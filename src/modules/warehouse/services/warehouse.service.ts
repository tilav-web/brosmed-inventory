import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ILike, Repository } from 'typeorm';
import { Product } from 'src/modules/product/entities/product.entity';
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
  ) {}

  async findAll(query: ListWarehousesQueryDto) {
    const page = query.page ?? 1;
    const limit = Math.min(query.limit ?? 10, 100);
    const search = query.search?.trim();

    const [warehouses, total] = await this.warehouseRepository.findAndCount({
      where: search
        ? {
            name: ILike(`%${search}%`),
          }
        : undefined,
      relations: {
        manager: true,
      },
      order: {
        createdAt: 'DESC',
      },
      skip: (page - 1) * limit,
      take: limit,
    });

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

    return warehouse;
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
    const warehouse = await this.findById(id);

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
    const warehouse = await this.findById(id);
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
