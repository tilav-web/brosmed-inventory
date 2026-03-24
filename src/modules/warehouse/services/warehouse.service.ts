import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ILike, Repository } from 'typeorm';
import Redis from 'ioredis';
import { Product } from 'src/modules/product/entities/product.entity';
import { ProductBatch } from 'src/modules/product/entities/product-batch.entity';
import { Role } from 'src/modules/user/enums/role.enum';
import { User } from 'src/modules/user/entities/user.entity';
import { ExpenseItem } from 'src/modules/expense/entities/expense-item.entity';
import { Category } from 'src/modules/category/entities/category.entity';
import { CreateWarehouseDto } from '../dto/create-warehouse.dto';
import { ListWarehousesQueryDto } from '../dto/list-warehouses-query.dto';
import { ListWarehouseExpensesQueryDto } from '../dto/list-warehouse-expenses-query.dto';
import { UpdateWarehouseDto } from '../dto/update-warehouse.dto';
import { Warehouse } from '../entities/warehouse.entity';

interface CategoryStatsRaw {
  category_id: string;
  category_name: string;
  total_positions: string;
  total_quantity: string;
}

export interface WarehouseWithTotalValue extends Warehouse {
  total_inventory_value: number;
}

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
    @InjectRepository(ExpenseItem)
    private readonly expenseItemRepository: Repository<ExpenseItem>,
    @InjectRepository(Category)
    private readonly categoryRepository: Repository<Category>,
    @Inject('REDIS_CLIENT')
    private readonly redis: Redis,
  ) {}

  async findAll(query: ListWarehousesQueryDto) {
    const page = query.page ?? 1;
    const limit = Math.min(query.limit ?? 10, 100);
    const search = query.search?.trim();

    const cacheKey = `warehouses:all:${page}:${limit}:${search ?? 'none'}`;
    const cachedData = await this.redis.get(cacheKey);

    if (cachedData) {
      return JSON.parse(cachedData) as Record<string, unknown>;
    }

    const qb = this.warehouseRepository
      .createQueryBuilder('warehouse')
      .leftJoinAndSelect('warehouse.manager', 'manager')
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

    const result = {
      data: warehouses,
      meta: {
        page,
        limit,
        total,
        total_pages: Math.ceil(total / limit) || 1,
      },
    };

    // 5 daqiqaga keshga saqlash
    await this.redis.set(cacheKey, JSON.stringify(result), 'EX', 300);

    return result;
  }

  async findById(id: string): Promise<WarehouseWithTotalValue> {
    const cacheKey = `warehouse:${id}`;
    const cachedData = await this.redis.get(cacheKey);

    if (cachedData) {
      return JSON.parse(cachedData) as WarehouseWithTotalValue;
    }

    const warehouse = await this.warehouseRepository.findOne({
      where: { id },
      relations: {
        manager: true,
      },
    });

    if (!warehouse) {
      throw new NotFoundException('Warehouse topilmadi');
    }

    const totalValueRaw = await this.productBatchRepository
      .createQueryBuilder('batch')
      .select('SUM(batch.quantity * batch.price_at_purchase)', 'total')
      .where('batch.warehouse_id = :id', { id })
      .andWhere('batch.quantity > 0')
      .getRawOne<{ total: string | null }>();

    const result = {
      ...warehouse,
      total_inventory_value: Number(
        Number(totalValueRaw?.total ?? 0).toFixed(2),
      ),
    };

    await this.redis.set(cacheKey, JSON.stringify(result), 'EX', 300);

    return result;
  }

  async findByIdWithDetails(id: string) {
    const warehouse = await this.warehouseRepository.findOne({
      where: { id },
      relations: {
        manager: true,
      },
    });

    if (!warehouse) {
      throw new NotFoundException('Warehouse topilmadi');
    }

    const [lowStockProducts, alerts] = await Promise.all([
      this.getLowStockProducts(id),
      this.getAlerts(id),
    ]);

    return {
      warehouse: {
        id: warehouse.id,
        name: warehouse.name,
        type: warehouse.type,
        location: warehouse.location,
        manager: warehouse.manager
          ? {
              id: warehouse.manager.id,
              first_name: warehouse.manager.first_name,
              last_name: warehouse.manager.last_name,
            }
          : null,
      },
      alerts,
      low_stock_products: lowStockProducts,
    };
  }

  async getWarehouseExpenses(id: string, query: ListWarehouseExpensesQueryDto) {
    const warehouse = await this.warehouseRepository.findOne({ where: { id } });
    if (!warehouse) {
      throw new NotFoundException('Warehouse topilmadi');
    }

    const page = query.page ?? 1;
    const limit = Math.min(query.limit ?? 10, 100);
    const search = query.search?.trim();

    const qb = this.expenseItemRepository
      .createQueryBuilder('item')
      .leftJoinAndSelect('item.expense', 'expense')
      .leftJoinAndSelect('item.product', 'product')
      .leftJoinAndSelect('item.product_batch', 'batch')
      .where('item.warehouse_id = :id', { id })
      .andWhere('expense.status = :status', { status: 'выдано' });

    if (search) {
      qb.andWhere(
        '(expense.staff_name ILIKE :search OR expense.purpose ILIKE :search OR product.name ILIKE :search)',
        { search: `%${search}%` },
      );
    }

    qb.orderBy('expense.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    const [items, total] = await qb.getManyAndCount();

    const data = items.map((item) => ({
      id: item.id,
      date: item.expense?.createdAt,
      staff_name: item.expense?.staff_name,
      product_name: item.product?.name,
      quantity: item.quantity,
      unit: item.product?.unit,
      purpose: item.expense?.purpose,
    }));

    return {
      data,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  private async getLowStockProducts(warehouseId: string) {
    const products = await this.productRepository
      .createQueryBuilder('product')
      .leftJoinAndSelect('product.category', 'category')
      .where('product.warehouse_id = :warehouseId', { warehouseId })
      .andWhere('product.quantity <= product.min_limit')
      .andWhere('product.quantity > 0')
      .getMany();

    return products.map((product) => ({
      id: product.id,
      name: product.name,
      category: product.category?.name || 'Без категории',
      current_stock: product.quantity,
      min_limit: product.min_limit,
      unit: product.unit,
    }));
  }

  async getCategoryStats(
    warehouseId: string,
    query: { page?: number; limit?: number },
  ) {
    const page = query.page ?? 1;
    const limit = Math.min(query.limit ?? 10, 100);

    const qb = this.productRepository
      .createQueryBuilder('product')
      .leftJoin('product.category', 'category')
      .select('category.id', 'id')
      .addSelect('category.name', 'name')
      .addSelect('COUNT(product.id)', 'total_positions')
      .addSelect('COALESCE(SUM(product.quantity), 0)', 'total_quantity')
      .where('product.warehouse_id = :warehouseId', { warehouseId })
      .groupBy('category.id')
      .addGroupBy('category.name');

    const allStats: CategoryStatsRaw[] = await qb.getRawMany();
    const total = allStats.length;
    const data = allStats.slice((page - 1) * limit, page * limit);

    const lowStockCount = await this.productRepository
      .createQueryBuilder('product')
      .where('product.warehouse_id = :warehouseId', { warehouseId })
      .andWhere('product.quantity <= product.min_limit')
      .andWhere('product.quantity > 0')
      .getCount();

    return {
      data: data.map((s) => ({
        category_id: s.category_id,
        category_name: s.category_name || 'Без категории',
        total_positions: parseInt(s.total_positions, 10),
        total_quantity: parseInt(s.total_quantity, 10),
      })),
      low_stock_count: lowStockCount,
      purchase_required_count: lowStockCount,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  private async getAlerts(warehouseId: string) {
    const lowStockProducts = await this.productRepository
      .createQueryBuilder('product')
      .where('product.warehouse_id = :warehouseId', { warehouseId })
      .andWhere('product.quantity <= product.min_limit')
      .andWhere('product.quantity > 0')
      .getMany();

    const expiringProducts = await this.productBatchRepository
      .createQueryBuilder('batch')
      .where('batch.warehouse_id = :warehouseId', { warehouseId })
      .andWhere('batch.expiration_alert_date <= :today', {
        today: new Date().toISOString().split('T')[0],
      })
      .andWhere('batch.quantity > 0')
      .getMany();

    const alerts: Array<{
      type: string;
      message: string;
      product_name?: string;
    }> = [];

    for (const product of lowStockProducts) {
      alerts.push({
        type: 'low_stock',
        message: `${product.name}: qoldiq qayta buyurtma chegarasidan past`,
        product_name: product.name,
      });
    }

    for (const batch of expiringProducts) {
      const product = await this.productRepository.findOne({
        where: { id: batch.product_id },
      });
      alerts.push({
        type: 'expiring',
        message: `${product?.name || 'Nomaʼlum'}: yaroqlilik muddati tugayapti ${batch.expiration_date ? new Date(batch.expiration_date).toLocaleDateString() : 'N/A'}`,
        product_name: product?.name,
      });
    }

    return {
      count: alerts.length,
      items: alerts.slice(0, 10),
    };
  }

  private async clearCache() {
    const keys = await this.redis.keys('warehouses:*');
    if (keys.length > 0) {
      await this.redis.del(...keys);
    }
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

    const saved = await this.warehouseRepository.save(
      this.warehouseRepository.create({
        name: dto.name,
        type: dto.type,
        location: dto.location,
        manager_id: manager.id,
      }),
    );

    await this.clearCache();
    return saved;
  }

  async update(id: string, dto: UpdateWarehouseDto) {
    const warehouse = await this.warehouseRepository.findOne({
      where: { id },
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

    const saved = await this.warehouseRepository.save(warehouse);
    await this.redis.del(`warehouse:${id}`);
    await this.clearCache();
    return saved;
  }

  async delete(id: string) {
    const warehouse = await this.warehouseRepository.findOne({ where: { id } });
    if (!warehouse) throw new NotFoundException('Warehouse topilmadi');

    const expenseItems = await this.expenseItemRepository
      .createQueryBuilder('item')
      .where('item.warehouse_id = :id', { id })
      .getCount();

    if (expenseItems > 0) {
      throw new ConflictException(
        `Bu warehouse ga ${expenseItems} ta chiqim bog'langan. Avval chiqimlarni o'chiring.`,
      );
    }

    const products = await this.productRepository.count({
      where: { warehouse_id: id },
    });
    if (products > 0) {
      throw new ConflictException(
        `Bu warehouse da ${products} ta mahsulot bor. Avval mahsulotlarni o'chiring yoki boshqa omborga ko'chiring.`,
      );
    }

    await this.warehouseRepository.delete(warehouse.id);
    await this.redis.del(`warehouse:${id}`);
    await this.clearCache();
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
