import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ILike, Repository } from 'typeorm';
import { Category } from 'src/modules/category/entities/category.entity';
import { FileFolderEnum } from 'src/modules/image/enums/file-folder.enum';
import { ImageService } from 'src/modules/image/services/image.service';
import { Supplier } from 'src/modules/supplier/entities/supplier.entity';
import { Unit } from 'src/modules/unit/entities/unit.entity';
import { Warehouse } from 'src/modules/warehouse/entities/warehouse.entity';
import { CreateProductDto } from '../dto/create-product.dto';
import { ListProductsQueryDto } from '../dto/list-products-query.dto';
import { UpdateProductDto } from '../dto/update-product.dto';
import { Product } from '../entities/product.entity';

interface UploadedImage {
  buffer: Buffer;
  mimetype: string;
}

@Injectable()
export class ProductService {
  constructor(
    @InjectRepository(Product)
    private readonly productRepository: Repository<Product>,
    @InjectRepository(Category)
    private readonly categoryRepository: Repository<Category>,
    @InjectRepository(Warehouse)
    private readonly warehouseRepository: Repository<Warehouse>,
    @InjectRepository(Unit)
    private readonly unitRepository: Repository<Unit>,
    @InjectRepository(Supplier)
    private readonly supplierRepository: Repository<Supplier>,
    private readonly imageService: ImageService,
  ) {}

  async findAll(query: ListProductsQueryDto) {
    const page = query.page ?? 1;
    const limit = Math.min(query.limit ?? 10, 100);
    const search = query.search?.trim();

    const [products, total] = await this.productRepository.findAndCount({
      where: search
        ? {
            name: ILike(`%${search}%`),
          }
        : undefined,
      relations: {
        category: true,
        supplier: true,
        warehouse: true,
      },
      order: {
        createdAt: 'DESC',
      },
      skip: (page - 1) * limit,
      take: limit,
    });

    return {
      data: products,
      meta: {
        page,
        limit,
        total,
        total_pages: Math.ceil(total / limit) || 1,
      },
    };
  }

  async findById(id: string) {
    const product = await this.productRepository.findOne({
      where: { id },
      relations: {
        category: true,
        supplier: true,
        warehouse: true,
      },
    });

    if (!product) {
      throw new NotFoundException('Product topilmadi');
    }

    return product;
  }

  private async findCategoryOrFail(categoryId: string): Promise<Category> {
    const category = await this.categoryRepository.findOne({
      where: { id: categoryId },
    });

    if (!category) {
      throw new NotFoundException('Category topilmadi');
    }

    return category;
  }

  private async findWarehouseOrFail(warehouseId: string): Promise<Warehouse> {
    const warehouse = await this.warehouseRepository.findOne({
      where: { id: warehouseId },
    });

    if (!warehouse) {
      throw new NotFoundException('Warehouse topilmadi');
    }

    return warehouse;
  }

  private async findUnitNameOrFail(unitId: string): Promise<string> {
    const unit = await this.unitRepository.findOne({ where: { id: unitId } });

    if (!unit) {
      throw new NotFoundException('Unit topilmadi');
    }

    return unit.name;
  }

  private async findSupplierOrFail(supplierId: string): Promise<Supplier> {
    const supplier = await this.supplierRepository.findOne({
      where: { id: supplierId },
    });

    if (!supplier) {
      throw new NotFoundException('Supplier topilmadi');
    }

    return supplier;
  }

  async create(dto: CreateProductDto) {
    const existing = await this.productRepository.findOne({
      where: {
        name: dto.name,
      },
      relations: {
        warehouse: true,
      },
    });

    if (existing && existing.warehouse?.id === dto.warehouse_id) {
      throw new ConflictException(
        'Bu omborda bunday product allaqachon mavjud',
      );
    }

    const [category, warehouse, unitName, supplier] = await Promise.all([
      this.findCategoryOrFail(dto.category_id),
      this.findWarehouseOrFail(dto.warehouse_id),
      this.findUnitNameOrFail(dto.unit_id),
      this.findSupplierOrFail(dto.supplier_id),
    ]);

    return this.productRepository.save(
      this.productRepository.create({
        name: dto.name,
        price: dto.price,
        quantity: dto.quantity ?? 0,
        min_limit: dto.min_limit ?? 10,
        expiration_date: dto.expiration_date
          ? new Date(dto.expiration_date)
          : null,
        batch_number: dto.batch_number ?? null,
        storage_conditions: dto.storage_conditions ?? null,
        unit: unitName,
        category,
        supplier,
        warehouse,
      }),
    );
  }

  async update(id: string, dto: UpdateProductDto & { image?: UploadedImage }) {
    if (!id) {
      throw new BadRequestException(
        'Mahsulot id sini yuborish majburiy uni params da yuboring!',
      );
    }

    const hasUpdateField =
      dto.image ||
      Object.values(dto).some((value) => value !== undefined && value !== null);

    if (!hasUpdateField) {
      throw new BadRequestException('Hech qanday maydon yuborilmadi!');
    }

    const product = await this.findById(id);

    if (dto.image) {
      if (!dto.image.mimetype.startsWith('image/')) {
        throw new BadRequestException('Faqat rasm fayli yuborish mumkin');
      }

      if (product.image) {
        await this.imageService.deleteImage(product.image);
      }

      product.image = await this.imageService.saveImage({
        file: dto.image,
        folder: FileFolderEnum.PRODUCTS,
        entityId: product.id,
      });
    }

    if (dto.name !== undefined) {
      product.name = dto.name;
    }
    if (dto.price !== undefined) {
      product.price = dto.price;
    }
    if (dto.quantity !== undefined) {
      product.quantity = dto.quantity;
    }
    if (dto.min_limit !== undefined) {
      product.min_limit = dto.min_limit;
    }
    if (dto.expiration_date !== undefined) {
      product.expiration_date = new Date(dto.expiration_date);
    }
    if (dto.batch_number !== undefined) {
      product.batch_number = dto.batch_number;
    }
    if (dto.storage_conditions !== undefined) {
      product.storage_conditions = dto.storage_conditions;
    }

    if (dto.category_id !== undefined) {
      product.category = await this.findCategoryOrFail(dto.category_id);
    }

    if (dto.supplier_id !== undefined) {
      product.supplier = await this.findSupplierOrFail(dto.supplier_id);
    }

    if (dto.warehouse_id !== undefined) {
      product.warehouse = await this.findWarehouseOrFail(dto.warehouse_id);
    }

    if (dto.unit_id !== undefined) {
      product.unit = await this.findUnitNameOrFail(dto.unit_id);
    }

    return this.productRepository.save(product);
  }

  async delete(id: string) {
    const product = await this.findById(id);
    await this.productRepository.delete(product.id);
    return { message: "Product o'chirildi" };
  }
}
