import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
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

interface ReceiptItem {
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
    @InjectRepository(Product)
    private readonly productRepository: Repository<Product>,
    @InjectRepository(ProductBatch)
    private readonly productBatchRepository: Repository<ProductBatch>,
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
    return this.dataSource.transaction(async (manager) => {
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
          check_image_url: null,
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

        if (batch.product_id !== product.id || batch.warehouse_id !== warehouse.id) {
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
  }

  async issueExpense(id: string) {
    return this.dataSource.transaction(async (manager) => {
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
          throw new BadRequestException(`Item ${item.id} uchun partiya bog'lanmagan`);
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
          .where('batch.product_id = :productId', { productId: item.product.id })
          .getRawOne<{ total: string | null }>();

        const product = await productRepo.findOne({ where: { id: item.product.id } });
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
  }

  async attachCheckImageAndComplete(id: string, checkImageUrl: string) {
    const expense = await this.findById(id);

    if (expense.status !== ExpenseStatus.PENDING_PHOTO) {
      throw new BadRequestException(
        "Faqat 'PENDING_PHOTO' statusdagi expense yakunlanishi mumkin",
      );
    }

    expense.check_image_url = checkImageUrl;
    expense.status = ExpenseStatus.COMPLETED;

    return this.expenseRepository.save(expense);
  }

  async getDashboardSummary() {
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

    return {
      total_products: totalProducts,
      pending_issue: pendingIssueCount,
      low_stock: lowStockCount,
      expiring_soon: expiringSoonCount,
    };
  }

  private getLocalDateString(date: Date = new Date()): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
}
