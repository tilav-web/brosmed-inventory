import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Product } from 'src/modules/product/entities/product.entity';
import { Supplier } from 'src/modules/supplier/entities/supplier.entity';
import { Warehouse } from 'src/modules/warehouse/entities/warehouse.entity';

// ProductBatch: omborga kirib kelgan mahsulot partiyasi (narx + yaroqlilik muddati).
@Entity({ name: 'product_batches' })
export class ProductBatch {
  // Unikal identifikator (UUID).
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // Partiyadagi qolgan miqdor.
  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  quantity: number;

  // Partiya tugagan vaqt (ixtiyoriy).
  @Column({ type: 'timestamp', nullable: true })
  depleted_at: Date | null;

  // Sotib olingan paytdagi narx (snapshot).
  @Column({ type: 'decimal', precision: 12, scale: 2 })
  price_at_purchase: number;

  // Yaroqlilik muddati (ixtiyoriy).
  @Column({ type: 'date', nullable: true })
  expiration_date: Date | null;

  // Ogohlantirish sanasi (ixtiyoriy).
  @Column({ type: 'date', nullable: true })
  expiration_alert_date: Date | null;

  // Partiya raqami (ixtiyoriy).
  @Column({ type: 'varchar', nullable: true })
  batch_number: string | null;

  // Mahsulotning seriya raqami (ixtiyoriy).
  @Column({ type: 'varchar', nullable: true })
  serial_number: string | null;

  // Qaysi mahsulot partiyasi.
  @ManyToOne(() => Product, (product) => product.batches, { nullable: false })
  @JoinColumn({ name: 'product_id' })
  product: Product;

  // Product ID.
  @Column({ type: 'uuid' })
  product_id: string;

  // Qaysi omborga kirgan.
  @ManyToOne(() => Warehouse, { nullable: false })
  @JoinColumn({ name: 'warehouse_id' })
  warehouse: Warehouse;

  // Warehouse ID.
  @Column({ type: 'uuid' })
  warehouse_id: string;

  // Qaysi supplierdan kelgan (ixtiyoriy).
  @ManyToOne(() => Supplier, { nullable: true })
  @JoinColumn({ name: 'supplier_id' })
  supplier: Supplier | null;

  // Supplier ID (ixtiyoriy).
  @Column({ type: 'uuid', nullable: true })
  supplier_id: string | null;

  // Partiya omborga qabul qilingan vaqt.
  @CreateDateColumn({ type: 'timestamp' })
  received_at: Date;
}
