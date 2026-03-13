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

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const in30Days = new Date(today);
    in30Days.setDate(in30Days.getDate() + 30);

    const qb = this.categoryRepository
      .createQueryBuilder('category')
      .loadRelationCountAndMap('category.product_count', 'category.products');

    qb.addSelect(
      (subQb) =>
        subQb
          .select('COUNT(*)')
          .from(Product, 'p')
          .where('p.category_id = category.id')
          .andWhere('p.quantity <= p.min_limit'),
      'low_stock_count',
    );

    qb.addSelect(
      (subQb) =>
        subQb
          .select('COUNT(*)')
          .from(ProductBatch, 'b')
          .innerJoin(Product, 'p', 'p.id = b.product_id')
          .where('p.category_id = category.id')
          .andWhere('b.expiration_date IS NOT NULL')
          .andWhere('b.expiration_date >= :today')
          .andWhere('b.expiration_date <= :in30Days')
          .andWhere('b.quantity > 0'),
      'expiring_soon_count',
    );

    qb.addSelect(
      (subQb) =>
        subQb
          .select('COUNT(*)')
          .from(ProductBatch, 'b')
          .innerJoin(Product, 'p', 'p.id = b.product_id')
          .where('p.category_id = category.id')
          .andWhere('b.expiration_date IS NOT NULL')
          .andWhere('b.expiration_date < :today')
          .andWhere('b.quantity > 0'),
      'expired_count',
    );

    if (search) {
      qb.where('category.name ILIKE :search', { search: `%${search}%` });
    }

    qb.orderBy('category.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .setParameters({
        today: today.toISOString().slice(0, 10),
        in30Days: in30Days.toISOString().slice(0, 10),
      });

    const { entities, raw } = await qb.getRawAndEntities<{
      low_stock_count: string | number | null;
      expiring_soon_count: string | number | null;
      expired_count: string | number | null;
    }>();
    const total = await qb.clone().getCount();

    const categories = entities.map((category, index) => {
      const lowStockCount = Number(raw[index]?.low_stock_count ?? 0);
      const expiringSoonCount = Number(raw[index]?.expiring_soon_count ?? 0);
      const expiredCount = Number(raw[index]?.expired_count ?? 0);

      const notifications: {
        id: string;
        message: string;
        priority: number;
      }[] = [];
      if (lowStockCount > 0) {
        notifications.push({
          message: 'Kam qolgan mahsulotlar mavjud',
          priority: 1,
          id: 'low-stock',
        });
      }
      if (expiringSoonCount > 0) {
        notifications.push({
          message: 'Eskirish muddati yaqinlashib qolgan mahsulotlar mavjud',
          priority: 2,
          id: 'expiring-soon',
        });
      }
      if (expiredCount > 0) {
        notifications.push({
          message: 'Eskirish muddati tugagan mahsulotlar mavjud',
          priority: 3,
          id: 'expired',
        });
      }

      return Object.assign(category, { notifications });
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

  async findById(id: string) {
    const category = await this.categoryRepository.findOne({ where: { id } });
    if (!category) {
      throw new NotFoundException('Category topilmadi');
    }
    return category;
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

    // Set category to null for all related products
    await this.categoryRepository.query(
      `UPDATE products SET category_id = NULL WHERE category_id = $1`,
      [id],
    );

    // Delete the category
    return this.categoryRepository.remove(category);
  }
}
