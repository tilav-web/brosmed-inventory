import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { ExpenseService } from 'src/modules/expense/services/expense.service';
import { ExpenseType } from 'src/modules/expense/enums/expense-type.enum';
import { Product } from '../entities/product.entity';
import { ProductBatch } from '../entities/product-batch.entity';
import { ProductStatus } from '../enums/product-status.enum';

@Injectable()
export class ProductStatusSchedulerService {
  private readonly logger = new Logger(ProductStatusSchedulerService.name);

  constructor(
    @InjectRepository(Product)
    private readonly productRepository: Repository<Product>,
    @InjectRepository(ProductBatch)
    private readonly productBatchRepository: Repository<ProductBatch>,
    private readonly expenseService: ExpenseService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_1AM)
  async handleDailyRefresh() {
    const today = this.getTodayDateString();

    try {
      await this.writeOffExpiredBatches(today);
    } catch (error) {
      this.logger.error('Expired write-off failed', error);
    }

    try {
      await this.refreshProductExpirationDates(today);
    } catch (error) {
      this.logger.error('Product expiration sync failed', error);
    }

    try {
      await this.refreshProductStatuses(today);
    } catch (error) {
      this.logger.error('Product status refresh failed', error);
    }
  }

  private getTodayDateString() {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  private formatLocalDate(value?: Date | string | null) {
    if (!value) return null;
    if (typeof value === 'string') {
      return value.slice(0, 10);
    }
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, '0');
    const day = String(value.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  private async writeOffExpiredBatches(today: string) {
    const expiredBatches = await this.productBatchRepository
      .createQueryBuilder('batch')
      .where('batch.quantity > 0')
      .andWhere('batch.expiration_date IS NOT NULL')
      .andWhere('batch.expiration_date < :today', { today })
      .getMany();

    if (expiredBatches.length === 0) return;

    for (const batch of expiredBatches) {
      const items = [
        {
          product_id: batch.product_id,
          warehouse_id: batch.warehouse_id,
          product_batch_id: batch.id,
          quantity: Number(batch.quantity),
        },
      ];

      await this.expenseService.createSystemExpense({
        staff_name: 'SYSTEM',
        purpose: 'Auto: expired batch write-off',
        type: ExpenseType.EXPIRED,
        items,
      });
    }

    this.logger.log(
      `Auto write-off completed for ${expiredBatches.length} batches.`,
    );
  }

  private async refreshProductStatuses(today: string) {
    const expiredIds = await this.productBatchRepository
      .createQueryBuilder('batch')
      .select('DISTINCT batch.product_id', 'id')
      .where('batch.quantity > 0')
      .andWhere('batch.expiration_date IS NOT NULL')
      .andWhere('batch.expiration_date < :today', { today })
      .getRawMany<{ id: string }>();

    const expiringSoonIds = await this.productBatchRepository
      .createQueryBuilder('batch')
      .select('DISTINCT batch.product_id', 'id')
      .where('batch.quantity > 0')
      .andWhere('batch.expiration_alert_date IS NOT NULL')
      .andWhere('batch.expiration_alert_date <= :today', { today })
      .andWhere(
        '(batch.expiration_date IS NULL OR batch.expiration_date >= :today)',
        { today },
      )
      .getRawMany<{ id: string }>();

    const lowStockIds = await this.productRepository
      .createQueryBuilder('product')
      .select('product.id', 'id')
      .where('product.quantity > 0')
      .andWhere('product.quantity <= product.min_limit')
      .getRawMany<{ id: string }>();

    const inStockIds = await this.productRepository
      .createQueryBuilder('product')
      .select('product.id', 'id')
      .where('product.quantity > 0')
      .getRawMany<{ id: string }>();

    const flaggedIds = await this.productRepository
      .createQueryBuilder('product')
      .select('product.id', 'id')
      .where('COALESCE(array_length(product.statuses, 1), 0) > 0')
      .getRawMany<{ id: string }>();

    const expiredSet = new Set(expiredIds.map((row) => row.id));
    const expiringSet = new Set(expiringSoonIds.map((row) => row.id));
    const lowStockSet = new Set(lowStockIds.map((row) => row.id));
    const inStockSet = new Set(inStockIds.map((row) => row.id));

    const targetIds = new Set<string>();
    for (const row of [
      ...expiredIds,
      ...expiringSoonIds,
      ...lowStockIds,
      ...inStockIds,
      ...flaggedIds,
    ]) {
      targetIds.add(row.id);
    }

    if (targetIds.size === 0) return;

    const ids = Array.from(targetIds);
    const chunkSize = 500;
    const productsToSave: Product[] = [];

    for (let i = 0; i < ids.length; i += chunkSize) {
      const chunk = ids.slice(i, i + chunkSize);
      const products = await this.productRepository.findBy({
        id: In(chunk),
      });

      for (const product of products) {
        const nextStatuses: ProductStatus[] = [];

        if (expiredSet.has(product.id)) {
          nextStatuses.push(ProductStatus.EXPIRED);
        }
        if (expiringSet.has(product.id)) {
          nextStatuses.push(ProductStatus.EXPIRING_SOON);
        }
        if (lowStockSet.has(product.id)) {
          nextStatuses.push(ProductStatus.LOW_STOCK);
        }
        if (inStockSet.has(product.id)) {
          nextStatuses.push(ProductStatus.IN_STOCK);
        }

        const nextValue = nextStatuses.length > 0 ? nextStatuses : null;

        if (!this.sameStatusList(product.statuses, nextValue)) {
          product.statuses = nextValue;
          productsToSave.push(product);
        }
      }
    }

    if (productsToSave.length > 0) {
      await this.productRepository.save(productsToSave);
    }
  }

  private async refreshProductExpirationDates(today: string) {
    const earliestActiveBatches = await this.productBatchRepository
      .createQueryBuilder('batch')
      .distinctOn(['batch.product_id'])
      .select('batch.product_id', 'product_id')
      .addSelect('batch.expiration_date', 'expiration_date')
      .addSelect('batch.expiration_alert_date', 'expiration_alert_date')
      .where('batch.quantity > 0')
      .andWhere('batch.expiration_date IS NOT NULL')
      .andWhere('batch.expiration_date >= :today', { today })
      .orderBy('batch.product_id', 'ASC')
      .addOrderBy('batch.received_at', 'ASC')
      .getRawMany<{
        product_id: string;
        expiration_date: Date | null;
        expiration_alert_date: Date | null;
      }>();

    const activeMap = new Map(
      earliestActiveBatches.map((row) => [
        row.product_id,
        {
          expiration_date: row.expiration_date ?? null,
          expiration_alert_date: row.expiration_alert_date ?? null,
          expiration_date_key: this.formatLocalDate(row.expiration_date),
          expiration_alert_date_key: this.formatLocalDate(
            row.expiration_alert_date,
          ),
        },
      ]),
    );

    const flaggedProductIds = await this.productRepository
      .createQueryBuilder('product')
      .select('product.id', 'id')
      .where(
        'product.expiration_date IS NOT NULL OR product.expiration_alert_date IS NOT NULL',
      )
      .getRawMany<{ id: string }>();

    const targetIds = new Set<string>();
    for (const row of earliestActiveBatches) {
      targetIds.add(row.product_id);
    }
    for (const row of flaggedProductIds) {
      targetIds.add(row.id);
    }

    if (targetIds.size === 0) return;

    const ids = Array.from(targetIds);
    const chunkSize = 500;
    const productsToSave: Product[] = [];

    for (let i = 0; i < ids.length; i += chunkSize) {
      const chunk = ids.slice(i, i + chunkSize);
      const products = await this.productRepository.findBy({
        id: In(chunk),
      });

      for (const product of products) {
        const next = activeMap.get(product.id) ?? {
          expiration_date: null,
          expiration_alert_date: null,
          expiration_date_key: null,
          expiration_alert_date_key: null,
        };

        const sameExpirationDate =
          this.formatLocalDate(product.expiration_date) ===
          next.expiration_date_key;
        const sameAlertDate =
          this.formatLocalDate(product.expiration_alert_date) ===
          next.expiration_alert_date_key;

        if (!sameExpirationDate || !sameAlertDate) {
          product.expiration_date = next.expiration_date;
          product.expiration_alert_date = next.expiration_alert_date;
          productsToSave.push(product);
        }
      }
    }

    if (productsToSave.length > 0) {
      await this.productRepository.save(productsToSave);
    }
  }

  private sameStatusList(
    left: ProductStatus[] | null | undefined,
    right: ProductStatus[] | null | undefined,
  ) {
    const normalize = (list?: ProductStatus[]) =>
      (list ?? []).slice().sort().join('|');

    const leftEmpty = !left || left.length === 0;
    const rightEmpty = !right || right.length === 0;

    if (leftEmpty && rightEmpty) {
      return left === null && right === null;
    }

    return normalize(left ?? []) === normalize(right ?? []);
  }
}
