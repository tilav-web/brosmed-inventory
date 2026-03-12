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
import { Supplier } from 'src/modules/supplier/entities/supplier.entity';
import { Warehouse } from 'src/modules/warehouse/entities/warehouse.entity';
import { OrderStatus } from '../enums/order-status.enum';
import { OrderItem } from './order-item.entity';

// PurchaseOrder: yetkazib beruvchidan mahsulot sotib olish buyurtmasi.
@Entity({ name: 'purchase_orders' })
export class PurchaseOrder {
  // Unikal identifikator (UUID).
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // Buyurtma raqami (unikal).
  @Column({ type: 'varchar', unique: true })
  order_number: string;

  // Buyurtma statusi.
  @Column({ type: 'enum', enum: OrderStatus, default: OrderStatus.PENDING })
  status: OrderStatus;

  // Buyurtma berilgan sana/vaqt.
  @Column({ type: 'timestamp' })
  order_date: Date;

  // Yetkazib berilgan sana/vaqt (ixtiyoriy).
  @Column({ type: 'timestamp', nullable: true })
  delivery_date: Date | null;

  // Umumiy summa (itemlar yig`indisi).
  @Column({ type: 'decimal', precision: 15, scale: 2, default: 0 })
  total_amount: number;

  // Supplier ID.
  @Column({ type: 'uuid' })
  supplier_id: string;

  // Supplier obyekti.
  @ManyToOne(() => Supplier, { nullable: false })
  @JoinColumn({ name: 'supplier_id' })
  supplier: Supplier;

  // Ombor ID.
  @Column({ type: 'uuid' })
  warehouse_id: string;

  // Ombor obyekti.
  @ManyToOne(() => Warehouse, { nullable: false })
  @JoinColumn({ name: 'warehouse_id' })
  warehouse: Warehouse;

  // Buyurtma itemlari.
  @OneToMany(() => OrderItem, (item) => item.purchase_order, { cascade: true })
  items: OrderItem[];

  // Yaratilgan vaqt.
  @CreateDateColumn({ type: 'timestamp' })
  createdAt: Date;

  // Oxirgi yangilangan vaqt.
  @UpdateDateColumn({ type: 'timestamp' })
  updatedAt: Date;
}
