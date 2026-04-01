import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPendingApprovalToExpensesStatus1775030400000
  implements MigrationInterface
{
  name = 'AddPendingApprovalToExpensesStatus1775030400000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TYPE "public"."expenses_status_enum" ADD VALUE IF NOT EXISTS 'PENDING_APPROVAL'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TYPE "public"."expenses_status_enum" RENAME TO "expenses_status_enum_old"`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."expenses_status_enum" AS ENUM('CREATED', 'ISSUED', 'CANCELLED')`,
    );
    await queryRunner.query(
      `ALTER TABLE "expenses"
        ALTER COLUMN "status"
        TYPE "public"."expenses_status_enum"
        USING (
          CASE
            WHEN "status"::text = 'PENDING_APPROVAL' THEN 'CANCELLED'
            ELSE "status"::text
          END
        )::"public"."expenses_status_enum"`,
    );
    await queryRunner.query(`DROP TYPE "public"."expenses_status_enum_old"`);
  }
}
