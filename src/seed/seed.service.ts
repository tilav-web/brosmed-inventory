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
    const [antibiotics, vitamins, painkillers, medicalSupplies] =
      input.categories;
    const [dona, quti, paket, ml, mg, g, kg] = input.units;
    const [supplier1, supplier2] = input.suppliers;
    const [warehouse1, warehouse2, warehouse3] = input.warehouses;

    const definitions: {
      name: string;
      unit: Unit;
      category: Category;
      supplier: Supplier;
      warehouse: Warehouse;
      min_limit: number;
      quantity: number;
      batchExpiryDays: number;
    }[] = [
      // Toshkent Markaziy Ombor (Medical)
      {
        name: 'Amoksitsillin 500mg',
        unit: quti,
        category: antibiotics,
        supplier: supplier1,
        warehouse: warehouse1,
        min_limit: 20,
        quantity: 150,
        batchExpiryDays: 300,
      },
      {
        name: 'Paratsetamol 500mg',
        unit: quti,
        category: painkillers,
        supplier: supplier1,
        warehouse: warehouse1,
        min_limit: 30,
        quantity: 8,
        batchExpiryDays: 15,
      },
      {
        name: 'Ibuprofen 200mg',
        unit: quti,
        category: painkillers,
        supplier: supplier2,
        warehouse: warehouse1,
        min_limit: 15,
        quantity: 200,
        batchExpiryDays: 400,
      },
      {
        name: 'C Vitamin 1000mg',
        unit: quti,
        category: vitamins,
        supplier: supplier2,
        warehouse: warehouse1,
        min_limit: 10,
        quantity: 5,
        batchExpiryDays: 7,
      },
      {
        name: 'Shprits 5ml',
        unit: dona,
        category: medicalSupplies,
        supplier: supplier1,
        warehouse: warehouse1,
        min_limit: 50,
        quantity: 300,
        batchExpiryDays: 600,
      },
      {
        name: 'Bint steril 10m',
        unit: dona,
        category: medicalSupplies,
        supplier: supplier1,
        warehouse: warehouse1,
        min_limit: 25,
        quantity: 12,
        batchExpiryDays: 20,
      },
      {
        name: 'Deksametazon 4mg/ml',
        unit: quti,
        category: antibiotics,
        supplier: supplier1,
        warehouse: warehouse1,
        min_limit: 10,
        quantity: 45,
        batchExpiryDays: 250,
      },

      // Samarqand Filial Ombor
      {
        name: 'Metformin 500mg',
        unit: quti,
        category: antibiotics,
        supplier: supplier1,
        warehouse: warehouse2,
        min_limit: 20,
        quantity: 180,
        batchExpiryDays: 350,
      },
      {
        name: 'Aspirin 100mg',
        unit: quti,
        category: painkillers,
        supplier: supplier2,
        warehouse: warehouse2,
        min_limit: 25,
        quantity: 3,
        batchExpiryDays: 10,
      },
      {
        name: "Tibbiy qo'lqoplar",
        unit: quti,
        category: medicalSupplies,
        supplier: supplier2,
        warehouse: warehouse2,
        min_limit: 40,
        quantity: 250,
        batchExpiryDays: 500,
      },
      {
        name: 'D3 Vitamini 2000ME',
        unit: quti,
        category: vitamins,
        supplier: supplier1,
        warehouse: warehouse2,
        min_limit: 15,
        quantity: 60,
        batchExpiryDays: 280,
      },
      {
        name: 'Tibbiy niqob 50 dona',
        unit: paket,
        category: medicalSupplies,
        supplier: supplier1,
        warehouse: warehouse2,
        min_limit: 30,
        quantity: 18,
        batchExpiryDays: 25,
      },

      // Farg'ona Zaxira Ombor
      {
        name: 'Tramadol 50mg',
        unit: quti,
        category: painkillers,
        supplier: supplier2,
        warehouse: warehouse3,
        min_limit: 10,
        quantity: 70,
        batchExpiryDays: 320,
      },
      {
        name: 'B Kompleks Vitamini',
        unit: quti,
        category: vitamins,
        supplier: supplier1,
        warehouse: warehouse3,
        min_limit: 20,
        quantity: 6,
        batchExpiryDays: 5,
      },
      {
        name: 'Fiziologik eritma 500ml',
        unit: quti,
        category: medicalSupplies,
        supplier: supplier1,
        warehouse: warehouse3,
        min_limit: 50,
        quantity: 400,
        batchExpiryDays: 450,
      },
      {
        name: 'Ketoprofen 100mg',
        unit: quti,
        category: painkillers,
        supplier: supplier2,
        warehouse: warehouse3,
        min_limit: 12,
        quantity: 40,
        batchExpiryDays: 200,
      },
      {
        name: 'Penitsillin 1mln',
        unit: quti,
        category: antibiotics,
        supplier: supplier1,
        warehouse: warehouse3,
        min_limit: 15,
        quantity: 9,
        batchExpiryDays: 30,
      },
    ];

    const existingNames = definitions.map((d) => d.name);
    const existing = await this.productRepository.find({
      where: { name: In(existingNames) },
    });
    if (existing.length > 0) {
      return this.productRepository.find({
        relations: { warehouse: true, supplier: true, category: true },
      });
    }

    const today = new Date();
    const createdProducts: Product[] = [];
    let batchIndex = 0;

    for (const def of definitions) {
      const statuses: ProductStatus[] = [];

      if (def.quantity > 0) statuses.push(ProductStatus.IN_STOCK);
      if (def.quantity <= def.min_limit && def.quantity > 0)
        statuses.push(ProductStatus.LOW_STOCK);
      if (def.batchExpiryDays <= 30) statuses.push(ProductStatus.EXPIRING_SOON);
      if (def.batchExpiryDays <= 0) statuses.push(ProductStatus.EXPIRED);

      const product = this.productRepository.create({
        name: def.name,
        quantity: def.quantity,
        min_limit: def.min_limit,
        unit: def.unit.name,
        category: def.category,
        supplier: def.supplier,
        warehouse: def.warehouse,
        statuses,
        expiration_date: this.addDays(today, def.batchExpiryDays),
        expiration_alert_date: this.addDays(today, def.batchExpiryDays - 30),
      });

      const saved = await this.productRepository.save(product);

      batchIndex += 1;
      await this.productBatchRepository.save(
        this.productBatchRepository.create({
          product: saved,
          product_id: saved.id,
          warehouse: def.warehouse,
          warehouse_id: def.warehouse.id,
          supplier: def.supplier,
          supplier_id: def.supplier.id,
          quantity: def.quantity,
          price_at_purchase: this.randomNumber(5000, 80000, 2),
          expiration_date: this.addDays(today, def.batchExpiryDays),
          expiration_alert_date: this.addDays(today, def.batchExpiryDays - 30),
          batch_number: `BATCH-${input.runId}-${String(batchIndex).padStart(3, '0')}`,
        }),
      );

      createdProducts.push(saved);
    }

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

    const today = new Date();
    let orderIndex = 0;

    for (const warehouse of input.warehouses) {
      const warehouseProducts = input.products.filter(
        (p) => p.warehouse_id === warehouse.id,
      );
      if (warehouseProducts.length === 0) continue;

      const orderCount = this.randomInt(2, 3);

      for (let i = 0; i < orderCount; i += 1) {
        orderIndex += 1;
        const itemsCount = this.randomInt(1, 3);
        const items: OrderItem[] = [];
        let total = 0;

        for (let j = 0; j < itemsCount; j += 1) {
          const product = this.pick(warehouseProducts);
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

        const status = this.pick([
          OrderStatus.PENDING,
          OrderStatus.CONFIRMED,
          OrderStatus.DELIVERED,
          OrderStatus.CANCELLED,
        ]);
        const order = this.purchaseOrderRepository.create({
          order_number: `PO-${input.runId}-${String(orderIndex).padStart(3, '0')}`,
          status,
          is_received: status === OrderStatus.DELIVERED,
          order_date: this.addDays(today, -this.randomInt(1, 30)),
          total_amount: Number(total.toFixed(2)),
          supplier: this.pick(input.suppliers),
          warehouse,
          items,
        });

        for (const item of items) {
          item.purchase_order = order;
        }
        await this.purchaseOrderRepository.save(order);
      }
    }
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

    const staffNames = [
      'Ali Valiyev',
      'Hasan Husanov',
      'Dilshod Karimov',
      'Nodira Azimova',
      'Rustam Saidov',
    ];
    const purposes = [
      'Klinikaga berildi',
      'Jarrohlik bo`limiga',
      'Poliklinikaga yuborildi',
      'Favqulodda holat uchun',
      'Ambulator davolash',
      'Laboratoriyaga',
      'Reanimatsiya bo`limiga',
    ];
    const statuses = [
      ExpenseStatus.COMPLETED,
      ExpenseStatus.COMPLETED,
      ExpenseStatus.COMPLETED,
      ExpenseStatus.PENDING_ISSUE,
      ExpenseStatus.PENDING_PHOTO,
    ];

    let expenseIndex = 0;
    const today = new Date();

    for (const warehouse of input.warehouses) {
      const warehouseBatches = input.batches.filter(
        (b) => b.warehouse_id === warehouse.id,
      );
      if (warehouseBatches.length === 0) continue;

      const expenseCount = this.randomInt(4, 6);

      for (let i = 0; i < expenseCount; i += 1) {
        expenseIndex += 1;
        const items: ExpenseItem[] = [];
        let total = 0;
        const itemsCount = this.randomInt(1, 3);

        for (let j = 0; j < itemsCount; j += 1) {
          const batch = this.pick(warehouseBatches);
          const quantity = this.randomInt(1, 10);
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

        const status = this.pick(statuses);
        const expense = this.expenseRepository.create({
          expense_number: `EXP-${input.runId}-${String(expenseIndex).padStart(3, '0')}`,
          status,
          type: this.pick([ExpenseType.USAGE, ExpenseType.EXPIRED]),
          total_price: Number(total.toFixed(2)),
          staff_name: this.pick(staffNames),
          purpose: this.pick(purposes),
          manager: this.pick(input.warehouseManagers),
          items,
          createdAt: this.addDays(today, -this.randomInt(1, 30)),
        });

        for (const item of items) {
          item.expense = expense;
        }
        await this.expenseRepository.save(expense);
      }
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
