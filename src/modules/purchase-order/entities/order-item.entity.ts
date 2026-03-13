import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Product } from 'src/modules/product/entities/product.entity';
import { PurchaseOrder } from './purchase-order.entity';

// OrderItem: purchase order ichidagi alohida mahsulot satri.
@Entity({ name: 'order_items' })
export class OrderItem {
  // Unikal identifikator (UUID).
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // Buyurtma miqdori.
  @Column({ type: 'int' })
  quantity: number;

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

  // Qaysi purchase orderga tegishli.
  @ManyToOne(() => PurchaseOrder, (order) => order.items, { nullable: false })
  @JoinColumn({ name: 'purchase_order_id' })
  purchase_order: PurchaseOrder;

  // Qaysi mahsulot buyurtma qilingan.
  @ManyToOne(() => Product, { nullable: false })
  @JoinColumn({ name: 'product_id' })
  product: Product;
}
