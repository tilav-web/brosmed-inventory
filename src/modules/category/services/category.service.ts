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
  ) {}

  async findAll(query: ListCategoriesQueryDto) {
    const page = query.page ?? 1;
    const limit = Math.min(query.limit ?? 10, 100);
    const search = query.search?.trim();
    const hasSearch = Boolean(search);

    const today = new Date().toISOString().slice(0, 10);
    const in30Days = new Date(Date.now() + 30 * 86400_000)
      .toISOString()
      .slice(0, 10);

    const qb = this.categoryRepository
      .createQueryBuilder('category')
      // loadRelationCountAndMap OLIB TASHLANDI — subquery bilan almashtirildi
      .addSelect('COUNT(*) OVER()', 'total_count')
      .addSelect(
        (subQb) =>
          subQb
            .select('COUNT(*)')
            .from(Product, 'p')
            .where('p.category_id = category.id')
            .andWhere('p.quantity <= p.min_limit'),
        'low_stock_count',
      )
      .addSelect(
        (subQb) =>
          subQb
            .select('COUNT(*)')
            .from(ProductBatch, 'b')
            .innerJoin(Product, 'p', 'p.id = b.product_id')
            .where('p.category_id = category.id')
            .andWhere('b.expiration_date BETWEEN :today AND :in30Days')
            .andWhere('b.quantity > 0'),
        'expiring_soon_count',
      )
      .addSelect(
        (subQb) =>
          subQb
            .select('COUNT(*)')
            .from(ProductBatch, 'b')
            .innerJoin(Product, 'p', 'p.id = b.product_id')
            .where('p.category_id = category.id')
            .andWhere('b.expiration_date < :today')
            .andWhere('b.quantity > 0'),
        'expired_count',
      )
      .setParameters({ today, in30Days });

    if (hasSearch) {
      qb.leftJoin('category.products', 'product')
        .where('(category.name ILIKE :search OR product.name ILIKE :search)', {
          search: `%${search}%`,
        })
        .distinct(true);
    }

    qb.orderBy('category.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    const { entities, raw } = await qb.getRawAndEntities<{
      category_id: string | null;
      total_count: string;
      low_stock_count: string;
      expiring_soon_count: string;
      expired_count: string;
    }>();

    // Ishonchli raw ma'lumot olish — index emas, id bo'yicha
    const rawMap = new Map(
      raw.filter((r) => r.category_id).map((r) => [r.category_id as string, r]),
    );
    const total = Number(raw[0]?.total_count ?? 0);

    // Search bo'lsa mahsulotlarni parallel yuklash
    const productsByCategory = new Map<string, Product[]>();
    if (hasSearch && entities.length > 0) {
      const categoryIds = entities.map((c) => c.id);
      const product_page = query.product_page ?? 1;
      const productLimit = Math.min(10, 50);

      const products = await this.productRepository
        .createQueryBuilder('product')
        .leftJoinAndSelect('product.category', 'category')
        .leftJoinAndSelect('product.supplier', 'supplier')
        .leftJoinAndSelect('product.warehouse', 'warehouse')
        .leftJoinAndSelect('product.batches', 'batches')
        .where('product.category_id IN (:...categoryIds)', { categoryIds })
        .andWhere('product.name ILIKE :search', { search: `%${search}%` })
        .orderBy('product.createdAt', 'DESC')
        .skip((product_page - 1) * productLimit)
        .take(productLimit)
        .getMany();

      for (const product of products) {
        if (!product.category_id) continue;
        const list = productsByCategory.get(product.category_id) ?? [];
        list.push(product);
        productsByCategory.set(product.category_id, list);
      }
    }

    const categories = entities.map((category) => {
      const r = rawMap.get(category.id);
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

      const extra = hasSearch
        ? { notifications, products: productsByCategory.get(category.id) ?? [] }
        : { notifications };

      return Object.assign(category, extra);
    });

    return {
      data: categories,
      meta: { page, limit, total, total_pages: Math.ceil(total / limit) || 1 },
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
