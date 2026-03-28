import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Category } from 'src/modules/category/entities/category.entity';
import { Supplier } from 'src/modules/supplier/entities/supplier.entity';
import { Unit } from 'src/modules/unit/entities/unit.entity';
import { Warehouse } from 'src/modules/warehouse/entities/warehouse.entity';
import { ProductBatch } from './product-batch.entity';
import { ProductStatus } from '../enums/product-status.enum';

// Product: ombor va savdo jarayonlari uchun asosiy mahsulot yozuvi.
@Entity({ name: 'products' })
export class Product {
  // Unikal identifikator (UUID).
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // Mahsulot nomi.
  @Column({ type: 'varchar' })
  name: string;

  // Ombordagi umumiy miqdor (partiyalar yig`indisi).
  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  quantity: number;

  // O`lchov birligi nomi (snapshot).
  @Column({ type: 'varchar' })
  unit: string;

  // Unit ID (asosiy manba yozuvi, unit o`chirilib ketsa null bo`ladi).
  @ManyToOne(() => Unit, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'unit_id' })
  unit_reference: Unit | null;

  // Unit ID.
  @Column({ type: 'uuid', nullable: true })
  unit_id: string | null;

  // Minimal qoldiq (qayta buyurtma nuqtasi).
  @Column({ type: 'int', default: 10 })
  min_limit: number;

  // MXIK kodi (Mahsulotlar va xizmatlarning identifikatsiya kodi - 17 xonali).
  @Column({ type: 'varchar', length: 17, nullable: true })
  mxik_code: string | null;

  // Saqlash sharoitlari (ixtiyoriy).
  @Column({ type: 'text', nullable: true })
  storage_conditions: string | null;

  // Mahsulot holatlari (tarkibiy hisob-kitoblar uchun).
  @Column({
    type: 'enum',
    enum: ProductStatus,
    enumName: 'product_status_enum',
    array: true,
    nullable: true,
  })
  statuses: ProductStatus[] | null;

  // Yaroqlilik muddati (ixtiyoriy).
  @Column({ type: 'date', nullable: true })
  expiration_date: Date | null;

  // Ogohlantirish sanasi (ixtiyoriy).
  @Column({ type: 'date', nullable: true })
  expiration_alert_date: Date | null;

  // Mahsulotni yetkazib beruvchi.
  @ManyToOne(() => Supplier, { nullable: false })
  @JoinColumn({ name: 'supplier_id' })
  supplier: Supplier;

  // Supplier ID.
  @Column({ type: 'uuid' })
  supplier_id: string;

  // Mahsulot kategoriyasi (ixtiyoriy).
  @ManyToOne(() => Category, (category) => category.products, {
    nullable: true,
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'category_id' })
  category: Category | null;

  // Category ID (ixtiyoriy).
  @Column({ type: 'uuid', nullable: true })
  category_id: string | null;

  // Mahsulot qaysi omborda saqlanishi.
  @ManyToOne(() => Warehouse, (warehouse) => warehouse.products, {
    nullable: false,
  })
  @JoinColumn({ name: 'warehouse_id' })
  warehouse: Warehouse;

  // Warehouse ID.
  @Column({ type: 'uuid' })
  warehouse_id: string;

  // Mahsulot partiyalari (omborga kirimlar).
  @OneToMany(() => ProductBatch, (batch) => batch.product, {
    cascade: true,
    onDelete: 'CASCADE',
  })
  batches: ProductBatch[];

  // Yaratilgan vaqt.
  @CreateDateColumn({ type: 'timestamp' })
  createdAt: Date;

  // Oxirgi yangilangan vaqt.
  @UpdateDateColumn({ type: 'timestamp' })
  updatedAt: Date;
}
