import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, SelectQueryBuilder } from 'typeorm';
import { AuthUser } from 'src/modules/auth/interfaces/auth-user.interface';
import { Role } from 'src/modules/user/enums/role.enum';
import { Warehouse } from 'src/modules/warehouse/entities/warehouse.entity';
import { UpdateProductBatchDto } from '../dto/update-product-batch.dto';
import { ProductBatch } from '../entities/product-batch.entity';
import { ListProductBatchsQueryDto } from '../dto/list-product-batch-query.dto';

@Injectable()
export class ProductBatchService {
  constructor(
    @InjectRepository(ProductBatch)
    private readonly productBatchRepository: Repository<ProductBatch>,
    @InjectRepository(Warehouse)
    private readonly warehouseRepository: Repository<Warehouse>,
  ) {}

  private hasField(
    dto: UpdateProductBatchDto,
    field: keyof UpdateProductBatchDto,
  ): boolean {
    return Object.hasOwn(dto, field);
  }

  private normalizeNullableText(value: string | null | undefined) {
    if (value == null) {
      return null;
    }

    const normalizedValue = value.trim();
    return normalizedValue.length > 0 ? normalizedValue : null;
  }

  private applyActiveBatchFilter(
    qb: SelectQueryBuilder<ProductBatch>,
    includeDepleted: boolean,
  ) {
    if (!includeDepleted) {
      qb.andWhere('batch.quantity > 0');
    }
  }

  private async getAssignedWarehouseForUser(userId: string) {
    const warehouses = await this.warehouseRepository.find({
      where: { manager_id: userId },
      select: { id: true },
      order: { createdAt: 'ASC' },
    });

    if (!warehouses.length) {
      throw new NotFoundException(
        "Warehouse userga biriktirilgan warehouse topilmadi",
      );
    }

    if (warehouses.length > 1) {
      throw new ForbiddenException(
        "Warehouse userga faqat bitta warehouse biriktirilishi kerak",
      );
    }

    return warehouses[0];
  }

  private async applyWarehouseScope(
    qb: SelectQueryBuilder<ProductBatch>,
    user?: AuthUser,
  ) {
    if (!user || user.role !== Role.WAREHOUSE) {
      return;
    }

    const warehouse = await this.getAssignedWarehouseForUser(user.id);
    qb.andWhere('batch.warehouse_id = :warehouseId', {
      warehouseId: warehouse.id,
    });
  }

  async findById(id: string, user?: AuthUser) {
    const qb = this.productBatchRepository
      .createQueryBuilder('batch')
      .where('batch.id = :id', { id });

    await this.applyWarehouseScope(qb, user);

    const batch = await qb.getOne();

    if (!batch) {
      throw new NotFoundException('Product batch topilmadi');
    }

    return batch;
  }

  async update(id: string, dto: UpdateProductBatchDto, user?: AuthUser) {
    const batch = await this.findById(id, user);

    const hasExpirationDateField = this.hasField(dto, 'expiration_date');
    const hasExpirationAlertDateField = this.hasField(
      dto,
      'expiration_alert_date',
    );
    const hasBatchNumberField = this.hasField(dto, 'batch_number');
    const hasSerialNumberField = this.hasField(dto, 'serial_number');

    const hasUpdateField =
      hasExpirationDateField ||
      hasExpirationAlertDateField ||
      hasBatchNumberField ||
      hasSerialNumberField;

    if (!hasUpdateField) {
      throw new BadRequestException('Hech qanday maydon yuborilmadi!');
    }

    const nextExpirationDate = hasExpirationDateField
      ? dto.expiration_date
        ? new Date(dto.expiration_date)
        : null
      : batch.expiration_date;
    const nextExpirationAlertDate = hasExpirationAlertDateField
      ? dto.expiration_alert_date
        ? new Date(dto.expiration_alert_date)
        : null
      : batch.expiration_alert_date;

    if (nextExpirationAlertDate && !nextExpirationDate) {
      throw new BadRequestException(
        'expiration_alert_date bo‘lishi uchun expiration_date ham bo‘lishi kerak',
      );
    }

    if (
      nextExpirationAlertDate &&
      nextExpirationDate &&
      nextExpirationAlertDate > nextExpirationDate
    ) {
      throw new BadRequestException(
        'expiration_alert_date expiration_date dan oldin yoki teng bo‘lishi kerak',
      );
    }

    if (hasExpirationDateField) {
      batch.expiration_date = nextExpirationDate;
    }

    if (hasExpirationAlertDateField) {
      batch.expiration_alert_date = nextExpirationAlertDate;
    }

    if (hasBatchNumberField) {
      batch.batch_number = this.normalizeNullableText(dto.batch_number);
    }

    if (hasSerialNumberField) {
      batch.serial_number = this.normalizeNullableText(dto.serial_number);
    }

    return this.productBatchRepository.save(batch);
  }

  async findAll(query: ListProductBatchsQueryDto, user?: AuthUser) {
    const { page, limit, include_depleted } = query;
    const skip = (page - 1) * limit;

    const qb = this.productBatchRepository.createQueryBuilder('batch');

    const productId =
      typeof query.product_id === 'string' ? query.product_id : undefined;

    if (productId) {
      qb.andWhere('batch.product_id = :productId', {
        productId,
      });
    }

    await this.applyWarehouseScope(qb, user);
    this.applyActiveBatchFilter(qb, include_depleted);

    qb.orderBy('batch.received_at', 'DESC')
      .addOrderBy('batch.id', 'DESC')
      .skip(skip)
      .take(limit);

    const [data, total] = await qb.getManyAndCount();

    return {
      data,
      meta: {
        page: Number(page),
        limit: Number(limit),
        total,
        total_pages: Math.ceil(total / limit) || 1,
      },
    };
  }

  async findAlerts(query: ListProductBatchsQueryDto, user?: AuthUser) {
    const { page, limit, include_depleted } = query;
    const skip = (page - 1) * limit;

    const qb = this.productBatchRepository.createQueryBuilder('batch');

    const productId =
      typeof query.product_id === 'string' ? query.product_id : undefined;

    if (productId) {
      qb.andWhere('batch.product_id = :productId', {
        productId,
      });
    }

    await this.applyWarehouseScope(qb, user);
    this.applyActiveBatchFilter(qb, include_depleted);

    const today = new Date();
    qb.andWhere('batch.expiration_alert_date IS NOT NULL')
      .andWhere('batch.expiration_alert_date <= :today', { today })
      .andWhere(
        '(batch.expiration_date IS NULL OR batch.expiration_date >= :today)',
        { today },
      );

    qb.orderBy('batch.expiration_date', 'ASC', 'NULLS LAST')
      .skip(skip)
      .take(limit);

    const [data, total] = await qb.getManyAndCount();

    return {
      data,
      meta: {
        page: Number(page),
        limit: Number(limit),
        total,
        total_pages: Math.ceil(total / limit) || 1,
      },
    };
  }
}
