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

    return this.productBatchRepository.save(batch);
  }

  async findAll(query: ListProductBatchsQueryDto) {
    const { page, limit } = query;
    const skip = (page - 1) * limit;

    const [data, total] = await this.productBatchRepository.findAndCount({
      relations: ['product', 'warehouse'],
      order: {
        expiration_date: 'ASC',
      },
      take: limit,
      skip: skip,
    });

    return {
      data,
      meta: {
        total,
        page,
        last_page: Math.ceil(total / limit),
      },
    };
  }
}
