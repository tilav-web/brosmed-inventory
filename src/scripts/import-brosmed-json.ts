import { hash } from 'bcrypt';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Repository } from 'typeorm';
import dataSource from '../database/data-source';
import { Category } from '../modules/category/entities/category.entity';
import { Product } from '../modules/product/entities/product.entity';
import { Supplier } from '../modules/supplier/entities/supplier.entity';
import { Unit } from '../modules/unit/entities/unit.entity';
import { Role } from '../modules/user/enums/role.enum';
import { User } from '../modules/user/entities/user.entity';
import { Warehouse } from '../modules/warehouse/entities/warehouse.entity';
import { WarehouseType } from '../modules/warehouse/enums/warehouse-type.enum';

interface BrosmedProductRow {
  index: number;
  source_row: number;
  original_no: number | null;
  name: string;
  min_limit: number;
  supplier: string;
  category: string;
  warehouse: string;
  unit: string;
}

interface CliOptions {
  input: string;
  dryRun: boolean;
  skipMigrations: boolean;
}

interface ImportStats {
  rowsProcessed: number;
  warehouseUsersCreated: number;
  warehouseUsersUpdated: number;
  unitsCreated: number;
  unitsUpdated: number;
  categoriesCreated: number;
  categoriesUpdated: number;
  suppliersCreated: number;
  suppliersUpdated: number;
  warehousesCreated: number;
  warehousesUpdated: number;
  productsCreated: number;
  productsUpdated: number;
}

type NamedEntity = { name: string };

interface WarehouseManagerAccount {
  username: string;
  password: string;
  firstName: string;
  lastName: string;
}

function parseArgs(argv: string[]): CliOptions {
  let input = 'data/brosmed-products.json';
  let dryRun = false;
  let skipMigrations = false;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === '--input') {
      const value = argv[index + 1];
      if (!value) {
        throw new Error('--input dan keyin fayl yo`li kelishi kerak');
      }
      input = value;
      index += 1;
      continue;
    }

    if (arg === '--dry-run') {
      dryRun = true;
      continue;
    }

    if (arg === '--skip-migrations') {
      skipMigrations = true;
      continue;
    }

    if (arg === '--help') {
      console.log(
        [
          'Foydalanish:',
          '  node dist/scripts/import-brosmed-json.js --input data/brosmed-products.json',
          '',
          'Opsiyalar:',
          '  --input <path>         JSON fayl yo`li',
          '  --dry-run              Faqat JSON ni tekshiradi, DB ga yozmaydi',
          '  --skip-migrations      Migrationlarni o`tkazib yuboradi',
        ].join('\n'),
      );
      process.exit(0);
    }

    throw new Error(`Noma'lum argument: ${arg}`);
  }

  return {
    input: resolve(input),
    dryRun,
    skipMigrations,
  };
}

function normalizeKey(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLowerCase();
}

function readRows(inputPath: string): BrosmedProductRow[] {
  if (!existsSync(inputPath)) {
    throw new Error(`JSON fayl topilmadi: ${inputPath}`);
  }

  const parsed = JSON.parse(
    readFileSync(inputPath, 'utf8'),
  ) as BrosmedProductRow[];

  if (!Array.isArray(parsed)) {
    throw new Error('JSON ildiz qiymati massiv bo`lishi kerak');
  }

  const rows = parsed
    .map((row) => ({
      ...row,
      name: String(row.name ?? '').trim(),
      supplier: String(row.supplier ?? '').trim() || "NOMA'LUM TA'MINOTCHI",
      category: String(row.category ?? '').trim(),
      warehouse: String(row.warehouse ?? '').trim(),
      unit: String(row.unit ?? '').trim(),
      min_limit: Number(row.min_limit ?? 10) || 10,
    }))
    .filter(
      (row) =>
        row.name &&
        row.supplier &&
        row.category &&
        row.warehouse &&
        row.unit,
    );

  if (rows.length === 0) {
    throw new Error('Import uchun yaroqli qator topilmadi');
  }

  return rows;
}

function deterministicEmail(companyName: string): string {
  const suffix = createHash('sha1')
    .update(normalizeKey(companyName))
    .digest('hex')
    .slice(0, 12);

  return `supplier-${suffix}@brosmed.local`;
}

function buildWarehouseManagerAccount(
  warehouseName: string,
): WarehouseManagerAccount {
  const normalized = normalizeKey(warehouseName);
  const slug = normalized
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 32);
  const hashSuffix = createHash('sha1').update(normalized).digest('hex').slice(0, 6);
  const username = `import_wh_${slug || 'warehouse'}_${hashSuffix}`.slice(0, 64);

  return {
    username,
    password:
      process.env.IMPORT_WAREHOUSE_PASSWORD?.trim() ||
      process.env.WAREHOUSE_PASSWORD?.trim() ||
      'warehouse12345',
    firstName: warehouseName.slice(0, 64) || 'Warehouse',
    lastName: 'test',
  };
}

function inferWarehouseType(
  warehouseName: string,
  categoryName: string,
): WarehouseType {
  const warehouseKey = normalizeKey(warehouseName);
  const categoryKey = normalizeKey(categoryName);

  if (warehouseKey.includes('dori-darmon') || categoryKey === 'dori-darmon') {
    return WarehouseType.MEDICAL;
  }

  if (
    warehouseKey.includes('oziq-ovqat') ||
    categoryKey === 'oziq-ovqat'
  ) {
    return WarehouseType.KITCHEN;
  }

  return WarehouseType.HOUSEHOLD;
}

async function findByName<T extends NamedEntity>(
  repository: Repository<T>,
  alias: string,
  keys: string[],
): Promise<T | null> {
  const normalizedKeys = Array.from(
    new Set(keys.map((value) => normalizeKey(value)).filter(Boolean)),
  );

  if (normalizedKeys.length === 0) {
    return null;
  }

  return repository
    .createQueryBuilder(alias)
    .where(`LOWER(${alias}.name) IN (:...keys)`, { keys: normalizedKeys })
    .getOne();
}

async function findSupplierByName(
  repository: Repository<Supplier>,
  keys: string[],
): Promise<Supplier | null> {
  const normalizedKeys = Array.from(
    new Set(keys.map((value) => normalizeKey(value)).filter(Boolean)),
  );

  if (normalizedKeys.length === 0) {
    return null;
  }

  return repository
    .createQueryBuilder('supplier')
    .where('LOWER(supplier.company_name) IN (:...keys)', { keys: normalizedKeys })
    .getOne();
}

async function ensureWarehouseManagerUser(
  userRepository: Repository<User>,
  warehouseName: string,
): Promise<{ user: User; created: boolean; updated: boolean }> {
  const account = buildWarehouseManagerAccount(warehouseName);
  const existingUser = await userRepository.findOne({
    where: { username: account.username },
  });

  if (!existingUser) {
    const createdUser = userRepository.create({
      username: account.username,
      password: await hash(account.password, 10),
      first_name: account.firstName,
      last_name: account.lastName,
      role: Role.WAREHOUSE,
    });

    return {
      user: await userRepository.save(createdUser),
      created: true,
      updated: false,
    };
  }

  let shouldSave = false;

  if (existingUser.role !== Role.WAREHOUSE) {
    existingUser.role = Role.WAREHOUSE;
    shouldSave = true;
  }
  if (existingUser.first_name !== account.firstName) {
    existingUser.first_name = account.firstName;
    shouldSave = true;
  }
  if (existingUser.last_name !== account.lastName) {
    existingUser.last_name = account.lastName;
    shouldSave = true;
  }

  if (shouldSave) {
    return {
      user: await userRepository.save(existingUser),
      created: false,
      updated: true,
    };
  }

  return {
    user: existingUser,
    created: false,
    updated: false,
  };
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const rows = readRows(options.input);
  const warehouseManagers = Array.from(
    new Set(rows.map((row) => row.warehouse)),
  ).map((warehouse) => ({
    warehouse,
    username: buildWarehouseManagerAccount(warehouse).username,
  }));

  if (options.dryRun) {
    console.log(
      JSON.stringify(
        {
          input: options.input,
          rows: rows.length,
          suppliers: new Set(rows.map((row) => row.supplier)).size,
          categories: new Set(rows.map((row) => row.category)).size,
          warehouses: new Set(rows.map((row) => row.warehouse)).size,
          units: new Set(rows.map((row) => row.unit)).size,
          warehouse_managers: warehouseManagers,
        },
        null,
        2,
      ),
    );
    return;
  }

  await dataSource.initialize();

  try {
    if (!options.skipMigrations) {
      await dataSource.runMigrations();
    }

    const stats = await dataSource.transaction<ImportStats>(async (manager) => {
      const userRepository = manager.getRepository(User);
      const unitRepository = manager.getRepository(Unit);
      const categoryRepository = manager.getRepository(Category);
      const supplierRepository = manager.getRepository(Supplier);
      const warehouseRepository = manager.getRepository(Warehouse);
      const productRepository = manager.getRepository(Product);
      const warehouseUserCache = new Map<string, User>();

      const unitCache = new Map<string, Unit>();
      const categoryCache = new Map<string, Category>();
      const supplierCache = new Map<string, Supplier>();
      const warehouseCache = new Map<string, Warehouse>();

      const stats: ImportStats = {
        rowsProcessed: 0,
        warehouseUsersCreated: 0,
        warehouseUsersUpdated: 0,
        unitsCreated: 0,
        unitsUpdated: 0,
        categoriesCreated: 0,
        categoriesUpdated: 0,
        suppliersCreated: 0,
        suppliersUpdated: 0,
        warehousesCreated: 0,
        warehousesUpdated: 0,
        productsCreated: 0,
        productsUpdated: 0,
      };

      for (const row of rows) {
        const unitKey = normalizeKey(row.unit);
        let unit = unitCache.get(unitKey);
        if (!unit) {
          unit =
            (await findByName(unitRepository, 'unit', [row.unit])) ??
            unitRepository.create({ name: row.unit });

          if (!unit.id) {
            unit = await unitRepository.save(unit);
            stats.unitsCreated += 1;
          } else if (unit.name !== row.unit) {
            unit.name = row.unit;
            unit = await unitRepository.save(unit);
            stats.unitsUpdated += 1;
          }

          unitCache.set(unitKey, unit);
        }

        const categoryKey = normalizeKey(row.category);
        let category = categoryCache.get(categoryKey);
        if (!category) {
          category =
            (await findByName(categoryRepository, 'category', [row.category])) ??
            categoryRepository.create({
              name: row.category,
              description: 'Brosmed JSON import',
            });

          if (!category.id) {
            category = await categoryRepository.save(category);
            stats.categoriesCreated += 1;
          } else if (category.name !== row.category) {
            category.name = row.category;
            category = await categoryRepository.save(category);
            stats.categoriesUpdated += 1;
          }

          categoryCache.set(categoryKey, category);
        }

        const supplierKey = normalizeKey(row.supplier);
        let supplier = supplierCache.get(supplierKey);
        if (!supplier) {
          supplier =
            (await findSupplierByName(supplierRepository, [row.supplier])) ??
            supplierRepository.create({
              company_name: row.supplier,
              contact_person: 'Import',
              email: deterministicEmail(row.supplier),
              phone: '+998000000000',
              description: 'Brosmed JSON import',
            });

          if (!supplier.id) {
            supplier = await supplierRepository.save(supplier);
            stats.suppliersCreated += 1;
          } else {
            let shouldSave = false;
            if (supplier.company_name !== row.supplier) {
              supplier.company_name = row.supplier;
              shouldSave = true;
            }
            if (!supplier.contact_person?.trim()) {
              supplier.contact_person = 'Import';
              shouldSave = true;
            }
            if (!supplier.email?.trim()) {
              supplier.email = deterministicEmail(row.supplier);
              shouldSave = true;
            }
            if (!supplier.phone?.trim()) {
              supplier.phone = '+998000000000';
              shouldSave = true;
            }
            if (shouldSave) {
              supplier = await supplierRepository.save(supplier);
              stats.suppliersUpdated += 1;
            }
          }

          supplierCache.set(supplierKey, supplier);
        }

        const warehouseKey = normalizeKey(row.warehouse);
        let warehouse = warehouseCache.get(warehouseKey);
        if (!warehouse) {
          let managerUser = warehouseUserCache.get(warehouseKey);
          if (!managerUser) {
            const ensuredManager = await ensureWarehouseManagerUser(
              userRepository,
              row.warehouse,
            );
            managerUser = ensuredManager.user;
            warehouseUserCache.set(warehouseKey, managerUser);
            if (ensuredManager.created) {
              stats.warehouseUsersCreated += 1;
            }
            if (ensuredManager.updated) {
              stats.warehouseUsersUpdated += 1;
            }
          }

          warehouse =
            (await findByName(warehouseRepository, 'warehouse', [row.warehouse])) ??
            warehouseRepository.create({
              name: row.warehouse,
              type: inferWarehouseType(row.warehouse, row.category),
              location: `${row.warehouse} / JSON import`,
              manager: managerUser,
              manager_id: managerUser.id,
            });

          if (!warehouse.id) {
            warehouse = await warehouseRepository.save(warehouse);
            stats.warehousesCreated += 1;
          } else {
            let shouldSave = false;
            const inferredType = inferWarehouseType(row.warehouse, row.category);

            if (warehouse.name !== row.warehouse) {
              warehouse.name = row.warehouse;
              shouldSave = true;
            }
            if (warehouse.type !== inferredType) {
              warehouse.type = inferredType;
              shouldSave = true;
            }
            if (!warehouse.location?.trim()) {
              warehouse.location = `${row.warehouse} / JSON import`;
              shouldSave = true;
            }
            if (warehouse.manager_id !== managerUser.id) {
              warehouse.manager = managerUser;
              warehouse.manager_id = managerUser.id;
              shouldSave = true;
            }

            if (shouldSave) {
              warehouse = await warehouseRepository.save(warehouse);
              stats.warehousesUpdated += 1;
            }
          }

          warehouseCache.set(warehouseKey, warehouse);
        }

        const existingProduct = await productRepository
          .createQueryBuilder('product')
          .where('product.warehouse_id = :warehouseId', {
            warehouseId: warehouse.id,
          })
          .andWhere('LOWER(product.name) = :name', {
            name: normalizeKey(row.name),
          })
          .getOne();

        if (existingProduct) {
          existingProduct.name = row.name;
          existingProduct.min_limit = row.min_limit;
          existingProduct.unit = unit.name;
          existingProduct.unit_reference = unit;
          existingProduct.unit_id = unit.id;
          existingProduct.category = category;
          existingProduct.category_id = category.id;
          existingProduct.supplier = supplier;
          existingProduct.supplier_id = supplier.id;
          existingProduct.warehouse = warehouse;
          existingProduct.warehouse_id = warehouse.id;
          await productRepository.save(existingProduct);
          stats.productsUpdated += 1;
        } else {
          await productRepository.save(
            productRepository.create({
              name: row.name,
              quantity: 0,
              unit: unit.name,
              unit_reference: unit,
              unit_id: unit.id,
              min_limit: row.min_limit,
              statuses: null,
              expiration_date: null,
              expiration_alert_date: null,
              supplier,
              supplier_id: supplier.id,
              category,
              category_id: category.id,
              warehouse,
              warehouse_id: warehouse.id,
              mxik_code: null,
              storage_conditions: null,
            }),
          );
          stats.productsCreated += 1;
        }

        stats.rowsProcessed += 1;
      }

      return stats;
    });

    console.log(
      JSON.stringify(
        {
          input: options.input,
          ...stats,
          warehouse_managers: warehouseManagers,
        },
        null,
        2,
      ),
    );
  } finally {
    if (dataSource.isInitialized) {
      await dataSource.destroy();
    }
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.stack || error.message : error;
  console.error(message);
  process.exit(1);
});
