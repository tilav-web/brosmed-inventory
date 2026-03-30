import {
  Inject,
  Injectable,
  Logger,
  OnApplicationBootstrap,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { hash } from 'bcrypt';
import Redis from 'ioredis';
import { DataSource, Repository } from 'typeorm';
import { Category } from 'src/modules/category/entities/category.entity';
import { Expense } from 'src/modules/expense/entities/expense.entity';
import { ExpenseItem } from 'src/modules/expense/entities/expense-item.entity';
import { ExpenseStatus } from 'src/modules/expense/enums/expense-status.enum';
import { ExpenseType } from 'src/modules/expense/enums/expense-type.enum';
import { Product } from 'src/modules/product/entities/product.entity';
import { ProductBatch } from 'src/modules/product/entities/product-batch.entity';
import { ProductStatus } from 'src/modules/product/enums/product-status.enum';
import { OrderItem } from 'src/modules/purchase-order/entities/order-item.entity';
import { PurchaseOrder } from 'src/modules/purchase-order/entities/purchase-order.entity';
import { OrderStatus } from 'src/modules/purchase-order/enums/order-status.enum';
import { Supplier } from 'src/modules/supplier/entities/supplier.entity';
import { Unit } from 'src/modules/unit/entities/unit.entity';
import { User } from 'src/modules/user/entities/user.entity';
import { Role } from 'src/modules/user/enums/role.enum';
import { Warehouse } from 'src/modules/warehouse/entities/warehouse.entity';
import { WarehouseType } from 'src/modules/warehouse/enums/warehouse-type.enum';

type SeedUsers = {
  admin: User;
  warehouse: User;
  accountant: User;
};

type SeedReferences = {
  units: {
    box: Unit;
    piece: Unit;
    pack: Unit;
  };
  categories: {
    antibiotics: Category;
    vitamins: Category;
    supplies: Category;
    solutions: Category;
  };
  suppliers: {
    primary: Supplier;
    reserve: Supplier;
  };
};

type SeedProducts = {
  products: {
    amoxicillin: Product;
    paracetamol: Product;
    syringe: Product;
    bandage: Product;
    vitaminC: Product;
    saline: Product;
  };
  batches: {
    amoxicillin: ProductBatch;
    paracetamol: ProductBatch;
    syringe: ProductBatch;
    bandage: ProductBatch;
    vitaminC: ProductBatch;
    saline: ProductBatch;
  };
};

@Injectable()
export class SeedService implements OnApplicationBootstrap {
  private readonly logger = new Logger(SeedService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly dataSource: DataSource,
    @Inject('REDIS_CLIENT')
    private readonly redis: Redis,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Warehouse)
    private readonly warehouseRepository: Repository<Warehouse>,
    @InjectRepository(Category)
    private readonly categoryRepository: Repository<Category>,
    @InjectRepository(Unit)
    private readonly unitRepository: Repository<Unit>,
    @InjectRepository(Supplier)
    private readonly supplierRepository: Repository<Supplier>,
    @InjectRepository(Product)
    private readonly productRepository: Repository<Product>,
    @InjectRepository(ProductBatch)
    private readonly productBatchRepository: Repository<ProductBatch>,
    @InjectRepository(PurchaseOrder)
    private readonly purchaseOrderRepository: Repository<PurchaseOrder>,
    @InjectRepository(OrderItem)
    private readonly orderItemRepository: Repository<OrderItem>,
    @InjectRepository(Expense)
    private readonly expenseRepository: Repository<Expense>,
    @InjectRepository(ExpenseItem)
    private readonly expenseItemRepository: Repository<ExpenseItem>,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    const nodeEnv = this.configService.get<string>('NODE_ENV');
    const shouldSeed =
      this.configService.get<string>('DEV_SEED_ON_BOOTSTRAP', 'true') ===
      'true';

    if (nodeEnv !== 'development' || !shouldSeed) {
      return;
    }

    this.logger.log(
      "Development seed ishga tushdi: eski data tozalanib demo ma'lumotlar yaratiladi",
    );

    const checkImageUrls = this.resetUploadsAndCreateCheckImages();
    await this.flushRedis();
    await this.resetDatabase();

    const users = await this.seedUsers();
    const warehouse = await this.seedWarehouse(users.warehouse);
    const references = await this.seedReferences();
    const inventory = await this.seedProductsAndBatches({
      warehouse,
      references,
    });

    await this.seedPurchaseOrders({
      users,
      warehouse,
      references,
      products: inventory.products,
    });

    await this.seedExpenses({
      users,
      warehouse,
      batches: inventory.batches,
      checkImageUrls,
    });

    await this.flushRedis();
    this.logSeedSummary(users, warehouse);
  }

  private async flushRedis(): Promise<void> {
    try {
      await this.redis.flushdb();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Redis cache tozalanmadi: ${message}`);
    }
  }

  private resetUploadsAndCreateCheckImages(): [string, string] {
    const checksDir = join(process.cwd(), 'uploads', 'checks');
    rmSync(checksDir, { recursive: true, force: true });
    mkdirSync(checksDir, { recursive: true });

    const files = [
      {
        name: 'seed-check-1.svg',
        label: 'Seed Check 1',
        accent: '#2563eb',
      },
      {
        name: 'seed-check-2.svg',
        label: 'Seed Check 2',
        accent: '#ea580c',
      },
    ] as const;

    for (const file of files) {
      writeFileSync(
        join(checksDir, file.name),
        this.buildSvgPlaceholder(file.label, file.accent),
        'utf8',
      );
    }

    return files.map((file) => `/uploads/checks/${file.name}`) as [
      string,
      string,
    ];
  }

  private buildSvgPlaceholder(label: string, accent: string): string {
    return `
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800" viewBox="0 0 1200 800">
  <rect width="1200" height="800" fill="#f8fafc"/>
  <rect x="60" y="60" width="1080" height="680" rx="32" fill="#ffffff" stroke="#e2e8f0" stroke-width="6"/>
  <rect x="120" y="120" width="180" height="56" rx="16" fill="${accent}" opacity="0.12"/>
  <text x="140" y="156" font-family="Arial, sans-serif" font-size="28" fill="${accent}">${label}</text>
  <text x="120" y="260" font-family="Arial, sans-serif" font-size="46" fill="#0f172a">Brosmed Demo Receipt</text>
  <text x="120" y="330" font-family="Arial, sans-serif" font-size="30" fill="#475569">Development seed uchun namunaviy chek rasmi</text>
  <line x1="120" y1="390" x2="1080" y2="390" stroke="#cbd5e1" stroke-width="4"/>
  <text x="120" y="470" font-family="Arial, sans-serif" font-size="30" fill="#0f172a">Warehouse issue tasdiq fayli</text>
  <text x="120" y="540" font-family="Arial, sans-serif" font-size="28" fill="#64748b">Bu fayl UI gallery va previewlarni test qilish uchun yaratilgan.</text>
</svg>`.trim();
  }

  private async resetDatabase(): Promise<void> {
    await this.dataSource.query(`
      TRUNCATE TABLE
        "bot_users",
        "expense_items",
        "expenses",
        "order_items",
        "purchase_orders",
        "product_batches",
        "products",
        "suppliers",
        "categories",
        "units",
        "warehouses",
        "users"
      RESTART IDENTITY CASCADE
    `);
  }

  private async seedUsers(): Promise<SeedUsers> {
    const credentials = [
      {
        role: Role.ADMIN,
        username: this.configService.get<string>('ADMIN_USERNAME', 'admin'),
        password: this.configService.get<string>('ADMIN_PASSWORD', 'admin12345'),
        first_name: 'System',
        last_name: 'Admin',
      },
      {
        role: Role.WAREHOUSE,
        username: this.configService.get<string>(
          'WAREHOUSE_USERNAME',
          'warehouse',
        ),
        password: this.configService.get<string>(
          'WAREHOUSE_PASSWORD',
          'warehouse12345',
        ),
        first_name: 'Warehouse',
        last_name: 'Manager',
      },
      {
        role: Role.ACCOUNTANT,
        username: this.configService.get<string>(
          'ACCOUNTANT_USERNAME',
          'accountant',
        ),
        password: this.configService.get<string>(
          'ACCOUNTANT_PASSWORD',
          'accountant12345',
        ),
        first_name: 'Accountant',
        last_name: 'Operator',
      },
    ] as const;

    const users = await Promise.all(
      credentials.map(async (entry) =>
        this.userRepository.save(
          this.userRepository.create({
            username: entry.username,
            password: await hash(entry.password, 10),
            first_name: entry.first_name,
            last_name: entry.last_name,
            role: entry.role,
          }),
        ),
      ),
    );

    return {
      admin: users[0],
      warehouse: users[1],
      accountant: users[2],
    };
  }

  private async seedWarehouse(manager: User): Promise<Warehouse> {
    return this.warehouseRepository.save(
      this.warehouseRepository.create({
        name: 'Demo Medical Warehouse',
        type: WarehouseType.MEDICAL,
        location: 'Toshkent sh., Chilonzor tumani',
        manager,
        manager_id: manager.id,
      }),
    );
  }

  private async seedReferences(): Promise<SeedReferences> {
    const units = await this.unitRepository.save([
      this.unitRepository.create({ name: 'quti' }),
      this.unitRepository.create({ name: 'dona' }),
      this.unitRepository.create({ name: 'paket' }),
    ]);

    const categories = await this.categoryRepository.save([
      this.categoryRepository.create({
        name: 'Antibiotiklar',
        description: 'Antibakterial preparatlar',
      }),
      this.categoryRepository.create({
        name: 'Vitaminlar',
        description: 'Vitamin va mikroelementlar',
      }),
      this.categoryRepository.create({
        name: 'Tibbiy sarf materiallari',
        description: 'Shprits, bint va boshqa sarf materiallari',
      }),
      this.categoryRepository.create({
        name: 'Infuzion eritmalar',
        description: 'Tomchilatuvchi va eritma mahsulotlari',
      }),
    ]);

    const suppliers = await this.supplierRepository.save([
      this.supplierRepository.create({
        company_name: 'Medline Demo Supply',
        contact_person: 'Aziz Karimov',
        email: 'demo-supply@brosmed.local',
        phone: '+998901112233',
      }),
      this.supplierRepository.create({
        company_name: 'Healthy Reserve Trade',
        contact_person: 'Zarina Ismoilova',
        email: 'reserve-supply@brosmed.local',
        phone: '+998907778899',
      }),
    ]);

    return {
      units: {
        box: units[0],
        piece: units[1],
        pack: units[2],
      },
      categories: {
        antibiotics: categories[0],
        vitamins: categories[1],
        supplies: categories[2],
        solutions: categories[3],
      },
      suppliers: {
        primary: suppliers[0],
        reserve: suppliers[1],
      },
    };
  }

  private async seedProductsAndBatches(input: {
    warehouse: Warehouse;
    references: SeedReferences;
  }): Promise<SeedProducts> {
    const today = new Date();
    const definitions = [
      {
        key: 'amoxicillin',
        name: 'Amoksitsillin 500mg',
        quantity: 140,
        min_limit: 20,
        price: 24000,
        expiryDays: 240,
        unit: input.references.units.box,
        category: input.references.categories.antibiotics,
        supplier: input.references.suppliers.primary,
      },
      {
        key: 'paracetamol',
        name: 'Paratsetamol 500mg',
        quantity: 12,
        min_limit: 20,
        price: 12000,
        expiryDays: 18,
        unit: input.references.units.box,
        category: input.references.categories.vitamins,
        supplier: input.references.suppliers.primary,
      },
      {
        key: 'syringe',
        name: 'Shprits 5ml',
        quantity: 280,
        min_limit: 60,
        price: 1500,
        expiryDays: 480,
        unit: input.references.units.piece,
        category: input.references.categories.supplies,
        supplier: input.references.suppliers.primary,
      },
      {
        key: 'bandage',
        name: 'Bint steril 10m',
        quantity: 35,
        min_limit: 30,
        price: 3200,
        expiryDays: 75,
        unit: input.references.units.piece,
        category: input.references.categories.supplies,
        supplier: input.references.suppliers.reserve,
      },
      {
        key: 'vitaminC',
        name: 'C Vitamin 1000mg',
        quantity: 18,
        min_limit: 15,
        price: 18000,
        expiryDays: 25,
        unit: input.references.units.box,
        category: input.references.categories.vitamins,
        supplier: input.references.suppliers.reserve,
      },
      {
        key: 'saline',
        name: 'Natriy xlorid 0.9% 500ml',
        quantity: 9,
        min_limit: 15,
        price: 9000,
        expiryDays: -5,
        unit: input.references.units.box,
        category: input.references.categories.solutions,
        supplier: input.references.suppliers.primary,
      },
    ] as const;

    const products = {} as SeedProducts['products'];
    const batches = {} as SeedProducts['batches'];
    let batchIndex = 1;

    for (const definition of definitions) {
      const expirationDate = this.addDays(today, definition.expiryDays);
      const expirationAlertDate = this.buildExpirationAlertDate(
        today,
        definition.expiryDays,
      );

      const product = await this.productRepository.save(
        this.productRepository.create({
          name: definition.name,
          quantity: definition.quantity,
          unit: definition.unit.name,
          unit_reference: definition.unit,
          unit_id: definition.unit.id,
          min_limit: definition.min_limit,
          supplier: definition.supplier,
          supplier_id: definition.supplier.id,
          category: definition.category,
          category_id: definition.category.id,
          warehouse: input.warehouse,
          warehouse_id: input.warehouse.id,
          statuses: this.buildProductStatuses(
            definition.quantity,
            definition.min_limit,
            expirationDate,
          ),
          expiration_date: expirationDate,
          expiration_alert_date: expirationAlertDate,
        }),
      );

      const batch = await this.productBatchRepository.save(
        this.productBatchRepository.create({
          product,
          product_id: product.id,
          warehouse: input.warehouse,
          warehouse_id: input.warehouse.id,
          supplier: definition.supplier,
          supplier_id: definition.supplier.id,
          quantity: definition.quantity,
          price_at_purchase: definition.price,
          expiration_date: expirationDate,
          expiration_alert_date: expirationAlertDate,
          batch_number: `BATCH-DEMO-${String(batchIndex).padStart(3, '0')}`,
          serial_number: `SERIAL-DEMO-${String(batchIndex).padStart(3, '0')}`,
          depleted_at: null,
        }),
      );

      products[definition.key] = product;
      batches[definition.key] = batch;
      batchIndex += 1;
    }

    return { products, batches };
  }

  private async seedPurchaseOrders(input: {
    users: SeedUsers;
    warehouse: Warehouse;
    references: SeedReferences;
    products: SeedProducts['products'];
  }): Promise<void> {
    const year = new Date().getFullYear();

    await this.createPurchaseOrder({
      orderNumber: `PO-${year}-001`,
      status: OrderStatus.PENDING,
      users: input.users,
      supplier: input.references.suppliers.primary,
      warehouse: input.warehouse,
      orderDate: this.addDays(new Date(), -2),
      deliveryDate: this.addDays(new Date(), 2),
      items: [
        {
          product: input.products.amoxicillin,
          quantity: 30,
          price_at_purchase: 22000,
        },
        {
          product: input.products.syringe,
          quantity: 100,
          price_at_purchase: 1400,
        },
      ],
    });

    await this.createPurchaseOrder({
      orderNumber: `PO-${year}-002`,
      status: OrderStatus.CONFIRMED,
      users: input.users,
      supplier: input.references.suppliers.reserve,
      warehouse: input.warehouse,
      orderDate: this.addDays(new Date(), -5),
      deliveryDate: this.addDays(new Date(), 1),
      decidedAt: this.addDays(new Date(), -4),
      items: [
        {
          product: input.products.vitaminC,
          quantity: 20,
          price_at_purchase: 16500,
        },
      ],
    });

    await this.createPurchaseOrder({
      orderNumber: `PO-${year}-003`,
      status: OrderStatus.DELIVERED,
      users: input.users,
      supplier: input.references.suppliers.primary,
      warehouse: input.warehouse,
      orderDate: this.addDays(new Date(), -8),
      deliveryDate: this.addDays(new Date(), -1),
      decidedAt: this.addDays(new Date(), -7),
      items: [
        {
          product: input.products.paracetamol,
          quantity: 40,
          price_at_purchase: 10800,
        },
        {
          product: input.products.bandage,
          quantity: 25,
          price_at_purchase: 3000,
        },
      ],
    });

    await this.createPurchaseOrder({
      orderNumber: `PO-${year}-004`,
      status: OrderStatus.CANCELLED,
      users: input.users,
      supplier: input.references.suppliers.reserve,
      warehouse: input.warehouse,
      orderDate: this.addDays(new Date(), -4),
      deliveryDate: this.addDays(new Date(), 3),
      decidedAt: this.addDays(new Date(), -3),
      items: [
        {
          product: input.products.saline,
          quantity: 15,
          price_at_purchase: 8700,
        },
      ],
    });
  }

  private async createPurchaseOrder(input: {
    orderNumber: string;
    status: OrderStatus;
    users: SeedUsers;
    supplier: Supplier;
    warehouse: Warehouse;
    orderDate: Date;
    deliveryDate: Date | null;
    decidedAt?: Date;
    items: Array<{
      product: Product;
      quantity: number;
      price_at_purchase: number;
    }>;
  }): Promise<void> {
    const total = input.items.reduce(
      (sum, item) => sum + item.quantity * item.price_at_purchase,
      0,
    );

    const items = input.items.map((item) =>
      this.orderItemRepository.create({
        product: item.product,
        product_id: item.product.id,
        quantity: item.quantity,
        price_at_purchase: item.price_at_purchase,
      }),
    );

    const order = this.purchaseOrderRepository.create({
      order_number: input.orderNumber,
      status: input.status,
      is_received: false,
      created_by_id: input.users.accountant.id,
      decided_by_id:
        input.status === OrderStatus.PENDING ? null : input.users.admin.id,
      decided_at: input.status === OrderStatus.PENDING ? null : input.decidedAt,
      received_by_id: null,
      received_at: null,
      order_date: input.orderDate,
      delivery_date: input.deliveryDate,
      total_amount: Number(total.toFixed(2)),
      supplier: input.supplier,
      supplier_id: input.supplier.id,
      warehouse: input.warehouse,
      warehouse_id: input.warehouse.id,
      items,
    });

    for (const item of items) {
      item.purchase_order = order;
    }

    await this.purchaseOrderRepository.save(order);
  }

  private async seedExpenses(input: {
    users: SeedUsers;
    warehouse: Warehouse;
    batches: SeedProducts['batches'];
    checkImageUrls: [string, string];
  }): Promise<void> {
    const year = new Date().getFullYear();

    await this.createExpense({
      expenseNumber: `EXP-${year}-001`,
      status: ExpenseStatus.PENDING_APPROVAL,
      users: input.users,
      createdAt: this.addDays(new Date(), -1),
      staffName: 'Terapiya bo`limi',
      purpose: 'Kunlik sarf uchun tayyorlandi',
      type: ExpenseType.USAGE,
      items: [
        { batch: input.batches.paracetamol, quantity: 4 },
        { batch: input.batches.bandage, quantity: 6 },
      ],
    });

    await this.createExpense({
      expenseNumber: `EXP-${year}-002`,
      status: ExpenseStatus.PENDING_ISSUE,
      users: input.users,
      createdAt: this.addDays(new Date(), -2),
      approvedAt: this.addDays(new Date(), -1),
      staffName: 'Jarrohlik bo`limi',
      purpose: 'Tasdiqlangan, ombordan chiqarish kutilmoqda',
      type: ExpenseType.USAGE,
      items: [{ batch: input.batches.amoxicillin, quantity: 8 }],
    });

    await this.createExpense({
      expenseNumber: `EXP-${year}-003`,
      status: ExpenseStatus.PENDING_PHOTO,
      users: input.users,
      createdAt: this.addDays(new Date(), -3),
      approvedAt: this.addDays(new Date(), -2),
      issuedAt: this.addDays(new Date(), -1),
      staffName: 'Poliklinika',
      purpose: 'Mahsulot berilgan, chek rasmi kutilmoqda',
      type: ExpenseType.USAGE,
      items: [
        { batch: input.batches.syringe, quantity: 20 },
        { batch: input.batches.bandage, quantity: 4 },
      ],
    });

    await this.createExpense({
      expenseNumber: `EXP-${year}-004`,
      status: ExpenseStatus.PENDING_CONFIRMATION,
      users: input.users,
      createdAt: this.addDays(new Date(), -4),
      approvedAt: this.addDays(new Date(), -3),
      issuedAt: this.addDays(new Date(), -2),
      staffName: 'Kardiologiya',
      purpose: 'Foto yuklangan, final review kutilmoqda',
      type: ExpenseType.USAGE,
      images: [input.checkImageUrls[0], input.checkImageUrls[1]],
      items: [{ batch: input.batches.vitaminC, quantity: 3 }],
    });

    await this.createExpense({
      expenseNumber: `EXP-${year}-005`,
      status: ExpenseStatus.REVISION_REQUIRED,
      users: input.users,
      createdAt: this.addDays(new Date(), -5),
      approvedAt: this.addDays(new Date(), -4),
      issuedAt: this.addDays(new Date(), -3),
      revisionRequestedAt: this.addDays(new Date(), -1),
      revisionReason:
        'Chek rasmi noaniq. Mahsulot nomi va miqdori aniq ko`rinadigan qilib qayta yuklang.',
      staffName: 'Reanimatsiya bo`limi',
      purpose: 'Qayta rasm yuklash talab qilinadi',
      type: ExpenseType.USAGE,
      images: [input.checkImageUrls[0]],
      items: [{ batch: input.batches.saline, quantity: 2 }],
    });

    await this.createExpense({
      expenseNumber: `EXP-${year}-006`,
      status: ExpenseStatus.COMPLETED,
      users: input.users,
      createdAt: this.addDays(new Date(), -6),
      approvedAt: this.addDays(new Date(), -5),
      issuedAt: this.addDays(new Date(), -4),
      confirmedAt: this.addDays(new Date(), -3),
      staffName: 'Laboratoriya',
      purpose: 'Yakunlangan chiqim',
      type: ExpenseType.USAGE,
      images: [input.checkImageUrls[0], input.checkImageUrls[1]],
      items: [
        { batch: input.batches.amoxicillin, quantity: 5 },
        { batch: input.batches.syringe, quantity: 15 },
      ],
    });

    await this.createExpense({
      expenseNumber: `EXP-${year}-007`,
      status: ExpenseStatus.CANCELLED,
      users: input.users,
      createdAt: this.addDays(new Date(), -2),
      cancelledAt: this.addDays(new Date(), -1),
      staffName: 'Qabul bo`limi',
      purpose: 'Bekor qilingan chiqim so`rovi',
      type: ExpenseType.EXPIRED,
      items: [{ batch: input.batches.paracetamol, quantity: 2 }],
    });
  }

  private async createExpense(input: {
    expenseNumber: string;
    status: ExpenseStatus;
    users: SeedUsers;
    createdAt: Date;
    approvedAt?: Date;
    issuedAt?: Date;
    confirmedAt?: Date;
    cancelledAt?: Date;
    revisionRequestedAt?: Date;
    revisionReason?: string;
    staffName: string;
    purpose: string;
    type: ExpenseType;
    images?: string[];
    items: Array<{ batch: ProductBatch; quantity: number }>;
  }): Promise<void> {
    const total = input.items.reduce(
      (sum, item) =>
        sum + item.quantity * Number(item.batch.price_at_purchase),
      0,
    );

    const items = input.items.map((item) =>
      this.expenseItemRepository.create({
        product: item.batch.product,
        warehouse: item.batch.warehouse,
        product_batch: item.batch,
        product_batch_id: item.batch.id,
        quantity: item.quantity,
      }),
    );

    const expense = this.expenseRepository.create({
      expense_number: input.expenseNumber,
      status: input.status,
      type: input.type,
      images: input.images ?? [],
      total_price: Number(total.toFixed(2)),
      manager_id: input.users.accountant.id,
      issued_by_id: input.issuedAt ? input.users.warehouse.id : null,
      issued_at: input.issuedAt ?? null,
      approved_by_id: input.approvedAt ? input.users.admin.id : null,
      approved_at: input.approvedAt ?? null,
      confirmed_by_id: input.confirmedAt ? input.users.admin.id : null,
      confirmed_at: input.confirmedAt ?? null,
      revision_reason: input.revisionReason ?? null,
      revision_requested_by_id: input.revisionRequestedAt
        ? input.users.admin.id
        : null,
      revision_requested_at: input.revisionRequestedAt ?? null,
      cancelled_by_id: input.cancelledAt ? input.users.admin.id : null,
      cancelled_at: input.cancelledAt ?? null,
      staff_name: input.staffName,
      purpose: input.purpose,
      items,
      createdAt: input.createdAt,
    });

    for (const item of items) {
      item.expense = expense;
    }

    await this.expenseRepository.save(expense);
  }

  private buildProductStatuses(
    quantity: number,
    minLimit: number,
    expirationDate: Date | null,
  ): ProductStatus[] {
    const statuses = new Set<ProductStatus>();

    if (quantity > 0) {
      statuses.add(ProductStatus.IN_STOCK);
    }

    if (quantity > 0 && quantity <= minLimit) {
      statuses.add(ProductStatus.LOW_STOCK);
    }

    if (expirationDate) {
      const today = new Date();
      const normalizedToday = new Date(
        today.getFullYear(),
        today.getMonth(),
        today.getDate(),
      );
      const normalizedExpiration = new Date(
        expirationDate.getFullYear(),
        expirationDate.getMonth(),
        expirationDate.getDate(),
      );

      if (normalizedExpiration < normalizedToday) {
        statuses.add(ProductStatus.EXPIRED);
      } else {
        const daysLeft = Math.ceil(
          (normalizedExpiration.getTime() - normalizedToday.getTime()) /
            (1000 * 60 * 60 * 24),
        );
        if (daysLeft <= 30) {
          statuses.add(ProductStatus.EXPIRING_SOON);
        }
      }
    }

    return Array.from(statuses);
  }

  private buildExpirationAlertDate(baseDate: Date, expiryDays: number): Date {
    const alertOffset =
      expiryDays > 30 ? expiryDays - 30 : Math.max(expiryDays - 3, -7);
    return this.addDays(baseDate, alertOffset);
  }

  private addDays(date: Date, days: number): Date {
    const result = new Date(date);
    result.setDate(result.getDate() + days);
    return result;
  }

  private logSeedSummary(users: SeedUsers, warehouse: Warehouse): void {
    const adminPassword = this.configService.get<string>(
      'ADMIN_PASSWORD',
      'admin12345',
    );
    const warehousePassword = this.configService.get<string>(
      'WAREHOUSE_PASSWORD',
      'warehouse12345',
    );
    const accountantPassword = this.configService.get<string>(
      'ACCOUNTANT_PASSWORD',
      'accountant12345',
    );

    this.logger.log('Development seed tayyor.');
    this.logger.log(`Admin: ${users.admin.username} / ${adminPassword}`);
    this.logger.log(
      `Warehouse: ${users.warehouse.username} / ${warehousePassword}`,
    );
    this.logger.log(
      `Accountant: ${users.accountant.username} / ${accountantPassword}`,
    );
    this.logger.log(`Warehouse assigned: ${warehouse.name}`);
    this.logger.log(
      'Demo data ichida purchase order va expense approval flow holatlari ham yaratildi',
    );
  }
}
