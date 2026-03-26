import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  DataSource,
  EntityManager,
  Repository,
  SelectQueryBuilder,
} from 'typeorm';
import Redis from 'ioredis';
import { Product } from 'src/modules/product/entities/product.entity';
import { ProductBatch } from 'src/modules/product/entities/product-batch.entity';
import { PurchaseOrder } from 'src/modules/purchase-order/entities/purchase-order.entity';
import { OrderStatus } from 'src/modules/purchase-order/enums/order-status.enum';
import { User } from 'src/modules/user/entities/user.entity';
import { Warehouse } from 'src/modules/warehouse/entities/warehouse.entity';
import { CreateExpenseDto } from '../dto/create-expense.dto';
import { ListExpensesQueryDto } from '../dto/list-expenses-query.dto';
import { ExpenseStatus } from '../enums/expense-status.enum';
import { ExpenseType } from '../enums/expense-type.enum';
import { ExpenseItem } from '../entities/expense-item.entity';
import { Expense } from '../entities/expense.entity';
import { ListExpenseItemsQueryDto } from '../dto/list-expense-items-query.dto';

export interface ReceiptItem {
  product_id: string;
  product_name: string;
  warehouse_id: string;
  warehouse_name: string;
  batch_id: string;
  quantity: number;
  unit: string;
  price: number;
  line_total: number;
}

type DashboardSeverity = 'high' | 'medium';
type DashboardAlertType = 'expired' | 'expiring_soon' | 'low_stock';

export interface DashboardAlertItem {
  type: DashboardAlertType;
  severity: DashboardSeverity;
  message: string;
  product_id: string;
  product_name: string;
  warehouse_id: string;
  warehouse_name: string;
  quantity?: number;
  min_limit?: number;
  batch_id?: string;
  expiration_date?: string | null;
  days_left?: number | null;
  created_at: string;
}

export interface DashboardOverview {
  generated_at: string;
  headline_alerts: {
    total: number;
    high: number;
    medium: number;
    items: DashboardAlertItem[];
  };
  summary: {
    total_products: number;
    low_stock_products: number;
    expiring_products: number;
    total_inventory_value: number;
    total_warehouses: number;
    pending_orders: number;
    expired_products: number;
  };
  charts: {
    inventory_value_by_warehouse: Array<{
      warehouse_id: string;
      warehouse_name: string;
      total_inventory_value: number;
    }>;
    stock_status_distribution: {
      total: number;
      items: Array<{
        status: 'normal' | 'low_stock' | 'expired';
        label: string;
        count: number;
        percentage: number;
      }>;
    };
    products_by_category: Array<{
      category_id: string | null;
      category_name: string;
      product_count: number;
    }>;
    product_count_by_warehouse: Array<{
      warehouse_id: string;
      warehouse_name: string;
      product_count: number;
    }>;
  };
  recent_notifications: DashboardAlertItem[];
}

@Injectable()
export class ExpenseService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(Expense)
    private readonly expenseRepository: Repository<Expense>,
    @InjectRepository(ExpenseItem)
    private readonly expenseItemRepository: Repository<ExpenseItem>,
    @InjectRepository(Product)
    private readonly productRepository: Repository<Product>,
    @InjectRepository(ProductBatch)
    private readonly productBatchRepository: Repository<ProductBatch>,
    @InjectRepository(PurchaseOrder)
    private readonly purchaseOrderRepository: Repository<PurchaseOrder>,
    @InjectRepository(Warehouse)
    private readonly warehouseRepository: Repository<Warehouse>,
    @Inject('REDIS_CLIENT')
    private readonly redis: Redis,
  ) {}

  async findAll(query: ListExpensesQueryDto) {
    const page = query.page ?? 1;
    const limit = Math.min(query.limit ?? 10, 100);
    const search = query.search?.trim();

    const qb = this.expenseRepository
      .createQueryBuilder('expense')
      .leftJoinAndSelect('expense.manager', 'manager')
      .leftJoinAndSelect('expense.items', 'item')
      .leftJoinAndSelect('item.product', 'product')
      .leftJoinAndSelect('item.warehouse', 'warehouse');

    if (search) {
      qb.andWhere(
        '(expense.staff_name ILIKE :search OR expense.purpose ILIKE :search OR expense.expense_number ILIKE :search)',
        {
          search: `%${search}%`,
        },
      );
    }

    if (query.status) {
      qb.andWhere('expense.status = :status', { status: query.status });
    }

    if (query.type) {
      qb.andWhere('expense.type = :type', { type: query.type });
    }

    qb.orderBy('expense.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    const [expenses, total] = await qb.getManyAndCount();

    return {
      data: expenses,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  async findAllItems(query: ListExpenseItemsQueryDto) {
    const page = query.page ?? 1;
    const limit = Math.min(query.limit ?? 10, 100);
    const search = query.search?.trim();

    const qb = this.expenseItemRepository
      .createQueryBuilder('item')
      .leftJoinAndSelect('item.expense', 'expense')
      .leftJoinAndSelect('item.product', 'product')
      .leftJoinAndSelect('item.warehouse', 'warehouse');

    if (search) {
      qb.andWhere(
        '(expense.staff_name ILIKE :search OR expense.purpose ILIKE :search OR expense.expense_number ILIKE :search OR product.name ILIKE :search OR warehouse.name ILIKE :search)',
        { search: `%${search}%` },
      );
    }

    if (query.status) {
      qb.andWhere('expense.status = :status', { status: query.status });
    }

    if (query.type) {
      qb.andWhere('expense.type = :type', { type: query.type });
    }

    if (query.warehouse_id) {
      qb.andWhere('warehouse.id = :warehouseId', {
        warehouseId: query.warehouse_id,
      });
    }

    this.applyDateRangeFilter(qb, 'expense.createdAt', query);

    qb.orderBy('expense.createdAt', 'DESC')
      .addOrderBy('item.id', 'ASC')
      .skip((page - 1) * limit)
      .take(limit);

    const [items, total] = await qb.getManyAndCount();

    const data = items.map((item) => ({
      id: item.id,
      date: item.expense?.createdAt ?? null,
      staff_name: item.expense?.staff_name ?? null,
      purpose: item.expense?.purpose ?? null,
      expense_id: item.expense?.id ?? null,
      expense_number: item.expense?.expense_number ?? null,
      status: item.expense?.status ?? null,
      type: item.expense?.type ?? null,
      warehouse: item.warehouse
        ? { id: item.warehouse.id, name: item.warehouse.name }
        : null,
      product: item.product
        ? {
            id: item.product.id,
            name: item.product.name,
            unit: item.product.unit,
          }
        : null,
      quantity: item.quantity,
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

  async getWarehouseStats(query: ListExpenseItemsQueryDto) {
    const search = query.search?.trim();

    const qb = this.expenseItemRepository
      .createQueryBuilder('item')
      .leftJoin('item.expense', 'expense')
      .leftJoin('item.product', 'product')
      .leftJoin('item.warehouse', 'warehouse')
      .select('warehouse.id', 'warehouse_id')
      .addSelect('warehouse.name', 'warehouse_name')
      .addSelect('COUNT(item.id)', 'count')
      .groupBy('warehouse.id')
      .addGroupBy('warehouse.name');

    if (search) {
      qb.andWhere(
        '(expense.staff_name ILIKE :search OR expense.purpose ILIKE :search OR expense.expense_number ILIKE :search OR product.name ILIKE :search OR warehouse.name ILIKE :search)',
        { search: `%${search}%` },
      );
    }

    if (query.status) {
      qb.andWhere('expense.status = :status', { status: query.status });
    }

    if (query.type) {
      qb.andWhere('expense.type = :type', { type: query.type });
    }

    if (query.warehouse_id) {
      qb.andWhere('warehouse.id = :warehouseId', {
        warehouseId: query.warehouse_id,
      });
    }

    this.applyDateRangeFilter(qb, 'expense.createdAt', query);

    qb.orderBy('warehouse.name', 'ASC');

    const rows = await qb.getRawMany<{
      warehouse_id: string;
      warehouse_name: string;
      count: string;
    }>();

    return rows.map((row) => ({
      warehouse_id: row.warehouse_id,
      warehouse_name: row.warehouse_name,
      count: Number(row.count ?? 0),
    }));
  }

  async findById(id: string) {
    const expense = await this.expenseRepository.findOne({
      where: { id },
      relations: {
        manager: true,
        items: {
          product: true,
          warehouse: true,
          product_batch: true,
        },
      },
    });

    if (!expense) {
      throw new NotFoundException('Expense topilmadi');
    }

    return expense;
  }

  private async generateExpenseNumber(manager: EntityManager): Promise<string> {
    const year = new Date().getFullYear();

    await manager.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
      `expense:${year}`,
    ]);

    const result = await manager
      .getRepository(Expense)
      .createQueryBuilder('expense')
      .select("MAX(CAST(SPLIT_PART(expense.expense_number, '-', 3) AS int))", 'max')
      .where('expense.expense_number LIKE :prefix', {
        prefix: `EXP-${year}-%`,
      })
      .getRawOne<{ max: string | null }>();

    const last = result?.max ? parseInt(result.max, 10) : 0;
    const next = String(last + 1).padStart(3, '0');
    return `EXP-${year}-${next}`;
  }

  private async lockProductForUpdate(
    manager: EntityManager,
    productId: string,
  ): Promise<Product> {
    const product = await manager
      .getRepository(Product)
      .createQueryBuilder('product')
      .setLock('pessimistic_write')
      .where('product.id = :productId', { productId })
      .getOne();

    if (!product) {
      throw new NotFoundException(`Product topilmadi: ${productId}`);
    }

    return product;
  }

  private async lockBatchForUpdate(
    manager: EntityManager,
    batchId: string,
  ): Promise<ProductBatch> {
    const batch = await manager
      .getRepository(ProductBatch)
      .createQueryBuilder('batch')
      .setLock('pessimistic_write')
      .where('batch.id = :batchId', { batchId })
      .getOne();

    if (!batch) {
      throw new NotFoundException(`Batch topilmadi: ${batchId}`);
    }

    return batch;
  }

  private async recalculateProductQuantity(
    manager: EntityManager,
    product: Product,
  ): Promise<void> {
    const totalRaw = await manager
      .getRepository(ProductBatch)
      .createQueryBuilder('batch')
      .select('COALESCE(SUM(batch.quantity), 0)', 'total')
      .where('batch.product_id = :productId', {
        productId: product.id,
      })
      .getRawOne<{ total: string | null }>();

    product.quantity = Number(Number(totalRaw?.total ?? 0).toFixed(2));
    await manager.getRepository(Product).save(product);
  }

  private async getReservedBatchQuantity(
    manager: EntityManager,
    batchId: string,
  ): Promise<number> {
    const reservedRaw = await manager
      .getRepository(ExpenseItem)
      .createQueryBuilder('item')
      .leftJoin('item.expense', 'expense')
      .select('COALESCE(SUM(item.quantity), 0)', 'reserved')
      .where('item.product_batch_id = :batchId', { batchId })
      .andWhere('expense.status = :status', {
        status: ExpenseStatus.PENDING_ISSUE,
      })
      .getRawOne<{ reserved: string | null }>();

    return Number(Number(reservedRaw?.reserved ?? 0).toFixed(2));
  }

  async createAndGetReceipt(dto: CreateExpenseDto, managerId?: string) {
    const result = await this.dataSource.transaction(async (manager) => {
      const expenseRepo = manager.getRepository(Expense);
      const expenseItemRepo = manager.getRepository(ExpenseItem);
      const productRepo = manager.getRepository(Product);
      const productBatchRepo = manager.getRepository(ProductBatch);
      const warehouseRepo = manager.getRepository(Warehouse);
      const userRepo = manager.getRepository(User);

      const managerUser = managerId
        ? await userRepo.findOne({ where: { id: managerId } })
        : null;

      const expenseNumber = await this.generateExpenseNumber(manager);
      const expenseType = dto.type ?? ExpenseType.USAGE;

      const createdExpense = await expenseRepo.save(
        expenseRepo.create({
          expense_number: expenseNumber,
          status: ExpenseStatus.PENDING_ISSUE,
          type: expenseType,
          images: [],
          total_price: 0,
          staff_name: dto.staff_name,
          purpose: dto.purpose ?? null,
          manager_id: managerUser?.id ?? null,
        }),
      );

      const receiptItems: ReceiptItem[] = [];
      let totalPrice = 0;
      const requestReservedByBatch = new Map<string, number>();
      const existingReservedByBatch = new Map<string, number>();

      for (const item of dto.items) {
        const batch = await this.lockBatchForUpdate(manager, item.product_batch_id);

        if (!batch) {
          throw new NotFoundException(
            `Ma'lumot topilmadi: Batch=${item.product_batch_id}`,
          );
        }

        const productId = item.product_id ?? batch.product_id;
        const warehouseId = item.warehouse_id ?? batch.warehouse_id;

        const [product, warehouse] = await Promise.all([
          productRepo.findOne({ where: { id: productId } }),
          warehouseRepo.findOne({ where: { id: warehouseId } }),
        ]);

        if (!product || !warehouse || !batch) {
          throw new NotFoundException(
            `Ma'lumot topilmadi: Product=${productId}, Warehouse=${warehouseId}, Batch=${item.product_batch_id}`,
          );
        }

        if (
          batch.product_id !== product.id ||
          batch.warehouse_id !== warehouse.id
        ) {
          throw new BadRequestException(
            `Tanlangan partiya (Batch: ${batch.id}) tanlangan mahsulot yoki omborga tegishli emas`,
          );
        }

        const requestedQty = Number(item.quantity);
        const batchQty = Number(batch.quantity);
        const requestReservedQty = requestReservedByBatch.get(batch.id) ?? 0;
        const existingReservedQty = existingReservedByBatch.has(batch.id)
          ? (existingReservedByBatch.get(batch.id) ?? 0)
          : await this.getReservedBatchQuantity(manager, batch.id);

        existingReservedByBatch.set(batch.id, existingReservedQty);

        const availableForReservation = Number(
          (batchQty - existingReservedQty - requestReservedQty).toFixed(2),
        );

        if (requestedQty > availableForReservation) {
          throw new BadRequestException(
            `Partiyada mahsulot yetarli emas: ${product.name}. Mavjud: ${availableForReservation}, kerak: ${requestedQty}`,
          );
        }

        requestReservedByBatch.set(
          batch.id,
          Number((requestReservedQty + requestedQty).toFixed(2)),
        );

        const lineTotal = requestedQty * Number(batch.price_at_purchase);
        totalPrice += lineTotal;

        const expenseItem = expenseItemRepo.create({
          expense: createdExpense,
          product: product,
          warehouse: warehouse,
          product_batch: batch,
          product_batch_id: batch.id,
          quantity: requestedQty,
        });
        await expenseItemRepo.save(expenseItem);

        receiptItems.push({
          product_id: product.id,
          product_name: product.name,
          warehouse_id: warehouse.id,
          warehouse_name: warehouse.name,
          batch_id: batch.id,
          quantity: requestedQty,
          unit: product.unit,
          price: Number(batch.price_at_purchase),
          line_total: Number(lineTotal.toFixed(2)),
        });
      }

      createdExpense.total_price = Number(totalPrice.toFixed(2));
      await expenseRepo.save(createdExpense);

      const savedExpense = await expenseRepo.findOne({
        where: { id: createdExpense.id },
        relations: {
          manager: true,
          items: {
            product: true,
            warehouse: true,
            product_batch: true,
          },
        },
      });

      if (!savedExpense) {
        throw new NotFoundException('Saqlangan expense topilmadi');
      }

      return {
        message: 'Sarf muvaffaqiyatli saqlandi',
        expense: savedExpense,
        receipt: {
          expense_id: savedExpense.id,
          expense_number: savedExpense.expense_number,
          staff_name: savedExpense.staff_name,
          purpose: savedExpense.purpose,
          status: savedExpense.status,
          total_price: savedExpense.total_price,
          createdAt: savedExpense.createdAt,
          items: receiptItems,
        },
      };
    });

    await this.invalidateDashboardCache();
    return result;
  }

  async issueExpense(id: string) {
    const result = await this.dataSource.transaction(async (manager) => {
      const expenseRepo = manager.getRepository(Expense);
      const productBatchRepo = manager.getRepository(ProductBatch);

      const expense = await expenseRepo
        .createQueryBuilder('expense')
        .setLock('pessimistic_write')
        .leftJoinAndSelect('expense.items', 'item')
        .leftJoinAndSelect('item.product', 'product')
        .leftJoinAndSelect('item.warehouse', 'warehouse')
        .leftJoinAndSelect('item.product_batch', 'product_batch')
        .where('expense.id = :id', { id })
        .getOne();

      if (!expense) {
        throw new NotFoundException('Expense topilmadi');
      }

      if (expense.status !== ExpenseStatus.PENDING_ISSUE) {
        throw new BadRequestException(
          "Faqat 'PENDING_ISSUE' statusdagi expense berilishi mumkin",
        );
      }

      const sortedItems = [...expense.items].sort((left, right) => {
        const leftKey = left.product_batch_id ?? left.id;
        const rightKey = right.product_batch_id ?? right.id;
        return leftKey.localeCompare(rightKey) || left.id.localeCompare(right.id);
      });

      for (const item of sortedItems) {
        const batch = item.product_batch;
        if (!batch) {
          throw new BadRequestException(
            `Item ${item.id} uchun partiya bog'lanmagan`,
          );
        }

        const currentBatch = await this.lockBatchForUpdate(manager, batch.id);

        const requested = Number(item.quantity);
        const available = Number(currentBatch.quantity);

        if (requested > available) {
          throw new BadRequestException(
            `Partiyada mahsulot yetarli emas: Batch ID: ${batch.id}. Mavjud: ${available}, kerak: ${requested}`,
          );
        }

        // Partiyadan chegirish
        currentBatch.quantity = Number((available - requested).toFixed(2));
        if (currentBatch.quantity <= 0 && !currentBatch.depleted_at) {
          currentBatch.depleted_at = new Date();
        } else if (currentBatch.quantity > 0) {
          currentBatch.depleted_at = null;
        }
        await productBatchRepo.save(currentBatch);
      }

      const lockedProducts = new Map<string, Product>();
      const productIds = Array.from(new Set(sortedItems.map((item) => item.product.id)))
        .sort((left, right) => left.localeCompare(right));

      for (const productId of productIds) {
        lockedProducts.set(
          productId,
          await this.lockProductForUpdate(manager, productId),
        );
      }

      for (const product of lockedProducts.values()) {
        await this.recalculateProductQuantity(manager, product);
      }

      expense.status = ExpenseStatus.PENDING_PHOTO;
      await expenseRepo.save(expense);

      return {
        message: 'Tovar berildi, endi foto tasdiq kutilmoqda',
        expense,
      };
    });

    await this.invalidateDashboardCache();
    return result;
  }

  async attachImagesAndComplete(id: string, images: string[]) {
    const expense = await this.findById(id);

    if (expense.status !== ExpenseStatus.PENDING_PHOTO) {
      throw new BadRequestException(
        "Faqat 'PENDING_PHOTO' statusdagi expense yakunlanishi mumkin",
      );
    }

    expense.images = images;
    expense.status = ExpenseStatus.COMPLETED;

    const result = await this.expenseRepository.save(expense);
    await this.invalidateDashboardCache();
    return result;
  }

  async getDashboardSummary(): Promise<{
    total_products: number;
    pending_issue: number;
    low_stock: number;
    expiring_soon: number;
  }> {
    const cacheKey = 'expenses:dashboard:summary';
    const cached = await this.redis.get(cacheKey);
    if (cached)
      return JSON.parse(cached) as {
        total_products: number;
        pending_issue: number;
        low_stock: number;
        expiring_soon: number;
      };

    const totalProducts = await this.productRepository.count();

    const pendingIssueCount = await this.expenseRepository.count({
      where: {
        status: ExpenseStatus.PENDING_ISSUE,
      },
    });

    const lowStockCount = await this.productRepository
      .createQueryBuilder('product')
      .where('product.quantity <= product.min_limit')
      .andWhere('product.quantity > 0')
      .getCount();

    const today = this.getLocalDateString();

    const in30DaysDate = new Date();
    in30DaysDate.setDate(in30DaysDate.getDate() + 30);
    const in30Days = this.getLocalDateString(in30DaysDate);

    const expiringSoonCount = await this.productBatchRepository
      .createQueryBuilder('batch')
      .where('batch.expiration_date IS NOT NULL')
      .andWhere('batch.expiration_date >= :today', { today })
      .andWhere('batch.expiration_date <= :in30Days', { in30Days })
      .andWhere('batch.quantity > 0')
      .getCount();

    const result = {
      total_products: totalProducts,
      pending_issue: pendingIssueCount,
      low_stock: lowStockCount,
      expiring_soon: expiringSoonCount,
    };

    await this.redis.set(cacheKey, JSON.stringify(result), 'EX', 30);
    return result;
  }

  async getDashboardOverview(): Promise<DashboardOverview> {
    const cacheKey = 'expenses:dashboard:overview';
    const cached = await this.redis.get(cacheKey);
    if (cached) {
      return JSON.parse(cached) as DashboardOverview;
    }

    const now = new Date();
    const nowIso = now.toISOString();
    const today = this.getLocalDateString(now);
    const in30DaysDate = new Date(now);
    in30DaysDate.setDate(in30DaysDate.getDate() + 30);
    const in30Days = this.getLocalDateString(in30DaysDate);

    const [
      totalProducts,
      totalWarehouses,
      pendingOrders,
      inventoryValueByWarehouseRaw,
      productsByCategoryRaw,
      productCountByWarehouseRaw,
      lowStockProductsRaw,
      expiredBatchesRaw,
      expiringBatchesRaw,
    ] = await Promise.all([
      this.productRepository.count(),
      this.warehouseRepository.count(),
      this.purchaseOrderRepository
        .createQueryBuilder('po')
        .where('po.is_received = false')
        .andWhere('po.status != :cancelled', {
          cancelled: OrderStatus.CANCELLED,
        })
        .getCount(),
      this.warehouseRepository
        .createQueryBuilder('warehouse')
        .leftJoin(
          'product_batches',
          'batch',
          'batch.warehouse_id = warehouse.id AND batch.quantity > 0',
        )
        .select('warehouse.id', 'warehouse_id')
        .addSelect('warehouse.name', 'warehouse_name')
        .addSelect(
          'COALESCE(SUM(batch.quantity * batch.price_at_purchase), 0)',
          'total_inventory_value',
        )
        .groupBy('warehouse.id')
        .addGroupBy('warehouse.name')
        .orderBy('warehouse.name', 'ASC')
        .getRawMany<{
          warehouse_id: string;
          warehouse_name: string;
          total_inventory_value: string;
        }>(),
      this.productRepository
        .createQueryBuilder('product')
        .leftJoin('product.category', 'category')
        .select('category.id', 'category_id')
        .addSelect("COALESCE(category.name, 'Bez kategorii')", 'category_name')
        .addSelect('COUNT(product.id)', 'product_count')
        .groupBy('category.id')
        .addGroupBy('category.name')
        .orderBy('COUNT(product.id)', 'DESC')
        .addOrderBy('category_name', 'ASC')
        .getRawMany<{
          category_id: string | null;
          category_name: string;
          product_count: string;
        }>(),
      this.productRepository
        .createQueryBuilder('product')
        .leftJoin('product.warehouse', 'warehouse')
        .select('warehouse.id', 'warehouse_id')
        .addSelect('warehouse.name', 'warehouse_name')
        .addSelect('COUNT(product.id)', 'product_count')
        .groupBy('warehouse.id')
        .addGroupBy('warehouse.name')
        .orderBy('warehouse.name', 'ASC')
        .getRawMany<{
          warehouse_id: string;
          warehouse_name: string;
          product_count: string;
        }>(),
      this.productRepository
        .createQueryBuilder('product')
        .leftJoin('product.warehouse', 'warehouse')
        .select('product.id', 'product_id')
        .addSelect('product.name', 'product_name')
        .addSelect('product.quantity', 'quantity')
        .addSelect('product.min_limit', 'min_limit')
        .addSelect('warehouse.id', 'warehouse_id')
        .addSelect('warehouse.name', 'warehouse_name')
        .where('product.quantity > 0')
        .andWhere('product.quantity <= product.min_limit')
        .orderBy('product.quantity', 'ASC')
        .getRawMany<{
          product_id: string;
          product_name: string;
          quantity: string;
          min_limit: string;
          warehouse_id: string;
          warehouse_name: string;
        }>(),
      this.productBatchRepository
        .createQueryBuilder('batch')
        .leftJoin('batch.product', 'product')
        .leftJoin('batch.warehouse', 'warehouse')
        .select('batch.id', 'batch_id')
        .addSelect('batch.product_id', 'product_id')
        .addSelect('product.name', 'product_name')
        .addSelect('batch.warehouse_id', 'warehouse_id')
        .addSelect('warehouse.name', 'warehouse_name')
        .addSelect('batch.quantity', 'quantity')
        .addSelect('batch.expiration_date', 'expiration_date')
        .where('batch.quantity > 0')
        .andWhere('batch.expiration_date IS NOT NULL')
        .andWhere('batch.expiration_date < :today', { today })
        .orderBy('batch.expiration_date', 'ASC')
        .getRawMany<{
          batch_id: string;
          product_id: string;
          product_name: string;
          warehouse_id: string;
          warehouse_name: string;
          quantity: string;
          expiration_date: string | Date | null;
        }>(),
      this.productBatchRepository
        .createQueryBuilder('batch')
        .leftJoin('batch.product', 'product')
        .leftJoin('batch.warehouse', 'warehouse')
        .select('batch.id', 'batch_id')
        .addSelect('batch.product_id', 'product_id')
        .addSelect('product.name', 'product_name')
        .addSelect('batch.warehouse_id', 'warehouse_id')
        .addSelect('warehouse.name', 'warehouse_name')
        .addSelect('batch.quantity', 'quantity')
        .addSelect('batch.expiration_date', 'expiration_date')
        .where('batch.quantity > 0')
        .andWhere('batch.expiration_date IS NOT NULL')
        .andWhere('batch.expiration_date >= :today', { today })
        .andWhere('batch.expiration_date <= :in30Days', { in30Days })
        .orderBy('batch.expiration_date', 'ASC')
        .getRawMany<{
          batch_id: string;
          product_id: string;
          product_name: string;
          warehouse_id: string;
          warehouse_name: string;
          quantity: string;
          expiration_date: string | Date | null;
        }>(),
    ]);

    const lowStockAlerts: DashboardAlertItem[] = lowStockProductsRaw.map(
      (row) => {
        const quantity = Number(row.quantity);
        const minLimit = Number(row.min_limit);
        const severity: DashboardSeverity =
          quantity <= Math.max(1, Math.floor(minLimit / 2)) ? 'high' : 'medium';

        return {
          type: 'low_stock',
          severity,
          message:
            severity === 'high'
              ? `${row.product_name}: kritik darajada kam qoldiq`
              : `${row.product_name}: qoldiq qayta buyurtma nuqtasiga yetgan`,
          product_id: row.product_id,
          product_name: row.product_name,
          warehouse_id: row.warehouse_id,
          warehouse_name: row.warehouse_name,
          quantity,
          min_limit: minLimit,
          created_at: nowIso,
        };
      },
    );

    const expiredAlerts: DashboardAlertItem[] = expiredBatchesRaw.map((row) => {
      const expirationDate = this.normalizeDateValue(row.expiration_date);

      return {
        type: 'expired',
        severity: 'high',
        message: `${row.product_name}: mahsulot muddati o‘tgan`,
        product_id: row.product_id,
        product_name: row.product_name,
        warehouse_id: row.warehouse_id,
        warehouse_name: row.warehouse_name,
        quantity: Number(row.quantity),
        batch_id: row.batch_id,
        expiration_date: expirationDate,
        days_left: expirationDate
          ? this.getDayDiffFromToday(expirationDate, now)
          : null,
        created_at: nowIso,
      };
    });

    const expiringAlerts: DashboardAlertItem[] = expiringBatchesRaw.map(
      (row) => {
        const expirationDate = this.normalizeDateValue(row.expiration_date);
        const daysLeft = expirationDate
          ? this.getDayDiffFromToday(expirationDate, now)
          : null;
        const severity: DashboardSeverity =
          daysLeft !== null && daysLeft <= 7 ? 'high' : 'medium';

        return {
          type: 'expiring_soon',
          severity,
          message:
            daysLeft !== null
              ? `${row.product_name}: yaroqlilik muddati ${daysLeft} kundan keyin tugaydi`
              : `${row.product_name}: yaroqlilik muddati yaqinlashmoqda`,
          product_id: row.product_id,
          product_name: row.product_name,
          warehouse_id: row.warehouse_id,
          warehouse_name: row.warehouse_name,
          quantity: Number(row.quantity),
          batch_id: row.batch_id,
          expiration_date: expirationDate,
          days_left: daysLeft,
          created_at: nowIso,
        };
      },
    );

    const allAlerts = [...expiredAlerts, ...expiringAlerts, ...lowStockAlerts].sort(
      (left, right) => {
        const severityScore = this.getSeverityScore(right.severity) -
          this.getSeverityScore(left.severity);
        if (severityScore !== 0) {
          return severityScore;
        }

        const leftDays = left.days_left ?? Number.MAX_SAFE_INTEGER;
        const rightDays = right.days_left ?? Number.MAX_SAFE_INTEGER;
        if (leftDays !== rightDays) {
          return leftDays - rightDays;
        }

        return left.product_name.localeCompare(right.product_name);
      },
    );

    const expiredProductIds = new Set(expiredBatchesRaw.map((row) => row.product_id));
    const lowStockProductIds = new Set(lowStockProductsRaw.map((row) => row.product_id));

    const expiredProducts = expiredProductIds.size;
    const expiringProducts = new Set(
      expiringBatchesRaw
        .map((row) => row.product_id)
        .filter((productId) => !expiredProductIds.has(productId)),
    ).size;
    const lowStockProducts = Array.from(lowStockProductIds).filter(
      (productId) => !expiredProductIds.has(productId),
    ).length;

    const normalProducts = Math.max(
      totalProducts - expiredProducts - lowStockProducts,
      0,
    );

    const inventoryValueByWarehouse = inventoryValueByWarehouseRaw.map((row) => ({
      warehouse_id: row.warehouse_id,
      warehouse_name: row.warehouse_name,
      total_inventory_value: Number(
        Number(row.total_inventory_value ?? 0).toFixed(2),
      ),
    }));

    const totalInventoryValue = Number(
      inventoryValueByWarehouse
        .reduce((sum, row) => sum + row.total_inventory_value, 0)
        .toFixed(2),
    );

    const stockStatusItems = [
      { status: 'normal' as const, label: 'Normal', count: normalProducts },
      { status: 'low_stock' as const, label: 'Kam qoldiq', count: lowStockProducts },
      { status: 'expired' as const, label: 'Muddati o‘tgan', count: expiredProducts },
    ].map((item) => ({
      ...item,
      percentage:
        totalProducts > 0
          ? Number(((item.count / totalProducts) * 100).toFixed(2))
          : 0,
    }));

    const result: DashboardOverview = {
      generated_at: nowIso,
      headline_alerts: {
        total: allAlerts.length,
        high: allAlerts.filter((item) => item.severity === 'high').length,
        medium: allAlerts.filter((item) => item.severity === 'medium').length,
        items: allAlerts.slice(0, 10),
      },
      summary: {
        total_products: totalProducts,
        low_stock_products: lowStockProducts,
        expiring_products: expiringProducts,
        total_inventory_value: totalInventoryValue,
        total_warehouses: totalWarehouses,
        pending_orders: pendingOrders,
        expired_products: expiredProducts,
      },
      charts: {
        inventory_value_by_warehouse: inventoryValueByWarehouse,
        stock_status_distribution: {
          total: totalProducts,
          items: stockStatusItems,
        },
        products_by_category: productsByCategoryRaw.map((row) => ({
          category_id: row.category_id,
          category_name: row.category_name,
          product_count: Number(row.product_count),
        })),
        product_count_by_warehouse: productCountByWarehouseRaw.map((row) => ({
          warehouse_id: row.warehouse_id,
          warehouse_name: row.warehouse_name,
          product_count: Number(row.product_count),
        })),
      },
      recent_notifications: allAlerts.slice(0, 20),
    };

    await this.redis.set(cacheKey, JSON.stringify(result), 'EX', 30);
    return result;
  }

  private getLocalDateString(date: Date = new Date()): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  private normalizeDateValue(value?: Date | string | null) {
    if (!value) return null;
    if (typeof value === 'string') {
      return value.slice(0, 10);
    }

    return value.toISOString().slice(0, 10);
  }

  private getDayDiffFromToday(value: string, now: Date) {
    const startOfToday = new Date(now);
    startOfToday.setHours(0, 0, 0, 0);

    const target = new Date(`${value}T00:00:00`);
    const msPerDay = 24 * 60 * 60 * 1000;
    return Math.round((target.getTime() - startOfToday.getTime()) / msPerDay);
  }

  private getSeverityScore(severity: DashboardSeverity) {
    return severity === 'high' ? 2 : 1;
  }

  private async invalidateDashboardCache() {
    await this.redis.del(
      'expenses:dashboard:summary',
      'expenses:dashboard:overview',
    );
  }

  private applyDateRangeFilter(
    qb: SelectQueryBuilder<any>,
    field: string,
    query: { date_from?: string; date_to?: string },
  ) {
    if (!query.date_from && !query.date_to) return;

    const from = query.date_from ? new Date(query.date_from) : null;
    const to = query.date_to ? new Date(query.date_to) : null;

    if (from) from.setHours(0, 0, 0, 0);
    if (to) to.setHours(23, 59, 59, 999);

    if (from) {
      qb.andWhere(`${field} >= :from`, { from });
    }
    if (to) {
      qb.andWhere(`${field} <= :to`, { to });
    }
  }
}
