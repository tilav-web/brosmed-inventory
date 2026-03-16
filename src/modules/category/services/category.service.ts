import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Product } from 'src/modules/product/entities/product.entity';
import { ProductBatch } from 'src/modules/product/entities/product-batch.entity';
import { CreateCategoryDto } from '../dto/create-category.dto';
import { ListCategoriesQueryDto } from '../dto/list-categories-query.dto';
import { UpdateCategoryDto } from '../dto/update-category.dto';
import { Category } from '../entities/category.entity';

@Injectable()
export class CategoryService {
  constructor(
    @InjectRepository(Category)
    private readonly categoryRepository: Repository<Category>,
  ) {}

  async findAll(query: ListCategoriesQueryDto) {
    const page = query.page ?? 1;
    const limit = Math.min(query.limit ?? 10, 100);
    const search = query.search?.trim();
    const offset = (page - 1) * limit;

    const today = this.getTodayDateString();

    const qb = this.categoryRepository
      .createQueryBuilder('category')

      // 1️⃣ Umumiy mahsulotlar soni
      .addSelect(
        (sub) =>
          sub
            .select('COUNT(*)')
            .from(Product, 'p')
            .where('p.category_id = category.id'),
        'product_count',
      )

      // 2️⃣ Kam qolgan mahsulotlar (quantity <= min_limit)
      .addSelect(
        (sub) =>
          sub
            .select('COUNT(*) FILTER (WHERE p.quantity <= p.min_limit)')
            .from(Product, 'p')
            .where('p.category_id = category.id'),
        'low_stock_count',
      )

      // 3️⃣ Eskirishiga kam qolgan partiyalar
      //    — ogohlantirish sanasi kelgan (alert_date <= today)
      //    — lekin hali muddati o'tmagan (expiration_date >= today)
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

      // 4️⃣ Muddati o'tgan partiyalar (expiration_date < today)
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

    // 5️⃣ Alohida count — COUNT(*) OVER() pagination bilan noto'g'ri ishlaydi
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

    const categories = entities.map((category) => {
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
      ].filter(Boolean);

      return Object.assign(category, {
        notifications,
        product_count: productCount,
      });
    });

    return {
      data: categories,
      meta: {
        page,
        limit,
        total,
        total_pages: Math.ceil(total / limit) || 1,
      },
    };
  }

  async findAllSimple(query: ListCategoriesQueryDto) {
    const page = query.page ?? 1;
    const limit = Math.min(query.limit ?? 10, 100);
    const search = query.search?.trim();

    const qb = this.categoryRepository.createQueryBuilder('category');

    if (search) {
      qb.where('category.name ILIKE :search', { search: `%${search}%` });
    }

    qb.orderBy('category.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    const [categories, total] = await qb.getManyAndCount();

    return {
      data: categories,
      meta: {
        page,
        limit,
        total,
        total_pages: Math.ceil(total / limit) || 1,
      },
    };
  }

  async findById(id: string) {
    const category = await this.categoryRepository.findOne({ where: { id } });
    if (!category) {
      throw new NotFoundException('Category topilmadi');
    }
    return category;
  }

  private getTodayDateString() {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  async create(dto: CreateCategoryDto) {
    const existing = await this.categoryRepository.findOne({
      where: { name: dto.name },
    });

    if (existing) {
      throw new ConflictException('Bunday category name mavjud');
    }

    return this.categoryRepository.save(
      this.categoryRepository.create({
        name: dto.name,
        description: dto.description ?? null,
      }),
    );
  }

  async update(id: string, dto: UpdateCategoryDto) {
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

    return this.categoryRepository.save(category);
  }

  async delete(id: string) {
    const category = await this.findById(id);
    return this.categoryRepository.remove(category);
  }
}
