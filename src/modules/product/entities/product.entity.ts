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
import { Warehouse } from 'src/modules/warehouse/entities/warehouse.entity';
import { ProductBatch } from './product-batch.entity';

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

  // Minimal qoldiq (qayta buyurtma nuqtasi).
  @Column({ type: 'int', default: 10 })
  min_limit: number;

  // Saqlash sharoitlari (ixtiyoriy).
  @Column({ type: 'text', nullable: true })
  storage_conditions: string | null;

  // Mahsulotni yetkazib beruvchi.
  @ManyToOne(() => Supplier, { nullable: false })
  @JoinColumn({ name: 'supplier_id' })
  supplier: Supplier;

  // Supplier ID.
  @Column({ type: 'uuid' })
  supplier_id: string;

  // Mahsulot rasmi (ixtiyoriy).
  @Column({ type: 'varchar', nullable: true })
  image: string | null;

  // Mahsulot kategoriyasi (ixtiyoriy).
  @ManyToOne(() => Category, (category) => category.products, {
    nullable: true,
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
  @OneToMany(() => ProductBatch, (batch) => batch.product)
  batches: ProductBatch[];

  // Yaratilgan vaqt.
  @CreateDateColumn({ type: 'timestamp' })
  createdAt: Date;

  // Oxirgi yangilangan vaqt.
  @UpdateDateColumn({ type: 'timestamp' })
  updatedAt: Date;
}
