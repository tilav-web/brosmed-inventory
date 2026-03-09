import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { Product } from 'src/modules/product/entities/product.entity';
import { User } from 'src/modules/user/entities/user.entity';
import { Warehouse } from 'src/modules/warehouse/entities/warehouse.entity';
import { CreateExpenseDto } from '../dto/create-expense.dto';
import { ListExpensesQueryDto } from '../dto/list-expenses-query.dto';
import { ExpenseStatus } from '../enums/expense-status.enum';
import { ExpenseItem } from '../entities/expense-item.entity';
import { Expense } from '../entities/expense.entity';

@Injectable()
export class ExpenseService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(Expense)
    private readonly expenseRepository: Repository<Expense>,
    @InjectRepository(Product)
    private readonly productRepository: Repository<Product>,
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
      const warehouseRepo = manager.getRepository(Warehouse);
      const userRepo = manager.getRepository(User);

      const managerUser = managerId
        ? await userRepo.findOne({ where: { id: managerId } })
        : null;

      const expenseNumber = await this.generateExpenseNumber(manager);

      const createdExpense = await expenseRepo.save(
        expenseRepo.create({
          expense_number: expenseNumber,
          status: ExpenseStatus.PENDING_ISSUE,
          check_image_url: null,
          total_price: 0,
          staff_name: dto.staff_name,
          purpose: dto.purpose ?? null,
          manager_id: managerUser?.id ?? null,
        }),
      );

      const receiptItems: Array<{
        product_id: string;
        product_name: string;
        warehouse_id: string;
        warehouse_name: string;
        quantity: number;
        unit: string;
        price: number;
        line_total: number;
      }> = [];

      let totalPrice = 0;

      for (const item of dto.items) {
        const [product, warehouse] = await Promise.all([
          productRepo.findOne({
            where: { id: item.product_id },
            relations: { warehouse: true },
          }),
          warehouseRepo.findOne({ where: { id: item.warehouse_id } }),
        ]);

        if (!product) {
          throw new NotFoundException(`Product topilmadi: ${item.product_id}`);
        }

        if (!warehouse) {
          throw new NotFoundException(
            `Warehouse topilmadi: ${item.warehouse_id}`,
          );
        }

        if (product.warehouse?.id !== warehouse.id) {
          throw new BadRequestException(
            `Product ${product.id} tanlangan warehousega tegishli emas`,
          );
        }

        const requested = Number(item.quantity);
        const available = Number(product.quantity);

        if (!Number.isFinite(requested) || requested <= 0) {
          throw new BadRequestException('Quantity musbat son bo`lishi kerak');
        }

        if (requested > available) {
          throw new BadRequestException(
            `Mahsulot yetarli emas: ${product.name}. Mavjud: ${available}, kerak: ${requested}`,
          );
        }

        const price = Number(product.price);
        const lineTotal = price * requested;
        totalPrice += lineTotal;

        const expenseItem = expenseItemRepo.create();
        expenseItem.expense = createdExpense;
        expenseItem.product = product;
        expenseItem.warehouse = warehouse;
        expenseItem.quantity = requested;
        await expenseItemRepo.save(expenseItem);

        receiptItems.push({
          product_id: product.id,
          product_name: product.name,
          warehouse_id: warehouse.id,
          warehouse_name: warehouse.name,
          quantity: requested,
          unit: product.unit,
          price,
          line_total: lineTotal,
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

      const expense = await expenseRepo.findOne({
        where: { id },
        relations: {
          items: {
            product: true,
            warehouse: true,
          },
        },
      });

      if (!expense) {
        throw new NotFoundException('Expense topilmadi');
      }

      if (expense.status !== ExpenseStatus.PENDING_ISSUE) {
        throw new BadRequestException(
          "Faqat 'ожидает выдачи' statusdagi expense berilishi mumkin",
        );
      }

      for (const item of expense.items) {
        const product = await productRepo.findOne({
          where: { id: item.product.id },
          relations: { warehouse: true },
        });

        if (!product) {
          throw new NotFoundException(`Product topilmadi: ${item.product.id}`);
        }

        if (product.warehouse?.id !== item.warehouse.id) {
          throw new BadRequestException(
            `Product ${product.id} expense item warehouseiga mos emas`,
          );
        }

        const available = Number(product.quantity);
        const requested = Number(item.quantity);

        if (requested > available) {
          throw new BadRequestException(
            `Mahsulot yetarli emas: ${product.name}. Mavjud: ${available}, kerak: ${requested}`,
          );
        }

        product.quantity = available - requested;
        await productRepo.save(product);
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
        "Faqat 'ожидает подтверждения' statusdagi expense yakunlanishi mumkin",
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

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const in30Days = new Date(today);
    in30Days.setDate(in30Days.getDate() + 30);

    const expiringSoonCount = await this.productRepository
      .createQueryBuilder('product')
      .where('product.expiration_date IS NOT NULL')
      .andWhere('product.expiration_date >= :today', {
        today: today.toISOString().slice(0, 10),
      })
      .andWhere('product.expiration_date <= :in30Days', {
        in30Days: in30Days.toISOString().slice(0, 10),
      })
      .getCount();

    return {
      total_products: totalProducts,
      pending_issue: pendingIssueCount,
      low_stock: lowStockCount,
      expiring_soon: expiringSoonCount,
    };
  }
}
