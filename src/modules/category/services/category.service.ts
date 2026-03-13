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
    @InjectRepository(Product)
    private readonly productRepository: Repository<Product>,
    @InjectRepository(ProductBatch)
    private readonly productBatchRepository: Repository<ProductBatch>,
  ) {}

  async findAll(query: ListCategoriesQueryDto) {
    const page = query.page ?? 1;
    const limit = Math.min(query.limit ?? 10, 100);
    const search = query.search?.trim();

    const qb = this.categoryRepository
      .createQueryBuilder('category')
      .loadRelationCountAndMap('category.product_count', 'category.products');

    if (search) {
      qb.where('category.name ILIKE :search', { search: `%${search}%` });
    }

    qb.orderBy('category.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    const [categories, total] = await qb.getManyAndCount();

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const in30Days = new Date(today);
    in30Days.setDate(in30Days.getDate() + 30);

    const [lowStockCount, expiringSoonCount, expiredCount] = await Promise.all([
      this.productRepository
        .createQueryBuilder('product')
        .where('product.quantity <= product.min_limit')
        .getCount(),
      this.productBatchRepository
        .createQueryBuilder('batch')
        .where('batch.expiration_date IS NOT NULL')
        .andWhere('batch.expiration_date >= :today', {
          today: today.toISOString().slice(0, 10),
        })
        .andWhere('batch.expiration_date <= :in30Days', {
          in30Days: in30Days.toISOString().slice(0, 10),
        })
        .andWhere('batch.quantity > 0')
        .getCount(),
      this.productBatchRepository
        .createQueryBuilder('batch')
        .where('batch.expiration_date IS NOT NULL')
        .andWhere('batch.expiration_date < :today', {
          today: today.toISOString().slice(0, 10),
        })
        .andWhere('batch.quantity > 0')
        .getCount(),
    ]);

    const notifications: string[] = [];
    if (lowStockCount > 0) {
      notifications.push(`Kam qolgan mahsulotlar soni: ${lowStockCount} ta`);
    }
    if (expiringSoonCount > 0) {
      notifications.push(
        `Eskirish muddati yaqinlashib qolgan mahsulotlar soni: ${expiringSoonCount} ta`,
      );
    }
    if (expiredCount > 0) {
      notifications.push(
        `Eskirish muddati tugagan mahsulotlar soni: ${expiredCount} ta`,
      );
    }

    return {
      data: categories,
      meta: {
        page,
        limit,
        total,
        total_pages: Math.ceil(total / limit) || 1,
        notifications,
        stats: {
          low_stock: lowStockCount,
          expiring_soon: expiringSoonCount,
          expired: expiredCount,
        },
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
