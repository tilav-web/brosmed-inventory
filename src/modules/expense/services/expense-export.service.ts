import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { existsSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { dirname, extname, join } from 'node:path';
import PDFDocument from 'pdfkit';
import { Repository, SelectQueryBuilder } from 'typeorm';
import ExcelJS from 'exceljs';
import { ExpenseItem } from '../entities/expense-item.entity';
import { Expense } from '../entities/expense.entity';
import { ListExpenseItemsQueryDto } from '../dto/list-expense-items-query.dto';
import { ExpenseReceiptQueueService } from './expense-receipt-queue.service';
import { User } from 'src/modules/user/entities/user.entity';
import { Role } from 'src/modules/user/enums/role.enum';

@Injectable()
export class ExpenseExportService {
  private readonly logger = new Logger(ExpenseExportService.name);
  private readonly pdfFontPath = this.resolvePdfFontPath();
  private readonly pdfFontName = 'ReceiptFont';
  private readonly serverUrl = process.env.SERVER_URL;
  private readonly uploadsPath = join(process.cwd(), 'uploads');
  private readonly receiptTtlMs = 60_000;

  constructor(
    @InjectRepository(ExpenseItem)
    private readonly expenseItemRepository: Repository<ExpenseItem>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly expenseReceiptQueueService: ExpenseReceiptQueueService,
  ) {
    if (!existsSync(this.uploadsPath)) {
      mkdirSync(this.uploadsPath, { recursive: true });
    }

    if (!this.pdfFontPath) {
      this.logger.warn(
        'PDF font file topilmadi. Expense receipt PDF Helvetica bilan davom etadi, Unicode matn soddalashtirilishi mumkin.',
      );
    } else {
      this.logger.log(`PDF font ishlatilyapti: ${this.pdfFontPath}`);
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

  async createOrRefreshExpenseReceiptLink(expense: Expense) {
    const fileKey = this.buildExpenseReceiptKey(expense);
    const absolutePath = this.resolveAbsolutePath(fileKey);

    if (!existsSync(dirname(absolutePath))) {
      mkdirSync(dirname(absolutePath), { recursive: true });
    }

    if (!existsSync(absolutePath)) {
      const buffer = await this.buildExpenseReceiptPdfBuffer(expense);
      await writeFile(absolutePath, buffer);
    }

    await this.expenseReceiptQueueService.scheduleCleanup(
      fileKey,
      this.receiptTtlMs,
    );

    return {
      file_key: fileKey,
      url: this.getPublicUrl(fileKey),
      expires_at: new Date(Date.now() + this.receiptTtlMs).toISOString(),
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

  private async buildExpenseReceiptPdfBuffer(
    expense: Expense,
  ): Promise<Buffer> {
    const adminName = await this.getRoleUserFullName(Role.ADMIN);
    const accountantName = await this.getRoleUserFullName(Role.ACCOUNTANT);

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
      const issuedAt = expense.issued_at ?? null;

      this.renderDocumentHeader(doc, expense, createdAt);
      this.renderInfoBlock(doc, {
        warehouseName,
        managerName,
        staffName: expense.staff_name,
        purpose: expense.purpose,
        issuedAt,
        status: this.formatStatus(expense.status),
        type: this.formatType(expense.type),
      });

      this.renderItemsTable(doc, expense);

      this.renderSignatureBlock(doc, {
        warehouseUserName: managerName,
        staffName: expense.staff_name,
        accountantName,
        adminName,
      });

      this.renderPageFooters(doc);

      doc.end();
    });
  }

  private renderDocumentHeader(
    doc: InstanceType<typeof PDFDocument>,
    expense: Expense,
    createdAt: Date,
  ) {
    const left = doc.page.margins.left;
    const right = doc.page.width - doc.page.margins.right;
    const width = right - left;
    const top = doc.y;

    doc
      .fillColor('#0F172A')
      .fontSize(18)
      .text(this.toPdfText('BROSMED INVENTORY'), left, top, {
        width,
        align: 'left',
      });

    doc
      .fillColor('#475569')
      .fontSize(9)
      .text(
        this.toPdfText(`Hujjat raqami: ${expense.expense_number}`),
        left,
        top + 2,
        { width, align: 'right' },
      )
      .text(
        this.toPdfText(
          `Yaratildi: ${this.formatDate(createdAt)} ${this.formatTime(createdAt)}`,
        ),
        left,
        top + 16,
        { width, align: 'right' },
      );

    doc.fillColor('#000000');
    doc.moveDown(1.2);

    const titleY = doc.y;
    doc
      .fontSize(15)
      .fillColor('#0F172A')
      .text(this.toPdfText('CHIQIM DALOLATNOMASI'), left, titleY, {
        width,
        align: 'center',
      });

    const underlineY = doc.y + 4;
    doc
      .moveTo(left + width / 2 - 80, underlineY)
      .lineTo(left + width / 2 + 80, underlineY)
      .lineWidth(1.2)
      .strokeColor('#0F172A')
      .stroke();

    doc.fillColor('#000000');
    doc.y = underlineY + 14;
  }

  private renderInfoBlock(
    doc: InstanceType<typeof PDFDocument>,
    info: {
      warehouseName: string;
      managerName: string;
      staffName: string;
      purpose: string | null;
      issuedAt: Date | null;
      status: string;
      type: string;
    },
  ) {
    const left = doc.page.margins.left;
    const right = doc.page.width - doc.page.margins.right;
    const width = right - left;
    const padding = 10;
    const lineHeight = 16;

    const rows: Array<[string, string]> = [
      ['Ombor', info.warehouseName],
      ['Topshiruvchi', info.managerName],
      ['Qabul qiluvchi', info.staffName],
      [
        'Berilgan sana',
        info.issuedAt
          ? `${this.formatDate(info.issuedAt)} ${this.formatTime(info.issuedAt)}`
          : '—',
      ],
      ['Holati', info.status],
      ['Turi', info.type],
    ];

    if (info.purpose) {
      rows.push(['Maqsad', info.purpose]);
    }

    const rowsPerColumn = Math.ceil(rows.length / 2);
    const blockHeight = padding * 2 + rowsPerColumn * lineHeight;
    const top = doc.y;

    doc
      .roundedRect(left, top, width, blockHeight, 4)
      .lineWidth(0.6)
      .strokeColor('#CBD5E1')
      .stroke();

    const columnWidth = (width - padding * 3) / 2;
    const labelWidth = 95;
    const valueWidth = columnWidth - labelWidth - 6;

    doc.fontSize(10);

    rows.forEach((row, index) => {
      const isRight = index >= rowsPerColumn;
      const rowIndex = isRight ? index - rowsPerColumn : index;
      const x = isRight ? left + padding * 2 + columnWidth : left + padding;
      const y = top + padding + rowIndex * lineHeight;

      doc
        .fillColor('#64748B')
        .text(this.toPdfText(`${row[0]}:`), x, y, {
          width: labelWidth,
        });
      doc
        .fillColor('#0F172A')
        .text(this.toPdfText(row[1]), x + labelWidth, y, {
          width: valueWidth,
        });
    });

    doc.fillColor('#000000');
    doc.y = top + blockHeight + 14;
  }

  private renderItemsTable(
    doc: InstanceType<typeof PDFDocument>,
    expense: Expense,
  ) {
    const left = doc.page.margins.left;
    const right = doc.page.width - doc.page.margins.right;
    const tableWidth = right - left;

    const widths = {
      index: 28,
      product: tableWidth - 28 - 65 - 45 - 85 - 120,
      quantity: 65,
      unit: 45,
      price: 85,
      total: 120,
    };

    const xs = {
      index: left,
      product: left + widths.index,
      quantity: left + widths.index + widths.product,
      unit: left + widths.index + widths.product + widths.quantity,
      price: left + widths.index + widths.product + widths.quantity + widths.unit,
      total:
        left +
        widths.index +
        widths.product +
        widths.quantity +
        widths.unit +
        widths.price,
    };

    const cellPaddingY = 6;
    const cellPaddingX = 6;
    const headerHeight = 24;
    const minRowHeight = 22;
    const bottomLimit = doc.page.height - doc.page.margins.bottom - 140;

    const drawHeader = () => {
      const headerY = doc.y;
      doc
        .rect(left, headerY, tableWidth, headerHeight)
        .fillColor('#0F172A')
        .fill();

      doc.fillColor('#FFFFFF').fontSize(10);
      const textY = headerY + cellPaddingY + 1;

      doc.text('#', xs.index, textY, {
        width: widths.index,
        align: 'center',
      });
      doc.text(
        this.toPdfText('Mahsulot'),
        xs.product + cellPaddingX,
        textY,
        { width: widths.product - cellPaddingX * 2, align: 'left' },
      );
      doc.text(this.toPdfText('Miqdor'), xs.quantity, textY, {
        width: widths.quantity - cellPaddingX,
        align: 'right',
      });
      doc.text(this.toPdfText('Birlik'), xs.unit, textY, {
        width: widths.unit - cellPaddingX,
        align: 'right',
      });
      doc.text(this.toPdfText('Narx'), xs.price, textY, {
        width: widths.price - cellPaddingX,
        align: 'right',
      });
      doc.text(this.toPdfText('Jami'), xs.total, textY, {
        width: widths.total - cellPaddingX,
        align: 'right',
      });

      doc.fillColor('#000000');
      doc.y = headerY + headerHeight;
    };

    drawHeader();

    const items = expense.items ?? [];

    items.forEach((item, index) => {
      const productName = this.toPdfText(
        item.product?.name ?? "Noma'lum mahsulot",
      );
      const productWidth = widths.product - cellPaddingX * 2;
      const productHeight = doc.heightOfString(productName, {
        width: productWidth,
      });
      const rowHeight = Math.max(
        minRowHeight,
        productHeight + cellPaddingY * 2,
      );

      if (doc.y + rowHeight > bottomLimit) {
        doc.addPage();
        this.applyPdfFont(doc);
        drawHeader();
      }

      const rowY = doc.y;
      const isEven = index % 2 === 1;

      if (isEven) {
        doc
          .rect(left, rowY, tableWidth, rowHeight)
          .fillColor('#F8FAFC')
          .fill();
      }

      doc
        .rect(left, rowY, tableWidth, rowHeight)
        .lineWidth(0.4)
        .strokeColor('#E2E8F0')
        .stroke();

      const quantity = Number(item.quantity);
      const price = Number(item.product_batch?.price_at_purchase ?? 0);
      const lineTotal = quantity * price;
      const textY = rowY + cellPaddingY;

      doc.fillColor('#0F172A').fontSize(10);

      doc.text(String(index + 1), xs.index, textY, {
        width: widths.index,
        align: 'center',
      });
      doc.text(productName, xs.product + cellPaddingX, textY, {
        width: productWidth,
        align: 'left',
      });
      doc.text(this.formatNumber(quantity), xs.quantity, textY, {
        width: widths.quantity - cellPaddingX,
        align: 'right',
      });
      doc.text(
        this.toPdfText(item.product?.unit ?? '-'),
        xs.unit,
        textY,
        { width: widths.unit - cellPaddingX, align: 'right' },
      );
      doc.text(this.formatCurrency(price), xs.price, textY, {
        width: widths.price - cellPaddingX,
        align: 'right',
      });
      doc.text(this.formatCurrency(lineTotal), xs.total, textY, {
        width: widths.total - cellPaddingX,
        align: 'right',
      });

      doc.y = rowY + rowHeight;
    });

    const totalRowHeight = 26;
    if (doc.y + totalRowHeight > bottomLimit) {
      doc.addPage();
      this.applyPdfFont(doc);
    }

    const totalY = doc.y;
    doc
      .rect(left, totalY, tableWidth, totalRowHeight)
      .fillColor('#0F172A')
      .fill();

    doc.fillColor('#FFFFFF').fontSize(10.5);
    const totalTextY = totalY + cellPaddingY + 2;
    doc.text(this.toPdfText('JAMI SUMMA'), left + cellPaddingX, totalTextY, {
      width: tableWidth - widths.total - cellPaddingX * 2,
      align: 'right',
    });
    doc.text(
      this.formatCurrency(Number(expense.total_price)),
      xs.total,
      totalTextY,
      { width: widths.total - cellPaddingX, align: 'right' },
    );

    doc.fillColor('#000000');
    doc.y = totalY + totalRowHeight + 24;
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

  private async getRoleUserFullName(role: Role): Promise<string> {
    const user = await this.userRepository.findOne({
      where: { role },
      order: { createdAt: 'ASC' },
    });

    if (!user) {
      return '-';
    }

    const fullName = [user.first_name, user.last_name]
      .filter(Boolean)
      .join(' ')
      .trim();

    return fullName || user.username;
  }

  private renderSignatureBlock(
    doc: InstanceType<typeof PDFDocument>,
    info: {
      warehouseUserName: string;
      staffName: string;
      accountantName: string;
      adminName: string;
    },
  ) {
    const left = doc.page.margins.left;
    const right = doc.page.width - doc.page.margins.right;
    const columnGap = 14;
    const columnWidth = (right - left - columnGap * 2) / 3;
    const blockHeight = 96;
    const bottomLimit = doc.page.height - doc.page.margins.bottom - 40;

    if (doc.y + blockHeight > bottomLimit) {
      doc.addPage();
      this.applyPdfFont(doc);
    }

    const top = doc.y;

    const columns: Array<{
      title: string;
      role: string;
      name: string;
      hint: string;
      x: number;
    }> = [
      {
        title: 'TOPSHIRDI',
        role: 'Omborchi',
        name: info.warehouseUserName,
        hint: 'F.I.Sh va imzo',
        x: left,
      },
      {
        title: 'QABUL QILDI',
        role: 'Xodim',
        name: info.staffName || '—',
        hint: 'F.I.Sh va imzo',
        x: left + columnWidth + columnGap,
      },
      {
        title: 'TASDIQLADI',
        role: 'Hisobchi',
        name: info.accountantName,
        hint:
          info.adminName && info.adminName !== '-'
            ? `Admin: ${info.adminName}`
            : 'F.I.Sh va imzo',
        x: left + (columnWidth + columnGap) * 2,
      },
    ];

    columns.forEach((column) => {
      doc
        .fillColor('#0F172A')
        .fontSize(10)
        .text(this.toPdfText(column.title), column.x, top, {
          width: columnWidth,
          align: 'left',
        });

      doc
        .fillColor('#64748B')
        .fontSize(8.5)
        .text(this.toPdfText(column.role), column.x, top + 14, {
          width: columnWidth,
          align: 'left',
        });

      const lineY = top + 54;
      doc
        .moveTo(column.x, lineY)
        .lineTo(column.x + columnWidth, lineY)
        .lineWidth(0.6)
        .strokeColor('#0F172A')
        .stroke();

      doc
        .fillColor('#0F172A')
        .fontSize(10)
        .text(this.toPdfText(column.name), column.x, lineY + 4, {
          width: columnWidth,
          align: 'left',
        });

      doc
        .fillColor('#94A3B8')
        .fontSize(8)
        .text(this.toPdfText(column.hint), column.x, lineY + 18, {
          width: columnWidth,
          align: 'left',
        });
    });

    doc.fillColor('#000000');
    doc.y = top + blockHeight;
  }

  private renderPageFooters(doc: InstanceType<typeof PDFDocument>) {
    const range = doc.bufferedPageRange();
    const generatedAt = new Date();
    const generatedLabel = `${this.formatDate(generatedAt)} ${this.formatTime(generatedAt)}`;

    for (let i = 0; i < range.count; i += 1) {
      doc.switchToPage(range.start + i);
      this.applyPdfFont(doc);

      const left = doc.page.margins.left;
      const right = doc.page.width - doc.page.margins.right;
      const width = right - left;
      const lineY = doc.page.height - doc.page.margins.bottom - 22;
      const textY = lineY + 6;

      doc
        .moveTo(left, lineY)
        .lineTo(right, lineY)
        .lineWidth(0.4)
        .strokeColor('#E2E8F0')
        .stroke();

      doc
        .fillColor('#94A3B8')
        .fontSize(8)
        .text(this.toPdfText(`Yaratilgan: ${generatedLabel}`), left, textY, {
          width,
          align: 'left',
          lineBreak: false,
        })
        .text(
          this.toPdfText(`Sahifa ${i + 1} / ${range.count}`),
          left,
          textY,
          { width, align: 'right', lineBreak: false },
        );
    }

    doc.fillColor('#000000');
  }

  private formatStatus(status?: string | null) {
    switch (status) {
      case 'CREATED':
        return 'Yaratildi';
      case 'PENDING_APPROVAL':
        return 'Tasdiqlash kutilmoqda';
      case 'ISSUED':
        return 'Berildi';
      case 'CANCELLED':
        return 'Bekor qilindi';
      default:
        return status ?? '—';
    }
  }

  private formatType(type?: string | null) {
    switch (type) {
      case 'USAGE':
        return 'Foydalanish';
      case 'EXPIRED':
        return 'Muddati o`tgan';
      default:
        return type ?? '—';
    }
  }

  private resolvePdfFontPath() {
    const candidates = [
      process.env.PDF_FONT_PATH,
      join(process.cwd(), 'assets', 'fonts', 'DejaVuSans.ttf'),
      join(process.cwd(), 'assets', 'fonts', 'NotoSans-Regular.ttf'),
      // Alpine (production Docker)
      '/usr/share/fonts/dejavu/DejaVuSans.ttf',
      '/usr/share/fonts/ttf-dejavu/DejaVuSans.ttf',
      // Arch
      '/usr/share/fonts/TTF/DejaVuSans.ttf',
      // Debian / Ubuntu
      '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
      '/usr/share/fonts/truetype/noto/NotoSans-Regular.ttf',
      '/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf',
      // Misc
      '/usr/share/fonts/noto/NotoSans-Regular.ttf',
      '/usr/share/fonts/liberation/LiberationSans-Regular.ttf',
    ];

    const direct = candidates.find(
      (candidate): candidate is string => !!candidate && existsSync(candidate),
    );

    if (direct) {
      return direct;
    }

    return this.findFallbackUnicodeFont('/usr/share/fonts');
  }

  private findFallbackUnicodeFont(root: string): string | undefined {
    if (!existsSync(root)) {
      return undefined;
    }

    const preferredNames = [
      'DejaVuSans.ttf',
      'NotoSans-Regular.ttf',
      'LiberationSans-Regular.ttf',
      'FreeSans.ttf',
    ];

    const stack: string[] = [root];
    let firstAnyTtf: string | undefined;

    while (stack.length > 0) {
      const dir = stack.pop()!;
      let entries: string[];
      try {
        entries = readdirSync(dir);
      } catch {
        continue;
      }

      for (const entry of entries) {
        const full = join(dir, entry);
        let stats;
        try {
          stats = statSync(full);
        } catch {
          continue;
        }

        if (stats.isDirectory()) {
          stack.push(full);
          continue;
        }

        if (preferredNames.includes(entry)) {
          return full;
        }

        if (!firstAnyTtf && extname(entry).toLowerCase() === '.ttf') {
          firstAnyTtf = full;
        }
      }
    }

    return firstAnyTtf;
  }

  private applyPdfFont(doc: InstanceType<typeof PDFDocument>) {
    if (this.pdfFontPath) {
      doc.registerFont(this.pdfFontName, this.pdfFontPath);
      doc.font(this.pdfFontName);
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

  private buildExpenseReceiptKey(
    expense: Pick<Expense, 'id' | 'expense_number'>,
  ) {
    return `expense-receipts/${expense.id}/${this.buildPdfFilename(expense.expense_number)}`;
  }

  private resolveAbsolutePath(fileKey: string) {
    return join(this.uploadsPath, fileKey);
  }

  private getPublicUrl(fileKey: string) {
    const normalized = fileKey.replace(/^\/+/, '').replace(/^uploads\//, '');
    const baseUrl = (this.serverUrl || '').replace(/\/+$/, '');

    if (!baseUrl) {
      return `/uploads/${normalized}`;
    }

    return `${baseUrl}/uploads/${normalized}`;
  }
}
