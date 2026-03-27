import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { existsSync } from 'node:fs';
import PDFDocument from 'pdfkit';
import ExcelJS from 'exceljs';
import { Repository, SelectQueryBuilder } from 'typeorm';
import { Product } from 'src/modules/product/entities/product.entity';
import { Warehouse } from 'src/modules/warehouse/entities/warehouse.entity';
import {
  ExportInventoryReportQueryDto,
  GetInventoryReportQueryDto,
  InventoryReportType,
  ReportExportFormat,
} from '../dto/get-inventory-report-query.dto';

interface InventoryItemRowRaw {
  product_id: string;
  product_name: string;
  warehouse_id: string;
  warehouse_name: string;
  unit: string;
  quantity: string;
  total_value: string;
}

export interface InventoryReportItem {
  product_id: string;
  product_name: string;
  warehouse_id: string;
  warehouse_name: string;
  quantity: number;
  unit: string;
  average_price: number;
  total_value: number;
}

export interface InventoryWarehouseDistributionItem {
  warehouse_id: string;
  warehouse_name: string;
  positions_count: number;
  total_units: number;
  total_value: number;
}

export interface InventoryReportResponse {
  report_type: InventoryReportType;
  generated_at: string;
  filters: {
    warehouse_id: string | null;
    date_from: string | null;
    date_to: string | null;
    date_filter_field: 'batch.received_at';
  };
  summary: {
    total_positions: number;
    total_units: number;
    total_value: number;
  };
  warehouse_distribution: InventoryWarehouseDistributionItem[];
  details: InventoryReportItem[];
  meta: {
    page: number;
    limit: number;
    total: number;
    total_pages: number;
  };
}

interface InventoryDataset {
  generated_at: string;
  filters: InventoryReportResponse['filters'];
  summary: InventoryReportResponse['summary'];
  warehouse_distribution: InventoryWarehouseDistributionItem[];
  details: InventoryReportItem[];
}

@Injectable()
export class ReportService {
  private readonly logger = new Logger(ReportService.name);
  private readonly pdfFontPath = this.resolvePdfFontPath();

  constructor(
    @InjectRepository(Product)
    private readonly productRepository: Repository<Product>,
    @InjectRepository(Warehouse)
    private readonly warehouseRepository: Repository<Warehouse>,
  ) {
    if (!this.pdfFontPath) {
      this.logger.warn(
        'PDF font file topilmadi. PDF export Helvetica bilan davom etadi, Unicode matn soddalashtirilishi mumkin.',
      );
    }
  }

  async getInventoryReport(
    query: GetInventoryReportQueryDto,
  ): Promise<InventoryReportResponse> {
    const dataset = await this.buildInventoryDataset(query);
    const page = query.page ?? 1;
    const limit = Math.min(query.limit ?? 50, 200);
    const total = dataset.details.length;

    return {
      report_type: query.report_type ?? InventoryReportType.INVENTORY_BALANCE,
      generated_at: dataset.generated_at,
      filters: dataset.filters,
      summary: dataset.summary,
      warehouse_distribution: dataset.warehouse_distribution,
      details: dataset.details.slice((page - 1) * limit, page * limit),
      meta: {
        page,
        limit,
        total,
        total_pages: Math.ceil(total / limit) || 1,
      },
    };
  }

  async buildInventoryExportBuffer(query: ExportInventoryReportQueryDto) {
    const format = query.format ?? ReportExportFormat.EXCEL;

    if (format === ReportExportFormat.PDF) {
      const buffer = await this.buildInventoryPdfBuffer(query);
      return {
        buffer,
        filename: this.buildFilename('inventory_report', 'pdf'),
        contentType: 'application/pdf',
      };
    }

    const buffer = await this.buildInventoryExcelBuffer(query);
    return {
      buffer,
      filename: this.buildFilename('inventory_report', 'xlsx'),
      contentType:
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    };
  }

  private async buildInventoryDataset(
    query: GetInventoryReportQueryDto,
  ): Promise<InventoryDataset> {
    await this.validateWarehouse(query.warehouse_id);
    this.validateDateRange(query.date_from, query.date_to);

    const generatedAt = new Date().toISOString();
    const items = await this.getInventoryItems(query);

    const summary = {
      total_positions: items.length,
      total_units: Number(
        items.reduce((sum, item) => sum + item.quantity, 0).toFixed(2),
      ),
      total_value: Number(
        items.reduce((sum, item) => sum + item.total_value, 0).toFixed(2),
      ),
    };

    const warehouseMap = new Map<string, InventoryWarehouseDistributionItem>();
    for (const item of items) {
      const current = warehouseMap.get(item.warehouse_id) ?? {
        warehouse_id: item.warehouse_id,
        warehouse_name: item.warehouse_name,
        positions_count: 0,
        total_units: 0,
        total_value: 0,
      };

      current.positions_count += 1;
      current.total_units = Number(
        (current.total_units + item.quantity).toFixed(2),
      );
      current.total_value = Number(
        (current.total_value + item.total_value).toFixed(2),
      );

      warehouseMap.set(item.warehouse_id, current);
    }

    return {
      generated_at: generatedAt,
      filters: {
        warehouse_id: query.warehouse_id ?? null,
        date_from: query.date_from ?? null,
        date_to: query.date_to ?? null,
        date_filter_field: 'batch.received_at',
      },
      summary,
      warehouse_distribution: Array.from(warehouseMap.values()).sort((a, b) =>
        a.warehouse_name.localeCompare(b.warehouse_name),
      ),
      details: items,
    };
  }

  private async getInventoryItems(query: GetInventoryReportQueryDto) {
    const qb = this.productRepository
      .createQueryBuilder('product')
      .leftJoin('product.warehouse', 'warehouse')
      .leftJoin('product.batches', 'batch', 'batch.quantity > 0')
      .select('product.id', 'product_id')
      .addSelect('product.name', 'product_name')
      .addSelect('warehouse.id', 'warehouse_id')
      .addSelect('warehouse.name', 'warehouse_name')
      .addSelect('product.unit', 'unit')
      .addSelect('COALESCE(SUM(batch.quantity), 0)', 'quantity')
      .addSelect(
        'COALESCE(SUM(batch.quantity * batch.price_at_purchase), 0)',
        'total_value',
      )
      .groupBy('product.id')
      .addGroupBy('warehouse.id')
      .addGroupBy('warehouse.name')
      .having('COALESCE(SUM(batch.quantity), 0) > 0')
      .orderBy('warehouse.name', 'ASC')
      .addOrderBy('product.name', 'ASC');

    if (query.warehouse_id) {
      qb.andWhere('warehouse.id = :warehouseId', {
        warehouseId: query.warehouse_id,
      });
    }

    this.applyReceivedAtFilter(qb, query);

    const rows = await qb.getRawMany<InventoryItemRowRaw>();

    return rows.map((row) => {
      const quantity = Number(Number(row.quantity ?? 0).toFixed(2));
      const totalValue = Number(Number(row.total_value ?? 0).toFixed(2));
      const averagePrice =
        quantity > 0 ? Number((totalValue / quantity).toFixed(2)) : 0;

      return {
        product_id: row.product_id,
        product_name: row.product_name,
        warehouse_id: row.warehouse_id,
        warehouse_name: row.warehouse_name,
        quantity,
        unit: row.unit,
        average_price: averagePrice,
        total_value: totalValue,
      };
    });
  }

  private async buildInventoryExcelBuffer(
    query: GetInventoryReportQueryDto,
  ): Promise<Buffer> {
    const report = await this.buildInventoryDataset(query);

    const workbook = new ExcelJS.Workbook();
    const summarySheet = workbook.addWorksheet('Summary');
    const detailsSheet = workbook.addWorksheet('Details');

    summarySheet.addRow(['Inventory Report']);
    summarySheet.addRow(['Generated at', report.generated_at]);
    summarySheet.addRow([
      'Warehouse',
      report.filters.warehouse_id ?? 'All warehouses',
    ]);
    summarySheet.addRow(['Date from', report.filters.date_from ?? '-']);
    summarySheet.addRow(['Date to', report.filters.date_to ?? '-']);
    summarySheet.addRow([
      'Date filter field',
      report.filters.date_filter_field,
    ]);
    summarySheet.addRow([]);
    summarySheet.addRow(['Metric', 'Value']);
    summarySheet.addRow(['Total positions', report.summary.total_positions]);
    summarySheet.addRow(['Total units', report.summary.total_units]);
    summarySheet.addRow(['Total value', report.summary.total_value]);
    summarySheet.addRow([]);
    summarySheet.addRow([
      'Warehouse',
      'Positions count',
      'Total units',
      'Total value',
    ]);

    for (const row of report.warehouse_distribution) {
      summarySheet.addRow([
        row.warehouse_name,
        row.positions_count,
        row.total_units,
        row.total_value,
      ]);
    }

    summarySheet.columns = [
      { width: 24 },
      { width: 20 },
      { width: 18 },
      { width: 18 },
    ];
    summarySheet.getRow(1).font = { bold: true, size: 16 };
    summarySheet.getRow(8).font = { bold: true };
    summarySheet.getRow(13).font = { bold: true };

    detailsSheet.columns = [
      { header: 'Product', key: 'product_name', width: 32 },
      { header: 'Warehouse', key: 'warehouse_name', width: 24 },
      { header: 'Quantity', key: 'quantity', width: 14 },
      { header: 'Unit', key: 'unit', width: 12 },
      { header: 'Average price', key: 'average_price', width: 16 },
      { header: 'Total value', key: 'total_value', width: 18 },
    ];

    for (const item of report.details) {
      detailsSheet.addRow(item);
    }

    detailsSheet.getRow(1).font = { bold: true };
    detailsSheet.views = [{ state: 'frozen', ySplit: 1 }];

    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }

  private async buildInventoryPdfBuffer(
    query: GetInventoryReportQueryDto,
  ): Promise<Buffer> {
    const report = await this.buildInventoryDataset(query);

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
      doc
        .fontSize(18)
        .text(this.toPdfText('Inventory Report'), { align: 'left' });
      doc.moveDown(0.5);
      doc.fontSize(10);
      doc.text(this.toPdfText(`Generated at: ${report.generated_at}`));
      doc.text(
        this.toPdfText(
          `Warehouse: ${report.filters.warehouse_id ?? 'All warehouses'}`,
        ),
      );
      doc.text(this.toPdfText(`Date from: ${report.filters.date_from ?? '-'}`));
      doc.text(this.toPdfText(`Date to: ${report.filters.date_to ?? '-'}`));
      doc.text(
        this.toPdfText(
          `Date filter field: ${report.filters.date_filter_field}`,
        ),
      );
      doc.moveDown();

      doc.fontSize(13).text(this.toPdfText('Summary'));
      doc.fontSize(10);
      doc.text(
        this.toPdfText(`Total positions: ${report.summary.total_positions}`),
      );
      doc.text(
        this.toPdfText(
          `Total units: ${this.formatNumber(report.summary.total_units)}`,
        ),
      );
      doc.text(
        this.toPdfText(
          `Total value: ${this.formatCurrency(report.summary.total_value)}`,
        ),
      );
      doc.moveDown();

      doc.fontSize(13).text(this.toPdfText('Warehouse distribution'));
      doc.moveDown(0.5);
      for (const row of report.warehouse_distribution) {
        doc
          .fontSize(10)
          .text(
            this.toPdfText(
              `${row.warehouse_name}: positions ${row.positions_count}, units ${this.formatNumber(row.total_units)}, value ${this.formatCurrency(row.total_value)}`,
            ),
          );
      }

      doc.moveDown();
      doc.fontSize(13).text(this.toPdfText('Detailed list'));
      doc.moveDown(0.5);

      for (const item of report.details) {
        if (doc.y > 760) {
          doc.addPage();
          this.applyPdfFont(doc);
          doc.fontSize(13).text(this.toPdfText('Detailed list'));
          doc.moveDown(0.5);
        }

        doc
          .fontSize(10)
          .text(
            this.toPdfText(
              `${item.product_name} | ${item.warehouse_name} | ${this.formatNumber(item.quantity)} ${item.unit} | ${this.formatCurrency(item.average_price)} | ${this.formatCurrency(item.total_value)}`,
            ),
          );
      }

      doc.end();
    });
  }

  private applyReceivedAtFilter(
    qb: SelectQueryBuilder<Product>,
    query: Pick<GetInventoryReportQueryDto, 'date_from' | 'date_to'>,
  ) {
    if (!query.date_from && !query.date_to) {
      return;
    }

    const from = query.date_from ? new Date(query.date_from) : null;
    const to = query.date_to ? new Date(query.date_to) : null;

    if (from) from.setHours(0, 0, 0, 0);
    if (to) to.setHours(23, 59, 59, 999);

    if (from) {
      qb.andWhere('batch.received_at >= :from', { from });
    }

    if (to) {
      qb.andWhere('batch.received_at <= :to', { to });
    }
  }

  private async validateWarehouse(warehouseId?: string) {
    if (!warehouseId) {
      return;
    }

    const warehouse = await this.warehouseRepository.findOne({
      where: { id: warehouseId },
    });

    if (!warehouse) {
      throw new BadRequestException('Warehouse topilmadi');
    }
  }

  private validateDateRange(dateFrom?: string, dateTo?: string) {
    if (!dateFrom || !dateTo) {
      return;
    }

    if (new Date(dateFrom) > new Date(dateTo)) {
      throw new BadRequestException(
        'date_from date_to dan katta bo`lishi mumkin emas',
      );
    }
  }

  private formatNumber(value: number) {
    return Number(value.toFixed(2)).toLocaleString('en-US', {
      maximumFractionDigits: 2,
    });
  }

  private formatCurrency(value: number) {
    return `${this.formatNumber(value)} sum`;
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

  private buildFilename(prefix: string, extension: 'pdf' | 'xlsx') {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    return `${prefix}_${year}${month}${day}_${hours}${minutes}${seconds}.${extension}`;
  }
}
