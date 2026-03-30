import {
  BadRequestException,
  ForbiddenException,
  forwardRef,
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
import { InlineKeyboard } from 'grammy';
import { BotService } from 'src/modules/bot/bot.service';
import { BotUserService } from 'src/modules/bot-user/services/bot-user.service';
import { Product } from 'src/modules/product/entities/product.entity';
import { ProductBatch } from 'src/modules/product/entities/product-batch.entity';
import { PurchaseOrder } from 'src/modules/purchase-order/entities/purchase-order.entity';
import { OrderStatus } from 'src/modules/purchase-order/enums/order-status.enum';
import { User } from 'src/modules/user/entities/user.entity';
import { Role } from 'src/modules/user/enums/role.enum';
import { Warehouse } from 'src/modules/warehouse/entities/warehouse.entity';
import { AuthUser } from 'src/modules/auth/interfaces/auth-user.interface';
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
    @Inject(forwardRef(() => BotService))
    private readonly botService: BotService,
    private readonly botUserService: BotUserService,
  ) {}

  private async getAssignedWarehouseForUser(userId: string): Promise<Warehouse> {
    const warehouses = await this.warehouseRepository.find({
      where: { manager_id: userId },
      order: { createdAt: 'ASC' },
    });

    if (warehouses.length === 0) {
      throw new NotFoundException(
        "Warehouse userga biriktirilgan warehouse topilmadi",
      );
    }

    if (warehouses.length > 1) {
      throw new ForbiddenException(
        "Warehouse userga faqat bitta warehouse biriktirilishi kerak",
      );
    }

    return warehouses[0];
  }

  private async ensureExpenseAccess(
    expense: Expense,
    user?: AuthUser,
  ): Promise<void> {
    if (!user) {
      return;
    }

    if (user.role === Role.ACCOUNTANT) {
      if (expense.manager_id !== user.id) {
        throw new ForbiddenException(
          "Siz faqat o'zingiz yaratgan chiqimlar bilan ishlay olasiz",
        );
      }
      return;
    }

    if (user.role !== Role.WAREHOUSE) {
      return;
    }

    const assignedWarehouse = await this.getAssignedWarehouseForUser(user.id);
    const expenseWarehouseIds = new Set(
      expense.items
        .map((item) => item.warehouse?.id)
        .filter((warehouseId): warehouseId is string => Boolean(warehouseId)),
    );

    if (!expenseWarehouseIds.size) {
      throw new ForbiddenException("Expense uchun warehouse aniqlanmadi");
    }

    if (
      expenseWarehouseIds.size !== 1 ||
      !expenseWarehouseIds.has(assignedWarehouse.id)
    ) {
      throw new ForbiddenException(
        "Siz faqat o'zingizga biriktirilgan warehouse chiqimlari bilan ishlay olasiz",
      );
    }
  }

  async findAll(query: ListExpensesQueryDto, user: AuthUser) {
    const page = query.page ?? 1;
    const limit = Math.min(query.limit ?? 10, 100);
    const search = query.search?.trim();
    const accountantUserId =
      user.role === Role.ACCOUNTANT ? user.id : undefined;
    const assignedWarehouse =
      user.role === Role.WAREHOUSE
        ? await this.getAssignedWarehouseForUser(user.id)
        : null;

    const qb = this.expenseRepository
      .createQueryBuilder('expense')
      .leftJoinAndSelect('expense.manager', 'manager');

    if (accountantUserId) {
      qb.andWhere('expense.manager_id = :managerId', {
        managerId: accountantUserId,
      });
    }

    if (assignedWarehouse) {
      qb.leftJoinAndSelect(
        'expense.items',
        'item',
        'item.warehouse_id = :warehouseId',
        { warehouseId: assignedWarehouse.id },
      )
        .leftJoinAndSelect('item.product', 'product')
        .leftJoinAndSelect('item.warehouse', 'warehouse');
      qb.innerJoin(
        'expense.items',
        'scope_item',
        'scope_item.warehouse_id = :warehouseId',
        { warehouseId: assignedWarehouse.id },
      ).distinct(true);
    } else {
      qb.leftJoinAndSelect('expense.items', 'item')
        .leftJoinAndSelect('item.product', 'product')
        .leftJoinAndSelect('item.warehouse', 'warehouse');
    }

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

  async findAllItems(query: ListExpenseItemsQueryDto, user?: AuthUser) {
    const page = query.page ?? 1;
    const limit = Math.min(query.limit ?? 10, 100);
    const search = query.search?.trim();
    const accountantUserId =
      user?.role === Role.ACCOUNTANT ? user.id : undefined;
    const assignedWarehouseId =
      user?.role === Role.WAREHOUSE
        ? (await this.getAssignedWarehouseForUser(user.id)).id
        : undefined;

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

    if (accountantUserId) {
      qb.andWhere('expense.manager_id = :managerId', {
        managerId: accountantUserId,
      });
    }

    if (assignedWarehouseId) {
      qb.andWhere('warehouse.id = :warehouseId', {
        warehouseId: assignedWarehouseId,
      });
    } else if (query.warehouse_id) {
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

  async getWarehouseStats(query: ListExpenseItemsQueryDto, user?: AuthUser) {
    const search = query.search?.trim();
    const assignedWarehouseId =
      user?.role === Role.WAREHOUSE
        ? (await this.getAssignedWarehouseForUser(user.id)).id
        : undefined;

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

    if (assignedWarehouseId) {
      qb.andWhere('warehouse.id = :warehouseId', {
        warehouseId: assignedWarehouseId,
      });
    } else if (query.warehouse_id) {
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

  async findById(id: string, user?: AuthUser, manager?: EntityManager) {
    const repo = manager
      ? manager.getRepository(Expense)
      : this.expenseRepository;

    const expense = await repo.findOne({
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

    if (user) {
      await this.ensureExpenseAccess(expense, user);
    }

    return expense;
  }

  private async lockExpenseForUpdate(
    manager: EntityManager,
    expenseId: string,
  ): Promise<void> {
    const expense = await manager
      .getRepository(Expense)
      .createQueryBuilder('expense')
      .setLock('pessimistic_write')
      .where('expense.id = :expenseId', { expenseId })
      .getOne();

    if (!expense) {
      throw new NotFoundException('Expense topilmadi');
    }
  }

  private async generateExpenseNumber(manager: EntityManager): Promise<string> {
    const year = new Date().getFullYear();

    await manager.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
      `expense:${year}`,
    ]);

    const result = await manager
      .getRepository(Expense)
      .createQueryBuilder('expense')
      .select(
        "MAX(CAST(SPLIT_PART(expense.expense_number, '-', 3) AS int))",
        'max',
      )
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
      .andWhere('expense.status IN (:...statuses)', {
        statuses: [
          ExpenseStatus.PENDING_APPROVAL,
          ExpenseStatus.PENDING_ISSUE,
        ],
      })
      .getRawOne<{ reserved: string | null }>();

    return Number(Number(reservedRaw?.reserved ?? 0).toFixed(2));
  }

  async createAndGetReceipt(dto: CreateExpenseDto, actor?: AuthUser) {
    const result = await this.dataSource.transaction(async (manager) => {
      const expenseRepo = manager.getRepository(Expense);
      const expenseItemRepo = manager.getRepository(ExpenseItem);
      const productRepo = manager.getRepository(Product);
      const warehouseRepo = manager.getRepository(Warehouse);
      const userRepo = manager.getRepository(User);

      const managerUser = actor?.id
        ? await userRepo.findOne({ where: { id: actor.id } })
        : null;

      const expenseNumber = await this.generateExpenseNumber(manager);
      const expenseType = dto.type ?? ExpenseType.USAGE;
      const requiresAdminApproval = actor?.role === Role.ACCOUNTANT;

      const createdExpense = await expenseRepo.save(
        expenseRepo.create({
          expense_number: expenseNumber,
          status: requiresAdminApproval
            ? ExpenseStatus.PENDING_APPROVAL
            : ExpenseStatus.PENDING_ISSUE,
          type: expenseType,
          images: [],
          total_price: 0,
          staff_name: dto.staff_name,
          purpose: dto.purpose ?? null,
          manager_id: managerUser?.id ?? null,
          approved_by_id:
            requiresAdminApproval || !actor?.id ? null : actor.id,
          approved_at:
            requiresAdminApproval || !actor?.id ? null : new Date(),
        }),
      );

      const receiptItems: ReceiptItem[] = [];
      let totalPrice = 0;
      const requestReservedByBatch = new Map<string, number>();
      const existingReservedByBatch = new Map<string, number>();
      let expenseWarehouseId: string | null = null;

      for (const item of dto.items) {
        const batch = await this.lockBatchForUpdate(
          manager,
          item.product_batch_id,
        );

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

        if (!expenseWarehouseId) {
          expenseWarehouseId = warehouse.id;
        } else if (expenseWarehouseId !== warehouse.id) {
          throw new BadRequestException(
            'Bitta expense ichida faqat bitta warehouse mahsulotlari bo‘lishi mumkin',
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
        message: requiresAdminApproval
          ? "Chiqim so'rovi yaratildi va admin tasdig'i kutilmoqda"
          : 'Sarf muvaffaqiyatli saqlandi',
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

    if (result.expense.status === ExpenseStatus.PENDING_APPROVAL) {
      await this.notifyAdminsAboutNewExpenseRequest(result.expense).catch(
        () => undefined,
      );
    }

    return result;
  }

  async issueExpense(id: string, actor?: AuthUser) {
    const result = await this.dataSource.transaction(async (manager) => {
      const expenseRepo = manager.getRepository(Expense);
      const productBatchRepo = manager.getRepository(ProductBatch);

      await this.lockExpenseForUpdate(manager, id);
      const expense = await this.findById(id, actor, manager);

      if (expense.status !== ExpenseStatus.PENDING_ISSUE) {
        throw new BadRequestException(
          "Faqat 'PENDING_ISSUE' statusdagi expense berilishi mumkin",
        );
      }

      const sortedItems = [...expense.items].sort((left, right) => {
        const leftKey = left.product_batch_id ?? left.id;
        const rightKey = right.product_batch_id ?? right.id;
        return (
          leftKey.localeCompare(rightKey) || left.id.localeCompare(right.id)
        );
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
      const productIds = Array.from(
        new Set(sortedItems.map((item) => item.product.id)),
      ).sort((left, right) => left.localeCompare(right));

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
      expense.issued_by_id = actor?.id ?? null;
      expense.issued_at = new Date();
      await expenseRepo.save(expense);

      return {
        message: 'Tovar berildi, endi foto tasdiq kutilmoqda',
        expense,
      };
    });

    await this.invalidateDashboardCache();
    return result;
  }

  async approveExpense(id: string, adminUserId?: string) {
    const expense = await this.findById(id);

    if (expense.status !== ExpenseStatus.PENDING_APPROVAL) {
      throw new BadRequestException(
        "Faqat 'PENDING_APPROVAL' statusdagi expense tasdiqlanishi mumkin",
      );
    }

    expense.status = ExpenseStatus.PENDING_ISSUE;
    expense.approved_by_id = adminUserId ?? null;
    expense.approved_at = new Date();
    expense.revision_reason = null;
    expense.revision_requested_by_id = null;
    expense.revision_requested_at = null;
    expense.cancelled_by_id = null;
    expense.cancelled_at = null;

    const result = await this.expenseRepository.save(expense);
    await this.invalidateDashboardCache();

    await this.notifyWarehouseManagersAboutApprovedExpense(result).catch(
      () => undefined,
    );

    return result;
  }

  async cancelExpense(id: string, adminUserId?: string) {
    const expense = await this.findById(id);

    if (
      ![
        ExpenseStatus.PENDING_APPROVAL,
        ExpenseStatus.PENDING_ISSUE,
      ].includes(expense.status)
    ) {
      throw new BadRequestException(
        "Faqat 'PENDING_APPROVAL' yoki 'PENDING_ISSUE' statusdagi expense bekor qilinishi mumkin",
      );
    }

    expense.status = ExpenseStatus.CANCELLED;
    expense.cancelled_by_id = adminUserId ?? null;
    expense.cancelled_at = new Date();

    const result = await this.expenseRepository.save(expense);
    await this.invalidateDashboardCache();
    return result;
  }

  async attachImagesAndMarkPendingConfirmation(
    id: string,
    images: string[],
    actor?: AuthUser,
  ) {
    const expense = await this.findById(id, actor);
    const isRevisionRetry = expense.status === ExpenseStatus.REVISION_REQUIRED;

    if (
      ![ExpenseStatus.PENDING_PHOTO, ExpenseStatus.REVISION_REQUIRED].includes(
        expense.status,
      )
    ) {
      throw new BadRequestException(
        "Faqat 'PENDING_PHOTO' yoki 'REVISION_REQUIRED' statusdagi expense uchun foto yuklash mumkin",
      );
    }

    expense.images = isRevisionRetry ? [...expense.images, ...images] : images;
    expense.status = ExpenseStatus.PENDING_CONFIRMATION;
    expense.revision_reason = null;
    expense.revision_requested_by_id = null;
    expense.revision_requested_at = null;

    const result = await this.expenseRepository.save(expense);
    await this.invalidateDashboardCache();

    if (actor?.id) {
      await this.notifyAdminsAboutExpenseReadyForConfirmation(
        result,
        isRevisionRetry,
      ).catch(() => undefined);
    }

    return result;
  }

  async confirmExpense(id: string, adminUserId?: string) {
    const expense = await this.findById(id);

    if (expense.status !== ExpenseStatus.PENDING_CONFIRMATION) {
      throw new BadRequestException(
        "Faqat 'PENDING_CONFIRMATION' statusdagi expense tasdiqlanishi mumkin",
      );
    }

    expense.status = ExpenseStatus.COMPLETED;
    expense.confirmed_by_id = adminUserId ?? null;
    expense.confirmed_at = new Date();

    const result = await this.expenseRepository.save(expense);
    await this.invalidateDashboardCache();
    return result;
  }

  async requestRevision(
    id: string,
    reason: string,
    adminUserId?: string,
  ) {
    const expense = await this.findById(id);

    if (expense.status !== ExpenseStatus.PENDING_CONFIRMATION) {
      throw new BadRequestException(
        "Faqat 'PENDING_CONFIRMATION' statusdagi expense qayta ko'rib chiqishga yuborilishi mumkin",
      );
    }

    expense.status = ExpenseStatus.REVISION_REQUIRED;
    expense.revision_reason = reason.trim();
    expense.revision_requested_by_id = adminUserId ?? null;
    expense.revision_requested_at = new Date();

    const result = await this.expenseRepository.save(expense);
    await this.invalidateDashboardCache();
    await this.notifyWarehouseManagersAboutRevisionRequired(result).catch(
      () => undefined,
    );
    return result;
  }

  async handleAdminRequestDecisionFromBot(
    expenseId: string,
    action: 'approve' | 'cancel',
    adminUserId?: string | null,
  ) {
    if (action === 'approve') {
      return this.approveExpense(expenseId, adminUserId ?? undefined);
    }

    return this.cancelExpense(expenseId, adminUserId ?? undefined);
  }

  async handleFinalConfirmationFromBot(
    expenseId: string,
    adminUserId?: string | null,
  ) {
    return this.confirmExpense(expenseId, adminUserId ?? undefined);
  }

  async handleRevisionRequestFromBot(
    expenseId: string,
    adminUserId?: string | null,
  ) {
    return this.requestRevision(
      expenseId,
      "Telegram bot orqali qayta ko'rib chiqish so'raldi",
      adminUserId ?? undefined,
    );
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

    const allAlerts = [
      ...expiredAlerts,
      ...expiringAlerts,
      ...lowStockAlerts,
    ].sort((left, right) => {
      const severityScore =
        this.getSeverityScore(right.severity) -
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
    });

    const expiredProductIds = new Set(
      expiredBatchesRaw.map((row) => row.product_id),
    );
    const lowStockProductIds = new Set(
      lowStockProductsRaw.map((row) => row.product_id),
    );

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

    const inventoryValueByWarehouse = inventoryValueByWarehouseRaw.map(
      (row) => ({
        warehouse_id: row.warehouse_id,
        warehouse_name: row.warehouse_name,
        total_inventory_value: Number(
          Number(row.total_inventory_value ?? 0).toFixed(2),
        ),
      }),
    );

    const totalInventoryValue = Number(
      inventoryValueByWarehouse
        .reduce((sum, row) => sum + row.total_inventory_value, 0)
        .toFixed(2),
    );

    const stockStatusItems = [
      { status: 'normal' as const, label: 'Normal', count: normalProducts },
      {
        status: 'low_stock' as const,
        label: 'Kam qoldiq',
        count: lowStockProducts,
      },
      {
        status: 'expired' as const,
        label: 'Muddati o‘tgan',
        count: expiredProducts,
      },
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

  private getExpenseWarehouse(expense: Expense): Warehouse | null {
    return expense.items.find((item) => item.warehouse)?.warehouse ?? null;
  }

  private async getApprovedWarehouseTelegramIds(expense: Expense) {
    const warehouse = this.getExpenseWarehouse(expense);
    if (!warehouse?.id) {
      return [];
    }

    const managedWarehouse = await this.warehouseRepository.findOne({
      where: { id: warehouse.id },
      select: { id: true, manager_id: true },
    });

    if (!managedWarehouse?.manager_id) {
      return [];
    }

    const approvedBotUsers = await this.botUserService.getApprovedUsers(
      Role.WAREHOUSE,
    );

    return approvedBotUsers
      .filter((user) => user.linked_user_id === managedWarehouse.manager_id)
      .map((user) => user.telegram_id);
  }

  private getExpenseCreatorName(expense: Expense) {
    if (expense.manager) {
      return (
        [expense.manager.first_name, expense.manager.last_name]
          .filter(Boolean)
          .join(' ') || expense.manager.username
      );
    }

    return expense.manager_id ?? "Noma'lum";
  }

  private async notifyAdminsAboutNewExpenseRequest(expense: Expense) {
    const warehouse = this.getExpenseWarehouse(expense);
    const text =
      `📋 <b>Yangi chiqim so'rovi</b>\n\n` +
      `📄 Hujjat: <b>${expense.expense_number}</b>\n` +
      `👤 Hisobchi: <b>${this.escapeHtml(this.getExpenseCreatorName(expense))}</b>\n` +
      `🏢 Warehouse: <b>${this.escapeHtml(warehouse?.name ?? "Noma'lum")}</b>\n` +
      `🙍 Xodim: <b>${this.escapeHtml(expense.staff_name)}</b>\n` +
      `💰 Summa: <b>${this.formatCurrency(Number(expense.total_price))}</b>\n` +
      `📌 Status: <b>${expense.status}</b>`;

    const keyboard = new InlineKeyboard()
      .text('✅ Tasdiqlash', `expense_request:approve:${expense.id}`)
      .text('❌ Bekor qilish', `expense_request:cancel:${expense.id}`);

    await this.botService.sendToApprovedUsers(text, Role.ADMIN, {
      reply_markup: keyboard,
    });
  }

  private async notifyWarehouseManagersAboutApprovedExpense(expense: Expense) {
    const warehouse = this.getExpenseWarehouse(expense);
    const telegramIds = await this.getApprovedWarehouseTelegramIds(expense);

    if (!telegramIds.length) {
      return;
    }

    const text =
      `📦 <b>Yangi chiqim tasdiqlandi</b>\n\n` +
      `📄 Hujjat: <b>${expense.expense_number}</b>\n` +
      `🏢 Warehouse: <b>${this.escapeHtml(warehouse?.name ?? "Noma'lum")}</b>\n` +
      `🙍 Xodim: <b>${this.escapeHtml(expense.staff_name)}</b>\n` +
      `💰 Summa: <b>${this.formatCurrency(Number(expense.total_price))}</b>\n` +
      `📌 Status: <b>${expense.status}</b>\n\n` +
      `Mahsulotni chiqaring va chek rasmlarini yuklang.`;

    for (const telegramId of telegramIds) {
      await this.botService.sendMessage(telegramId, text);
    }
  }

  private async notifyWarehouseManagersAboutRevisionRequired(expense: Expense) {
    const warehouse = this.getExpenseWarehouse(expense);
    const telegramIds = await this.getApprovedWarehouseTelegramIds(expense);

    if (!telegramIds.length) {
      return;
    }

    const text =
      `🔁 <b>Chiqim qayta ko'rib chiqishga yuborildi</b>\n\n` +
      `📄 Hujjat: <b>${expense.expense_number}</b>\n` +
      `🏢 Warehouse: <b>${this.escapeHtml(warehouse?.name ?? "Noma'lum")}</b>\n` +
      `📝 Sabab: <b>${this.escapeHtml(expense.revision_reason ?? "Qayta tekshirish kerak")}</b>\n` +
      `📌 Status: <b>${expense.status}</b>\n\n` +
      `Chek yoki rasmlarni to'g'rilab qayta yuklang.`;

    for (const telegramId of telegramIds) {
      await this.botService.sendMessage(telegramId, text);
    }
  }

  private async notifyAdminsAboutExpenseReadyForConfirmation(
    expense: Expense,
    isRevisionRetry = false,
  ) {
    const warehouse = this.getExpenseWarehouse(expense);
    const text =
      `📷 <b>${isRevisionRetry ? "Qayta yuklangan chiqim rasmlari" : "Chiqim uchun foto yuklandi"}</b>\n\n` +
      `📄 Hujjat: <b>${expense.expense_number}</b>\n` +
      `🏢 Warehouse: <b>${this.escapeHtml(warehouse?.name ?? "Noma'lum")}</b>\n` +
      `🙍 Xodim: <b>${this.escapeHtml(expense.staff_name)}</b>\n` +
      `💰 Summa: <b>${this.formatCurrency(Number(expense.total_price))}</b>\n` +
      `🖼 Rasm soni: <b>${expense.images.length}</b>\n` +
      `📌 Status: <b>${expense.status}</b>`;

    const keyboard = new InlineKeyboard()
      .text('✅ Yakuniy tasdiqlash', `expense_final:confirm:${expense.id}`)
      .text('🔁 Qayta ko‘rib chiqish', `expense_final:revision:${expense.id}`);

    await this.botService.sendToApprovedUsers(text, Role.ADMIN, {
      reply_markup: keyboard,
    });
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

  private formatCurrency(value: number) {
    return `${new Intl.NumberFormat('uz-UZ', {
      minimumFractionDigits: value % 1 === 0 ? 0 : 2,
      maximumFractionDigits: 2,
    }).format(Number(value.toFixed(2)))} sum`;
  }

  private escapeHtml(value: string) {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
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
