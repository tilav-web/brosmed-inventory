import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ILike, Repository } from 'typeorm';
import Redis from 'ioredis';
import { CreateSupplierDto } from '../dto/create-supplier.dto';
import { ListSuppliersQueryDto } from '../dto/list-suppliers-query.dto';
import { UpdateSupplierDto } from '../dto/update-supplier.dto';
import { Supplier } from '../entities/supplier.entity';

export interface SupplierListResult {
  data: Supplier[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

@Injectable()
export class SupplierService {
  constructor(
    @InjectRepository(Supplier)
    private readonly supplierRepository: Repository<Supplier>,
    @Inject('REDIS_CLIENT')
    private readonly redis: Redis,
  ) {}

  async findAll(query: ListSuppliersQueryDto): Promise<SupplierListResult> {
    const page = query.page ?? 1;
    const limit = Math.min(query.limit ?? 10, 100);
    const search = query.search?.trim();

    const cacheKey = `suppliers:all:${page}:${limit}:${search ?? 'none'}`;
    const cached = await this.redis.get(cacheKey);
    if (cached) return JSON.parse(cached) as SupplierListResult;

    const [suppliers, total] = await this.supplierRepository.findAndCount({
      where: search ? [{ company_name: ILike(`%${search}%`) }] : undefined,
      order: {
        createdAt: 'DESC',
      },
      skip: (page - 1) * limit,
      take: limit,
    });

    const result: SupplierListResult = {
      data: suppliers,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };

    await this.redis.set(cacheKey, JSON.stringify(result), 'EX', 600);
    return result;
  }

  async findById(id: string): Promise<Supplier> {
    const cacheKey = `supplier:${id}`;
    const cached = await this.redis.get(cacheKey);
    if (cached) return JSON.parse(cached) as Supplier;

    const supplier = await this.supplierRepository.findOne({ where: { id } });
    if (!supplier) {
      throw new NotFoundException('Supplier topilmadi');
    }

    await this.redis.set(cacheKey, JSON.stringify(supplier), 'EX', 600);
    return supplier;
  }

  async create(dto: CreateSupplierDto): Promise<Supplier> {
    const existing = await this.supplierRepository.findOne({
      where: { email: dto.email },
    });

    if (existing) {
      throw new ConflictException('Bu email bilan supplier allaqachon mavjud');
    }

    const supplier = await this.supplierRepository.save(
      this.supplierRepository.create({
        company_name: dto.company_name,
        contact_person: dto.contact_person,
        email: dto.email,
        phone: dto.phone,
        payment_terms: dto.payment_terms ?? null,
        description: dto.description ?? null,
      }),
    );

    await this.clearCache();
    return supplier;
  }

  async update(id: string, dto: UpdateSupplierDto): Promise<Supplier> {
    const supplier = await this.findById(id);

    if (dto.email !== undefined && dto.email !== supplier.email) {
      const emailExists = await this.supplierRepository.findOne({
        where: { email: dto.email },
      });
      if (emailExists) {
        throw new ConflictException(
          'Bu email bilan supplier allaqachon mavjud',
        );
      }
      supplier.email = dto.email;
    }

    if (dto.company_name !== undefined) {
      supplier.company_name = dto.company_name;
    }
    if (dto.contact_person !== undefined) {
      supplier.contact_person = dto.contact_person;
    }
    if (dto.phone !== undefined) {
      supplier.phone = dto.phone;
    }
    if (dto.payment_terms !== undefined) {
      supplier.payment_terms = dto.payment_terms;
    }
    if (dto.description !== undefined) {
      supplier.description = dto.description;
    }

    const updated = await this.supplierRepository.save(supplier);
    await this.clearCache();
    await this.redis.del(`supplier:${id}`);
    return updated;
  }

  async delete(id: string): Promise<{ message: string }> {
    const supplier = await this.findById(id);
    await this.supplierRepository.delete(supplier.id);

    await this.clearCache();
    await this.redis.del(`supplier:${id}`);
    return { message: "Supplier o'chirildi" };
  }

  private async clearCache(): Promise<void> {
    const keys = await this.redis.keys('suppliers:*');
    if (keys.length > 0) await this.redis.del(...keys);
  }
}
