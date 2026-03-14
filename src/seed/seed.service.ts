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

    await this.seedPurchaseOrders({ suppliers, warehouses, products, runId });
    await this.seedExpenses({ warehouses, products, warehouseManagers, runId });
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
      const hashedPassword = await hash('warehouse12345', 10);
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
      'tablet',
      'flakon',
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
      {
        name: 'Antibiotiklar',
        description: 'Bakterial infeksiyalar uchun dori vositalari',
      },
      {
        name: 'Vitaminlar',
        description: 'Vitamin va mikroelementlar',
      },
      {
        name: 'Og`riq qoldiruvchi',
        description: 'Analgetik va yallig`lanishga qarshi vositalar',
      },
      {
        name: 'Tibbiy sarf materiallari',
        description: 'Bint, shprits va boshqa sarf materiallar',
      },
      {
        name: 'Dezinfeksiya vositalari',
        description: 'Antiseptik va tozalash vositalari',
      },
      {
        name: 'Jarohat parvarishi',
        description: 'Yara va kuyish uchun ishlatiladigan vositalar',
      },
    ];

    const existing = await this.categoryRepository.find({
      where: { name: In(definitions.map((d) => d.name)) },
    });
    const existingNames = new Set(existing.map((c) => c.name));

    const toCreate = definitions
      .filter((d) => !existingNames.has(d.name))
      .map((d) =>
        this.categoryRepository.create({
          name: d.name,
          description: d.description,
        }),
      );

    if (toCreate.length > 0) {
      await this.categoryRepository.save(toCreate);
    }

    return this.categoryRepository.find({
      where: { name: In(definitions.map((d) => d.name)) },
      order: { name: 'ASC' },
    });
  }

  private async seedSuppliers(): Promise<Supplier[]> {
    const definitions = [
      {
        company_name: 'MedLine Pharma',
        contact_person: 'Aziz Karimov',
        email: 'sales@medline.uz',
        phone: '+998901112233',
        payment_terms: '30 kun ichida to`lov',
        description: 'Katta hajmli dori vositalari yetkazib beruvchi',
      },
      {
        company_name: 'Samarqand Medical',
        contact_person: 'Dilnoza M.',
        email: 'office@sammedical.uz',
        phone: '+998935556677',
        payment_terms: '15 kun',
        description: 'Mahalliy tibbiy vositalar',
      },
      {
        company_name: 'HealthPro Supply',
        contact_person: 'Umar S.',
        email: 'contact@healthpro.uz',
        phone: '+998997778899',
        payment_terms: 'Oldindan 50%',
        description: 'Dezinfeksiya va sarf materiallar',
      },
      {
        company_name: 'VitaPlus',
        contact_person: 'Zarnigor I.',
        email: 'info@vitaplus.uz',
        phone: '+998901234567',
        payment_terms: '30 kun',
        description: 'Vitamin va biologik qo`shimchalar',
      },
      {
        company_name: 'Klinika Market',
        contact_person: 'Islom T.',
        email: 'hello@klinmarket.uz',
        phone: '+998939991122',
        payment_terms: '20 kun',
        description: 'Klinikalar uchun to`plamlar',
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

    return this.supplierRepository.find({
      where: { email: In(definitions.map((d) => d.email)) },
      order: { company_name: 'ASC' },
    });
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
      'Magniy B6',
      'Bint steril 10cm',
      'Spirt 70% 1L',
      'Yod eritmasi 100ml',
      'Shprits 5ml',
      'Shprits 10ml',
      'Povidon-yod 100ml',
      'Natriy xlorid 0.9% 500ml',
      'Glyukoza 5% 500ml',
      'Askorbin kislota 100mg',
      'Geksoral sprey',
      'Sut yodiruvchi tozalagich',
      'Betadin 30ml',
      'Tibbiy niqob 50 dona',
      'Lateks qo`lqop',
      'Oftalmik tomchi',
      'Yaraga surtma',
      'Yangi avlod antiseptik',
      'O`tkir og`riq gel',
      'Dezinfeksiya salfetkasi',
      'Glyukometr lenta',
      'Tibbiy termometr',
      'Bronxolitin sirop',
      'Kalsiy D3',
      'Rivanol eritmasi',
      'Mahalliy antibiotik krem',
    ];

    const toCreate: Product[] = [];
    const today = new Date();

    for (let i = 0; i < productNames.length; i += 1) {
      toCreate.push(
        this.productRepository.create({
          name: productNames[i],
          quantity: 0,
          min_limit: this.randomInt(5, 30),
          storage_conditions: 'Quruq va salqin joyda saqlash',
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
      const batchesCount = this.randomInt(1, 3);
      let totalQty = 0;

      for (let j = 0; j < batchesCount; j += 1) {
        const expirationDate =
          Math.random() < 0.2
            ? null
            : this.addDays(today, this.randomInt(30, 360));
        const expirationAlertDate =
          expirationDate && Math.random() < 0.9
            ? this.addDays(
                expirationDate,
                -this.randomInt(
                  5,
                  Math.min(30, this.daysBetween(today, expirationDate)),
                ),
              )
            : null;
        const quantity = this.randomInt(10, 120);

        totalQty += quantity;
        batches.push(
          this.productBatchRepository.create({
            product,
            product_id: product.id,
            warehouse: product.warehouse,
            warehouse_id: product.warehouse_id,
            supplier: product.supplier,
            supplier_id: product.supplier_id,
            quantity,
            price_at_purchase: this.randomNumber(5000, 150000, 2),
            expiration_date: expirationDate,
            expiration_alert_date: expirationAlertDate,
            batch_number: `BATCH-${input.runId}-${String(i + 1).padStart(3, '0')}-${String(j + 1).padStart(2, '0')}`,
          }),
        );
      }

      product.quantity = totalQty;
    }

    if (batches.length > 0) {
      await this.productBatchRepository.save(batches);
    }

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
    if (existingCount > 0) {
      return;
    }

    const orders: PurchaseOrder[] = [];
    const today = new Date();

    for (let i = 0; i < 12; i += 1) {
      const itemsCount = this.randomInt(2, 5);
      const items: OrderItem[] = [];
      let total = 0;

      for (let j = 0; j < itemsCount; j += 1) {
        const product = this.pick(input.products);
        const quantity = this.randomInt(5, 40);
        const price = this.randomNumber(3000, 120000, 2);
        const expirationDate =
          Math.random() < 0.2
            ? null
            : this.addDays(today, this.randomInt(30, 360));
        const expirationAlertDate =
          expirationDate && Math.random() < 0.9
            ? this.addDays(
                expirationDate,
                -this.randomInt(
                  5,
                  Math.min(30, this.daysBetween(today, expirationDate)),
                ),
              )
            : null;
        total += quantity * price;
        items.push(
          this.orderItemRepository.create({
            product,
            quantity,
            price_at_purchase: price,
            expiration_date: expirationDate,
            expiration_alert_date: expirationAlertDate,
            batch_number: `BATCH-${input.runId}-${String(i + 1).padStart(4, '0')}-${String(j + 1).padStart(2, '0')}`,
          }),
        );
      }

      const orderDate = this.addDays(today, -this.randomInt(1, 40));
      const deliveryDate =
        Math.random() < 0.7
          ? this.addDays(orderDate, this.randomInt(1, 10))
          : null;

      const order = this.purchaseOrderRepository.create({
        order_number: `PO-${input.runId}-${String(i + 1).padStart(4, '0')}`,
        status: this.pick([
          OrderStatus.PENDING,
          OrderStatus.CONFIRMED,
          OrderStatus.DELIVERED,
        ]),
        order_date: orderDate,
        delivery_date: deliveryDate,
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
    warehouseManagers: User[];
    runId: string;
  }): Promise<void> {
    const existingCount = await this.expenseRepository.count();
    if (existingCount > 0) {
      return;
    }

    const expenses: Expense[] = [];

    for (let i = 0; i < 10; i += 1) {
      const itemsCount = this.randomInt(2, 4);
      const items: ExpenseItem[] = [];
      let total = 0;

      for (let j = 0; j < itemsCount; j += 1) {
        const product = this.pick(input.products);
        const quantity = this.randomNumber(1, 12, 2);
        const price = this.randomNumber(2000, 80000, 2);
        total += quantity * price;
        items.push(
          this.expenseItemRepository.create({
            product,
            quantity,
            warehouse: product.warehouse,
          }),
        );
      }

      const expense = this.expenseRepository.create({
        expense_number: `EXP-${input.runId}-${String(i + 1).padStart(4, '0')}`,
        status: this.pick([
          ExpenseStatus.PENDING_ISSUE,
          ExpenseStatus.PENDING_PHOTO,
          ExpenseStatus.COMPLETED,
        ]),
        type: ExpenseType.USAGE,
        check_image_url: null,
        total_price: Number(total.toFixed(2)),
        manager:
          Math.random() < 0.6 ? this.pick(input.warehouseManagers) : null,
        staff_name: this.pick([
          'Shahnoza Y.',
          'Javlon S.',
          'Muhammad A.',
          'Shirin Q.',
          'Zafar D.',
        ]),
        purpose: this.pick([
          'Klinika ehtiyojlari uchun',
          'Favqulodda holat',
          'Reja asosida xarajat',
          'Profilaktika tadbirlari',
          null,
        ]),
        items,
      });

      for (const item of items) {
        item.expense = expense;
      }

      expenses.push(expense);
    }

    await this.expenseRepository.save(expenses);
  }

  private pick<T>(items: T[]): T {
    return items[Math.floor(Math.random() * items.length)];
  }

  private randomInt(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  private randomNumber(min: number, max: number, decimals = 0): number {
    const value = Math.random() * (max - min) + min;
    return Number(value.toFixed(decimals));
  }

  private addDays(date: Date, days: number): Date {
    const result = new Date(date);
    result.setDate(result.getDate() + days);
    return result;
  }

  private buildRunId(): string {
    const now = new Date();
    const pad = (value: number) => String(value).padStart(2, '0');
    const ms = String(now.getMilliseconds()).padStart(3, '0');
    const rand = String(Math.floor(Math.random() * 100)).padStart(2, '0');
    return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}${ms}${rand}`;
  }

  private daysBetween(start: Date, end: Date): number {
    const ms = end.getTime() - start.getTime();
    return Math.max(1, Math.floor(ms / (24 * 60 * 60 * 1000)));
  }
}
