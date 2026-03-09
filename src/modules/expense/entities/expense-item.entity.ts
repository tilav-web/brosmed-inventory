import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Product } from 'src/modules/product/entities/product.entity';
import { Warehouse } from 'src/modules/warehouse/entities/warehouse.entity';
import { Expense } from './expense.entity';

@Entity({ name: 'expense_items' })
export class ExpenseItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  quantity: number;

  @ManyToOne(() => Expense, (expense) => expense.items, { nullable: false })
  @JoinColumn({ name: 'expense_id' })
  expense: Expense;

  @ManyToOne(() => Product, { nullable: false })
  @JoinColumn({ name: 'product_id' })
  product: Product;

  @ManyToOne(() => Warehouse, { nullable: false })
  @JoinColumn({ name: 'warehouse_id' })
  warehouse: Warehouse;
}
