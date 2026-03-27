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

  async findById(id: string) {
    const batch = await this.productBatchRepository.findOne({ where: { id } });

    if (!batch) {
      throw new NotFoundException('Product batch topilmadi');
    }

    return batch;
  }

  async update(id: string, dto: UpdateProductBatchDto) {
    const hasUpdateField = Object.values(dto).some(
      (value) => value !== undefined && value !== null,
    );

    if (!hasUpdateField) {
      throw new BadRequestException('Hech qanday maydon yuborilmadi!');
    }

    const batch = await this.productBatchRepository.findOne({ where: { id } });
    if (!batch) {
      throw new NotFoundException('Product batch topilmadi');
    }

    if (dto.expiration_alert_date && !dto.expiration_date) {
      throw new BadRequestException(
        'expiration_alert_date berilsa, expiration_date ham berilishi kerak',
      );
    }

    if (dto.expiration_alert_date && dto.expiration_date) {
      const alertDate = new Date(dto.expiration_alert_date);
      const expirationDate = new Date(dto.expiration_date);
      if (alertDate > expirationDate) {
        throw new BadRequestException(
          'expiration_alert_date expiration_date dan oldin yoki teng bo‘lishi kerak',
        );
      }
    }

    if (dto.expiration_date !== undefined) {
      batch.expiration_date = dto.expiration_date
        ? new Date(dto.expiration_date)
        : null;
    }

    if (dto.expiration_alert_date !== undefined) {
      batch.expiration_alert_date = dto.expiration_alert_date
        ? new Date(dto.expiration_alert_date)
        : null;
    }

    if (dto.batch_number !== undefined) {
      batch.batch_number = dto.batch_number ?? null;
    }

    if (dto.serial_number !== undefined) {
      batch.serial_number = dto.serial_number ?? null;
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
