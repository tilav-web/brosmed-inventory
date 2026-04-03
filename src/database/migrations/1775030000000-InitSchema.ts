import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitSchema1775030000000 implements MigrationInterface {
  name = 'InitSchema1775030000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);
    await queryRunner.query(
      `CREATE TABLE "categories" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "name" character varying(128) NOT NULL, "description" text, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_8b0be371d28245da6e4f4b61878" UNIQUE ("name"), CONSTRAINT "PK_24dbc6126a28ff948da33e97d3b" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "suppliers" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "company_name" character varying NOT NULL, "contact_person" character varying NOT NULL, "email" character varying NOT NULL, "phone" character varying NOT NULL, "payment_terms" character varying, "description" text, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_66181e465a65c2ddcfa9c00c9c7" UNIQUE ("email"), CONSTRAINT "PK_b70ac51766a9e3144f778cfe81e" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "units" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "name" character varying(64) NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_5a8f2f064919b587d93936cb223" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_cd34e4bfea359fa09d997a0b87" ON "units" ("name") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."users_role_enum" AS ENUM('admin', 'warehouse', 'accountant')`,
    );
    await queryRunner.query(
      `CREATE TABLE "users" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "first_name" character varying NOT NULL DEFAULT '-', "last_name" character varying NOT NULL DEFAULT '-', "username" character varying(64) NOT NULL, "password" character varying NOT NULL, "role" "public"."users_role_enum" NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_a3ffb1c0c8416b9fc6f907b7433" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_fe0bb3f6520ee0469504521e71" ON "users" ("username") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."expenses_status_enum" AS ENUM('CREATED', 'PENDING_APPROVAL', 'ISSUED', 'CANCELLED')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."expenses_type_enum" AS ENUM('USAGE', 'EXPIRED')`,
    );
    await queryRunner.query(
      `CREATE TABLE "expenses" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "expense_number" character varying NOT NULL, "status" "public"."expenses_status_enum" NOT NULL DEFAULT 'CREATED', "type" "public"."expenses_type_enum" NOT NULL DEFAULT 'USAGE', "total_price" numeric(15,2) NOT NULL DEFAULT '0', "manager_id" uuid, "issued_by_id" uuid, "issued_at" TIMESTAMP, "cancelled_by_id" uuid, "cancelled_at" TIMESTAMP, "staff_name" character varying NOT NULL, "purpose" text, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_c104942da407cb31c7e6b5b40ac" UNIQUE ("expense_number"), CONSTRAINT "PK_94c3ceb17e3140abc9282c20610" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "expense_items" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "quantity" numeric(10,2) NOT NULL, "product_batch_id" uuid, "expense_id" uuid NOT NULL, "product_id" uuid NOT NULL, "warehouse_id" uuid NOT NULL, CONSTRAINT "PK_6fd381fa4fa54678572a7aa534d" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "product_batches" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "quantity" numeric(10,2) NOT NULL DEFAULT '0', "depleted_at" TIMESTAMP, "price_at_purchase" numeric(12,2) NOT NULL, "expiration_date" date, "expiration_alert_date" date, "batch_number" character varying, "serial_number" character varying, "product_id" uuid NOT NULL, "warehouse_id" uuid NOT NULL, "supplier_id" uuid, "received_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_843fa9e28be96c903f8c71292fc" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."product_status_enum" AS ENUM('EXPIRED', 'EXPIRING_SOON', 'IN_STOCK', 'LOW_STOCK')`,
    );
    await queryRunner.query(
      `CREATE TABLE "products" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "name" character varying NOT NULL, "quantity" numeric(10,2) NOT NULL DEFAULT '0', "unit" character varying NOT NULL, "unit_id" uuid, "min_limit" integer NOT NULL DEFAULT '10', "mxik_code" character varying(17), "storage_conditions" text, "statuses" "public"."product_status_enum" array, "expiration_date" date, "expiration_alert_date" date, "supplier_id" uuid NOT NULL, "category_id" uuid, "warehouse_id" uuid NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_0806c755e0aca124e67c0cf6d7d" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."warehouses_type_enum" AS ENUM('kitchen', 'medical', 'household', 'spare_parts')`,
    );
    await queryRunner.query(
      `CREATE TABLE "warehouses" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "name" character varying NOT NULL, "type" "public"."warehouses_type_enum" NOT NULL DEFAULT 'medical', "location" character varying NOT NULL, "manager_id" uuid NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_56ae21ee2432b2270b48867e4be" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "order_items" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "quantity" integer NOT NULL, "price_at_purchase" numeric(12,2) NOT NULL, "product_id" uuid NOT NULL, "purchase_order_id" uuid NOT NULL, CONSTRAINT "PK_005269d8574e6fac0493715c308" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."purchase_orders_status_enum" AS ENUM('PENDING', 'CONFIRMED', 'DELIVERED', 'CANCELLED')`,
    );
    await queryRunner.query(
      `CREATE TABLE "purchase_orders" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "order_number" character varying NOT NULL, "status" "public"."purchase_orders_status_enum" NOT NULL DEFAULT 'PENDING', "is_received" boolean NOT NULL DEFAULT false, "created_by_id" uuid, "decided_by_id" uuid, "decided_at" TIMESTAMP, "received_by_id" uuid, "received_at" TIMESTAMP, "order_date" TIMESTAMP NOT NULL, "delivery_date" TIMESTAMP, "total_amount" numeric(15,2) NOT NULL DEFAULT '0', "supplier_id" uuid NOT NULL, "warehouse_id" uuid NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_b297010fff05faf7baf4e67afa7" UNIQUE ("order_number"), CONSTRAINT "PK_05148947415204a897e8beb2553" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."bot_users_status_enum" AS ENUM('active', 'blocked', 'pending')`,
    );
    await queryRunner.query(
      `CREATE TABLE "bot_users" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "telegram_id" bigint NOT NULL, "first_name" character varying, "last_name" character varying, "username" character varying, "status" "public"."bot_users_status_enum" NOT NULL DEFAULT 'active', "is_approved" boolean NOT NULL DEFAULT false, "linked_user_id" uuid, "last_active_at" TIMESTAMP, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_3bfe73517f51c6f0c1d1fe71c94" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_a8c0cf7cc16256781d681569a9" ON "bot_users" ("telegram_id") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_f8ef845d19cf4d2e599e547896" ON "bot_users" ("username") `,
    );
    await queryRunner.query(
      `ALTER TABLE "expenses" ADD CONSTRAINT "FK_b6b1d5fb8f6dbd922a3bcd0a1f7" FOREIGN KEY ("manager_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "expense_items" ADD CONSTRAINT "FK_0ce51d6048f5679b3c53194ba06" FOREIGN KEY ("expense_id") REFERENCES "expenses"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "expense_items" ADD CONSTRAINT "FK_cd20639951204065260544d6533" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "expense_items" ADD CONSTRAINT "FK_cc8f236ef232a623179d3961bc8" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "expense_items" ADD CONSTRAINT "FK_df4807adac9c8a77c790a8544f5" FOREIGN KEY ("product_batch_id") REFERENCES "product_batches"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "product_batches" ADD CONSTRAINT "FK_82998c582d28f74cca4eff80a73" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "product_batches" ADD CONSTRAINT "FK_fbbc98354700cceeab037050fae" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "product_batches" ADD CONSTRAINT "FK_c877a35c876b116df937f1754f1" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "products" ADD CONSTRAINT "FK_0b97249dd9e17bbc604a5ba3d07" FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "products" ADD CONSTRAINT "FK_0ec433c1e1d444962d592d86c86" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "products" ADD CONSTRAINT "FK_9a5f6868c96e0069e699f33e124" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "products" ADD CONSTRAINT "FK_76ac0a401091bd373753579c977" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "warehouses" ADD CONSTRAINT "FK_6c0a3017732f03feb52e47fad96" FOREIGN KEY ("manager_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "order_items" ADD CONSTRAINT "FK_72a7541877723b9b3e502ff112e" FOREIGN KEY ("purchase_order_id") REFERENCES "purchase_orders"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "order_items" ADD CONSTRAINT "FK_9263386c35b6b242540f9493b00" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "purchase_orders" ADD CONSTRAINT "FK_d16a885aa88447ccfd010e739b0" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "purchase_orders" ADD CONSTRAINT "FK_74e4ce03ba3f8bc13de20fc594e" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "purchase_orders" DROP CONSTRAINT "FK_74e4ce03ba3f8bc13de20fc594e"`,
    );
    await queryRunner.query(
      `ALTER TABLE "purchase_orders" DROP CONSTRAINT "FK_d16a885aa88447ccfd010e739b0"`,
    );
    await queryRunner.query(
      `ALTER TABLE "order_items" DROP CONSTRAINT "FK_9263386c35b6b242540f9493b00"`,
    );
    await queryRunner.query(
      `ALTER TABLE "order_items" DROP CONSTRAINT "FK_72a7541877723b9b3e502ff112e"`,
    );
    await queryRunner.query(
      `ALTER TABLE "warehouses" DROP CONSTRAINT "FK_6c0a3017732f03feb52e47fad96"`,
    );
    await queryRunner.query(
      `ALTER TABLE "products" DROP CONSTRAINT "FK_76ac0a401091bd373753579c977"`,
    );
    await queryRunner.query(
      `ALTER TABLE "products" DROP CONSTRAINT "FK_9a5f6868c96e0069e699f33e124"`,
    );
    await queryRunner.query(
      `ALTER TABLE "products" DROP CONSTRAINT "FK_0ec433c1e1d444962d592d86c86"`,
    );
    await queryRunner.query(
      `ALTER TABLE "products" DROP CONSTRAINT "FK_0b97249dd9e17bbc604a5ba3d07"`,
    );
    await queryRunner.query(
      `ALTER TABLE "product_batches" DROP CONSTRAINT "FK_c877a35c876b116df937f1754f1"`,
    );
    await queryRunner.query(
      `ALTER TABLE "product_batches" DROP CONSTRAINT "FK_fbbc98354700cceeab037050fae"`,
    );
    await queryRunner.query(
      `ALTER TABLE "product_batches" DROP CONSTRAINT "FK_82998c582d28f74cca4eff80a73"`,
    );
    await queryRunner.query(
      `ALTER TABLE "expense_items" DROP CONSTRAINT "FK_df4807adac9c8a77c790a8544f5"`,
    );
    await queryRunner.query(
      `ALTER TABLE "expense_items" DROP CONSTRAINT "FK_cc8f236ef232a623179d3961bc8"`,
    );
    await queryRunner.query(
      `ALTER TABLE "expense_items" DROP CONSTRAINT "FK_cd20639951204065260544d6533"`,
    );
    await queryRunner.query(
      `ALTER TABLE "expense_items" DROP CONSTRAINT "FK_0ce51d6048f5679b3c53194ba06"`,
    );
    await queryRunner.query(
      `ALTER TABLE "expenses" DROP CONSTRAINT "FK_b6b1d5fb8f6dbd922a3bcd0a1f7"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_f8ef845d19cf4d2e599e547896"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_a8c0cf7cc16256781d681569a9"`,
    );
    await queryRunner.query(`DROP TABLE "bot_users"`);
    await queryRunner.query(`DROP TYPE "public"."bot_users_status_enum"`);
    await queryRunner.query(`DROP TABLE "purchase_orders"`);
    await queryRunner.query(`DROP TYPE "public"."purchase_orders_status_enum"`);
    await queryRunner.query(`DROP TABLE "order_items"`);
    await queryRunner.query(`DROP TABLE "warehouses"`);
    await queryRunner.query(`DROP TYPE "public"."warehouses_type_enum"`);
    await queryRunner.query(`DROP TABLE "products"`);
    await queryRunner.query(`DROP TYPE "public"."product_status_enum"`);
    await queryRunner.query(`DROP TABLE "product_batches"`);
    await queryRunner.query(`DROP TABLE "expense_items"`);
    await queryRunner.query(`DROP TABLE "expenses"`);
    await queryRunner.query(`DROP TYPE "public"."expenses_type_enum"`);
    await queryRunner.query(`DROP TYPE "public"."expenses_status_enum"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_fe0bb3f6520ee0469504521e71"`,
    );
    await queryRunner.query(`DROP TABLE "users"`);
    await queryRunner.query(`DROP TYPE "public"."users_role_enum"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_cd34e4bfea359fa09d997a0b87"`,
    );
    await queryRunner.query(`DROP TABLE "units"`);
    await queryRunner.query(`DROP TABLE "suppliers"`);
    await queryRunner.query(`DROP TABLE "categories"`);
  }
}
