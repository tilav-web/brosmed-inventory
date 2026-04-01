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
import { Repository } from 'typeorm';
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

interface SeedUsers {
  admin: User;
  warehouse1: User;
  warehouse2: User;
  warehouse3: User;
  accountant: User;
}

interface SeedWarehouses {
  medical: Warehouse;
  kitchen: Warehouse;
  household: Warehouse;
}

interface SeedReferences {
  units: { box: Unit; piece: Unit; pack: Unit; liter: Unit; kg: Unit };
  categories: {
    antibiotics: Category;
    vitamins: Category;
    supplies: Category;
    solutions: Category;
    painkillers: Category;
    antiseptics: Category;
  };
  suppliers: {
    medline: Supplier;
    healthyReserve: Supplier;
    globalMed: Supplier;
    samarkand: Supplier;
  };
}

interface SeedProductDef {
  key: string;
  name: string;
  quantity: number;
  minLimit: number;
  unitKey: keyof SeedReferences['units'];
  categoryKey: keyof SeedReferences['categories'];
  supplierKey: keyof SeedReferences['suppliers'];
  warehouseKey: keyof SeedWarehouses;
  batches: Array<{
    quantity: number;
    price: number;
    expiryDays: number;
    batchNum: string;
    serialNum: string;
  }>;
}

@Injectable()
export class SeedService implements OnApplicationBootstrap {
  private readonly logger = new Logger(SeedService.name);

  constructor(
    private readonly configService: ConfigService,
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

    if (nodeEnv !== 'development' || !shouldSeed) return;

    const hasData = await this.hasExistingData();
    if (hasData) {
      this.logger.log("Seed o'tkazildi: bazada ma'lumot mavjud");
      return;
    }

    this.logger.log('Seed boshlandi...');
    await this.flushRedis();

    const users = await this.seedUsers();
    const warehouses = await this.seedWarehouses(users);
    const refs = await this.seedReferences();
    const { products, batches } = await this.seedProductsAndBatches(
      warehouses,
      refs,
    );
    await this.seedPurchaseOrders(users, warehouses, refs, products);
    await this.seedExpenses(users, warehouses, batches, products);

    this.resetUploadsDir();
    await this.flushRedis();
    this.logSummary(users, warehouses);
  }

  // ─── Helpers ───────────────────────────────────────────────

  private async flushRedis(): Promise<void> {
    try {
      await this.redis.flushdb();
    } catch (e) {
      this.logger.warn(
        `Redis flush: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }

  private addDays(date: Date, days: number): Date {
    const d = new Date(date);
    d.setDate(d.getDate() + days);
    return d;
  }

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
      const expNorm = new Date(exp);
      expNorm.setHours(0, 0, 0, 0);
      if (expNorm < today) s.add(ProductStatus.EXPIRED);
      else {
        const days = Math.ceil(
          (expNorm.getTime() - today.getTime()) / 86400000,
        );
        if (days <= 30) s.add(ProductStatus.EXPIRING_SOON);
      }
    }
    return Array.from(s);
  }

  private buildAlertDate(expDays: number): Date | null {
    if (expDays <= 0) return null;
    return this.addDays(new Date(), expDays > 30 ? expDays - 30 : expDays - 3);
  }

  // ─── Check existing data ──────────────────────────────────

  private async hasExistingData(): Promise<boolean> {
    const count = await this.userRepository.count();
    return count > 0;
  }

  // ─── Users ────────────────────────────────────────────────

  private async seedUsers(): Promise<SeedUsers> {
    const pwd = (key: string, fallback: string) =>
      this.configService.get<string>(key, fallback);
    const hashPwd = (p: string) => hash(p, 10);

    const adminUsername = pwd('ADMIN_USERNAME', 'admin');
    const adminPassword = pwd('ADMIN_PASSWORD', 'admin12345');

    const findOrCreate = async (
      username: string,
      password: string,
      first_name: string,
      last_name: string,
      role: Role,
    ) => {
      const existing = await this.userRepository.findOne({
        where: { username },
      });
      if (existing) return existing;
      return this.userRepository.save(
        this.userRepository.create({
          username,
          password: await hashPwd(password),
          first_name,
          last_name,
          role,
        }),
      );
    };

    const admin = await findOrCreate(
      adminUsername,
      adminPassword,
      'System',
      'Admin',
      Role.ADMIN,
    );
    const warehouse1 = await findOrCreate(
      'warehouse1',
      pwd('WAREHOUSE_PASSWORD', 'warehouse12345'),
      'Ali',
      'Valiyev',
      Role.WAREHOUSE,
    );
    const warehouse2 = await findOrCreate(
      'warehouse2',
      pwd('WAREHOUSE_PASSWORD', 'warehouse12345'),
      'Bekzod',
      'Karimov',
      Role.WAREHOUSE,
    );
    const warehouse3 = await findOrCreate(
      'warehouse3',
      pwd('WAREHOUSE_PASSWORD', 'warehouse12345'),
      'Davron',
      'Rahimov',
      Role.WAREHOUSE,
    );
    const accountant = await findOrCreate(
      pwd('ACCOUNTANT_USERNAME', 'accountant'),
      pwd('ACCOUNTANT_PASSWORD', 'accountant12345'),
      'Nilufar',
      'Toshmatova',
      Role.ACCOUNTANT,
    );

    return { admin, warehouse1, warehouse2, warehouse3, accountant };
  }

  // ─── Warehouses ───────────────────────────────────────────

  private async seedWarehouses(users: SeedUsers): Promise<SeedWarehouses> {
    const findOrCreate = async (
      name: string,
      type: WarehouseType,
      location: string,
      manager: User,
    ) => {
      const existing = await this.warehouseRepository.findOne({
        where: { name },
      });
      if (existing) return existing;
      return this.warehouseRepository.save(
        this.warehouseRepository.create({
          name,
          type,
          location,
          manager,
          manager_id: manager.id,
        }),
      );
    };

    const medical = await findOrCreate(
      'Asosiy tibbiy ombor',
      WarehouseType.MEDICAL,
      "Toshkent sh., Chilonzor tumani, Bog'ishamol ko'chasi 12",
      users.warehouse1,
    );
    const kitchen = await findOrCreate(
      'Oshxona ombori',
      WarehouseType.KITCHEN,
      "Toshkent sh., Yunusobod tumani, Amir Temur ko'chasi 45",
      users.warehouse2,
    );
    const household = await findOrCreate(
      'Maishiy ombor',
      WarehouseType.HOUSEHOLD,
      "Toshkent sh., Mirobod tumani, Navoiy ko'chasi 78",
      users.warehouse3,
    );

    return { medical, kitchen, household };
  }

  // ─── References (units, categories, suppliers) ────────────

  private async seedReferences(): Promise<SeedReferences> {
    const findOrCreateUnit = async (name: string) => {
      const existing = await this.unitRepository.findOne({ where: { name } });
      if (existing) return existing;
      return this.unitRepository.save(this.unitRepository.create({ name }));
    };

    const findOrCreateCategory = async (name: string, description: string) => {
      const existing = await this.categoryRepository.findOne({
        where: { name },
      });
      if (existing) return existing;
      return this.categoryRepository.save(
        this.categoryRepository.create({ name, description }),
      );
    };

    const findOrCreateSupplier = async (
      company_name: string,
      contact_person: string,
      email: string,
      phone: string,
    ) => {
      const existing = await this.supplierRepository.findOne({
        where: { company_name },
      });
      if (existing) return existing;
      return this.categoryRepository.save(
        this.supplierRepository.create({
          company_name,
          contact_person,
          email,
          phone,
        }),
      );
    };

    const [box, piece, pack, liter, kg] = await Promise.all([
      findOrCreateUnit('quti'),
      findOrCreateUnit('dona'),
      findOrCreateUnit('paket'),
      findOrCreateUnit('litr'),
      findOrCreateUnit('kg'),
    ]);

    const [
      antibiotics,
      vitamins,
      supplies,
      solutions,
      painkillers,
      antiseptics,
    ] = await Promise.all([
      findOrCreateCategory('Antibiotiklar', 'Antibakterial dori vositalari'),
      findOrCreateCategory('Vitaminlar', 'Vitamin va mineral komplekslar'),
      findOrCreateCategory(
        'Tibbiy sarf materiallari',
        "Shprits, bint, qo'lqop va boshqa sarf materiallari",
      ),
      findOrCreateCategory(
        'Infuzion eritmalar',
        "Tomchilatuvchi va in'ektsion eritmalar",
      ),
      findOrCreateCategory(
        "Og'riq qoldiruvchi",
        "Analgetik va og'riq qoldiruvchi preparatlar",
      ),
      findOrCreateCategory(
        'Antiseptiklar',
        'Yara davolash va dezinfeksiya vositalari',
      ),
    ]);

    const [medline, healthyReserve, globalMed, samarkand] = await Promise.all([
      findOrCreateSupplier(
        'Medline Pharma Supply',
        'Aziz Karimov',
        'aziz@medline.uz',
        '+998901112233',
      ),
      findOrCreateSupplier(
        'Healthy Reserve Trade',
        'Zarina Ismoilova',
        'zarina@healthyreserve.uz',
        '+998907778899',
      ),
      findOrCreateSupplier(
        'Global Med Import',
        'Jasur Aliyev',
        'jasur@globalmed.uz',
        '+998933445566',
      ),
      findOrCreateSupplier(
        'Samarqand Farm',
        'Dilshod Umarov',
        'dilshod@samarkandfarm.uz',
        '+998909998877',
      ),
    ]);

    return {
      units: { box, piece, pack, liter, kg },
      categories: {
        antibiotics,
        vitamins,
        supplies,
        solutions,
        painkillers,
        antiseptics,
      },
      suppliers: { medline, healthyReserve, globalMed, samarkand },
    };
  }

  // ─── Products & Batches ───────────────────────────────────

  private async seedProductsAndBatches(
    warehouses: SeedWarehouses,
    refs: SeedReferences,
  ): Promise<{
    products: Record<string, Product>;
    batches: Record<string, ProductBatch[]>;
  }> {
    const defs: SeedProductDef[] = [
      // ── Tibbiy ombor (medical) ──────────────────────────
      {
        key: 'amoxicillin',
        name: 'Amoksitsillin 500mg',
        quantity: 280,
        minLimit: 30,
        unitKey: 'box',
        categoryKey: 'antibiotics',
        supplierKey: 'medline',
        warehouseKey: 'medical',
        batches: [
          {
            quantity: 120,
            price: 22000,
            expiryDays: 360,
            batchNum: 'B-2026-001',
            serialNum: 'S-AMX-001',
          },
          {
            quantity: 160,
            price: 24000,
            expiryDays: 300,
            batchNum: 'B-2026-002',
            serialNum: 'S-AMX-002',
          },
        ],
      },
      {
        key: 'paracetamol',
        name: 'Paratsetamol 500mg',
        quantity: 52,
        minLimit: 20,
        unitKey: 'box',
        categoryKey: 'painkillers',
        supplierKey: 'healthyReserve',
        warehouseKey: 'medical',
        batches: [
          {
            quantity: 30,
            price: 10800,
            expiryDays: 200,
            batchNum: 'B-2026-003',
            serialNum: 'S-PCT-001',
          },
          {
            quantity: 22,
            price: 12000,
            expiryDays: 15,
            batchNum: 'B-2026-004',
            serialNum: 'S-PCT-002',
          },
        ],
      },
      {
        key: 'syringe5ml',
        name: 'Shprits 5ml',
        quantity: 500,
        minLimit: 100,
        unitKey: 'piece',
        categoryKey: 'supplies',
        supplierKey: 'medline',
        warehouseKey: 'medical',
        batches: [
          {
            quantity: 300,
            price: 1200,
            expiryDays: 720,
            batchNum: 'B-2026-005',
            serialNum: 'S-SYR-001',
          },
          {
            quantity: 200,
            price: 1500,
            expiryDays: 600,
            batchNum: 'B-2026-006',
            serialNum: 'S-SYR-002',
          },
        ],
      },
      {
        key: 'syringe10ml',
        name: 'Shprits 10ml',
        quantity: 350,
        minLimit: 80,
        unitKey: 'piece',
        categoryKey: 'supplies',
        supplierKey: 'medline',
        warehouseKey: 'medical',
        batches: [
          {
            quantity: 200,
            price: 1800,
            expiryDays: 700,
            batchNum: 'B-2026-007',
            serialNum: 'S-SY10-001',
          },
          {
            quantity: 150,
            price: 2000,
            expiryDays: 650,
            batchNum: 'B-2026-008',
            serialNum: 'S-SY10-002',
          },
        ],
      },
      {
        key: 'bandage',
        name: 'Bint steril 10m',
        quantity: 65,
        minLimit: 30,
        unitKey: 'piece',
        categoryKey: 'supplies',
        supplierKey: 'healthyReserve',
        warehouseKey: 'medical',
        batches: [
          {
            quantity: 40,
            price: 3000,
            expiryDays: 400,
            batchNum: 'B-2026-009',
            serialNum: 'S-BND-001',
          },
          {
            quantity: 25,
            price: 3200,
            expiryDays: 80,
            batchNum: 'B-2026-010',
            serialNum: 'S-BND-002',
          },
        ],
      },
      {
        key: 'saline500',
        name: 'Natriy xlorid 0.9% 500ml',
        quantity: 18,
        minLimit: 20,
        unitKey: 'box',
        categoryKey: 'solutions',
        supplierKey: 'globalMed',
        warehouseKey: 'medical',
        batches: [
          {
            quantity: 10,
            price: 8500,
            expiryDays: -3,
            batchNum: 'B-2025-050',
            serialNum: 'S-SAL-001',
          },
          {
            quantity: 8,
            price: 9000,
            expiryDays: 180,
            batchNum: 'B-2026-011',
            serialNum: 'S-SAL-002',
          },
        ],
      },
      {
        key: 'glucose',
        name: 'Glyukoza 5% 400ml',
        quantity: 45,
        minLimit: 15,
        unitKey: 'box',
        categoryKey: 'solutions',
        supplierKey: 'globalMed',
        warehouseKey: 'medical',
        batches: [
          {
            quantity: 25,
            price: 7500,
            expiryDays: 250,
            batchNum: 'B-2026-012',
            serialNum: 'S-GLU-001',
          },
          {
            quantity: 20,
            price: 8000,
            expiryDays: 200,
            batchNum: 'B-2026-013',
            serialNum: 'S-GLU-002',
          },
        ],
      },
      {
        key: 'vitaminC',
        name: 'C Vitamin 1000mg',
        quantity: 25,
        minLimit: 15,
        unitKey: 'box',
        categoryKey: 'vitamins',
        supplierKey: 'healthyReserve',
        warehouseKey: 'medical',
        batches: [
          {
            quantity: 15,
            price: 16500,
            expiryDays: 28,
            batchNum: 'B-2026-014',
            serialNum: 'S-VTC-001',
          },
          {
            quantity: 10,
            price: 18000,
            expiryDays: 180,
            batchNum: 'B-2026-015',
            serialNum: 'S-VTC-002',
          },
        ],
      },
      {
        key: 'ibuprofen',
        name: 'Ibuprofen 400mg',
        quantity: 80,
        minLimit: 20,
        unitKey: 'box',
        categoryKey: 'painkillers',
        supplierKey: 'samarkand',
        warehouseKey: 'medical',
        batches: [
          {
            quantity: 50,
            price: 14000,
            expiryDays: 320,
            batchNum: 'B-2026-016',
            serialNum: 'S-IBU-001',
          },
          {
            quantity: 30,
            price: 15500,
            expiryDays: 280,
            batchNum: 'B-2026-017',
            serialNum: 'S-IBU-002',
          },
        ],
      },
      {
        key: 'chlorhexidine',
        name: 'Xlorgeksidin 0.05% 1l',
        quantity: 30,
        minLimit: 10,
        unitKey: 'liter',
        categoryKey: 'antiseptics',
        supplierKey: 'medline',
        warehouseKey: 'medical',
        batches: [
          {
            quantity: 18,
            price: 12000,
            expiryDays: 360,
            batchNum: 'B-2026-018',
            serialNum: 'S-CHX-001',
          },
          {
            quantity: 12,
            price: 13000,
            expiryDays: 300,
            batchNum: 'B-2026-019',
            serialNum: 'S-CHX-002',
          },
        ],
      },
      {
        key: 'gloves',
        name: "Nitril qo'lqop (100 dona)",
        quantity: 15,
        minLimit: 10,
        unitKey: 'pack',
        categoryKey: 'supplies',
        supplierKey: 'globalMed',
        warehouseKey: 'medical',
        batches: [
          {
            quantity: 10,
            price: 45000,
            expiryDays: 500,
            batchNum: 'B-2026-020',
            serialNum: 'S-GLV-001',
          },
          {
            quantity: 5,
            price: 48000,
            expiryDays: 480,
            batchNum: 'B-2026-021',
            serialNum: 'S-GLV-002',
          },
        ],
      },

      // ── Oshxona ombori (kitchen) ────────────────────────
      {
        key: 'sugar',
        name: 'Shakar',
        quantity: 200,
        minLimit: 50,
        unitKey: 'kg',
        categoryKey: 'supplies',
        supplierKey: 'healthyReserve',
        warehouseKey: 'kitchen',
        batches: [
          {
            quantity: 120,
            price: 12000,
            expiryDays: 360,
            batchNum: 'B-2026-022',
            serialNum: 'S-SGR-001',
          },
          {
            quantity: 80,
            price: 13500,
            expiryDays: 300,
            batchNum: 'B-2026-023',
            serialNum: 'S-SGR-002',
          },
        ],
      },
      {
        key: 'flour',
        name: 'Un 1-nav',
        quantity: 150,
        minLimit: 40,
        unitKey: 'kg',
        categoryKey: 'supplies',
        supplierKey: 'samarkand',
        warehouseKey: 'kitchen',
        batches: [
          {
            quantity: 100,
            price: 8000,
            expiryDays: 180,
            batchNum: 'B-2026-024',
            serialNum: 'S-FLR-001',
          },
          {
            quantity: 50,
            price: 8500,
            expiryDays: 150,
            batchNum: 'B-2026-025',
            serialNum: 'S-FLR-002',
          },
        ],
      },
      {
        key: 'oil',
        name: "O'simlik yog'i",
        quantity: 60,
        minLimit: 20,
        unitKey: 'liter',
        categoryKey: 'supplies',
        supplierKey: 'healthyReserve',
        warehouseKey: 'kitchen',
        batches: [
          {
            quantity: 35,
            price: 18000,
            expiryDays: 240,
            batchNum: 'B-2026-026',
            serialNum: 'S-OIL-001',
          },
          {
            quantity: 25,
            price: 19500,
            expiryDays: 200,
            batchNum: 'B-2026-027',
            serialNum: 'S-OIL-002',
          },
        ],
      },
      {
        key: 'rice',
        name: 'Guruch',
        quantity: 180,
        minLimit: 50,
        unitKey: 'kg',
        categoryKey: 'supplies',
        supplierKey: 'samarkand',
        warehouseKey: 'kitchen',
        batches: [
          {
            quantity: 100,
            price: 15000,
            expiryDays: 400,
            batchNum: 'B-2026-028',
            serialNum: 'S-RCE-001',
          },
          {
            quantity: 80,
            price: 16000,
            expiryDays: 360,
            batchNum: 'B-2026-029',
            serialNum: 'S-RCE-002',
          },
        ],
      },
      {
        key: 'pasta',
        name: 'Makaron',
        quantity: 8,
        minLimit: 20,
        unitKey: 'kg',
        categoryKey: 'supplies',
        supplierKey: 'healthyReserve',
        warehouseKey: 'kitchen',
        batches: [
          {
            quantity: 8,
            price: 9000,
            expiryDays: -10,
            batchNum: 'B-2025-055',
            serialNum: 'S-PST-001',
          },
        ],
      },

      // ── Maishiy ombor (household) ───────────────────────
      {
        key: 'detergent',
        name: 'Kir yuvish kukuni',
        quantity: 40,
        minLimit: 10,
        unitKey: 'kg',
        categoryKey: 'supplies',
        supplierKey: 'globalMed',
        warehouseKey: 'household',
        batches: [
          {
            quantity: 25,
            price: 35000,
            expiryDays: 500,
            batchNum: 'B-2026-030',
            serialNum: 'S-DET-001',
          },
          {
            quantity: 15,
            price: 38000,
            expiryDays: 480,
            batchNum: 'B-2026-031',
            serialNum: 'S-DET-002',
          },
        ],
      },
      {
        key: 'soap',
        name: 'Suyuq sovun 5l',
        quantity: 22,
        minLimit: 8,
        unitKey: 'liter',
        categoryKey: 'supplies',
        supplierKey: 'globalMed',
        warehouseKey: 'household',
        batches: [
          {
            quantity: 12,
            price: 28000,
            expiryDays: 450,
            batchNum: 'B-2026-032',
            serialNum: 'S-SOP-001',
          },
          {
            quantity: 10,
            price: 30000,
            expiryDays: 420,
            batchNum: 'B-2026-033',
            serialNum: 'S-SOP-002',
          },
        ],
      },
      {
        key: 'trashBags',
        name: 'Chiqindi paketlari (100 dona)',
        quantity: 35,
        minLimit: 10,
        unitKey: 'pack',
        categoryKey: 'supplies',
        supplierKey: 'healthyReserve',
        warehouseKey: 'household',
        batches: [
          {
            quantity: 20,
            price: 22000,
            expiryDays: 800,
            batchNum: 'B-2026-034',
            serialNum: 'S-TRB-001',
          },
          {
            quantity: 15,
            price: 24000,
            expiryDays: 780,
            batchNum: 'B-2026-035',
            serialNum: 'S-TRB-002',
          },
        ],
      },
      {
        key: 'disinfectant',
        name: 'Bartaraflovchi eritma 5l',
        quantity: 28,
        minLimit: 8,
        unitKey: 'liter',
        categoryKey: 'antiseptics',
        supplierKey: 'medline',
        warehouseKey: 'household',
        batches: [
          {
            quantity: 16,
            price: 32000,
            expiryDays: 360,
            batchNum: 'B-2026-036',
            serialNum: 'S-DIS-001',
          },
          {
            quantity: 12,
            price: 34000,
            expiryDays: 340,
            batchNum: 'B-2026-037',
            serialNum: 'S-DIS-002',
          },
        ],
      },
      {
        key: 'tissue',
        name: 'Bir martalik sochiq',
        quantity: 50,
        minLimit: 15,
        unitKey: 'pack',
        categoryKey: 'supplies',
        supplierKey: 'healthyReserve',
        warehouseKey: 'household',
        batches: [
          {
            quantity: 30,
            price: 15000,
            expiryDays: 600,
            batchNum: 'B-2026-038',
            serialNum: 'S-TSU-001',
          },
          {
            quantity: 20,
            price: 16500,
            expiryDays: 580,
            batchNum: 'B-2026-039',
            serialNum: 'S-TSU-002',
          },
        ],
      },
    ];

    const products: Record<string, Product> = {};
    const batches: Record<string, ProductBatch[]> = {};
    let batchIdx = 1;

    for (const def of defs) {
      const unit = refs.units[def.unitKey];
      const cat = refs.categories[def.categoryKey];
      const sup = refs.suppliers[def.supplierKey];
      const wh = warehouses[def.warehouseKey];
      const totalQty = def.batches.reduce((s, b) => s + b.quantity, 0);
      const lastExpiry = Math.max(...def.batches.map((b) => b.expiryDays));
      const expDate =
        lastExpiry > 0 ? this.addDays(new Date(), lastExpiry) : null;

      const product = await this.productRepository.save(
        this.productRepository.create({
          name: def.name,
          quantity: totalQty,
          unit: unit.name,
          unit_reference: unit,
          unit_id: unit.id,
          min_limit: def.minLimit,
          supplier: sup,
          supplier_id: sup.id,
          category: cat,
          category_id: cat.id,
          warehouse: wh,
          warehouse_id: wh.id,
          statuses: this.buildStatuses(totalQty, def.minLimit, expDate),
          expiration_date: expDate,
          expiration_alert_date: this.buildAlertDate(lastExpiry),
        }),
      );

      const productBatches: ProductBatch[] = [];
      for (const bd of def.batches) {
        const exp =
          bd.expiryDays > 0 ? this.addDays(new Date(), bd.expiryDays) : null;
        const batch = await this.productBatchRepository.save(
          this.productBatchRepository.create({
            product,
            product_id: product.id,
            warehouse: wh,
            warehouse_id: wh.id,
            supplier: sup,
            supplier_id: sup.id,
            quantity: bd.quantity,
            price_at_purchase: bd.price,
            expiration_date: exp,
            expiration_alert_date: this.buildAlertDate(bd.expiryDays),
            batch_number: `${bd.batchNum}-${String(batchIdx).padStart(3, '0')}`,
            serial_number: `${bd.serialNum}-${String(batchIdx).padStart(3, '0')}`,
            depleted_at: null,
          }),
        );
        productBatches.push(batch);
        batchIdx++;
      }

      products[def.key] = product;
      batches[def.key] = productBatches;
    }

    return { products, batches };
  }

  // ─── Purchase Orders ──────────────────────────────────────

  private async seedPurchaseOrders(
    users: SeedUsers,
    warehouses: SeedWarehouses,
    refs: SeedReferences,
    products: Record<string, Product>,
  ): Promise<void> {
    const year = new Date().getFullYear();
    const today = new Date();

    const orderDefs = [
      {
        number: `PO-${year}-001`,
        status: OrderStatus.PENDING,
        supplier: refs.suppliers.medline,
        warehouse: warehouses.medical,
        orderDate: this.addDays(today, -1),
        deliveryDate: this.addDays(today, 5),
        items: [
          { product: products.amoxicillin, qty: 50, price: 22000 },
          { product: products.syringe5ml, qty: 200, price: 1200 },
        ],
      },
      {
        number: `PO-${year}-002`,
        status: OrderStatus.PENDING,
        supplier: refs.suppliers.healthyReserve,
        warehouse: warehouses.medical,
        orderDate: this.addDays(today, -2),
        deliveryDate: this.addDays(today, 3),
        items: [
          { product: products.bandage, qty: 40, price: 2800 },
          { product: products.gloves, qty: 10, price: 44000 },
        ],
      },
      {
        number: `PO-${year}-003`,
        status: OrderStatus.CONFIRMED,
        supplier: refs.suppliers.globalMed,
        warehouse: warehouses.medical,
        orderDate: this.addDays(today, -5),
        deliveryDate: this.addDays(today, 2),
        decidedAt: this.addDays(today, -4),
        items: [
          { product: products.saline500, qty: 30, price: 8200 },
          { product: products.glucose, qty: 20, price: 7200 },
        ],
      },
      {
        number: `PO-${year}-004`,
        status: OrderStatus.CONFIRMED,
        supplier: refs.suppliers.samarkand,
        warehouse: warehouses.medical,
        orderDate: this.addDays(today, -6),
        deliveryDate: this.addDays(today, 1),
        decidedAt: this.addDays(today, -5),
        items: [{ product: products.ibuprofen, qty: 30, price: 13500 }],
      },
      {
        number: `PO-${year}-005`,
        status: OrderStatus.DELIVERED,
        isReceived: true,
        supplier: refs.suppliers.medline,
        warehouse: warehouses.medical,
        orderDate: this.addDays(today, -15),
        deliveryDate: this.addDays(today, -8),
        decidedAt: this.addDays(today, -14),
        receivedAt: this.addDays(today, -8),
        items: [
          { product: products.amoxicillin, qty: 40, price: 21000 },
          { product: products.chlorhexidine, qty: 10, price: 11500 },
        ],
      },
      {
        number: `PO-${year}-006`,
        status: OrderStatus.DELIVERED,
        isReceived: true,
        supplier: refs.suppliers.healthyReserve,
        warehouse: warehouses.medical,
        orderDate: this.addDays(today, -20),
        deliveryDate: this.addDays(today, -12),
        decidedAt: this.addDays(today, -19),
        receivedAt: this.addDays(today, -12),
        items: [
          { product: products.paracetamol, qty: 30, price: 10500 },
          { product: products.vitaminC, qty: 20, price: 16000 },
        ],
      },
      {
        number: `PO-${year}-007`,
        status: OrderStatus.DELIVERED,
        isReceived: true,
        supplier: refs.suppliers.globalMed,
        warehouse: warehouses.medical,
        orderDate: this.addDays(today, -25),
        deliveryDate: this.addDays(today, -18),
        decidedAt: this.addDays(today, -24),
        receivedAt: this.addDays(today, -18),
        items: [
          { product: products.syringe5ml, qty: 150, price: 1100 },
          { product: products.syringe10ml, qty: 100, price: 1700 },
        ],
      },
      {
        number: `PO-${year}-008`,
        status: OrderStatus.CANCELLED,
        supplier: refs.suppliers.samarkand,
        warehouse: warehouses.medical,
        orderDate: this.addDays(today, -10),
        deliveryDate: this.addDays(today, 4),
        decidedAt: this.addDays(today, -9),
        items: [{ product: products.saline500, qty: 20, price: 8800 }],
      },
      // Kitchen orders
      {
        number: `PO-${year}-009`,
        status: OrderStatus.DELIVERED,
        isReceived: true,
        supplier: refs.suppliers.healthyReserve,
        warehouse: warehouses.kitchen,
        orderDate: this.addDays(today, -12),
        deliveryDate: this.addDays(today, -6),
        decidedAt: this.addDays(today, -11),
        receivedAt: this.addDays(today, -6),
        items: [
          { product: products.sugar, qty: 100, price: 11500 },
          { product: products.oil, qty: 30, price: 17000 },
        ],
      },
      {
        number: `PO-${year}-010`,
        status: OrderStatus.CONFIRMED,
        supplier: refs.suppliers.samarkand,
        warehouse: warehouses.kitchen,
        orderDate: this.addDays(today, -3),
        deliveryDate: this.addDays(today, 4),
        decidedAt: this.addDays(today, -2),
        items: [
          { product: products.flour, qty: 80, price: 7800 },
          { product: products.rice, qty: 60, price: 14500 },
        ],
      },
      {
        number: `PO-${year}-011`,
        status: OrderStatus.PENDING,
        supplier: refs.suppliers.healthyReserve,
        warehouse: warehouses.kitchen,
        orderDate: this.addDays(today, -1),
        deliveryDate: this.addDays(today, 6),
        items: [{ product: products.pasta, qty: 30, price: 8500 }],
      },
      // Household orders
      {
        number: `PO-${year}-012`,
        status: OrderStatus.DELIVERED,
        isReceived: true,
        supplier: refs.suppliers.globalMed,
        warehouse: warehouses.household,
        orderDate: this.addDays(today, -18),
        deliveryDate: this.addDays(today, -10),
        decidedAt: this.addDays(today, -17),
        receivedAt: this.addDays(today, -10),
        items: [
          { product: products.detergent, qty: 20, price: 33000 },
          { product: products.soap, qty: 15, price: 27000 },
        ],
      },
      {
        number: `PO-${year}-013`,
        status: OrderStatus.PENDING,
        supplier: refs.suppliers.healthyReserve,
        warehouse: warehouses.household,
        orderDate: today,
        deliveryDate: this.addDays(today, 7),
        items: [
          { product: products.tissue, qty: 25, price: 14500 },
          { product: products.trashBags, qty: 15, price: 21000 },
        ],
      },
    ];

    for (const od of orderDefs) {
      const totalAmount = od.items.reduce((s, i) => s + i.qty * i.price, 0);
      const orderItems = od.items.map((i) =>
        this.orderItemRepository.create({
          product: i.product,
          product_id: i.product.id,
          quantity: i.qty,
          price_at_purchase: i.price,
        }),
      );

      const order = this.purchaseOrderRepository.create({
        order_number: od.number,
        status: od.status,
        is_received: od.isReceived ?? false,
        created_by_id: users.accountant.id,
        decided_by_id:
          od.status === OrderStatus.PENDING ? null : users.admin.id,
        decided_at: od.decidedAt ?? null,
        received_by_id: od.isReceived ? users.warehouse1.id : null,
        received_at: od.receivedAt ?? null,
        order_date: od.orderDate,
        delivery_date: od.deliveryDate,
        total_amount: Number(totalAmount.toFixed(2)),
        supplier: od.supplier,
        supplier_id: od.supplier.id,
        warehouse: od.warehouse,
        warehouse_id: od.warehouse.id,
        items: orderItems,
      });

      for (const item of orderItems) {
        item.purchase_order = order;
      }
      await this.purchaseOrderRepository.save(order);
    }
  }

  // ─── Expenses ─────────────────────────────────────────────

  private async seedExpenses(
    users: SeedUsers,
    warehouses: SeedWarehouses,
    batches: Record<string, ProductBatch[]>,
    products: Record<string, Product>,
  ): Promise<void> {
    const year = new Date().getFullYear();
    const today = new Date();

    const getBatch = (key: string, idx: number) => batches[key]?.[idx];

    const expenseDefs = [
      // ── Medical warehouse expenses ──
      {
        number: `EXP-${year}-001`,
        status: ExpenseStatus.CREATED,
        type: ExpenseType.USAGE,
        staffName: "Terapiya bo'limi - hamshira Dilnoza",
        purpose: 'Kunlik bemorlar uchun dori-darmon',
        warehouse: warehouses.medical,
        createdAt: this.addDays(today, -1),
        items: [
          { batch: getBatch('paracetamol', 0), qty: 5 },
          { batch: getBatch('bandage', 0), qty: 8 },
        ],
      },
      {
        number: `EXP-${year}-002`,
        status: ExpenseStatus.CREATED,
        type: ExpenseType.USAGE,
        staffName: "Jarrohlik bo'limi - vrach Anvar",
        purpose: 'Operatsiya uchun materiallar',
        warehouse: warehouses.medical,
        createdAt: this.addDays(today, -1),
        items: [
          { batch: getBatch('syringe5ml', 0), qty: 30 },
          { batch: getBatch('gloves', 0), qty: 2 },
        ],
      },
      {
        number: `EXP-${year}-003`,
        status: ExpenseStatus.ISSUED,
        type: ExpenseType.USAGE,
        staffName: 'Poliklinika - hamshira Mohira',
        purpose: 'Poliklinikaga dori berildi',
        warehouse: warehouses.medical,
        createdAt: this.addDays(today, -2),
        issuedAt: this.addDays(today, -1),
        items: [
          { batch: getBatch('amoxicillin', 0), qty: 10 },
          { batch: getBatch('ibuprofen', 0), qty: 8 },
        ],
      },
      {
        number: `EXP-${year}-004`,
        status: ExpenseStatus.ISSUED,
        type: ExpenseType.USAGE,
        staffName: "Kardiologiya bo'limi - vrach Rustam",
        purpose: 'Bemorlar uchun vitamin va dori',
        warehouse: warehouses.medical,
        createdAt: this.addDays(today, -3),
        issuedAt: this.addDays(today, -2),
        items: [
          { batch: getBatch('vitaminC', 0), qty: 5 },
          { batch: getBatch('paracetamol', 0), qty: 3 },
        ],
      },
      {
        number: `EXP-${year}-005`,
        status: ExpenseStatus.ISSUED,
        type: ExpenseType.USAGE,
        staffName: 'Reanimatsiya - hamshira Nodira',
        purpose: 'Reanimatsiya uchun shoshilinch material',
        warehouse: warehouses.medical,
        createdAt: this.addDays(today, -4),
        issuedAt: this.addDays(today, -3),
        items: [
          { batch: getBatch('saline500', 1), qty: 4 },
          { batch: getBatch('glucose', 0), qty: 6 },
          { batch: getBatch('syringe10ml', 0), qty: 15 },
        ],
      },
      {
        number: `EXP-${year}-006`,
        status: ExpenseStatus.ISSUED,
        type: ExpenseType.USAGE,
        staffName: 'Laboratoriya - laborant Kamola',
        purpose: 'Laboratoriya tekshiruvi uchun',
        warehouse: warehouses.medical,
        createdAt: this.addDays(today, -5),
        issuedAt: this.addDays(today, -4),
        items: [
          { batch: getBatch('syringe5ml', 1), qty: 25 },
          { batch: getBatch('gloves', 1), qty: 3 },
        ],
      },
      {
        number: `EXP-${year}-007`,
        status: ExpenseStatus.ISSUED,
        type: ExpenseType.USAGE,
        staffName: "Qabul bo'limi - hamshira Feruza",
        purpose: 'Tez yordam kelgan bemorlar uchun',
        warehouse: warehouses.medical,
        createdAt: this.addDays(today, -6),
        issuedAt: this.addDays(today, -5),
        items: [
          { batch: getBatch('amoxicillin', 1), qty: 12 },
          { batch: getBatch('bandage', 1), qty: 10 },
          { batch: getBatch('chlorhexidine', 0), qty: 3 },
        ],
      },
      {
        number: `EXP-${year}-008`,
        status: ExpenseStatus.ISSUED,
        type: ExpenseType.USAGE,
        staffName: 'Pediatriya - vrach Shahzoda',
        purpose: "Bolalar bo'limiga dori berildi",
        warehouse: warehouses.medical,
        createdAt: this.addDays(today, -8),
        issuedAt: this.addDays(today, -7),
        items: [
          { batch: getBatch('paracetamol', 0), qty: 6 },
          { batch: getBatch('syringe5ml', 0), qty: 20 },
        ],
      },
      {
        number: `EXP-${year}-009`,
        status: ExpenseStatus.CANCELLED,
        type: ExpenseType.USAGE,
        staffName: 'Travmatologiya - vrach Otabek',
        purpose: "Bekor qilindi: bemor ko'chirildi",
        warehouse: warehouses.medical,
        createdAt: this.addDays(today, -7),
        cancelledAt: this.addDays(today, -6),
        items: [{ batch: getBatch('ibuprofen', 1), qty: 5 }],
      },
      {
        number: `EXP-${year}-010`,
        status: ExpenseStatus.CANCELLED,
        type: ExpenseType.USAGE,
        staffName: 'Yuqumli kasalliklar - vrach Sanjar',
        purpose: 'Bekor qilindi: alternativ dori buyurildi',
        warehouse: warehouses.medical,
        createdAt: this.addDays(today, -5),
        cancelledAt: this.addDays(today, -4),
        items: [{ batch: getBatch('amoxicillin', 0), qty: 8 }],
      },
      {
        number: `EXP-${year}-011`,
        status: ExpenseStatus.ISSUED,
        type: ExpenseType.EXPIRED,
        staffName: 'Ombor nazorati',
        purpose: "Muddati o'tgan mahsulotlar yechildi",
        warehouse: warehouses.medical,
        createdAt: this.addDays(today, -10),
        issuedAt: this.addDays(today, -9),
        items: [{ batch: getBatch('saline500', 0), qty: 10 }],
      },
      {
        number: `EXP-${year}-012`,
        status: ExpenseStatus.ISSUED,
        type: ExpenseType.USAGE,
        staffName: 'Stomatologiya - vrach Laylo',
        purpose: "Stomatologiya bo'limi uchun sarf material",
        warehouse: warehouses.medical,
        createdAt: this.addDays(today, -9),
        issuedAt: this.addDays(today, -8),
        items: [
          { batch: getBatch('syringe5ml', 1), qty: 15 },
          { batch: getBatch('gloves', 0), qty: 2 },
          { batch: getBatch('chlorhexidine', 1), qty: 2 },
        ],
      },

      // ── Kitchen expenses ──
      {
        number: `EXP-${year}-013`,
        status: ExpenseStatus.CREATED,
        type: ExpenseType.USAGE,
        staffName: "Oshxona boshlig'i - Karim aka",
        purpose: 'Kunlik ovqat tayyorlash uchun',
        warehouse: warehouses.kitchen,
        createdAt: this.addDays(today, -1),
        items: [
          { batch: getBatch('sugar', 0), qty: 15 },
          { batch: getBatch('oil', 0), qty: 5 },
        ],
      },
      {
        number: `EXP-${year}-014`,
        status: ExpenseStatus.ISSUED,
        type: ExpenseType.USAGE,
        staffName: "Oshxona boshlig'i - Karim aka",
        purpose: 'Haftalik oziq-ovqat sarfi',
        warehouse: warehouses.kitchen,
        createdAt: this.addDays(today, -3),
        issuedAt: this.addDays(today, -2),
        items: [
          { batch: getBatch('flour', 0), qty: 25 },
          { batch: getBatch('rice', 0), qty: 20 },
        ],
      },
      {
        number: `EXP-${year}-015`,
        status: ExpenseStatus.ISSUED,
        type: ExpenseType.USAGE,
        staffName: "Oshxona boshlig'i - Karim aka",
        purpose: 'Maxsus tadbir uchun oziq-ovqat',
        warehouse: warehouses.kitchen,
        createdAt: this.addDays(today, -5),
        issuedAt: this.addDays(today, -4),
        items: [
          { batch: getBatch('sugar', 1), qty: 10 },
          { batch: getBatch('flour', 1), qty: 15 },
          { batch: getBatch('oil', 1), qty: 8 },
        ],
      },
      {
        number: `EXP-${year}-016`,
        status: ExpenseStatus.CANCELLED,
        type: ExpenseType.USAGE,
        staffName: "Oshxona boshlig'i - Karim aka",
        purpose: 'Bekor qilindi: tadbir qoldirildi',
        warehouse: warehouses.kitchen,
        createdAt: this.addDays(today, -7),
        cancelledAt: this.addDays(today, -6),
        items: [{ batch: getBatch('rice', 1), qty: 15 }],
      },
      {
        number: `EXP-${year}-017`,
        status: ExpenseStatus.ISSUED,
        type: ExpenseType.EXPIRED,
        staffName: 'Ombor nazorati',
        purpose: "Muddati o'tgan makaron yechildi",
        warehouse: warehouses.kitchen,
        createdAt: this.addDays(today, -2),
        issuedAt: this.addDays(today, -1),
        items: [{ batch: getBatch('pasta', 0), qty: 8 }],
      },

      // ── Household expenses ──
      {
        number: `EXP-${year}-018`,
        status: ExpenseStatus.CREATED,
        type: ExpenseType.USAGE,
        staffName: 'Tozalash xizmati - Gulnora',
        purpose: 'Haftalik tozalash materiallari',
        warehouse: warehouses.household,
        createdAt: this.addDays(today, -1),
        items: [
          { batch: getBatch('detergent', 0), qty: 5 },
          { batch: getBatch('trashBags', 0), qty: 4 },
        ],
      },
      {
        number: `EXP-${year}-019`,
        status: ExpenseStatus.ISSUED,
        type: ExpenseType.USAGE,
        staffName: 'Tozalash xizmati - Gulnora',
        purpose: 'Kunlik dezinfeksiya uchun',
        warehouse: warehouses.household,
        createdAt: this.addDays(today, -4),
        issuedAt: this.addDays(today, -3),
        items: [
          { batch: getBatch('disinfectant', 0), qty: 3 },
          { batch: getBatch('soap', 0), qty: 2 },
        ],
      },
      {
        number: `EXP-${year}-020`,
        status: ExpenseStatus.ISSUED,
        type: ExpenseType.USAGE,
        staffName: 'Tozalash xizmati - Gulnora',
        purpose: "Barcha bo'limlar uchun sochiq va sovun",
        warehouse: warehouses.household,
        createdAt: this.addDays(today, -6),
        issuedAt: this.addDays(today, -5),
        items: [
          { batch: getBatch('tissue', 0), qty: 8 },
          { batch: getBatch('soap', 1), qty: 3 },
        ],
      },
      {
        number: `EXP-${year}-021`,
        status: ExpenseStatus.CANCELLED,
        type: ExpenseType.USAGE,
        staffName: 'Tozalash xizmati - Gulnora',
        purpose: 'Bekor qilindi: material yetarli edi',
        warehouse: warehouses.household,
        createdAt: this.addDays(today, -8),
        cancelledAt: this.addDays(today, -7),
        items: [{ batch: getBatch('detergent', 1), qty: 3 }],
      },
    ];

    for (const ed of expenseDefs) {
      const validItems = ed.items.filter((i) => i.batch != null);
      if (validItems.length === 0) continue;

      const totalPrice = validItems.reduce(
        (s, i) => s + i.qty * Number(i.batch!.price_at_purchase),
        0,
      );

      const expenseItems = validItems.map((i) =>
        this.expenseItemRepository.create({
          product: i.batch!.product,
          warehouse: ed.warehouse,
          product_batch: i.batch!,
          product_batch_id: i.batch!.id,
          quantity: i.qty,
        }),
      );

      const expense = this.expenseRepository.create({
        expense_number: ed.number,
        status: ed.status,
        type: ed.type,
        total_price: Number(totalPrice.toFixed(2)),
        manager_id: users.accountant.id,
        issued_by_id: ed.issuedAt ? users.warehouse1.id : null,
        issued_at: ed.issuedAt ?? null,
        cancelled_by_id: ed.cancelledAt ? users.admin.id : null,
        cancelled_at: ed.cancelledAt ?? null,
        staff_name: ed.staffName,
        purpose: ed.purpose,
        items: expenseItems,
        createdAt: ed.createdAt,
      });

      for (const item of expenseItems) {
        item.expense = expense;
      }
      await this.expenseRepository.save(expense);
    }
  }

  // ─── Uploads dir ──────────────────────────────────────────

  private resetUploadsDir(): void {
    const checksDir = join(process.cwd(), 'uploads', 'checks');
    rmSync(checksDir, { recursive: true, force: true });
    mkdirSync(checksDir, { recursive: true });

    const svg = (label: string, color: string) =>
      `
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800" viewBox="0 0 1200 800">
  <rect width="1200" height="800" fill="#f8fafc"/>
  <rect x="60" y="60" width="1080" height="680" rx="32" fill="#fff" stroke="#e2e8f0" stroke-width="6"/>
  <rect x="120" y="120" width="180" height="56" rx="16" fill="${color}" opacity="0.12"/>
  <text x="140" y="156" font-family="Arial" font-size="28" fill="${color}">${label}</text>
  <text x="120" y="260" font-family="Arial" font-size="46" fill="#0f172a">Brosmed Inventory</text>
  <text x="120" y="330" font-family="Arial" font-size="30" fill="#475569">Seed demo chek</text>
</svg>`.trim();

    writeFileSync(
      join(checksDir, 'seed-check-1.svg'),
      svg('Seed Check 1', '#2563eb'),
      'utf8',
    );
    writeFileSync(
      join(checksDir, 'seed-check-2.svg'),
      svg('Seed Check 2', '#ea580c'),
      'utf8',
    );
  }

  // ─── Summary ──────────────────────────────────────────────

  private logSummary(users: SeedUsers, warehouses: SeedWarehouses): void {
    const adminPwd = this.configService.get('ADMIN_PASSWORD', 'admin12345');
    const whPwd = this.configService.get(
      'WAREHOUSE_PASSWORD',
      'warehouse12345',
    );
    const accPwd = this.configService.get(
      'ACCOUNTANT_PASSWORD',
      'accountant12345',
    );

    this.logger.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    this.logger.log('Seed muvaffaqiyatli yakunlandi!');
    this.logger.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    this.logger.log(`Admin:       ${users.admin.username} / ${adminPwd}`);
    this.logger.log(
      `Ombor 1:     ${users.warehouse1.username} / ${whPwd} → ${warehouses.medical.name}`,
    );
    this.logger.log(
      `Ombor 2:     ${users.warehouse2.username} / ${whPwd} → ${warehouses.kitchen.name}`,
    );
    this.logger.log(
      `Ombor 3:     ${users.warehouse3.username} / ${whPwd} → ${warehouses.household.name}`,
    );
    this.logger.log(`Buxgalter:   ${users.accountant.username} / ${accPwd}`);
    this.logger.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    this.logger.log(
      '20 ta mahsulot, 40 ta batch, 13 ta buyurtma, 21 ta chiqim yaratildi',
    );
    this.logger.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  }
}
