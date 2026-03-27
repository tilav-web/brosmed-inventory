import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BotUserService } from 'src/modules/bot-user/services/bot-user.service';
import { BotUserStatus } from 'src/modules/bot-user/enums/bot-user-status.enum';
import { ExpenseStatus } from 'src/modules/expense/enums/expense-status.enum';
import { ExpenseType } from 'src/modules/expense/enums/expense-type.enum';
import { Expense } from 'src/modules/expense/entities/expense.entity';
import { ProductBatch } from 'src/modules/product/entities/product-batch.entity';
import { Product } from 'src/modules/product/entities/product.entity';
import { OrderStatus } from 'src/modules/purchase-order/enums/order-status.enum';
import { PurchaseOrder } from 'src/modules/purchase-order/entities/purchase-order.entity';
import { Warehouse } from 'src/modules/warehouse/entities/warehouse.entity';
import { WarehouseService } from 'src/modules/warehouse/services/warehouse.service';

interface WarehouseRow {
  id: string;
  name: string;
  location: string;
  type: string;
  total_inventory_value?: number;
}

interface ProductRow {
  id: string;
  name: string;
  quantity: string | number;
  min_limit: number;
  unit: string;
  warehouse_name: string;
}

@Injectable()
export class BotContentService {
  constructor(
    @InjectRepository(Product)
    private readonly productRepository: Repository<Product>,
    @InjectRepository(ProductBatch)
    private readonly productBatchRepository: Repository<ProductBatch>,
    @InjectRepository(Expense)
    private readonly expenseRepository: Repository<Expense>,
    @InjectRepository(PurchaseOrder)
    private readonly purchaseOrderRepository: Repository<PurchaseOrder>,
    @InjectRepository(Warehouse)
    private readonly warehouseRepository: Repository<Warehouse>,
    private readonly warehouseService: WarehouseService,
    private readonly botUserService: BotUserService,
  ) {}

  async buildWarehousesMessage(): Promise<string> {
    const result = (await this.warehouseService.findAll({
      page: 1,
      limit: 20,
    })) as {
      data: Array<WarehouseRow & { total_inventory_value: number }>;
      meta: { total: number };
    };

    const warehouses = result.data;

    if (!warehouses.length) {
      return '📦 <b>Omborlar</b>\n\nHozircha omborlar mavjud emas.';
    }

    let text = `📦 <b>Omborlar ro'yxati</b>\n`;
    text += `Jami: <b>${result.meta.total}</b> ta\n\n`;

    for (const warehouse of warehouses) {
      text += `🔹 <b>${this.escapeHtml(warehouse.name)}</b>\n`;
      text += `📍 ${this.escapeHtml(warehouse.location || 'Nomaʼlum')}\n`;
      text += `🏷️ Turi: ${this.escapeHtml(warehouse.type)}\n`;
      text += `💰 Qiymati: ${this.formatCurrency(
        Number(warehouse.total_inventory_value ?? 0),
      )}\n\n`;
    }

    return text.trim();
  }

  async buildAlertsMessage(): Promise<string> {
    const result = (await this.warehouseService.findAll({
      page: 1,
      limit: 100,
    })) as {
      data: WarehouseRow[];
    };

    const sections: string[] = [];
    let totalAlerts = 0;

    for (const warehouse of result.data) {
      const details = (await this.warehouseService.findByIdWithDetails(
        warehouse.id,
      )) as {
        alerts: {
          count: number;
          items: Array<{ type: string; message: string }>;
        };
      };

      if (!details.alerts.count) {
        continue;
      }

      totalAlerts += details.alerts.count;
      const warehouseLines = details.alerts.items.slice(0, 5).map((alert) => {
        const icon = alert.type === 'low_stock' ? '⚠️' : '⏰';
        return `${icon} ${this.escapeHtml(alert.message)}`;
      });

      sections.push(
        `📦 <b>${this.escapeHtml(warehouse.name)}</b>\n${warehouseLines.join('\n')}`,
      );
    }

    if (!sections.length) {
      return "🔔 <b>Ogohlantirishlar</b>\n\n✅ Hozircha ogohlantirishlar yo'q.";
    }

    return `🔔 <b>Ogohlantirishlar</b>\nJami: <b>${totalAlerts}</b> ta\n\n${sections.join('\n\n')}`;
  }

  async buildStatsMessage(): Promise<string> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const in30Days = new Date(today);
    in30Days.setDate(in30Days.getDate() + 30);
    in30Days.setHours(23, 59, 59, 999);

    const [
      totalProducts,
      totalWarehouses,
      inStockProducts,
      lowStockProducts,
      pendingOrders,
      expiredBatches,
      expiringSoon,
      inventoryValueRaw,
      recentExpenses,
    ] = await Promise.all([
      this.productRepository.count(),
      this.warehouseRepository.count(),
      this.productRepository
        .createQueryBuilder('product')
        .where('product.quantity > 0')
        .getCount(),
      this.productRepository
        .createQueryBuilder('product')
        .where('product.quantity > 0')
        .andWhere('product.quantity <= product.min_limit')
        .getCount(),
      this.purchaseOrderRepository
        .createQueryBuilder('po')
        .where('po.is_received = false')
        .andWhere('po.status != :cancelled', {
          cancelled: OrderStatus.CANCELLED,
        })
        .getCount(),
      this.productBatchRepository
        .createQueryBuilder('batch')
        .where('batch.quantity > 0')
        .andWhere('batch.expiration_date IS NOT NULL')
        .andWhere('batch.expiration_date < :today', { today })
        .getCount(),
      this.productBatchRepository
        .createQueryBuilder('batch')
        .where('batch.quantity > 0')
        .andWhere('batch.expiration_date IS NOT NULL')
        .andWhere('batch.expiration_date >= :today', { today })
        .andWhere('batch.expiration_date <= :in30Days', { in30Days })
        .getCount(),
      this.productBatchRepository
        .createQueryBuilder('batch')
        .select(
          'COALESCE(SUM(batch.quantity * batch.price_at_purchase), 0)',
          'total',
        )
        .where('batch.quantity > 0')
        .getRawOne<{ total: string | null }>(),
      this.expenseRepository.find({
        order: { createdAt: 'DESC' },
        take: 5,
      }),
    ]);

    const inventoryValue = Number(
      Number(inventoryValueRaw?.total ?? 0).toFixed(2),
    );

    let text = '📊 <b>Umumiy statistika</b>\n\n';
    text += `💊 Mahsulotlar: <b>${totalProducts}</b> ta\n`;
    text += `📦 Omborlar: <b>${totalWarehouses}</b> ta\n`;
    text += `✅ Zaxirada bor: <b>${inStockProducts}</b> ta\n`;
    text += `⚠️ Kam qoldiq: <b>${lowStockProducts}</b> ta\n`;
    text += `📥 Kutilayotgan kirimlar: <b>${pendingOrders}</b> ta\n`;
    text += `⛔ Muddati o'tgan batchlar: <b>${expiredBatches}</b> ta\n`;
    text += `⏰ 30 kun ichida tugaydiganlar: <b>${expiringSoon}</b> ta\n`;
    text += `💰 Ombordagi jami qiymat: <b>${this.formatCurrency(inventoryValue)}</b>\n`;

    if (recentExpenses.length) {
      text += '\n🕒 <b>So‘nggi chiqimlar</b>\n';
      for (const expense of recentExpenses) {
        text += `• ${this.escapeHtml(expense.expense_number)} | ${this.mapExpenseStatus(expense.status)} | ${this.formatCurrency(Number(expense.total_price))}\n`;
      }
    }

    return text.trim();
  }

  async buildProductsMessage(): Promise<string> {
    const [totalProducts, lowStockProducts, featuredProducts] =
      await Promise.all([
        this.productRepository.count(),
        this.productRepository
          .createQueryBuilder('product')
          .where('product.quantity > 0')
          .andWhere('product.quantity <= product.min_limit')
          .getCount(),
        this.productRepository
          .createQueryBuilder('product')
          .leftJoin('product.warehouse', 'warehouse')
          .select('product.id', 'id')
          .addSelect('product.name', 'name')
          .addSelect('product.quantity', 'quantity')
          .addSelect('product.min_limit', 'min_limit')
          .addSelect('product.unit', 'unit')
          .addSelect('warehouse.name', 'warehouse_name')
          .where('product.quantity > 0')
          .orderBy(
            'CASE WHEN product.quantity <= product.min_limit THEN 0 ELSE 1 END',
            'ASC',
          )
          .addOrderBy('product.quantity', 'ASC')
          .addOrderBy('product.name', 'ASC')
          .limit(12)
          .getRawMany<ProductRow>(),
      ]);

    if (!featuredProducts.length) {
      return `💊 <b>Mahsulotlar</b>\n\nJami: <b>${totalProducts}</b> ta\nHozircha omborda qoldiq yo'q.`;
    }

    let text = '💊 <b>Mahsulotlar</b>\n';
    text += `Jami: <b>${totalProducts}</b> ta\n`;
    text += `Kam qoldiq: <b>${lowStockProducts}</b> ta\n\n`;

    for (const product of featuredProducts) {
      const quantity = Number(Number(product.quantity ?? 0).toFixed(2));
      const isLowStock = quantity <= Number(product.min_limit);
      text += `${isLowStock ? '⚠️' : '•'} <b>${this.escapeHtml(product.name)}</b>\n`;
      text += `   ${this.formatNumber(quantity)} ${this.escapeHtml(product.unit)} | min ${product.min_limit}\n`;
      text += `   📦 ${this.escapeHtml(product.warehouse_name)}\n`;
    }

    return text.trim();
  }

  async buildExpensesMessage(): Promise<string> {
    const [recentExpenses, statusRows] = await Promise.all([
      this.expenseRepository.find({
        order: { createdAt: 'DESC' },
        take: 10,
      }),
      this.expenseRepository
        .createQueryBuilder('expense')
        .select('expense.status', 'status')
        .addSelect('COUNT(expense.id)', 'count')
        .groupBy('expense.status')
        .getRawMany<{ status: ExpenseStatus; count: string }>(),
    ]);

    const counts = {
      [ExpenseStatus.PENDING_ISSUE]: 0,
      [ExpenseStatus.PENDING_PHOTO]: 0,
      [ExpenseStatus.COMPLETED]: 0,
    };

    for (const row of statusRows) {
      counts[row.status] = Number(row.count ?? 0);
    }

    let text = '📋 <b>Chiqimlar</b>\n\n';
    text += `🟡 Kutilayotgan berish: <b>${counts[ExpenseStatus.PENDING_ISSUE]}</b>\n`;
    text += `📷 Foto kutilmoqda: <b>${counts[ExpenseStatus.PENDING_PHOTO]}</b>\n`;
    text += `✅ Yakunlangan: <b>${counts[ExpenseStatus.COMPLETED]}</b>\n`;

    if (!recentExpenses.length) {
      text += '\nHozircha chiqimlar mavjud emas.';
      return text;
    }

    text += '\n🕒 <b>So‘nggi hujjatlar</b>\n';
    for (const expense of recentExpenses) {
      text += `• <b>${this.escapeHtml(expense.expense_number)}</b>\n`;
      text += `   ${this.mapExpenseStatus(expense.status)} | ${this.mapExpenseType(expense.type)}\n`;
      text += `   ${this.escapeHtml(expense.staff_name)} | ${this.formatCurrency(
        Number(expense.total_price),
      )}\n`;
      text += `   ${this.formatDate(expense.createdAt)}\n`;
    }

    return text.trim();
  }

  async buildSettingsMessage(telegramId: number): Promise<string> {
    const user = await this.botUserService.findByTelegramId(telegramId);

    if (!user) {
      return "⚙️ <b>Sozlamalar</b>\n\nBotdan foydalanish uchun avval /start buyrug'ini bosing.";
    }

    let text = '⚙️ <b>Sozlamalar va profil</b>\n\n';
    text += `🆔 Telegram ID: <b>${user.telegram_id}</b>\n`;
    text += `👤 Ism: <b>${this.escapeHtml(
      [user.first_name, user.last_name].filter(Boolean).join(' ') ||
        'Kiritilmagan',
    )}</b>\n`;
    text += `🔗 Username: <b>${this.escapeHtml(
      user.username ? `@${user.username}` : 'yoʻq',
    )}</b>\n`;
    text += `📌 Holat: <b>${this.mapBotUserStatus(user.status)}</b>\n`;
    text += `✅ Tasdiq: <b>${user.is_approved ? 'tasdiqlangan' : 'tasdiqlanmagan'}</b>\n`;
    text += `🕒 So‘nggi faollik: <b>${this.formatDate(user.last_active_at)}</b>\n`;
    text +=
      '\n💡 Buyruqlar: /help /stats /products /expenses /warehouses /alerts';

    return text;
  }

  private mapExpenseStatus(status: ExpenseStatus) {
    switch (status) {
      case ExpenseStatus.PENDING_ISSUE:
        return '🟡 Berish kutilmoqda';
      case ExpenseStatus.PENDING_PHOTO:
        return '📷 Foto kutilmoqda';
      case ExpenseStatus.COMPLETED:
        return '✅ Yakunlangan';
      default:
        return this.escapeHtml(status);
    }
  }

  private mapExpenseType(type: ExpenseType) {
    switch (type) {
      case ExpenseType.USAGE:
        return 'Ishlatish';
      case ExpenseType.EXPIRED:
        return 'Muddati o‘tgan';
      default:
        return this.escapeHtml(type);
    }
  }

  private mapBotUserStatus(status: BotUserStatus) {
    switch (status) {
      case BotUserStatus.ACTIVE:
        return 'faol';
      case BotUserStatus.PENDING:
        return 'kutilyapti';
      case BotUserStatus.BLOCKED:
        return 'bloklangan';
      default:
        return this.escapeHtml(status);
    }
  }

  private formatDate(value?: Date | string | null) {
    if (!value) {
      return 'N/A';
    }

    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) {
      return 'N/A';
    }

    return new Intl.DateTimeFormat('uz-UZ', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).format(date);
  }

  private formatCurrency(value: number) {
    return `${this.formatNumber(value)} sum`;
  }

  private formatNumber(value: number) {
    return new Intl.NumberFormat('uz-UZ', {
      minimumFractionDigits: value % 1 === 0 ? 0 : 2,
      maximumFractionDigits: 2,
    }).format(Number(value.toFixed(2)));
  }

  private escapeHtml(value: string) {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
}
