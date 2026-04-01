import {
  Inject,
  Injectable,
  Logger,
  OnApplicationBootstrap,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { hash } from 'bcrypt';
import Redis from 'ioredis';
import { DataSource, Repository } from 'typeorm';
import { Category } from 'src/modules/category/entities/category.entity';
import { Expense } from 'src/modules/expense/entities/expense.entity';
import { ExpenseItem } from 'src/modules/expense/entities/expense-item.entity';
import { Product } from 'src/modules/product/entities/product.entity';
import { ProductBatch } from 'src/modules/product/entities/product-batch.entity';
import { ProductStatus } from 'src/modules/product/enums/product-status.enum';
import { OrderItem } from 'src/modules/purchase-order/entities/order-item.entity';
import { PurchaseOrder } from 'src/modules/purchase-order/entities/purchase-order.entity';
import { Supplier } from 'src/modules/supplier/entities/supplier.entity';
import { Unit } from 'src/modules/unit/entities/unit.entity';
import { User } from 'src/modules/user/entities/user.entity';
import { Warehouse } from 'src/modules/warehouse/entities/warehouse.entity';
import { ExpenseStatus } from 'src/modules/expense/enums/expense-status.enum';
import { ExpenseType } from 'src/modules/expense/enums/expense-type.enum';
import { OrderStatus } from 'src/modules/purchase-order/enums/order-status.enum';
import { WarehouseType } from 'src/modules/warehouse/enums/warehouse-type.enum';
import { Role } from 'src/modules/user/enums/role.enum';

@Injectable()
export class SeedService implements OnApplicationBootstrap {
  private readonly logger = new Logger(SeedService.name);

  // Runtime lookup maps (populated during seeding, used for resolving refs)
  private users = new Map<string, User>(); // key: username
  private warehouses = new Map<string, Warehouse>(); // key: name
  private units = new Map<string, Unit>(); // key: name
  private categories = new Map<string, Category>(); // key: name
  private suppliers = new Map<string, Supplier>(); // key: company_name
  private products = new Map<string, Product>(); // key: name
  // key: "productName:batchIndex"  →  ProductBatch
  private batches = new Map<string, ProductBatch>();

  constructor(
    private readonly configService: ConfigService,
    private readonly dataSource: DataSource,
    @Inject('REDIS_CLIENT')
    private readonly redis: Redis,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(Warehouse)
    private readonly warehouseRepo: Repository<Warehouse>,
    @InjectRepository(Category)
    private readonly categoryRepo: Repository<Category>,
    @InjectRepository(Unit)
    private readonly unitRepo: Repository<Unit>,
    @InjectRepository(Supplier)
    private readonly supplierRepo: Repository<Supplier>,
    @InjectRepository(Product)
    private readonly productRepo: Repository<Product>,
    @InjectRepository(ProductBatch)
    private readonly batchRepo: Repository<ProductBatch>,
    @InjectRepository(PurchaseOrder)
    private readonly orderRepo: Repository<PurchaseOrder>,
    @InjectRepository(OrderItem)
    private readonly orderItemRepo: Repository<OrderItem>,
    @InjectRepository(Expense)
    private readonly expenseRepo: Repository<Expense>,
    @InjectRepository(ExpenseItem)
    private readonly expenseItemRepo: Repository<ExpenseItem>,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    const nodeEnv = this.configService.get<string>('NODE_ENV');
    const shouldSeed =
      this.configService.get<string>('DEV_SEED_ON_BOOTSTRAP', 'true') ===
      'true';

    if (nodeEnv !== 'development' || !shouldSeed) return;

    if ((await this.userRepo.count()) > 0) {
      this.logger.log("Seed o'tkazildi: bazada ma'lumot mavjud");
      return;
    }

    this.logger.log('Seed boshlandi...');
    await this.flushRedis();

    await this.seedUsers();
    await this.seedUnits();
    await this.seedCategories();
    await this.seedSuppliers();
    await this.seedWarehouses();
    await this.seedProducts();
    await this.seedPurchaseOrders();
    await this.seedExpenses();

    await this.flushRedis();
    this.logger.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    this.logger.log('Seed muvaffaqiyatli yakunlandi!');
    this.logger.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  }

  // ─── JSON loader ──────────────────────────────────────────

  private load<T>(filename: string): T[] {
    const filePath = join(
      process.cwd(),
      'src',
      'database',
      'seed-data',
      filename,
    );
    return JSON.parse(readFileSync(filePath, 'utf8')) as T[];
  }

  // ─── Date helper ──────────────────────────────────────────

  private offsetDate(days: number): Date {
    const d = new Date();
    d.setDate(d.getDate() + days);
    return d;
  }

  // ─── Product status builder ───────────────────────────────

  private buildStatuses(
    qty: number,
    min: number,
    exp: Date | null,
  ): ProductStatus[] {
    const s = new Set<ProductStatus>();
    if (qty > 0) s.add(ProductStatus.IN_STOCK);
    if (qty > 0 && qty <= min) s.add(ProductStatus.LOW_STOCK);
    if (exp) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const e = new Date(exp);
      e.setHours(0, 0, 0, 0);
      if (e < today) {
        s.add(ProductStatus.EXPIRED);
      } else {
        const days = Math.ceil((e.getTime() - today.getTime()) / 86_400_000);
        if (days <= 30) s.add(ProductStatus.EXPIRING_SOON);
      }
    }
    return [...s];
  }

  // ─── Redis flush ──────────────────────────────────────────

  private async flushRedis(): Promise<void> {
    try {
      await this.redis.flushdb();
    } catch (e) {
      this.logger.warn(
        `Redis flush: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }

  // ─── Force createdAt on any table ────────────────────────

  private async forceCreatedAt(
    table: string,
    id: string,
    date: Date,
  ): Promise<void> {
    await this.dataSource
      .createQueryBuilder()
      .update(table)
      .set({ createdAt: date })
      .where('id = :id', { id })
      .execute();
  }

  // ─── 01 Users ─────────────────────────────────────────────

  private async seedUsers(): Promise<void> {
    const rows = this.load<{
      username: string;
      password: string;
      first_name: string;
      last_name: string;
      role: string;
    }>('01-users.json');

    for (const row of rows) {
      const user = await this.userRepo.save(
        this.userRepo.create({
          username: row.username,
          password: await hash(row.password, 10),
          first_name: row.first_name,
          last_name: row.last_name,
          role: row.role as Role,
        }),
      );
      this.users.set(user.username, user);
    }
    this.logger.log(`✓ ${this.users.size} ta user yaratildi`);
  }

  // ─── 02 Units ─────────────────────────────────────────────

  private async seedUnits(): Promise<void> {
    const rows = this.load<{ name: string }>('02-units.json');
    for (const row of rows) {
      const unit = await this.unitRepo.save(
        this.unitRepo.create({ name: row.name }),
      );
      this.units.set(unit.name, unit);
    }
    this.logger.log(`✓ ${this.units.size} ta unit yaratildi`);
  }

  // ─── 03 Categories ────────────────────────────────────────

  private async seedCategories(): Promise<void> {
    const rows = this.load<{ name: string; description: string }>(
      '03-categories.json',
    );
    for (const row of rows) {
      const cat = await this.categoryRepo.save(
        this.categoryRepo.create({
          name: row.name,
          description: row.description,
        }),
      );
      this.categories.set(cat.name, cat);
    }
    this.logger.log(`✓ ${this.categories.size} ta category yaratildi`);
  }

  // ─── 04 Suppliers ─────────────────────────────────────────

  private async seedSuppliers(): Promise<void> {
    const rows = this.load<{
      company_name: string;
      contact_person: string;
      email: string;
      phone: string;
    }>('04-suppliers.json');

    for (const row of rows) {
      const sup = await this.supplierRepo.save(
        this.supplierRepo.create({
          company_name: row.company_name,
          contact_person: row.contact_person,
          email: row.email,
          phone: row.phone,
        }),
      );
      this.suppliers.set(sup.company_name, sup);
    }
    this.logger.log(`✓ ${this.suppliers.size} ta supplier yaratildi`);
  }

  // ─── 05 Warehouses ────────────────────────────────────────

  private async seedWarehouses(): Promise<void> {
    const rows = this.load<{
      name: string;
      type: string;
      location: string;
      manager_username: string;
    }>('05-warehouses.json');

    for (const row of rows) {
      const manager = this.users.get(row.manager_username);
      if (!manager) throw new Error(`User topilmadi: ${row.manager_username}`);

      const wh = await this.warehouseRepo.save(
        this.warehouseRepo.create({
          name: row.name,
          type: row.type as WarehouseType,
          location: row.location,
          manager,
          manager_id: manager.id,
        }),
      );
      this.warehouses.set(wh.name, wh);
    }
    this.logger.log(`✓ ${this.warehouses.size} ta warehouse yaratildi`);
  }

  // ─── 06 Products + Batches ────────────────────────────────

  private async seedProducts(): Promise<void> {
    interface BatchDef {
      quantity: number;
      price: number;
      expiry_days: number;
      batch_number: string;
      serial_number: string;
    }
    interface ProductDef {
      name: string;
      min_limit: number;
      unit: string;
      category: string;
      supplier: string;
      warehouse: string;
      batches: BatchDef[];
    }

    const rows = this.load<ProductDef>('06-products.json');
    let productCount = 0;
    let batchCount = 0;

    for (const row of rows) {
      const unit = this.units.get(row.unit);
      const category = this.categories.get(row.category);
      const supplier = this.suppliers.get(row.supplier);
      const warehouse = this.warehouses.get(row.warehouse);

      if (!unit) throw new Error(`Unit topilmadi: ${row.unit}`);
      if (!category) throw new Error(`Category topilmadi: ${row.category}`);
      if (!supplier) throw new Error(`Supplier topilmadi: ${row.supplier}`);
      if (!warehouse) throw new Error(`Warehouse topilmadi: ${row.warehouse}`);

      const totalQty = row.batches.reduce((s, b) => s + b.quantity, 0);
      const maxExpiry = Math.max(...row.batches.map((b) => b.expiry_days));
      const expDate = maxExpiry > 0 ? this.offsetDate(maxExpiry) : null;
      const alertDate = expDate
        ? this.offsetDate(maxExpiry > 30 ? maxExpiry - 30 : maxExpiry - 3)
        : null;

      const product = await this.productRepo.save(
        this.productRepo.create({
          name: row.name,
          quantity: totalQty,
          unit: unit.name,
          unit_reference: unit,
          unit_id: unit.id,
          min_limit: row.min_limit,
          supplier,
          supplier_id: supplier.id,
          category,
          category_id: category.id,
          warehouse,
          warehouse_id: warehouse.id,
          statuses: this.buildStatuses(totalQty, row.min_limit, expDate),
          expiration_date: expDate,
          expiration_alert_date: alertDate,
        }),
      );
      this.products.set(product.name, product);
      productCount++;

      // Save batches and index them by "productName:batchIndex"
      for (let i = 0; i < row.batches.length; i++) {
        const bd = row.batches[i];
        const exp = bd.expiry_days > 0 ? this.offsetDate(bd.expiry_days) : null;
        const batchAlert =
          exp && bd.expiry_days > 30
            ? this.offsetDate(bd.expiry_days - 30)
            : exp && bd.expiry_days > 0
              ? this.offsetDate(bd.expiry_days - 3)
              : null;

        const batch = await this.batchRepo.save(
          this.batchRepo.create({
            product,
            product_id: product.id,
            warehouse,
            warehouse_id: warehouse.id,
            supplier,
            supplier_id: supplier.id,
            quantity: bd.quantity,
            price_at_purchase: bd.price,
            expiration_date: exp,
            expiration_alert_date: batchAlert,
            batch_number: bd.batch_number,
            serial_number: bd.serial_number,
            depleted_at: null,
          }),
        );
        this.batches.set(`${product.name}:${i}`, batch);
        batchCount++;
      }
    }

    this.logger.log(
      `✓ ${productCount} ta product, ${batchCount} ta batch yaratildi`,
    );
  }

  // ─── 07 Purchase Orders ───────────────────────────────────

  private async seedPurchaseOrders(): Promise<void> {
    interface ItemDef {
      product: string;
      quantity: number;
      price: number;
    }
    interface OrderDef {
      order_number: string;
      status: string;
      is_received?: boolean;
      supplier: string;
      warehouse: string;
      order_date_offset: number;
      delivery_date_offset: number;
      decided_at_offset?: number;
      decided_by?: string;
      received_at_offset?: number;
      received_by?: string;
      items: ItemDef[];
    }

    const year = new Date().getFullYear();
    const rows = this.load<OrderDef>('07-purchase-orders.json');
    const createdBy = this.users.get('accountant')!;

    for (const row of rows) {
      const supplier = this.suppliers.get(row.supplier);
      const warehouse = this.warehouses.get(row.warehouse);
      if (!supplier) throw new Error(`Supplier topilmadi: ${row.supplier}`);
      if (!warehouse) throw new Error(`Warehouse topilmadi: ${row.warehouse}`);

      const decidedBy = row.decided_by ? this.users.get(row.decided_by) : null;
      const receivedBy = row.received_by
        ? this.users.get(row.received_by)
        : null;

      const orderItems = row.items.map((i) => {
        const product = this.products.get(i.product);
        if (!product) throw new Error(`Product topilmadi: ${i.product}`);
        return this.orderItemRepo.create({
          product,
          product_id: product.id,
          quantity: i.quantity,
          price_at_purchase: i.price,
        });
      });

      const totalAmount = row.items.reduce(
        (s, i) => s + i.quantity * i.price,
        0,
      );
      const orderNumber = row.order_number.replace('{YEAR}', String(year));

      const order = this.orderRepo.create({
        order_number: orderNumber,
        status: row.status as OrderStatus,
        is_received: row.is_received ?? false,
        created_by_id: createdBy.id,
        decided_by_id: decidedBy?.id ?? null,
        decided_at:
          row.decided_at_offset != null
            ? this.offsetDate(row.decided_at_offset)
            : null,
        received_by_id: receivedBy?.id ?? null,
        received_at:
          row.received_at_offset != null
            ? this.offsetDate(row.received_at_offset)
            : null,
        order_date: this.offsetDate(row.order_date_offset),
        delivery_date: this.offsetDate(row.delivery_date_offset),
        total_amount: Number(totalAmount.toFixed(2)),
        supplier,
        supplier_id: supplier.id,
        warehouse,
        warehouse_id: warehouse.id,
        items: orderItems,
      });

      for (const item of orderItems) item.purchase_order = order;
      await this.orderRepo.save(order);
    }

    this.logger.log(`✓ ${rows.length} ta purchase order yaratildi`);
  }

  // ─── 08 Expenses ──────────────────────────────────────────

  private async seedExpenses(): Promise<void> {
    interface ExpItemDef {
      product: string;
      batch_index: number;
      quantity: number;
    }
    interface ExpenseDef {
      expense_number: string;
      status: string;
      type: string;
      staff_name: string;
      purpose: string;
      warehouse: string;
      manager: string;
      created_at_offset: number;
      issued_at_offset?: number;
      issued_by?: string;
      cancelled_at_offset?: number;
      cancelled_by?: string;
      items: ExpItemDef[];
    }

    const year = new Date().getFullYear();
    const rows = this.load<ExpenseDef>('08-expenses.json');

    for (const row of rows) {
      const warehouse = this.warehouses.get(row.warehouse);
      const manager = this.users.get(row.manager);
      const issuedBy = row.issued_by ? this.users.get(row.issued_by) : null;
      const cancelledBy = row.cancelled_by
        ? this.users.get(row.cancelled_by)
        : null;

      if (!warehouse) throw new Error(`Warehouse topilmadi: ${row.warehouse}`);
      if (!manager) throw new Error(`Manager topilmadi: ${row.manager}`);

      const expenseItems = row.items
        .map((i) => {
          const batch = this.batches.get(`${i.product}:${i.batch_index}`);
          if (!batch) {
            this.logger.warn(
              `Batch topilmadi: ${i.product}[${i.batch_index}] — o'tkazib yuborildi`,
            );
            return null;
          }
          return this.expenseItemRepo.create({
            product: batch.product,
            warehouse,
            product_batch: batch,
            product_batch_id: batch.id,
            quantity: i.quantity,
          });
        })
        .filter((item): item is ExpenseItem => item !== null);

      if (expenseItems.length === 0) continue;

      const totalPrice = expenseItems.reduce((s, item) => {
        const batch = this.batches.get(
          `${item.product?.name}:${row.items.findIndex(
            (i) => i.product === item.product?.name,
          )}`,
        );
        return (
          s + item.quantity * Number(item.product_batch?.price_at_purchase ?? 0)
        );
      }, 0);

      const expenseNumber = row.expense_number.replace('{YEAR}', String(year));

      const expense = this.expenseRepo.create({
        expense_number: expenseNumber,
        status: row.status as ExpenseStatus,
        type: row.type as ExpenseType,
        total_price: Number(totalPrice.toFixed(2)),
        manager_id: manager.id,
        issued_by_id: issuedBy?.id ?? null,
        issued_at:
          row.issued_at_offset != null
            ? this.offsetDate(row.issued_at_offset)
            : null,
        cancelled_by_id: cancelledBy?.id ?? null,
        cancelled_at:
          row.cancelled_at_offset != null
            ? this.offsetDate(row.cancelled_at_offset)
            : null,
        staff_name: row.staff_name,
        purpose: row.purpose,
        items: expenseItems,
      });

      for (const item of expenseItems) item.expense = expense;

      const saved = await this.expenseRepo.save(expense);

      // Force back-dated createdAt since @CreateDateColumn ignores manual values
      await this.forceCreatedAt(
        'expenses',
        saved.id,
        this.offsetDate(row.created_at_offset),
      );
    }

    this.logger.log(`✓ ${rows.length} ta expense yaratildi`);
  }
}
