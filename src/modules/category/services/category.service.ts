import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ILike, Repository } from 'typeorm';
import { CreateCategoryDto } from '../dto/create-category.dto';
import { ListCategoriesQueryDto } from '../dto/list-categories-query.dto';
import { ListCategoriesWithProductsQueryDto } from '../dto/list-categories-with-products-query.dto';
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

    const [categories, total] = await this.categoryRepository.findAndCount({
      where: search
        ? {
            name: ILike(`%${search}%`),
          }
        : undefined,
      relations: {
        products: true,
      },
      order: {
        createdAt: 'DESC',
      },
      skip: (page - 1) * limit,
      take: limit,
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

  async findAllWithProducts(query: ListCategoriesWithProductsQueryDto) {
    const page = query.page ?? 1;
    const limit = Math.min(query.limit ?? 10, 100);

    const search = query.search?.trim();
    const productName = query.product_name?.trim();
    const batchNumber = query.batch_number?.trim();
    const expirationDate = query.expiration_date?.trim();

    const hasProductFilters = Boolean(
      productName || batchNumber || expirationDate,
    );

    const qb = this.categoryRepository.createQueryBuilder('category');

    if (hasProductFilters) {
      qb.innerJoinAndSelect('category.products', 'product');
    } else {
      qb.leftJoinAndSelect('category.products', 'product');
    }

    if (search) {
      qb.andWhere('category.name ILIKE :search', {
        search: `%${search}%`,
      });
    }

    if (productName) {
      qb.andWhere('product.name ILIKE :productName', {
        productName: `%${productName}%`,
      });
    }

    if (batchNumber) {
      qb.andWhere('product.batch_number ILIKE :batchNumber', {
        batchNumber: `%${batchNumber}%`,
      });
    }

    if (expirationDate) {
      qb.andWhere('product.expiration_date = :expirationDate', {
        expirationDate,
      });
    }

    qb.orderBy('category.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .distinct(true);

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
