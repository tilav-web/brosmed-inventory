import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import Redis from 'ioredis';
import { Product } from 'src/modules/product/entities/product.entity';
import { ProductBatch } from 'src/modules/product/entities/product-batch.entity';
import { CreateCategoryDto } from '../dto/create-category.dto';
import { ListCategoriesQueryDto } from '../dto/list-categories-query.dto';
import { UpdateCategoryDto } from '../dto/update-category.dto';
import { Category } from '../entities/category.entity';

export interface CategoryWithStats extends Category {
  notifications: Array<{ id: string; message: string; priority: number }>;
  product_count: number;
}

export interface CategoryListResult {
  data: CategoryWithStats[];
  meta: {
    page: number;
    limit: number;
    total: number;
    total_pages: number;
  };
}

export interface CategorySimpleListResult {
  data: Category[];
  meta: {
    page: number;
    limit: number;
    total: number;
    total_pages: number;
  };
}

@Injectable()
export class CategoryService {
  constructor(
    @InjectRepository(Category)
    private readonly categoryRepository: Repository<Category>,
    @Inject('REDIS_CLIENT')
    private readonly redis: Redis,
  ) {}

  async findAll(query: ListCategoriesQueryDto): Promise<CategoryListResult> {
    const page = query.page ?? 1;
    const limit = Math.min(query.limit ?? 10, 100);
    const search = query.search?.trim();
    const offset = (page - 1) * limit;

    const cacheKey = `categories:all:${page}:${limit}:${search ?? 'none'}`;
    const cached = await this.redis.get(cacheKey);
    if (cached) return JSON.parse(cached) as CategoryListResult;

    const today = this.getTodayDateString();

    const qb = this.categoryRepository
      .createQueryBuilder('category')

      .addSelect(
        (sub) =>
          sub
            .select('COUNT(*)')
            .from(Product, 'p')
            .where('p.category_id = category.id'),
        'product_count',
      )

      .addSelect(
        (sub) =>
          sub
            .select('COUNT(*) FILTER (WHERE p.quantity <= p.min_limit)')
            .from(Product, 'p')
            .where('p.category_id = category.id'),
        'low_stock_count',
      )

      .addSelect(
        (sub) =>
          sub
            .select(
              `SUM(CASE
              WHEN b.quantity > 0
               AND b.expiration_date IS NOT NULL
               AND b.expiration_date >= :today
               AND b.expiration_alert_date IS NOT NULL
               AND b.expiration_alert_date <= :today
              THEN 1 ELSE 0
            END)`,
            )
            .from(ProductBatch, 'b')
            .innerJoin(Product, 'p', 'p.id = b.product_id')
            .where('p.category_id = category.id'),
        'expiring_soon_count',
      )

      .addSelect(
        (sub) =>
          sub
            .select(
              `SUM(CASE
              WHEN b.quantity > 0
               AND b.expiration_date IS NOT NULL
               AND b.expiration_date < :today
              THEN 1 ELSE 0
            END)`,
            )
            .from(ProductBatch, 'b')
            .innerJoin(Product, 'p', 'p.id = b.product_id')
            .where('p.category_id = category.id'),
        'expired_count',
      )

      .setParameters({ today });

    if (search) {
      qb.where('category.name ILIKE :search', { search: `%${search}%` });
    }

    const total = await qb.clone().getCount();

    qb.orderBy('category.createdAt', 'DESC').skip(offset).take(limit);

    const { entities, raw } = await qb.getRawAndEntities<{
      category_id: string;
      product_count: string;
      low_stock_count: string;
      expiring_soon_count: string;
      expired_count: string;
    }>();

    const rawMap = new Map(
      raw.filter((r) => r.category_id != null).map((r) => [r.category_id, r]),
    );

    const categories: CategoryWithStats[] = entities.map((category) => {
      const r = rawMap.get(category.id);

      const productCount = Number(r?.product_count ?? 0);
      const lowStockCount = Number(r?.low_stock_count ?? 0);
      const expiringSoonCount = Number(r?.expiring_soon_count ?? 0);
      const expiredCount = Number(r?.expired_count ?? 0);

      const notifications = [
        lowStockCount > 0 && {
          id: 'low-stock',
          message: 'Kam qolgan mahsulotlar mavjud',
          priority: 1,
        },
        expiringSoonCount > 0 && {
          id: 'expiring-soon',
          message: 'Eskirish muddati yaqinlashib qolgan mahsulotlar mavjud',
          priority: 2,
        },
        expiredCount > 0 && {
          id: 'expired',
          message: 'Eskirish muddati tugagan mahsulotlar mavjud',
          priority: 3,
        },
      ].filter(Boolean) as Array<{
        id: string;
        message: string;
        priority: number;
      }>;

      return Object.assign(category, {
        notifications,
        product_count: productCount,
      }) as CategoryWithStats;
    });

    const result: CategoryListResult = {
      data: categories,
      meta: {
        page,
        limit,
        total,
        total_pages: Math.ceil(total / limit) || 1,
      },
    };

    await this.redis.set(cacheKey, JSON.stringify(result), 'EX', 300);
    return result;
  }

  async findAllSimple(
    query: ListCategoriesQueryDto,
  ): Promise<CategorySimpleListResult> {
    const page = query.page ?? 1;
    const limit = Math.min(query.limit ?? 10, 100);
    const search = query.search?.trim();

    const cacheKey = `categories:simple:${page}:${limit}:${search ?? 'none'}`;
    const cached = await this.redis.get(cacheKey);
    if (cached) return JSON.parse(cached) as CategorySimpleListResult;

    const qb = this.categoryRepository.createQueryBuilder('category');

    if (search) {
      qb.where('category.name ILIKE :search', { search: `%${search}%` });
    }

    qb.orderBy('category.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    const [categories, total] = await qb.getManyAndCount();

    const result: CategorySimpleListResult = {
      data: categories,
      meta: {
        page,
        limit,
        total,
        total_pages: Math.ceil(total / limit) || 1,
      },
    };

    await this.redis.set(cacheKey, JSON.stringify(result), 'EX', 300);
    return result;
  }

  async findById(id: string): Promise<Category> {
    const cacheKey = `category:${id}`;
    const cached = await this.redis.get(cacheKey);
    if (cached) return JSON.parse(cached) as Category;

    const category = await this.categoryRepository.findOne({ where: { id } });
    if (!category) {
      throw new NotFoundException('Category topilmadi');
    }

    await this.redis.set(cacheKey, JSON.stringify(category), 'EX', 600);
    return category;
  }

  private getTodayDateString(): string {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  async create(dto: CreateCategoryDto): Promise<Category> {
    const existing = await this.categoryRepository.findOne({
      where: { name: dto.name },
    });

    if (existing) {
      throw new ConflictException('Bunday category name mavjud');
    }

    const category = await this.categoryRepository.save(
      this.categoryRepository.create({
        name: dto.name,
        description: dto.description ?? null,
      }),
    );

    await this.clearCache();
    return category;
  }

  async update(id: string, dto: UpdateCategoryDto): Promise<Category> {
    const category = await this.findById(id);

    if (dto.name !== undefined && dto.name !== category.name) {
      const existing = await this.categoryRepository.findOne({
        where: { name: dto.name },
      });
      if (existing) {
        throw new ConflictException('Bunday category name mavjud');
      }
      category.name = dto.name;
    }

    if (dto.description !== undefined) {
      category.description = dto.description;
    }

    const updated = await this.categoryRepository.save(category);
    await this.clearCache();
    await this.redis.del(`category:${id}`);
    return updated;
  }

  async delete(id: string): Promise<Category> {
    const category = await this.findById(id);
    const result = await this.categoryRepository.remove(category);

    await this.clearCache();
    await this.redis.del(`category:${id}`);
    return result;
  }

  private async clearCache(): Promise<void> {
    const keys = await this.redis.keys('categories:*');
    if (keys.length > 0) await this.redis.del(...keys);
  }
}
