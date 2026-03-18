import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ILike, Repository } from 'typeorm';
import { Product } from 'src/modules/product/entities/product.entity';
import { ProductBatch } from 'src/modules/product/entities/product-batch.entity';
import { Role } from 'src/modules/user/enums/role.enum';
import { User } from 'src/modules/user/entities/user.entity';
import { CreateWarehouseDto } from '../dto/create-warehouse.dto';
import { ListWarehousesQueryDto } from '../dto/list-warehouses-query.dto';
import { UpdateWarehouseDto } from '../dto/update-warehouse.dto';
import { Warehouse } from '../entities/warehouse.entity';

@Injectable()
export class WarehouseService {
  constructor(
    @InjectRepository(Warehouse)
    private readonly warehouseRepository: Repository<Warehouse>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Product)
    private readonly productRepository: Repository<Product>,
    @InjectRepository(ProductBatch)
    private readonly productBatchRepository: Repository<ProductBatch>,
  ) {}

  async findAll(query: ListWarehousesQueryDto) {
    const page = query.page ?? 1;
    const limit = Math.min(query.limit ?? 10, 100);
    const search = query.search?.trim();

    const qb = this.warehouseRepository
      .createQueryBuilder('warehouse')
      .leftJoinAndSelect('warehouse.manager', 'manager')
      // ProductBatch larni join qilib, jami qiymatni hisoblaymiz
      .leftJoin(
        'product_batches',
        'batch',
        'batch.warehouse_id = warehouse.id AND batch.quantity > 0',
      )
      .select('warehouse.id', 'id')
      .addSelect('warehouse.name', 'name')
      .addSelect('warehouse.type', 'type')
      .addSelect('warehouse.location', 'location')
      .addSelect('warehouse.createdAt', 'createdAt')
      .addSelect('warehouse.updatedAt', 'updatedAt')
      .addSelect('manager.id', 'manager_id')
      .addSelect('manager.first_name', 'manager_first_name')
      .addSelect('manager.last_name', 'manager_last_name')
      .addSelect(
        'COALESCE(SUM(batch.quantity * batch.price_at_purchase), 0)',
        'total_inventory_value',
      )
      .groupBy('warehouse.id')
      .addGroupBy('manager.id');

    if (search) {
      qb.andWhere('warehouse.name ILIKE :search', { search: `%${search}%` });
    }

    qb.orderBy('warehouse.createdAt', 'DESC')
      .offset((page - 1) * limit)
      .limit(limit);

    const rawData = await qb.getRawMany<{
      id: string;
      name: string;
      type: string;
      location: string;
      createdAt: Date;
      updatedAt: Date;
      manager_id: string;
      manager_first_name: string;
      manager_last_name: string;
      total_inventory_value: string;
    }>();

    const total = await this.warehouseRepository.count({
      where: search ? { name: ILike(`%${search}%`) } : undefined,
    });

    const warehouses = rawData.map((row) => ({
      id: row.id,
      name: row.name,
      type: row.type,
      location: row.location,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      manager: {
        id: row.manager_id,
        first_name: row.manager_first_name,
        last_name: row.manager_last_name,
      },
      total_inventory_value: Number(
        Number(row.total_inventory_value).toFixed(2),
      ),
    }));

    return {
      data: warehouses,
      meta: {
        page,
        limit,
        total,
        total_pages: Math.ceil(total / limit) || 1,
      },
    };
  }

  async findById(id: string) {
    const warehouse = await this.warehouseRepository.findOne({
      where: { id },
      relations: {
        manager: true,
      },
    });

    if (!warehouse) {
      throw new NotFoundException('Warehouse topilmadi');
    }

    // Bitta ombor uchun ham jami qiymatni hisoblaymiz
    const totalValueRaw = await this.productBatchRepository
      .createQueryBuilder('batch')
      .select('SUM(batch.quantity * batch.price_at_purchase)', 'total')
      .where('batch.warehouse_id = :id', { id })
      .andWhere('batch.quantity > 0')
      .getRawOne<{ total: string | null }>();

    return {
      ...warehouse,
      total_inventory_value: Number(
        Number(totalValueRaw?.total ?? 0).toFixed(2),
      ),
    };
  }

  private async ensureWarehouseManager(managerId: string): Promise<User> {
    const manager = await this.userRepository.findOne({
      where: { id: managerId },
    });

    if (!manager) {
      throw new NotFoundException('Manager user topilmadi');
    }

    if (manager.role !== Role.WAREHOUSE) {
      throw new ForbiddenException(
        "Manager faqat warehouse role'li user bo'lishi mumkin",
      );
    }

    return manager;
  }

  async create(dto: CreateWarehouseDto) {
    const existing = await this.warehouseRepository.findOne({
      where: { name: dto.name },
    });
    if (existing) {
      throw new ConflictException('Bunday warehouse name mavjud');
    }

    const manager = await this.ensureWarehouseManager(dto.manager_id);

    return this.warehouseRepository.save(
      this.warehouseRepository.create({
        name: dto.name,
        type: dto.type,
        location: dto.location,
        manager_id: manager.id,
      }),
    );
  }

  async update(id: string, dto: UpdateWarehouseDto) {
    const warehouseResult = await this.findById(id);
    // findById endi obyekt qaytaradi, bizga entitiy kerak
    const warehouse = await this.warehouseRepository.findOne({
      where: { id: warehouseResult.id },
    });
    if (!warehouse) throw new NotFoundException('Warehouse topilmadi');

    if (dto.name !== undefined && dto.name !== warehouse.name) {
      const existing = await this.warehouseRepository.findOne({
        where: { name: dto.name },
      });
      if (existing) {
        throw new ConflictException('Bunday warehouse name mavjud');
      }
      warehouse.name = dto.name;
    }

    if (dto.type !== undefined) {
      warehouse.type = dto.type;
    }

    if (dto.location !== undefined) {
      warehouse.location = dto.location;
    }

    if (dto.manager_id !== undefined) {
      const manager = await this.ensureWarehouseManager(dto.manager_id);
      warehouse.manager_id = manager.id;
      warehouse.manager = manager;
    }

    return this.warehouseRepository.save(warehouse);
  }

  async delete(id: string) {
    const warehouse = await this.warehouseRepository.findOne({ where: { id } });
    if (!warehouse) throw new NotFoundException('Warehouse topilmadi');
    await this.warehouseRepository.delete(warehouse.id);
    return { message: "Warehouse o'chirildi" };
  }

  async getProductsByWarehouseId(id: string) {
    const warehouse = await this.warehouseRepository.findOne({
      where: { id },
    });

    if (!warehouse) {
      throw new NotFoundException('Warehouse topilmadi');
    }

    return this.productRepository.find({
      where: {
        warehouse: {
          id,
        },
      },
      order: {
        name: 'ASC',
      },
    });
  }
}
