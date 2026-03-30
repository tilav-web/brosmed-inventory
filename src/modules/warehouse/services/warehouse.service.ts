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
import { Expense } from 'src/modules/expense/entities/expense.entity';
import { Product } from 'src/modules/product/entities/product.entity';
import { ProductBatch } from 'src/modules/product/entities/product-batch.entity';
import { Role } from 'src/modules/user/enums/role.enum';
import { User } from 'src/modules/user/entities/user.entity';
import { ExpenseItem } from 'src/modules/expense/entities/expense-item.entity';
import { Category } from 'src/modules/category/entities/category.entity';
import { CreateWarehouseDto } from '../dto/create-warehouse.dto';
import { GetWarehouseDashboardQueryDto } from '../dto/get-warehouse-dashboard-query.dto';
import { ListWarehousesQueryDto } from '../dto/list-warehouses-query.dto';
import { ListWarehouseExpensesQueryDto } from '../dto/list-warehouse-expenses-query.dto';
import { UpdateWarehouseDto } from '../dto/update-warehouse.dto';
import { Warehouse } from '../entities/warehouse.entity';
import { ExpenseStatus } from 'src/modules/expense/enums/expense-status.enum';

interface CategoryStatsRaw {
  id: string;
  name: string;
  total_positions: string;
  total_quantity: string;
}

export interface WarehouseWithTotalValue extends Warehouse {
  total_inventory_value: number;
}

type DashboardWarehouseView = {
  id: string;
  name: string;
  type: Warehouse['type'];
  location: string;
  manager: {
    id: string;
    first_name: string;
    last_name: string;
  } | null;
};

type WarehouseDashboardSummary = {
  total_products: number;
  pending_issue: number;
  low_stock: number;
  expiring_soon: number;
};

type WarehouseRecentExpenseView = {
  id: string;
  expense_number: string;
  created_at: Date;
  staff_name: string;
  purpose: string | null;
  status: ExpenseStatus;
  total_price: number;
  issued_at: Date | null;
  confirmed_at: Date | null;
};

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
    @InjectRepository(Expense)
    private readonly expenseRepository: Repository<Expense>,
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

  private mapDashboardWarehouse(warehouse: Warehouse): DashboardWarehouseView {
    return {
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
    };
  }

  private normalizeRecentLimit(limit?: number) {
    return Math.min(limit ?? 5, 20);
  }

  private async getWarehouseOrThrow(id: string) {
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

  private async getManagedWarehouseByUser(userId: string) {
    const warehouses = await this.warehouseRepository.find({
      where: { manager_id: userId },
      relations: {
        manager: true,
      },
      order: {
        createdAt: 'ASC',
      },
    });

    if (!warehouses.length) {
      throw new NotFoundException(
        'Foydalanuvchiga biriktirilgan warehouse topilmadi',
      );
    }

    if (warehouses.length > 1) {
      throw new ConflictException(
        "Warehouse userga faqat bitta warehouse biriktirilishi kerak",
      );
    }

    return warehouses[0];
  }

  private async buildDashboardSummary(
    warehouseId: string,
  ): Promise<WarehouseDashboardSummary> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const in30Days = new Date(today);
    in30Days.setDate(in30Days.getDate() + 30);
    in30Days.setHours(23, 59, 59, 999);

    const [
      totalProducts,
      lowStockCount,
      expiringSoonCount,
      pendingIssueRaw,
    ] = await Promise.all([
      this.productRepository
        .createQueryBuilder('product')
        .where('product.warehouse_id = :warehouseId', { warehouseId })
        .getCount(),
      this.productRepository
        .createQueryBuilder('product')
        .where('product.warehouse_id = :warehouseId', { warehouseId })
        .andWhere('product.quantity > 0')
        .andWhere('product.quantity <= product.min_limit')
        .getCount(),
      this.productBatchRepository
        .createQueryBuilder('batch')
        .where('batch.warehouse_id = :warehouseId', { warehouseId })
        .andWhere('batch.quantity > 0')
        .andWhere('batch.expiration_date IS NOT NULL')
        .andWhere('batch.expiration_date >= :today', { today })
        .andWhere('batch.expiration_date <= :in30Days', { in30Days })
        .getCount(),
      this.expenseItemRepository
        .createQueryBuilder('item')
        .leftJoin('item.expense', 'expense')
        .select('COUNT(DISTINCT expense.id)', 'count')
        .where('item.warehouse_id = :warehouseId', { warehouseId })
        .andWhere('expense.status = :status', {
          status: ExpenseStatus.PENDING_ISSUE,
        })
        .getRawOne<{ count: string | null }>(),
    ]);

    return {
      total_products: totalProducts,
      pending_issue: Number(pendingIssueRaw?.count ?? 0),
      low_stock: lowStockCount,
      expiring_soon: expiringSoonCount,
    };
  }

  private async getRecentExpenses(
    warehouseId: string,
    recentLimit: number,
  ): Promise<WarehouseRecentExpenseView[]> {
    const rows = await this.expenseRepository
      .createQueryBuilder('expense')
      .innerJoin(
        'expense.items',
        'item',
        'item.warehouse_id = :warehouseId',
        { warehouseId },
      )
      .select('expense.id', 'id')
      .addSelect('expense.expense_number', 'expense_number')
      .addSelect('expense.createdAt', 'created_at')
      .addSelect('expense.staff_name', 'staff_name')
      .addSelect('expense.purpose', 'purpose')
      .addSelect('expense.status', 'status')
      .addSelect('expense.total_price', 'total_price')
      .addSelect('expense.issued_at', 'issued_at')
      .addSelect('expense.confirmed_at', 'confirmed_at')
      .groupBy('expense.id')
      .addGroupBy('expense.expense_number')
      .addGroupBy('expense.createdAt')
      .addGroupBy('expense.staff_name')
      .addGroupBy('expense.purpose')
      .addGroupBy('expense.status')
      .addGroupBy('expense.total_price')
      .addGroupBy('expense.issued_at')
      .addGroupBy('expense.confirmed_at')
      .orderBy('expense.createdAt', 'DESC')
      .limit(recentLimit)
      .getRawMany<{
        id: string;
        expense_number: string;
        created_at: Date;
        staff_name: string;
        purpose: string | null;
        status: ExpenseStatus;
        total_price: string;
        issued_at: Date | null;
        confirmed_at: Date | null;
      }>();

    return rows.map((expense) => ({
      id: expense.id,
      expense_number: expense.expense_number,
      created_at: expense.created_at,
      staff_name: expense.staff_name,
      purpose: expense.purpose,
      status: expense.status,
      total_price: Number(Number(expense.total_price ?? 0).toFixed(2)),
      issued_at: expense.issued_at,
      confirmed_at: expense.confirmed_at,
    }));
  }

  async getDashboardByUser(
    userId: string,
    query: GetWarehouseDashboardQueryDto,
  ) {
    const warehouse = await this.getManagedWarehouseByUser(userId);
    const recentLimit = this.normalizeRecentLimit(query.recent_limit);
    const [summary, recentExpenses] = await Promise.all([
      this.buildDashboardSummary(warehouse.id),
      this.getRecentExpenses(warehouse.id, recentLimit),
    ]);

    return {
      warehouses: [this.mapDashboardWarehouse(warehouse)],
      summary: {
        ...summary,
        warehouses_count: 1,
      },
      recent_expenses: recentExpenses,
    };
  }

  async getDashboard(id: string, query: GetWarehouseDashboardQueryDto) {
    const warehouse = await this.getWarehouseOrThrow(id);
    const recentLimit = this.normalizeRecentLimit(query.recent_limit);
    const [summary, recentExpenses] = await Promise.all([
      this.buildDashboardSummary(id),
      this.getRecentExpenses(id, recentLimit),
    ]);

    return {
      warehouse: this.mapDashboardWarehouse(warehouse),
      summary,
      recent_expenses: recentExpenses,
    };
  }

  async getMyWarehouse(userId: string): Promise<WarehouseWithTotalValue> {
    const warehouse = await this.getManagedWarehouseByUser(userId);
    return this.findById(warehouse.id);
  }

  async getMyDashboard(userId: string) {
    const warehouse = await this.getManagedWarehouseByUser(userId);
    return {
      warehouse: this.mapDashboardWarehouse(warehouse),
    };
  }

  async getMyDashboardStats(userId: string) {
    const warehouse = await this.getManagedWarehouseByUser(userId);
    return {
      warehouse: this.mapDashboardWarehouse(warehouse),
      summary: await this.buildDashboardSummary(warehouse.id),
    };
  }

  async getMyRecentExpenses(
    userId: string,
    query: GetWarehouseDashboardQueryDto,
  ) {
    const warehouse = await this.getManagedWarehouseByUser(userId);
    return {
      warehouse: this.mapDashboardWarehouse(warehouse),
      data: await this.getRecentExpenses(
        warehouse.id,
        this.normalizeRecentLimit(query.recent_limit),
      ),
    };
  }

  async getMyDetails(userId: string) {
    const warehouse = await this.getManagedWarehouseByUser(userId);
    return this.findByIdWithDetails(warehouse.id);
  }

  async getMyWarehouseExpenses(
    userId: string,
    query: ListWarehouseExpensesQueryDto,
  ) {
    const warehouse = await this.getManagedWarehouseByUser(userId);
    const expenses = await this.getWarehouseExpenses(warehouse.id, query);
    return {
      warehouse: this.mapDashboardWarehouse(warehouse),
      ...expenses,
    };
  }

  async getMyProducts(userId: string) {
    const warehouse = await this.getManagedWarehouseByUser(userId);
    return {
      warehouse: this.mapDashboardWarehouse(warehouse),
      data: await this.getProductsByWarehouseId(warehouse.id),
    };
  }

  async getMyCategoryStats(
    userId: string,
    query: { page?: number; limit?: number },
  ) {
    const warehouse = await this.getManagedWarehouseByUser(userId);
    const stats = await this.getCategoryStats(warehouse.id, query);
    return {
      warehouse: this.mapDashboardWarehouse(warehouse),
      ...stats,
    };
  }

  async getMyLowStockProducts(
    userId: string,
    query: { page?: number; limit?: number },
  ) {
    const warehouse = await this.getManagedWarehouseByUser(userId);
    const products = await this.getLowStockProductsPaginated(warehouse.id, query);
    return {
      warehouse: this.mapDashboardWarehouse(warehouse),
      ...products,
    };
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

    const qb = this.expenseRepository
      .createQueryBuilder('expense')
      .innerJoin('expense.items', 'item', 'item.warehouse_id = :id', { id })
      .leftJoin('item.product', 'product');

    if (search) {
      qb.andWhere(
        '(expense.staff_name ILIKE :search OR expense.purpose ILIKE :search OR product.name ILIKE :search)',
        { search: `%${search}%` },
      );
    }

    if (query.status) {
      qb.andWhere('expense.status = :status', {
        status: query.status,
      });
    }

    if (query.date_from || query.date_to) {
      const from = query.date_from ? new Date(query.date_from) : null;
      const to = query.date_to ? new Date(query.date_to) : null;
      if (from) from.setHours(0, 0, 0, 0);
      if (to) to.setHours(23, 59, 59, 999);
      if (from) {
        qb.andWhere('expense.createdAt >= :from', { from });
      }
      if (to) {
        qb.andWhere('expense.createdAt <= :to', { to });
      }
    }

    const totalRaw = await qb
      .clone()
      .select('COUNT(DISTINCT expense.id)', 'count')
      .getRawOne<{ count: string | null }>();

    const rows = await qb
      .clone()
      .select('expense.id', 'id')
      .addSelect('expense.expense_number', 'expense_number')
      .addSelect('expense.createdAt', 'created_at')
      .addSelect('expense.staff_name', 'staff_name')
      .addSelect('expense.purpose', 'purpose')
      .addSelect('expense.status', 'status')
      .addSelect('expense.total_price', 'total_price')
      .addSelect('expense.issued_at', 'issued_at')
      .addSelect('expense.confirmed_at', 'confirmed_at')
      .groupBy('expense.id')
      .addGroupBy('expense.expense_number')
      .addGroupBy('expense.createdAt')
      .addGroupBy('expense.staff_name')
      .addGroupBy('expense.purpose')
      .addGroupBy('expense.status')
      .addGroupBy('expense.total_price')
      .addGroupBy('expense.issued_at')
      .addGroupBy('expense.confirmed_at')
      .orderBy('expense.createdAt', 'DESC')
      .offset((page - 1) * limit)
      .limit(limit)
      .getRawMany<{
        id: string;
        expense_number: string;
        created_at: Date;
        staff_name: string;
        purpose: string | null;
        status: ExpenseStatus;
        total_price: string;
        issued_at: Date | null;
        confirmed_at: Date | null;
      }>();

    const total = Number(totalRaw?.count ?? 0);

    const data = rows.map((expense) => ({
      id: expense.id,
      expense_number: expense.expense_number,
      created_at: expense.created_at,
      staff_name: expense.staff_name,
      purpose: expense.purpose,
      status: expense.status,
      total_price: Number(Number(expense.total_price ?? 0).toFixed(2)),
      issued_at: expense.issued_at,
      confirmed_at: expense.confirmed_at,
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

  async getLowStockProductsPaginated(
    warehouseId: string,
    query: { page?: number; limit?: number },
  ) {
    const page = query.page ?? 1;
    const limit = Math.min(query.limit ?? 10, 100);

    const qb = this.productRepository
      .createQueryBuilder('product')
      .leftJoinAndSelect('product.category', 'category')
      .leftJoinAndSelect('product.supplier', 'supplier')
      .where('product.warehouse_id = :warehouseId', { warehouseId })
      .andWhere('product.quantity <= product.min_limit')
      .andWhere('product.quantity > 0')
      .orderBy('product.quantity', 'ASC');

    const [items, total] = await qb.getManyAndCount();

    const data = items.slice((page - 1) * limit, page * limit).map((p) => ({
      id: p.id,
      name: p.name,
      category: p.category?.name || 'Без категории',
      current_stock: Number(p.quantity),
      min_limit: p.min_limit,
      unit: p.unit,
      deficit: p.min_limit - Number(p.quantity),
      supplier: p.supplier
        ? { id: p.supplier.id, company_name: p.supplier.company_name }
        : null,
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
        id: s.id,
        name: s.name || 'Без категории',
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

  private async ensureWarehouseManagerCanBeAssigned(
    managerId: string,
    currentWarehouseId?: string,
  ): Promise<User> {
    const manager = await this.ensureWarehouseManager(managerId);

    const assignedWarehouses = await this.warehouseRepository.find({
      where: { manager_id: manager.id },
      select: { id: true },
    });

    const conflictingAssignment = assignedWarehouses.find(
      (warehouse) => warehouse.id !== currentWarehouseId,
    );

    if (conflictingAssignment) {
      throw new ConflictException(
        "Warehouse role'li userga faqat bitta warehouse biriktirilishi mumkin",
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

    const manager = await this.ensureWarehouseManagerCanBeAssigned(
      dto.manager_id,
    );

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
      const manager = await this.ensureWarehouseManagerCanBeAssigned(
        dto.manager_id,
        warehouse.id,
      );
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
