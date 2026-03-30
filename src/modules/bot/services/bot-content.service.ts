import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BotUser } from 'src/modules/bot-user/entities/bot-user.entity';
import { BotUserService } from 'src/modules/bot-user/services/bot-user.service';
import { BotUserStatus } from 'src/modules/bot-user/enums/bot-user-status.enum';
import { Expense } from 'src/modules/expense/entities/expense.entity';
import { ExpenseStatus } from 'src/modules/expense/enums/expense-status.enum';
import { ExpenseType } from 'src/modules/expense/enums/expense-type.enum';
import { ProductBatch } from 'src/modules/product/entities/product-batch.entity';
import { Product } from 'src/modules/product/entities/product.entity';
import { PurchaseOrder } from 'src/modules/purchase-order/entities/purchase-order.entity';
import { OrderStatus } from 'src/modules/purchase-order/enums/order-status.enum';
import { Role } from 'src/modules/user/enums/role.enum';
import { UserService } from 'src/modules/user/services/user.service';
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

interface RecentExpenseRow {
  id: string;
  expense_number: string;
  created_at: Date;
  staff_name: string;
  purpose: string | null;
  status: ExpenseStatus;
  total_price: number;
}

type ViewerContext =
  | {
      ok: true;
      role: Role;
      botUser: BotUser;
      linkedUserId: string | null;
    }
  | {
      ok: false;
      message: string;
      botUser?: BotUser;
    };

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
    private readonly userService: UserService,
  ) {}

  async buildWarehousesMessage(telegramId: number): Promise<string> {
    const viewer = await this.getViewerContext(telegramId);
    if (!viewer.ok) {
      return viewer.message;
    }

    if (viewer.role === Role.ADMIN) {
      return this.buildAdminWarehousesMessage();
    }

    if (viewer.role === Role.ACCOUNTANT) {
      return this.buildUnavailableSectionMessage(
        '📦 Omborlar',
        "Hisobchi uchun asosiy bo'lim xaridlar hisoblanadi. /orders buyrug'idan foydalaning.",
      );
    }

    return this.buildWarehouseWarehousesMessage(viewer.linkedUserId!);
  }

  async buildAlertsMessage(telegramId: number): Promise<string> {
    const viewer = await this.getViewerContext(telegramId);
    if (!viewer.ok) {
      return viewer.message;
    }

    if (viewer.role === Role.ADMIN) {
      return this.buildAdminAlertsMessage();
    }

    if (viewer.role === Role.ACCOUNTANT) {
      return this.buildUnavailableSectionMessage(
        '🔔 Ogohlantirishlar',
        "Hisobchi uchun bu bo'lim mavjud emas.",
      );
    }

    return this.buildWarehouseAlertsMessage(viewer.linkedUserId!);
  }

  async buildStatsMessage(telegramId: number): Promise<string> {
    const viewer = await this.getViewerContext(telegramId);
    if (!viewer.ok) {
      return viewer.message;
    }

    if (viewer.role === Role.ADMIN) {
      return this.buildAdminStatsMessage();
    }

    if (viewer.role === Role.ACCOUNTANT) {
      return this.buildAccountantStatsMessage(viewer.linkedUserId!);
    }

    return this.buildWarehouseStatsMessage(viewer.linkedUserId!);
  }

  async buildProductsMessage(telegramId: number): Promise<string> {
    const viewer = await this.getViewerContext(telegramId);
    if (!viewer.ok) {
      return viewer.message;
    }

    if (viewer.role === Role.ADMIN) {
      return this.buildAdminProductsMessage();
    }

    if (viewer.role === Role.ACCOUNTANT) {
      return this.buildUnavailableSectionMessage(
        '💊 Mahsulotlar',
        "Hisobchi uchun mahsulot bo'limi mavjud emas.",
      );
    }

    return this.buildWarehouseProductsMessage(viewer.linkedUserId!);
  }

  async buildExpensesMessage(telegramId: number): Promise<string> {
    const viewer = await this.getViewerContext(telegramId);
    if (!viewer.ok) {
      return viewer.message;
    }

    if (viewer.role === Role.ADMIN) {
      return this.buildAdminExpensesMessage();
    }

    if (viewer.role === Role.ACCOUNTANT) {
      return this.buildAccountantExpensesMessage(viewer.linkedUserId!);
    }

    return this.buildWarehouseExpensesMessage(viewer.linkedUserId!);
  }

  async buildOrdersMessage(telegramId: number): Promise<string> {
    const viewer = await this.getViewerContext(telegramId);
    if (!viewer.ok) {
      return viewer.message;
    }

    if (viewer.role === Role.WAREHOUSE) {
      return this.buildUnavailableSectionMessage(
        '🛒 Xaridlar',
        "Warehouse roli uchun xaridlar bo'limi mavjud emas.",
      );
    }

    if (viewer.role === Role.ADMIN) {
      return this.buildAdminOrdersMessage();
    }

    return this.buildAccountantOrdersMessage(viewer.linkedUserId!);
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
    text += `👔 Bot roli: <b>${this.mapRole(user.role)}</b>\n`;

    if (user.linked_user_id) {
      const linkedUser = await this.userService.findById(user.linked_user_id);
      if (linkedUser) {
        text += `🔐 Tizim user: <b>${this.escapeHtml(
          `${linkedUser.first_name} ${linkedUser.last_name}`.trim() ||
            linkedUser.username,
        )}</b>\n`;
        text += `🪪 Login: <b>${this.escapeHtml(linkedUser.username)}</b>\n`;
      } else {
        text += `🔐 Tizim user ID: <b>${this.escapeHtml(user.linked_user_id)}</b>\n`;
      }
    } else {
      text += `🔐 Tizim user: <b>${user.role === Role.ADMIN ? 'ixtiyoriy' : "bog'lanmagan"}</b>\n`;
    }

    text += `🕒 So‘nggi faollik: <b>${this.formatDate(user.last_active_at)}</b>\n`;

    const configMessage = this.getConfigurationMessage(user);
    if (configMessage) {
      text += `\n⚠️ ${configMessage}`;
    } else {
      text +=
        '\n💡 Buyruqlar: /help /stats /products /expenses /warehouses /alerts';
    }

    return text;
  }

  private async buildAdminWarehousesMessage(): Promise<string> {
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

  private async buildWarehouseWarehousesMessage(
    linkedUserId: string,
  ): Promise<string> {
    const warehouses = await this.getManagedWarehouses(linkedUserId);

    if (!warehouses.length) {
      return "📦 <b>Mening omborlarim</b>\n\nSizga hali ombor biriktirilmagan.";
    }

    const totalsRaw = await this.productBatchRepository
      .createQueryBuilder('batch')
      .select('batch.warehouse_id', 'warehouse_id')
      .addSelect(
        'COALESCE(SUM(batch.quantity * batch.price_at_purchase), 0)',
        'total_inventory_value',
      )
      .where('batch.warehouse_id IN (:...warehouseIds)', {
        warehouseIds: warehouses.map((warehouse) => warehouse.id),
      })
      .groupBy('batch.warehouse_id')
      .getRawMany<{
        warehouse_id: string;
        total_inventory_value: string;
      }>();

    const totals = new Map<string, number>(
      totalsRaw.map((row) => [
        row.warehouse_id,
        Number(Number(row.total_inventory_value ?? 0).toFixed(2)),
      ]),
    );

    let text = `📦 <b>Mening omborlarim</b>\n`;
    text += `Jami: <b>${warehouses.length}</b> ta\n\n`;

    for (const warehouse of warehouses) {
      text += `🔹 <b>${this.escapeHtml(warehouse.name)}</b>\n`;
      text += `📍 ${this.escapeHtml(warehouse.location || 'Nomaʼlum')}\n`;
      text += `🏷️ Turi: ${this.escapeHtml(warehouse.type)}\n`;
      text += `💰 Qiymati: ${this.formatCurrency(
        totals.get(warehouse.id) ?? 0,
      )}\n\n`;
    }

    return text.trim();
  }

  private async buildAdminAlertsMessage(): Promise<string> {
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

  private async buildWarehouseAlertsMessage(
    linkedUserId: string,
  ): Promise<string> {
    const warehouses = await this.getManagedWarehouses(linkedUserId);

    if (!warehouses.length) {
      return "🔔 <b>Mening ogohlantirishlarim</b>\n\nSizga hali ombor biriktirilmagan.";
    }

    const sections: string[] = [];
    let totalAlerts = 0;

    for (const warehouse of warehouses) {
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
      return "🔔 <b>Mening ogohlantirishlarim</b>\n\n✅ Hozircha sizning omborlaringizda ogohlantirish yo'q.";
    }

    return `🔔 <b>Mening ogohlantirishlarim</b>\nJami: <b>${totalAlerts}</b> ta\n\n${sections.join('\n\n')}`;
  }

  private async buildAdminStatsMessage(): Promise<string> {
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

  private async buildWarehouseStatsMessage(
    linkedUserId: string,
  ): Promise<string> {
    const warehouses = await this.getManagedWarehouses(linkedUserId);
    if (!warehouses.length) {
      return "📊 <b>Mening statistikam</b>\n\nSizga hali ombor biriktirilmagan.";
    }

    const [statsResponse, recentExpensesResponse] = await Promise.all([
      this.warehouseService.getMyDashboardStats(linkedUserId),
      this.warehouseService.getMyRecentExpenses(linkedUserId, {
        recent_limit: 5,
      }),
    ]);

    const summary = (
      statsResponse as {
        summary: {
          warehouses_count: number;
          total_products: number;
          pending_issue: number;
          low_stock: number;
          expiring_soon: number;
        };
      }
    ).summary;
    const recentExpenses = (
      recentExpensesResponse as { data: RecentExpenseRow[] }
    ).data;

    let text = '📊 <b>Mening statistikam</b>\n\n';
    text += `📦 Omborlar: <b>${summary.warehouses_count}</b> ta\n`;
    text += `💊 Mahsulotlar: <b>${summary.total_products}</b> ta\n`;
    text += `🟡 Berish kutilmoqda: <b>${summary.pending_issue}</b> ta\n`;
    text += `⚠️ Kam qoldiq: <b>${summary.low_stock}</b> ta\n`;
    text += `⏰ Tugash arafasida: <b>${summary.expiring_soon}</b> ta\n`;

    if (recentExpenses.length) {
      text += '\n🕒 <b>So‘nggi chiqimlar</b>\n';
      for (const expense of recentExpenses) {
        text += `• ${this.escapeHtml(expense.expense_number)} | ${this.mapExpenseStatus(expense.status)} | ${this.formatCurrency(Number(expense.total_price))}\n`;
      }
    }

    return text.trim();
  }

  private async buildAccountantStatsMessage(
    linkedUserId: string,
  ): Promise<string> {
    const overview = await this.loadOrderOverview(linkedUserId);

    let text = '📊 <b>Xarid statistikasi</b>\n\n';
    text += `🟡 Kutilayotgan: <b>${overview.counts[OrderStatus.PENDING]}</b>\n`;
    text += `✅ Tasdiqlangan: <b>${overview.counts[OrderStatus.CONFIRMED]}</b>\n`;
    text += `🚚 Delivered: <b>${overview.counts[OrderStatus.DELIVERED]}</b>\n`;
    text += `❌ Bekor qilingan: <b>${overview.counts[OrderStatus.CANCELLED]}</b>\n`;
    text += `📚 Jami: <b>${overview.total}</b>\n`;

    if (overview.recentOrders.length) {
      text += '\n🕒 <b>So‘nggi xaridlar</b>\n';
      for (const order of overview.recentOrders) {
        text += `• ${this.escapeHtml(order.order_number)} | ${order.status} | ${this.formatCurrency(order.total_amount)}\n`;
      }
    }

    return text.trim();
  }

  private async buildAdminProductsMessage(): Promise<string> {
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

  private async buildWarehouseProductsMessage(
    linkedUserId: string,
  ): Promise<string> {
    const [totalProducts, lowStockProducts, featuredProducts] =
      await Promise.all([
        this.productRepository
          .createQueryBuilder('product')
          .innerJoin('product.warehouse', 'warehouse')
          .where('warehouse.manager_id = :linkedUserId', { linkedUserId })
          .getCount(),
        this.productRepository
          .createQueryBuilder('product')
          .innerJoin('product.warehouse', 'warehouse')
          .where('warehouse.manager_id = :linkedUserId', { linkedUserId })
          .andWhere('product.quantity > 0')
          .andWhere('product.quantity <= product.min_limit')
          .getCount(),
        this.productRepository
          .createQueryBuilder('product')
          .innerJoin('product.warehouse', 'warehouse')
          .select('product.id', 'id')
          .addSelect('product.name', 'name')
          .addSelect('product.quantity', 'quantity')
          .addSelect('product.min_limit', 'min_limit')
          .addSelect('product.unit', 'unit')
          .addSelect('warehouse.name', 'warehouse_name')
          .where('warehouse.manager_id = :linkedUserId', { linkedUserId })
          .andWhere('product.quantity > 0')
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
      return `💊 <b>Mening mahsulotlarim</b>\n\nJami: <b>${totalProducts}</b> ta\nSizga biriktirilgan omborlarda hozircha qoldiq yo'q.`;
    }

    let text = '💊 <b>Mening mahsulotlarim</b>\n';
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

  private createExpenseStatusCounts(): Record<ExpenseStatus, number> {
    return {
      [ExpenseStatus.PENDING_APPROVAL]: 0,
      [ExpenseStatus.PENDING_ISSUE]: 0,
      [ExpenseStatus.PENDING_PHOTO]: 0,
      [ExpenseStatus.PENDING_CONFIRMATION]: 0,
      [ExpenseStatus.COMPLETED]: 0,
      [ExpenseStatus.CANCELLED]: 0,
    };
  }

  private async buildAdminExpensesMessage(): Promise<string> {
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

    const counts = this.createExpenseStatusCounts();

    for (const row of statusRows) {
      counts[row.status] = Number(row.count ?? 0);
    }

    let text = '📋 <b>Chiqimlar</b>\n\n';
    text += `🆕 Admin tasdig'i kutilmoqda: <b>${counts[ExpenseStatus.PENDING_APPROVAL]}</b>\n`;
    text += `🟡 Kutilayotgan berish: <b>${counts[ExpenseStatus.PENDING_ISSUE]}</b>\n`;
    text += `📷 Foto kutilmoqda: <b>${counts[ExpenseStatus.PENDING_PHOTO]}</b>\n`;
    text += `🟠 Tasdiq kutilmoqda: <b>${counts[ExpenseStatus.PENDING_CONFIRMATION]}</b>\n`;
    text += `✅ Yakunlangan: <b>${counts[ExpenseStatus.COMPLETED]}</b>\n`;
    text += `❌ Bekor qilingan: <b>${counts[ExpenseStatus.CANCELLED]}</b>\n`;

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

  private async buildAccountantExpensesMessage(
    linkedUserId: string,
  ): Promise<string> {
    const [recentExpenses, statusRows] = await Promise.all([
      this.expenseRepository.find({
        where: { manager_id: linkedUserId },
        order: { createdAt: 'DESC' },
        take: 10,
      }),
      this.expenseRepository
        .createQueryBuilder('expense')
        .select('expense.status', 'status')
        .addSelect('COUNT(expense.id)', 'count')
        .where('expense.manager_id = :managerId', { managerId: linkedUserId })
        .groupBy('expense.status')
        .getRawMany<{ status: ExpenseStatus; count: string }>(),
    ]);

    const counts = this.createExpenseStatusCounts();

    for (const row of statusRows) {
      counts[row.status] = Number(row.count ?? 0);
    }

    let text = '📋 <b>Mening chiqimlarim</b>\n\n';
    text += `🆕 Admin tasdig'i kutilmoqda: <b>${counts[ExpenseStatus.PENDING_APPROVAL]}</b>\n`;
    text += `🟡 Berish kutilmoqda: <b>${counts[ExpenseStatus.PENDING_ISSUE]}</b>\n`;
    text += `📷 Foto kutilmoqda: <b>${counts[ExpenseStatus.PENDING_PHOTO]}</b>\n`;
    text += `🟠 Yakuniy tasdiq kutilmoqda: <b>${counts[ExpenseStatus.PENDING_CONFIRMATION]}</b>\n`;
    text += `✅ Yakunlangan: <b>${counts[ExpenseStatus.COMPLETED]}</b>\n`;
    text += `❌ Bekor qilingan: <b>${counts[ExpenseStatus.CANCELLED]}</b>\n`;

    if (!recentExpenses.length) {
      text += '\nHozircha siz yaratgan chiqimlar mavjud emas.';
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

  private async buildWarehouseExpensesMessage(
    linkedUserId: string,
  ): Promise<string> {
    const warehouses = await this.getManagedWarehouses(linkedUserId);

    if (!warehouses.length) {
      return "📋 <b>Mening chiqimlarim</b>\n\nSizga hali ombor biriktirilmagan.";
    }

    const warehouseIds = warehouses.map((warehouse) => warehouse.id);

    const [recentExpenses, statusRows] = await Promise.all([
      this.expenseRepository
        .createQueryBuilder('expense')
        .innerJoin(
          'expense.items',
          'item',
          'item.warehouse_id IN (:...warehouseIds)',
          { warehouseIds },
        )
        .select('expense.id', 'id')
        .addSelect('expense.expense_number', 'expense_number')
        .addSelect('expense.createdAt', 'created_at')
        .addSelect('expense.staff_name', 'staff_name')
        .addSelect('expense.purpose', 'purpose')
        .addSelect('expense.status', 'status')
        .addSelect('expense.total_price', 'total_price')
        .groupBy('expense.id')
        .addGroupBy('expense.expense_number')
        .addGroupBy('expense.createdAt')
        .addGroupBy('expense.staff_name')
        .addGroupBy('expense.purpose')
        .addGroupBy('expense.status')
        .addGroupBy('expense.total_price')
        .orderBy('expense.createdAt', 'DESC')
        .limit(10)
        .getRawMany<{
          id: string;
          expense_number: string;
          created_at: Date;
          staff_name: string;
          purpose: string | null;
          status: ExpenseStatus;
          total_price: string;
        }>(),
      this.expenseRepository
        .createQueryBuilder('expense')
        .innerJoin(
          'expense.items',
          'item',
          'item.warehouse_id IN (:...warehouseIds)',
          { warehouseIds },
        )
        .select('expense.status', 'status')
        .addSelect('COUNT(DISTINCT expense.id)', 'count')
        .groupBy('expense.status')
        .getRawMany<{ status: ExpenseStatus; count: string }>(),
    ]);

    const counts = this.createExpenseStatusCounts();

    for (const row of statusRows) {
      counts[row.status] = Number(row.count ?? 0);
    }

    let text = '📋 <b>Mening chiqimlarim</b>\n\n';
    text += `🆕 Admin tasdig'i kutilmoqda: <b>${counts[ExpenseStatus.PENDING_APPROVAL]}</b>\n`;
    text += `🟡 Kutilayotgan berish: <b>${counts[ExpenseStatus.PENDING_ISSUE]}</b>\n`;
    text += `📷 Foto kutilmoqda: <b>${counts[ExpenseStatus.PENDING_PHOTO]}</b>\n`;
    text += `🟠 Tasdiq kutilmoqda: <b>${counts[ExpenseStatus.PENDING_CONFIRMATION]}</b>\n`;
    text += `✅ Yakunlangan: <b>${counts[ExpenseStatus.COMPLETED]}</b>\n`;
    text += `❌ Bekor qilingan: <b>${counts[ExpenseStatus.CANCELLED]}</b>\n`;

    if (!recentExpenses.length) {
      text += '\nHozircha sizning omborlaringiz bo‘yicha chiqimlar mavjud emas.';
      return text;
    }

    text += '\n🕒 <b>So‘nggi hujjatlar</b>\n';
    for (const expense of recentExpenses) {
      text += `• <b>${this.escapeHtml(expense.expense_number)}</b>\n`;
      text += `   ${this.mapExpenseStatus(expense.status)}\n`;
      text += `   ${this.escapeHtml(expense.staff_name)} | ${this.formatCurrency(
        Number(expense.total_price),
      )}\n`;
      text += `   ${this.formatDate(expense.created_at)}\n`;
    }

    return text.trim();
  }

  private async buildAdminOrdersMessage(): Promise<string> {
    const overview = await this.loadOrderOverview();

    let text = '🛒 <b>Xaridlar</b>\n\n';
    text += `🟡 Kutilayotgan: <b>${overview.counts[OrderStatus.PENDING]}</b>\n`;
    text += `✅ Tasdiqlangan: <b>${overview.counts[OrderStatus.CONFIRMED]}</b>\n`;
    text += `🚚 Delivered: <b>${overview.counts[OrderStatus.DELIVERED]}</b>\n`;
    text += `❌ Bekor qilingan: <b>${overview.counts[OrderStatus.CANCELLED]}</b>\n`;
    text += `📚 Jami: <b>${overview.total}</b>\n`;

    if (!overview.recentOrders.length) {
      text += '\nHozircha xaridlar mavjud emas.';
      return text;
    }

    text += '\n🕒 <b>So‘nggi xaridlar</b>\n';
    for (const order of overview.recentOrders) {
      text += `• <b>${this.escapeHtml(order.order_number)}</b>\n`;
      text += `   ${order.status} | ${this.formatCurrency(order.total_amount)}\n`;
      text += `   ${this.escapeHtml(order.supplier_name)}\n`;
    }

    return text.trim();
  }

  private async buildAccountantOrdersMessage(
    linkedUserId: string,
  ): Promise<string> {
    const overview = await this.loadOrderOverview(linkedUserId);

    let text = '🛒 <b>Mening xaridlarim</b>\n\n';
    text += `🟡 Kutilayotgan: <b>${overview.counts[OrderStatus.PENDING]}</b>\n`;
    text += `✅ Tasdiqlangan: <b>${overview.counts[OrderStatus.CONFIRMED]}</b>\n`;
    text += `🚚 Delivered: <b>${overview.counts[OrderStatus.DELIVERED]}</b>\n`;
    text += `❌ Bekor qilingan: <b>${overview.counts[OrderStatus.CANCELLED]}</b>\n`;
    text += `📚 Jami: <b>${overview.total}</b>\n`;

    if (!overview.recentOrders.length) {
      text += '\nHozircha xaridlar mavjud emas.';
      return text;
    }

    text += '\n🕒 <b>So‘nggi xaridlar</b>\n';
    for (const order of overview.recentOrders) {
      text += `• <b>${this.escapeHtml(order.order_number)}</b>\n`;
      text += `   ${order.status} | ${this.formatCurrency(order.total_amount)}\n`;
      text += `   ${this.escapeHtml(order.supplier_name)}\n`;
    }

    return text.trim();
  }

  private async getViewerContext(telegramId: number): Promise<ViewerContext> {
    const botUser = await this.botUserService.findByTelegramId(telegramId);

    if (!botUser) {
      return {
        ok: false,
        message:
          "❗ Botdan foydalanish uchun avval /start buyrug'ini bosing.",
      };
    }

    if (botUser.status === BotUserStatus.BLOCKED) {
      return {
        ok: false,
        botUser,
        message: "🚫 Siz bloklangansiz. Admin bilan bog'laning.",
      };
    }

    if (!botUser.is_approved) {
      return {
        ok: false,
        botUser,
        message:
          "⏳ Siz hali tasdiqlanmagansiz.\nAdmin sizni tasdiqlashini kuting.",
      };
    }

    if (!botUser.role) {
      return {
        ok: false,
        botUser,
        message:
          "⏳ Akkauntingiz tasdiqlangan, lekin bot roli hali biriktirilmagan.\nAdmin bilan bog'laning.",
      };
    }

    if (
      (botUser.role === Role.WAREHOUSE ||
        botUser.role === Role.ACCOUNTANT) &&
      !botUser.linked_user_id
    ) {
      return {
        ok: false,
        botUser,
        message:
          `⏳ ${botUser.role} roli berilgan, lekin tizimdagi user hali bog'lanmagan.\nAdmin bilan bog'laning.`,
      };
    }

    return {
      ok: true,
      role: botUser.role,
      botUser,
      linkedUserId: botUser.linked_user_id,
    };
  }

  private getConfigurationMessage(user: BotUser) {
    if (!user.is_approved) {
      return "tasdiq kutilmoqda.";
    }

    if (!user.role) {
      return "bot roli hali biriktirilmagan.";
    }

    if (
      (user.role === Role.WAREHOUSE || user.role === Role.ACCOUNTANT) &&
      !user.linked_user_id
    ) {
      return `${user.role} roli uchun tizimdagi user hali bog'lanmagan.`;
    }

    return null;
  }

  private async loadOrderOverview(createdById?: string) {
    const baseQb = this.purchaseOrderRepository.createQueryBuilder('po');

    if (createdById) {
      baseQb.where('po.created_by_id = :createdById', { createdById });
    }

    const [statusRows, recentOrders] = await Promise.all([
      baseQb
        .clone()
        .select('po.status', 'status')
        .addSelect('COUNT(po.id)', 'count')
        .groupBy('po.status')
        .getRawMany<{ status: OrderStatus; count: string }>(),
      baseQb
        .clone()
        .leftJoin('po.supplier', 'supplier')
        .select('po.order_number', 'order_number')
        .addSelect('po.status', 'status')
        .addSelect('po.total_amount', 'total_amount')
        .addSelect('supplier.company_name', 'supplier_name')
        .orderBy('po.createdAt', 'DESC')
        .limit(5)
        .getRawMany<{
          order_number: string;
          status: OrderStatus;
          total_amount: string;
          supplier_name: string;
        }>(),
    ]);

    const counts = {
      [OrderStatus.PENDING]: 0,
      [OrderStatus.CONFIRMED]: 0,
      [OrderStatus.DELIVERED]: 0,
      [OrderStatus.CANCELLED]: 0,
    };

    for (const row of statusRows) {
      counts[row.status] = Number(row.count ?? 0);
    }

    return {
      counts,
      total: Object.values(counts).reduce((sum, count) => sum + count, 0),
      recentOrders: recentOrders.map((order) => ({
        ...order,
        total_amount: Number(Number(order.total_amount ?? 0).toFixed(2)),
        supplier_name: order.supplier_name ?? 'Nomaʼlum supplier',
      })),
    };
  }

  private buildUnavailableSectionMessage(title: string, message: string) {
    return `${title}\n\n${message}`;
  }

  private async getManagedWarehouses(linkedUserId: string) {
    return this.warehouseRepository.find({
      where: { manager_id: linkedUserId },
      order: { name: 'ASC' },
    });
  }

  private mapExpenseStatus(status: ExpenseStatus) {
    switch (status) {
      case ExpenseStatus.PENDING_APPROVAL:
        return "🆕 Admin tasdig'i kutilmoqda";
      case ExpenseStatus.PENDING_ISSUE:
        return '🟡 Berish kutilmoqda';
      case ExpenseStatus.PENDING_PHOTO:
        return '📷 Foto kutilmoqda';
      case ExpenseStatus.PENDING_CONFIRMATION:
        return '🟠 Tasdiq kutilmoqda';
      case ExpenseStatus.COMPLETED:
        return '✅ Tasdiqlangan';
      case ExpenseStatus.CANCELLED:
        return '❌ Bekor qilingan';
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

  private mapRole(role: Role | null) {
    switch (role) {
      case Role.ADMIN:
        return 'admin';
      case Role.ACCOUNTANT:
        return 'accountant';
      case Role.WAREHOUSE:
        return 'warehouse';
      default:
        return 'biriktirilmagan';
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
