import {
  BadRequestException,
  ForbiddenException,
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
    @InjectRepository(Warehouse)
    private readonly warehouseRepository: Repository<Warehouse>,
    @Inject('REDIS_CLIENT')
    private readonly redis: Redis,
  ) {}

  private async getAssignedWarehouseForUser(
    userId: string,
  ): Promise<Warehouse> {
    const warehouses = await this.warehouseRepository.find({
      where: { manager_id: userId },
      order: { createdAt: 'ASC' },
    });

    if (warehouses.length === 0) {
      throw new NotFoundException(
        'Warehouse userga biriktirilgan warehouse topilmadi',
      );
    }

    if (warehouses.length > 1) {
      throw new ForbiddenException(
        'Warehouse userga faqat bitta warehouse biriktirilishi kerak',
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
      throw new ForbiddenException('Expense uchun warehouse aniqlanmadi');
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
    const assignedWarehouse =
      user.role === Role.WAREHOUSE
        ? await this.getAssignedWarehouseForUser(user.id)
        : null;

    const qb = this.expenseRepository
      .createQueryBuilder('expense')
      .leftJoinAndSelect('expense.manager', 'manager');

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

  async create(dto: CreateExpenseDto, actor: AuthUser) {
    if (actor.role !== Role.WAREHOUSE) {
      throw new ForbiddenException('Faqat warehouse user chiqim yarata oladi');
    }

    const assignedWarehouse = await this.getAssignedWarehouseForUser(actor.id);

    const result = await this.dataSource.transaction(async (manager) => {
      const expenseRepo = manager.getRepository(Expense);
      const expenseItemRepo = manager.getRepository(ExpenseItem);
      const productRepo = manager.getRepository(Product);
      const warehouseRepo = manager.getRepository(Warehouse);
      const userRepo = manager.getRepository(User);

      const managerUser = await userRepo.findOne({ where: { id: actor.id } });
      const expenseNumber = await this.generateExpenseNumber(manager);
      const expenseType = dto.type ?? ExpenseType.USAGE;

      const createdExpense = await expenseRepo.save(
        expenseRepo.create({
          expense_number: expenseNumber,
          status: ExpenseStatus.CREATED,
          type: expenseType,
          total_price: 0,
          staff_name: dto.staff_name,
          purpose: dto.purpose ?? null,
          manager_id: managerUser?.id ?? null,
          issued_by_id: null,
          issued_at: null,
          cancelled_by_id: null,
          cancelled_at: null,
        }),
      );

      const receiptItems: ReceiptItem[] = [];
      let totalPrice = 0;
      const affectedProductIds = new Set<string>();
      let expenseWarehouseId: string | null = null;

      for (const item of dto.items) {
        const batch = await this.lockBatchForUpdate(
          manager,
          item.product_batch_id,
        );

        const productId = item.product_id ?? batch.product_id;
        const warehouseId = item.warehouse_id ?? batch.warehouse_id;

        const [product, warehouse] = await Promise.all([
          productRepo.findOne({ where: { id: productId } }),
          warehouseRepo.findOne({ where: { id: warehouseId } }),
        ]);

        if (!product || !warehouse) {
          throw new NotFoundException(
            `Ma'lumot topilmadi: Product=${productId}, Warehouse=${warehouseId}`,
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
            "Bitta expense ichida faqat bitta warehouse mahsulotlari bo'lishi mumkin",
          );
        }

        if (warehouse.id !== assignedWarehouse.id) {
          throw new ForbiddenException(
            "Siz faqat o'zingizga biriktirilgan warehouse mahsulotlarini chiqim qila olasiz",
          );
        }

        const requestedQty = Number(item.quantity);
        const batchQty = Number(batch.quantity);

        if (requestedQty > batchQty) {
          throw new BadRequestException(
            `Partiyada mahsulot yetarli emas: ${product.name}. Mavjud: ${batchQty}, kerak: ${requestedQty}`,
          );
        }

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

        batch.quantity = Number((batchQty - requestedQty).toFixed(2));
        if (batch.quantity <= 0 && !batch.depleted_at) {
          batch.depleted_at = new Date();
        } else if (batch.quantity > 0) {
          batch.depleted_at = null;
        }
        await manager.getRepository(ProductBatch).save(batch);
        affectedProductIds.add(product.id);
      }

      const sortedProductIds = Array.from(affectedProductIds).sort((a, b) =>
        a.localeCompare(b),
      );

      for (const productId of sortedProductIds) {
        const lockedProduct = await this.lockProductForUpdate(
          manager,
          productId,
        );
        await this.recalculateProductQuantity(manager, lockedProduct);
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
        message: 'Chiqim muvaffaqiyatli yaratildi',
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

  async markAsIssued(id: string, actor: AuthUser) {
    if (actor.role !== Role.WAREHOUSE) {
      throw new ForbiddenException(
        'Faqat warehouse user chiqimni berilgan deb belgilashi mumkin',
      );
    }

    const result = await this.dataSource.transaction(async (manager) => {
      const expenseRepo = manager.getRepository(Expense);

      await this.lockExpenseForUpdate(manager, id);
      const expense = await this.findById(id, actor, manager);

      if (expense.status !== ExpenseStatus.CREATED) {
        throw new BadRequestException(
          "Faqat 'CREATED' statusdagi expense berilgan deb belgilanishi mumkin",
        );
      }

      expense.status = ExpenseStatus.ISSUED;
      expense.issued_by_id = actor.id;
      expense.issued_at = new Date();
      await expenseRepo.save(expense);

      return {
        message: 'Chiqim berildi',
        expense,
      };
    });

    await this.invalidateDashboardCache();
    return result;
  }

  async cancelExpense(id: string, actor: AuthUser) {
    const result = await this.dataSource.transaction(async (manager) => {
      const expenseRepo = manager.getRepository(Expense);

      await this.lockExpenseForUpdate(manager, id);
      const expense = await this.findById(id, actor, manager);

      if (expense.status !== ExpenseStatus.CREATED) {
        throw new BadRequestException(
          "Faqat 'CREATED' statusdagi expense bekor qilinishi mumkin",
        );
      }

      expense.status = ExpenseStatus.CANCELLED;
      expense.cancelled_by_id = actor.id;
      expense.cancelled_at = new Date();
      await expenseRepo.save(expense);

      for (const item of expense.items) {
        if (item.product_batch) {
          const batch = await this.lockBatchForUpdate(
            manager,
            item.product_batch.id,
          );
          batch.quantity = Number(
            (Number(batch.quantity) + Number(item.quantity)).toFixed(2),
          );
          if (batch.quantity > 0) {
            batch.depleted_at = null;
          }
          await manager.getRepository(ProductBatch).save(batch);
        }
      }

      const affectedProductIds = new Set<string>();
      for (const item of expense.items) {
        if (item.product) {
          affectedProductIds.add(item.product.id);
        }
      }

      const sortedProductIds = Array.from(affectedProductIds).sort((a, b) =>
        a.localeCompare(b),
      );

      for (const productId of sortedProductIds) {
        const lockedProduct = await this.lockProductForUpdate(
          manager,
          productId,
        );
        await this.recalculateProductQuantity(manager, lockedProduct);
      }

      return {
        message: 'Chiqim bekor qilindi',
        expense,
      };
    });

    await this.invalidateDashboardCache();
    return result;
  }

  async createSystemExpense(dto: {
    staff_name: string;
    purpose: string;
    type: ExpenseType;
    items: Array<{
      product_id: string;
      warehouse_id: string;
      product_batch_id: string;
      quantity: number;
    }>;
  }) {
    await this.dataSource.transaction(async (manager) => {
      const expenseRepo = manager.getRepository(Expense);
      const expenseItemRepo = manager.getRepository(ExpenseItem);
      const productRepo = manager.getRepository(Product);
      const warehouseRepo = manager.getRepository(Warehouse);

      const expenseNumber = await this.generateExpenseNumber(manager);

      const createdExpense = await expenseRepo.save(
        expenseRepo.create({
          expense_number: expenseNumber,
          status: ExpenseStatus.ISSUED,
          type: dto.type,
          total_price: 0,
          staff_name: dto.staff_name,
          purpose: dto.purpose,
          manager_id: null,
          issued_by_id: null,
          issued_at: new Date(),
          cancelled_by_id: null,
          cancelled_at: null,
        }),
      );

      let totalPrice = 0;
      const affectedProductIds = new Set<string>();

      for (const item of dto.items) {
        const batch = await this.lockBatchForUpdate(
          manager,
          item.product_batch_id,
        );

        const [product, warehouse] = await Promise.all([
          productRepo.findOne({ where: { id: item.product_id } }),
          warehouseRepo.findOne({ where: { id: item.warehouse_id } }),
        ]);

        if (!product || !warehouse) {
          throw new NotFoundException(
            `Ma'lumot topilmadi: Product=${item.product_id}, Warehouse=${item.warehouse_id}`,
          );
        }

        const requestedQty = Number(item.quantity);
        const batchQty = Number(batch.quantity);

        if (requestedQty > batchQty) {
          throw new BadRequestException(
            `Partiyada mahsulot yetarli emas: ${product.name}. Mavjud: ${batchQty}, kerak: ${requestedQty}`,
          );
        }

        const lineTotal = requestedQty * Number(batch.price_at_purchase);
        totalPrice += lineTotal;

        await expenseItemRepo.save(
          expenseItemRepo.create({
            expense: createdExpense,
            product,
            warehouse,
            product_batch: batch,
            product_batch_id: batch.id,
            quantity: requestedQty,
          }),
        );

        batch.quantity = Number((batchQty - requestedQty).toFixed(2));
        if (batch.quantity <= 0 && !batch.depleted_at) {
          batch.depleted_at = new Date();
        } else if (batch.quantity > 0) {
          batch.depleted_at = null;
        }
        await manager.getRepository(ProductBatch).save(batch);
        affectedProductIds.add(product.id);
      }

      const sortedProductIds = Array.from(affectedProductIds).sort((a, b) =>
        a.localeCompare(b),
      );

      for (const productId of sortedProductIds) {
        const lockedProduct = await this.lockProductForUpdate(
          manager,
          productId,
        );
        await this.recalculateProductQuantity(manager, lockedProduct);
      }

      createdExpense.total_price = Number(totalPrice.toFixed(2));
      await expenseRepo.save(createdExpense);
    });

    await this.invalidateDashboardCache();
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

  private async invalidateDashboardCache() {
    await this.redis.del(
      'expenses:dashboard:summary',
      'expenses:dashboard:overview',
    );
  }
}
