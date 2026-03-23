import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { hash } from 'bcrypt';
import { In, Repository } from 'typeorm';
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

@Injectable()
export class SeedService implements OnApplicationBootstrap {
  private readonly logger = new Logger(SeedService.name);

  constructor(
    private readonly configService: ConfigService,
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
    if (nodeEnv !== 'development') {
      return;
    }

    this.logger.log('Seeding development data...');
    await this.seedAll();
    this.logger.log('Seed completed.');
  }

  private async seedAll(): Promise<void> {
    const runId = this.buildRunId();
    await this.seedAdmin(); // Yangi: Admin yaratish
    const warehouseManagers = await this.seedUsers();
    const warehouses = await this.seedWarehouses(warehouseManagers);
    const units = await this.seedUnits();
    const categories = await this.seedCategories();
    const suppliers = await this.seedSuppliers();
    const products = await this.seedProducts({
      warehouses,
      units,
      categories,
      suppliers,
      runId,
    });

    // Muhim: Batchlar yaratilgandan keyin ularni olishimiz kerak
    const batches = await this.productBatchRepository.find({
      relations: { product: true, warehouse: true },
    });

    await this.seedPurchaseOrders({ suppliers, warehouses, products, runId });
    await this.seedExpenses({
      warehouses,
      products,
      batches,
      warehouseManagers,
      runId,
    });
  }

  private async seedAdmin(): Promise<void> {
    const existing = await this.userRepository.findOne({
      where: { username: 'admin' },
    });
    if (!existing) {
      const hashedPassword = await hash('admin123', 10);
      await this.userRepository.save(
        this.userRepository.create({
          username: 'admin',
          password: hashedPassword,
          first_name: 'Super',
          last_name: 'Admin',
          role: Role.ADMIN,
        }),
      );
      this.logger.log('Default admin created: admin / admin123');
    }
  }

  private async seedUsers(): Promise<User[]> {
    const usernames = [
      'warehouse01',
      'warehouse02',
      'warehouse03',
      'warehouse04',
    ];

    const existingUsers = await this.userRepository.find({
      where: { username: In(usernames) },
    });
    const existingUsernames = new Set(existingUsers.map((u) => u.username));

    const toCreate = usernames
      .filter((username) => !existingUsernames.has(username))
      .map((username, index) =>
        this.userRepository.create({
          username,
          password: 'temp',
          first_name: `Warehouse${index + 1}`,
          last_name: 'Manager',
          role: Role.WAREHOUSE,
        }),
      );

    if (toCreate.length > 0) {
      const hashedPassword = await hash('warehouse123', 10);
      for (const user of toCreate) {
        user.password = hashedPassword;
      }
      await this.userRepository.save(toCreate);
    }

    return this.userRepository.find({
      where: { username: In(usernames) },
      order: { username: 'ASC' },
    });
  }

  private async seedWarehouses(managers: User[]): Promise<Warehouse[]> {
    const definitions = [
      {
        name: 'Toshkent Markaziy Ombor',
        type: WarehouseType.MEDICAL,
        location: 'Toshkent sh., Yakkasaroy tumani',
      },
      {
        name: 'Samarqand Filial Ombor',
        type: WarehouseType.HOUSEHOLD,
        location: 'Samarqand sh., Registon ko`chasi',
      },
      {
        name: 'Farg`ona Zaxira Ombor',
        type: WarehouseType.SPARE_PARTS,
        location: 'Farg`ona sh., Mustaqillik ko`chasi',
      },
    ];

    const existing = await this.warehouseRepository.find({
      where: { name: In(definitions.map((d) => d.name)) },
    });
    const existingNames = new Set(existing.map((w) => w.name));

    const toCreate = definitions
      .filter((d) => !existingNames.has(d.name))
      .map((d, index) =>
        this.warehouseRepository.create({
          name: d.name,
          type: d.type,
          location: d.location,
          manager: managers[index % managers.length],
          manager_id: managers[index % managers.length].id,
        }),
      );

    if (toCreate.length > 0) {
      await this.warehouseRepository.save(toCreate);
    }

    return this.warehouseRepository.find({
      where: { name: In(definitions.map((d) => d.name)) },
      order: { name: 'ASC' },
    });
  }

  private async seedUnits(): Promise<Unit[]> {
    const names = [
      'dona',
      'quti',
      'paket',
      'litr',
      'ml',
      'mg',
      'g',
      'kg',
      'metr',
    ];

    const existing = await this.unitRepository.find({
      where: { name: In(names) },
    });
    const existingNames = new Set(existing.map((u) => u.name));

    const toCreate = names
      .filter((name) => !existingNames.has(name))
      .map((name) => this.unitRepository.create({ name }));

    if (toCreate.length > 0) {
      await this.unitRepository.save(toCreate);
    }

    return this.unitRepository.find({
      where: { name: In(names) },
      order: { name: 'ASC' },
    });
  }

  private async seedCategories(): Promise<Category[]> {
    const definitions = [
      { name: 'Antibiotiklar', description: 'Bakterial infeksiyalar uchun' },
      { name: 'Vitaminlar', description: 'Vitamin va mikroelementlar' },
      { name: 'Og`riq qoldiruvchi', description: 'Analgetik vositalar' },
      {
        name: 'Tibbiy sarf materiallari',
        description: 'Bint, shprits va h.k.',
      },
    ];

    const existing = await this.categoryRepository.find({
      where: { name: In(definitions.map((d) => d.name)) },
    });
    const existingNames = new Set(existing.map((c) => c.name));

    const toCreate = definitions
      .filter((d) => !existingNames.has(d.name))
      .map((d) => this.categoryRepository.create(d));

    if (toCreate.length > 0) {
      await this.categoryRepository.save(toCreate);
    }

    return this.categoryRepository.find({ order: { name: 'ASC' } });
  }

  private async seedSuppliers(): Promise<Supplier[]> {
    const definitions = [
      {
        company_name: 'MedLine Pharma',
        contact_person: 'Aziz Karimov',
        email: 'sales@medline.uz',
        phone: '+998901112233',
      },
      {
        company_name: 'HealthPro Supply',
        contact_person: 'Umar S.',
        email: 'contact@healthpro.uz',
        phone: '+998997778899',
      },
    ];

    const existing = await this.supplierRepository.find({
      where: { email: In(definitions.map((d) => d.email)) },
    });
    const existingEmails = new Set(existing.map((s) => s.email));

    const toCreate = definitions
      .filter((d) => !existingEmails.has(d.email))
      .map((d) => this.supplierRepository.create(d));

    if (toCreate.length > 0) {
      await this.supplierRepository.save(toCreate);
    }

    return this.supplierRepository.find({ order: { company_name: 'ASC' } });
  }

  private async seedProducts(input: {
    warehouses: Warehouse[];
    units: Unit[];
    categories: Category[];
    suppliers: Supplier[];
    runId: string;
  }): Promise<Product[]> {
    const productNames = [
      'Amoksitsillin 500mg',
      'Paratsetamol 500mg',
      'Ibuprofen 200mg',
      'C Vitamin 1000mg',
      'Shprits 5ml',
      'Tibbiy niqob 50 dona',
    ];

    const existing = await this.productRepository.find({
      where: { name: In(productNames) },
    });
    if (existing.length > 0) {
      return this.productRepository.find({
        relations: { warehouse: true, supplier: true },
      });
    }

    const toCreate: Product[] = [];
    const today = new Date();

    for (const name of productNames) {
      toCreate.push(
        this.productRepository.create({
          name,
          quantity: 0,
          min_limit: this.randomInt(5, 30),
          unit: this.pick(input.units).name,
          category: this.pick(input.categories),
          supplier: this.pick(input.suppliers),
          warehouse: this.pick(input.warehouses),
        }),
      );
    }

    const createdProducts = await this.productRepository.save(toCreate);
    const batches: ProductBatch[] = [];

    for (let i = 0; i < createdProducts.length; i += 1) {
      const product = createdProducts[i];
      const quantity = this.randomInt(50, 200);

      batches.push(
        this.productBatchRepository.create({
          product,
          product_id: product.id,
          warehouse: product.warehouse,
          warehouse_id: product.warehouse_id,
          supplier: product.supplier,
          supplier_id: product.supplier_id,
          quantity,
          price_at_purchase: this.randomNumber(5000, 50000, 2),
          expiration_date: this.addDays(today, this.randomInt(100, 500)),
          batch_number: `BATCH-${input.runId}-${String(i + 1).padStart(3, '0')}`,
        }),
      );
      product.quantity = quantity;
      product.statuses = [ProductStatus.IN_STOCK];
    }

    await this.productBatchRepository.save(batches);
    await this.productRepository.save(createdProducts);
    return createdProducts;
  }

  private async seedPurchaseOrders(input: {
    suppliers: Supplier[];
    warehouses: Warehouse[];
    products: Product[];
    runId: string;
  }): Promise<void> {
    const existingCount = await this.purchaseOrderRepository.count();
    if (existingCount > 0) return;

    const orders: PurchaseOrder[] = [];
    const today = new Date();

    for (let i = 0; i < 5; i += 1) {
      const itemsCount = this.randomInt(1, 3);
      const items: OrderItem[] = [];
      let total = 0;

      for (let j = 0; j < itemsCount; j += 1) {
        const product = this.pick(input.products);
        const quantity = this.randomInt(10, 50);
        const price = this.randomNumber(4000, 40000, 2);
        total += quantity * price;

        items.push(
          this.orderItemRepository.create({
            product,
            quantity,
            price_at_purchase: price,
          }),
        );
      }

      const status = this.pick([OrderStatus.PENDING, OrderStatus.DELIVERED]);
      const order = this.purchaseOrderRepository.create({
        order_number: `PO-${input.runId}-${String(i + 1).padStart(3, '0')}`,
        status,
        is_received: status === OrderStatus.DELIVERED, // Muhim: DELIVERED bo'lsa received bo'ladi
        order_date: this.addDays(today, -i),
        total_amount: Number(total.toFixed(2)),
        supplier: this.pick(input.suppliers),
        warehouse: this.pick(input.warehouses),
        items,
      });

      for (const item of items) {
        item.purchase_order = order;
      }
      orders.push(order);
    }
    await this.purchaseOrderRepository.save(orders);
  }

  private async seedExpenses(input: {
    warehouses: Warehouse[];
    products: Product[];
    batches: ProductBatch[];
    warehouseManagers: User[];
    runId: string;
  }): Promise<void> {
    const existingCount = await this.expenseRepository.count();
    if (existingCount > 0) return;

    for (let i = 0; i < 5; i += 1) {
      const items: ExpenseItem[] = [];
      let total = 0;

      const itemsCount = this.randomInt(1, 2);
      for (let j = 0; j < itemsCount; j += 1) {
        // Muhim: Batch bor mahsulotni tanlash
        const batch = this.pick(input.batches);
        const quantity = this.randomInt(1, 5);
        const lineTotal = quantity * Number(batch.price_at_purchase);
        total += lineTotal;

        items.push(
          this.expenseItemRepository.create({
            product: batch.product,
            warehouse: batch.warehouse,
            product_batch: batch,
            product_batch_id: batch.id,
            quantity,
          }),
        );
      }

      const expense = this.expenseRepository.create({
        expense_number: `EXP-${input.runId}-${String(i + 1).padStart(3, '0')}`,
        status: ExpenseStatus.COMPLETED,
        type: ExpenseType.USAGE,
        total_price: Number(total.toFixed(2)),
        staff_name: 'Test Staff',
        manager: this.pick(input.warehouseManagers),
        items,
      });

      for (const item of items) {
        item.expense = expense;
      }
      await this.expenseRepository.save(expense);
    }
  }

  private pick<T>(items: T[]): T {
    return items[Math.floor(Math.random() * items.length)];
  }

  private randomInt(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  private randomNumber(min: number, max: number, decimals = 0): number {
    return Number((Math.random() * (max - min) + min).toFixed(decimals));
  }

  private addDays(date: Date, days: number): Date {
    const result = new Date(date);
    result.setDate(result.getDate() + days);
    return result;
  }

  private buildRunId(): string {
    return new Date().getTime().toString().slice(-8);
  }
}
