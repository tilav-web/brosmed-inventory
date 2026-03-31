import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, SelectQueryBuilder } from 'typeorm';
import ExcelJS from 'exceljs';
import { AuthUser } from 'src/modules/auth/interfaces/auth-user.interface';
import { ExpenseItem } from '../entities/expense-item.entity';
import { ListExpenseItemsQueryDto } from '../dto/list-expense-items-query.dto';

@Injectable()
export class ExpenseExportService {
  constructor(
    @InjectRepository(ExpenseItem)
    private readonly expenseItemRepository: Repository<ExpenseItem>,
  ) {}

  async buildExcelBuffer(
    query: ListExpenseItemsQueryDto,
    user?: AuthUser,
  ): Promise<Buffer> {
    const items = await this.getItemsForExport(query, user);

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Expenses');

    sheet.columns = [
      { header: 'Дата', key: 'date', width: 14 },
      { header: 'Склад', key: 'warehouse', width: 22 },
      { header: 'Сотрудник', key: 'staff', width: 22 },
      { header: 'Продукт', key: 'product', width: 28 },
      { header: 'Количество', key: 'quantity', width: 14 },
      { header: 'Ед.', key: 'unit', width: 8 },
      { header: 'Цель', key: 'purpose', width: 32 },
      { header: 'Номер расхода', key: 'expense_number', width: 18 },
      { header: 'Статус', key: 'status', width: 18 },
      { header: 'Тип', key: 'type', width: 16 },
    ];

    for (const item of items) {
      sheet.addRow({
        date: item.expense?.createdAt
          ? this.formatDate(item.expense.createdAt)
          : '',
        warehouse: item.warehouse?.name ?? '',
        staff: item.expense?.staff_name ?? '',
        product: item.product?.name ?? '',
        quantity: Number(item.quantity),
        unit: item.product?.unit ?? '',
        purpose: item.expense?.purpose ?? '',
        expense_number: item.expense?.expense_number ?? '',
        status: item.expense?.status ?? '',
        type: item.expense?.type ?? '',
      });
    }

    sheet.getRow(1).font = { bold: true };
    sheet.views = [{ state: 'frozen', ySplit: 1 }];

    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }

  private async getItemsForExport(
    query: ListExpenseItemsQueryDto,
    user?: AuthUser,
  ) {
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

    qb.orderBy('expense.createdAt', 'DESC').addOrderBy('item.id', 'ASC');

    return qb.getMany();
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

  private formatDate(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${day}.${month}.${year}`;
  }
}
