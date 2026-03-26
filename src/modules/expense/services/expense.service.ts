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

    const totalThisYear = await manager
      .getRepository(Expense)
      .createQueryBuilder('expense')
      .where('EXTRACT(YEAR FROM expense.createdAt) = :year', { year })
      .getCount();

    const next = String(totalThisYear + 1).padStart(3, '0');
    return `EXP-${year}-${next}`;
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

      for (const item of dto.items) {
        const [product, warehouse, batch] = await Promise.all([
          productRepo.findOne({
            where: { id: item.product_id },
          }),
          warehouseRepo.findOne({ where: { id: item.warehouse_id } }),
          productBatchRepo.findOne({
            where: { id: item.product_batch_id },
            relations: { product: true, warehouse: true },
          }),
        ]);

        if (!product || !warehouse || !batch) {
          throw new NotFoundException(
            `Ma'lumot topilmadi: Product=${item.product_id}, Warehouse=${item.warehouse_id}, Batch=${item.product_batch_id}`,
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
      const productRepo = manager.getRepository(Product);
      const productBatchRepo = manager.getRepository(ProductBatch);

      const expense = await expenseRepo.findOne({
        where: { id },
        relations: {
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

      if (expense.status !== ExpenseStatus.PENDING_ISSUE) {
        throw new BadRequestException(
          "Faqat 'PENDING_ISSUE' statusdagi expense berilishi mumkin",
        );
      }

      for (const item of expense.items) {
        const batch = item.product_batch;
        if (!batch) {
          throw new BadRequestException(
            `Item ${item.id} uchun partiya bog'lanmagan`,
          );
        }

        const currentBatch = await productBatchRepo.findOne({
          where: { id: batch.id },
        });

        if (!currentBatch) {
          throw new NotFoundException(`Batch topilmadi: ${batch.id}`);
        }

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
        }
        await productBatchRepo.save(currentBatch);

        // Mahsulotning umumiy miqdorini yangilash
        const totalRaw = await productBatchRepo
          .createQueryBuilder('batch')
          .select('SUM(batch.quantity)', 'total')
          .where('batch.product_id = :productId', {
            productId: item.product.id,
          })
          .getRawOne<{ total: string | null }>();

        const product = await productRepo.findOne({
          where: { id: item.product.id },
        });
        if (product) {
          product.quantity = Number(Number(totalRaw?.total ?? 0).toFixed(2));
          await productRepo.save(product);
        }
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

  private getLocalDateString(date: Date = new Date()): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  private async invalidateDashboardCache() {
    await this.redis.del('expenses:dashboard:summary');
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
