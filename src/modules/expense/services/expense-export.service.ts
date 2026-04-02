import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { existsSync } from 'node:fs';
import PDFDocument from 'pdfkit';
import { Repository, SelectQueryBuilder } from 'typeorm';
import ExcelJS from 'exceljs';
import { ExpenseItem } from '../entities/expense-item.entity';
import { Expense } from '../entities/expense.entity';
import { ListExpenseItemsQueryDto } from '../dto/list-expense-items-query.dto';

@Injectable()
export class ExpenseExportService {
  private readonly logger = new Logger(ExpenseExportService.name);
  private readonly pdfFontPath = this.resolvePdfFontPath();

  constructor(
    @InjectRepository(ExpenseItem)
    private readonly expenseItemRepository: Repository<ExpenseItem>,
  ) {
    if (!this.pdfFontPath) {
      this.logger.warn(
        'PDF font file topilmadi. Expense receipt PDF Helvetica bilan davom etadi, Unicode matn soddalashtirilishi mumkin.',
      );
    }
  }

  async buildExcelBuffer(query: ListExpenseItemsQueryDto): Promise<Buffer> {
    const items = await this.getItemsForExport(query);

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

  async buildExpenseReceiptPdf(expense: Expense) {
    const buffer = await this.buildExpenseReceiptPdfBuffer(expense);

    return {
      buffer,
      filename: this.buildPdfFilename(expense.expense_number),
      contentType: 'application/pdf',
    };
  }

  private async getItemsForExport(query: ListExpenseItemsQueryDto) {
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

  private async buildExpenseReceiptPdfBuffer(expense: Expense): Promise<Buffer> {
    return new Promise<Buffer>((resolve, reject) => {
      const doc = new PDFDocument({
        size: 'A4',
        margin: 40,
        bufferPages: true,
      });
      const chunks: Buffer[] = [];

      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      this.applyPdfFont(doc);

      const warehouseName = this.getExpenseWarehouseName(expense);
      const managerName = this.getExpenseManagerName(expense);
      const createdAt = expense.createdAt ?? new Date();

      doc
        .fontSize(18)
        .text(this.toPdfText('Chiqim dalolatnomasi'), { align: 'center' });
      doc.moveDown(1);

      doc.fontSize(11);
      doc.text(this.toPdfText(`Hujjat raqami: ${expense.expense_number}`));
      doc.text(
        this.toPdfText(`Sana: ${this.formatDate(createdAt)} ${this.formatTime(createdAt)}`),
      );
      doc.text(this.toPdfText(`Ombor: ${warehouseName}`));
      doc.text(this.toPdfText(`Topshiruvchi: ${managerName}`));
      doc.text(this.toPdfText(`Qabul qiluvchi: ${expense.staff_name}`));

      if (expense.purpose) {
        doc.text(this.toPdfText(`Maqsad: ${expense.purpose}`));
      }

      doc.moveDown(1);
      this.drawHorizontalLine(doc);
      doc.moveDown(0.6);

      const columns = {
        index: 40,
        product: 70,
        quantity: 300,
        unit: 365,
        price: 415,
        total: 490,
      };

      this.renderReceiptTableHeader(doc, columns);

      const items = expense.items ?? [];
      items.forEach((item, index) => {
        if (doc.y > 730) {
          doc.addPage();
          this.applyPdfFont(doc);
          this.renderReceiptTableHeader(doc, columns);
        }

        const lineTop = doc.y;
        const quantity = Number(item.quantity);
        const price = Number(item.product_batch?.price_at_purchase ?? 0);
        const lineTotal = quantity * price;

        doc.text(String(index + 1), columns.index, lineTop, { width: 20 });
        doc.text(
          this.toPdfText(item.product?.name ?? "Noma'lum mahsulot"),
          columns.product,
          lineTop,
          { width: 220 },
        );
        doc.text(this.formatNumber(quantity), columns.quantity, lineTop, {
          width: 55,
          align: 'right',
        });
        doc.text(this.toPdfText(item.product?.unit ?? '-'), columns.unit, lineTop, {
          width: 45,
          align: 'right',
        });
        doc.text(this.formatCurrency(price), columns.price, lineTop, {
          width: 65,
          align: 'right',
        });
        doc.text(this.formatCurrency(lineTotal), columns.total, lineTop, {
          width: 65,
          align: 'right',
        });

        doc.moveDown(1.2);
      });

      doc.moveDown(0.3);
      this.drawHorizontalLine(doc);
      doc.moveDown(0.8);

      doc.fontSize(12).text(
        this.toPdfText(`Jami summa: ${this.formatCurrency(Number(expense.total_price))}`),
        {
          align: 'right',
        },
      );

      doc.moveDown(2);
      doc.fontSize(11);
      doc.text(this.toPdfText('Topshiruvchi: __________________________'));
      doc.moveDown(1);
      doc.text(this.toPdfText('Qabul qiluvchi: __________________________'));

      doc.end();
    });
  }

  private getExpenseWarehouseName(expense: Expense) {
    return (
      expense.items?.find((item) => item.warehouse?.name)?.warehouse?.name ??
      "Noma'lum ombor"
    );
  }

  private getExpenseManagerName(expense: Expense) {
    if (!expense.manager) {
      return "Noma'lum foydalanuvchi";
    }

    const fullName = [expense.manager.first_name, expense.manager.last_name]
      .filter(Boolean)
      .join(' ')
      .trim();

    return fullName || expense.manager.username;
  }

  private formatNumber(value: number) {
    return Number(value.toFixed(2)).toLocaleString('en-US', {
      maximumFractionDigits: 2,
    });
  }

  private formatCurrency(value: number) {
    return `${this.formatNumber(Number(value.toFixed(2)))} sum`;
  }

  private formatTime(date: Date) {
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${hours}:${minutes}`;
  }

  private drawHorizontalLine(doc: InstanceType<typeof PDFDocument>) {
    const y = doc.y;
    doc
      .moveTo(doc.page.margins.left, y)
      .lineTo(doc.page.width - doc.page.margins.right, y)
      .stroke('#A8A8A8');
  }

  private renderReceiptTableHeader(
    doc: InstanceType<typeof PDFDocument>,
    columns: {
      index: number;
      product: number;
      quantity: number;
      unit: number;
      price: number;
      total: number;
    },
  ) {
    doc.fontSize(10);
    const headerY = doc.y;

    doc.text('#', columns.index, headerY, { width: 20 });
    doc.text(this.toPdfText('Mahsulot'), columns.product, headerY, {
      width: 220,
    });
    doc.text(this.toPdfText('Miqdor'), columns.quantity, headerY, {
      width: 55,
      align: 'right',
    });
    doc.text(this.toPdfText('Birlik'), columns.unit, headerY, {
      width: 45,
      align: 'right',
    });
    doc.text(this.toPdfText('Narx'), columns.price, headerY, {
      width: 65,
      align: 'right',
    });
    doc.text(this.toPdfText('Jami'), columns.total, headerY, {
      width: 65,
      align: 'right',
    });

    doc.y = headerY + 16;
    this.drawHorizontalLine(doc);
    doc.moveDown(0.6);
  }

  private resolvePdfFontPath() {
    const candidates = [
      process.env.PDF_FONT_PATH,
      '/usr/share/fonts/TTF/DejaVuSans.ttf',
      '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
      '/usr/share/fonts/ttf-dejavu/DejaVuSans.ttf',
      '/usr/share/fonts/noto/NotoSans-Regular.ttf',
      '/usr/share/fonts/liberation/LiberationSans-Regular.ttf',
    ];

    return candidates.find(
      (candidate): candidate is string => !!candidate && existsSync(candidate),
    );
  }

  private applyPdfFont(doc: InstanceType<typeof PDFDocument>) {
    if (this.pdfFontPath) {
      doc.font(this.pdfFontPath);
      return;
    }

    doc.font('Helvetica');
  }

  private toPdfText(value: string) {
    if (this.pdfFontPath) {
      return value;
    }

    const normalizedValue = value
      .normalize('NFKD')
      .replace(/[\u2018\u2019\u02BC]/g, "'")
      .replace(/[\u2013\u2014]/g, '-')
      .replace(/\u00A0/g, ' ')
      .replace(/[\u0300-\u036f]/g, '');

    return Array.from(normalizedValue, (char) => {
      const code = char.charCodeAt(0);
      const isAllowedAscii =
        code === 9 || code === 10 || code === 13 || (code >= 32 && code <= 126);

      return isAllowedAscii ? char : '?';
    }).join('');
  }

  private buildPdfFilename(expenseNumber: string) {
    const safeExpenseNumber = expenseNumber.replace(/[^A-Za-z0-9_-]/g, '_');
    return `expense_receipt_${safeExpenseNumber}.pdf`;
  }
}
