import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UpdateProductBatchDto } from '../dto/update-product-batch.dto';
import { ProductBatch } from '../entities/product-batch.entity';
import { ListProductBatchsQueryDto } from '../dto/list-product-batch-query.dto';

@Injectable()
export class ProductBatchService {
  constructor(
    @InjectRepository(ProductBatch)
    private readonly productBatchRepository: Repository<ProductBatch>,
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

  async findById(id: string) {
    const batch = await this.productBatchRepository.findOne({ where: { id } });

    if (!batch) {
      throw new NotFoundException('Product batch topilmadi');
    }

    return batch;
  }

  async update(id: string, dto: UpdateProductBatchDto) {
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

    const batch = await this.productBatchRepository.findOne({ where: { id } });
    if (!batch) {
      throw new NotFoundException('Product batch topilmadi');
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

  async findAll(query: ListProductBatchsQueryDto) {
    const { page, limit } = query;
    const skip = (page - 1) * limit;

    const qb = this.productBatchRepository.createQueryBuilder('batch');

    const productId =
      typeof query.product_id === 'string' ? query.product_id : undefined;

    if (productId) {
      qb.andWhere('batch.product_id = :productId', {
        productId,
      });
    }

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

  async findAlerts(query: ListProductBatchsQueryDto) {
    const { page, limit } = query;
    const skip = (page - 1) * limit;

    const qb = this.productBatchRepository.createQueryBuilder('batch');

    const productId =
      typeof query.product_id === 'string' ? query.product_id : undefined;

    if (productId) {
      qb.andWhere('batch.product_id = :productId', {
        productId,
      });
    }

    // Sroki yaqinlashgan batchlar: alert_date keldi yoki o`tgan, lekin hali tugamagan
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
