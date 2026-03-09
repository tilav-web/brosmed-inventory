import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Product } from 'src/modules/product/entities/product.entity';
import { PurchaseOrder } from './purchase-order.entity';

@Entity({ name: 'order_items' })
export class OrderItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'int' })
  quantity: number;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  price_at_purchase: number;

  @ManyToOne(() => PurchaseOrder, (order) => order.items, { nullable: false })
  @JoinColumn({ name: 'purchase_order_id' })
  purchase_order: PurchaseOrder;

  @ManyToOne(() => Product, { nullable: false })
  @JoinColumn({ name: 'product_id' })
  product: Product;
}
