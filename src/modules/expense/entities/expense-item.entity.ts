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

// ExpenseItem: chiqim ichidagi alohida mahsulot satri.
@Entity({ name: 'expense_items' })
export class ExpenseItem {
  // Unikal identifikator (UUID).
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // Chiqimdagi miqdor (product birligida).
  @Column({ type: 'decimal', precision: 10, scale: 2 })
  quantity: number;

  // Qaysi chiqimga tegishli.
  @ManyToOne(() => Expense, (expense) => expense.items, { nullable: false })
  @JoinColumn({ name: 'expense_id' })
  expense: Expense;

  // Qaysi mahsulot chiqimi.
  @ManyToOne(() => Product, { nullable: false })
  @JoinColumn({ name: 'product_id' })
  product: Product;

  // Qaysi ombordan chiqim qilingan.
  @ManyToOne(() => Warehouse, { nullable: false })
  @JoinColumn({ name: 'warehouse_id' })
  warehouse: Warehouse;
}
