import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ILike, Repository } from 'typeorm';
import Redis from 'ioredis';
import { Product } from 'src/modules/product/entities/product.entity';
import { CreateUnitDto } from '../dto/create-unit.dto';
import { ListUnitsQueryDto } from '../dto/list-units-query.dto';
import { UpdateUnitDto } from '../dto/update-unit.dto';
import { Unit } from '../entities/unit.entity';

export interface UnitListResult {
  data: Unit[];
  meta: {
    page: number;
    limit: number;
    total: number;
    total_pages: number;
  };
}

@Injectable()
export class UnitService {
  constructor(
    @InjectRepository(Unit)
    private readonly unitRepository: Repository<Unit>,
    @InjectRepository(Product)
    private readonly productRepository: Repository<Product>,
    @Inject('REDIS_CLIENT')
    private readonly redis: Redis,
  ) {}

  async findAll(query: ListUnitsQueryDto): Promise<UnitListResult> {
    const page = query.page ?? 1;
    const limit = Math.min(query.limit ?? 10, 100);
    const search = query.search?.trim();

    const cacheKey = `units:all:${page}:${limit}:${search ?? 'none'}`;
    const cached = await this.redis.get(cacheKey);
    if (cached) return JSON.parse(cached) as UnitListResult;

    const [units, total] = await this.unitRepository.findAndCount({
      where: search
        ? {
            name: ILike(`%${search}%`),
          }
        : undefined,
      order: {
        createdAt: 'DESC',
      },
      skip: (page - 1) * limit,
      take: limit,
    });

    const result: UnitListResult = {
      data: units,
      meta: {
        page,
        limit,
        total,
        total_pages: Math.ceil(total / limit) || 1,
      },
    };

    await this.redis.set(cacheKey, JSON.stringify(result), 'EX', 1800);
    return result;
  }

  async findById(id: string): Promise<Unit> {
    const cacheKey = `unit:${id}`;
    const cached = await this.redis.get(cacheKey);
    if (cached) return JSON.parse(cached) as Unit;

    const unit = await this.unitRepository.findOne({ where: { id } });
    if (!unit) {
      throw new NotFoundException('Unit topilmadi');
    }

    await this.redis.set(cacheKey, JSON.stringify(unit), 'EX', 1800);
    return unit;
  }

  async create(dto: CreateUnitDto): Promise<Unit> {
    const normalizedName = dto.name.trim();
    const existing = await this.unitRepository.findOne({
      where: { name: ILike(normalizedName) },
    });

    if (existing) {
      throw new ConflictException('Bunday unit name mavjud');
    }

    const unit = await this.unitRepository.save(
      this.unitRepository.create({
        name: normalizedName,
      }),
    );

    await this.clearCache();
    return unit;
  }

  async update(id: string, dto: UpdateUnitDto): Promise<Unit> {
    const unit = await this.findById(id);

    if (dto.name !== undefined && dto.name !== unit.name) {
      const normalizedName = dto.name.trim();
      const existing = await this.unitRepository.findOne({
        where: { name: ILike(normalizedName) },
      });
      if (existing) {
        throw new ConflictException('Bunday unit name mavjud');
      }
      unit.name = normalizedName;

      await this.productRepository.update(
        { unit_id: unit.id },
        { unit: normalizedName },
      );
    }

    const updated = await this.unitRepository.save(unit);
    await this.clearCache();
    await this.redis.del(`unit:${id}`);
    return updated;
  }

  async delete(id: string): Promise<{ message: string }> {
    const unit = await this.findById(id);
    await this.productRepository.update(
      { unit_id: unit.id },
      { unit_id: null },
    );
    await this.unitRepository.delete(unit.id);

    await this.clearCache();
    await this.redis.del(`unit:${id}`);
    return { message: "Unit o'chirildi" };
  }

  private async clearCache(): Promise<void> {
    const keys = await this.redis.keys('units:*');
    if (keys.length > 0) await this.redis.del(...keys);
  }
}
