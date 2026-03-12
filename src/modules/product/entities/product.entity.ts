import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Category } from 'src/modules/category/entities/category.entity';
import { Supplier } from 'src/modules/supplier/entities/supplier.entity';
import { Warehouse } from 'src/modules/warehouse/entities/warehouse.entity';

// Product: ombor va savdo jarayonlari uchun asosiy mahsulot yozuvi.
@Entity({ name: 'products' })
export class Product {
  // Unikal identifikator (UUID).
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // Mahsulot nomi.
  @Column({ type: 'varchar' })
  name: string;

  // Mahsulot narxi.
  @Column({ type: 'decimal', precision: 15, scale: 2 })
  price: number;

  // Ombordagi miqdor.
  @Column({ type: 'int', default: 0 })
  quantity: number;

  // O`lchov birligi nomi (snapshot).
  @Column({ type: 'varchar' })
  unit: string;

  // Minimal qoldiq (qayta buyurtma nuqtasi).
  @Column({ type: 'int', default: 10 })
  min_limit: number;

  // Yaroqlilik muddati (ixtiyoriy).
  @Column({ type: 'date', nullable: true })
  expiration_date: Date | null;

  // Ogohlantirish sanasi (ixtiyoriy): shu sanadan boshlab UI qizil ko'rsatishi mumkin.
  @Column({ type: 'date', nullable: true })
  expiration_alert_date: Date | null;

  // Partiya raqami (ixtiyoriy).
  @Column({ type: 'varchar', nullable: true })
  batch_number: string | null;

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

  // Yaratilgan vaqt.
  @CreateDateColumn({ type: 'timestamp' })
  createdAt: Date;

  // Oxirgi yangilangan vaqt.
  @UpdateDateColumn({ type: 'timestamp' })
  updatedAt: Date;
}
