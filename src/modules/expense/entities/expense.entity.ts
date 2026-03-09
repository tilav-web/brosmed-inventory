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
import { User } from 'src/modules/user/entities/user.entity';
import { ExpenseStatus } from '../enums/expense-status.enum';
import { ExpenseItem } from './expense-item.entity';

@Entity({ name: 'expenses' })
export class Expense {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', unique: true })
  expense_number: string;

  @Column({
    type: 'enum',
    enum: ExpenseStatus,
    default: ExpenseStatus.PENDING_ISSUE,
  })
  status: ExpenseStatus;

  @Column({ type: 'varchar', nullable: true })
  check_image_url: string | null;

  @Column({ type: 'decimal', precision: 15, scale: 2, default: 0 })
  total_price: number;

  @Column({ type: 'uuid', nullable: true })
  manager_id: string | null;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'manager_id' })
  manager: User | null;

  @Column({ type: 'varchar' })
  staff_name: string;

  @Column({ type: 'text', nullable: true })
  purpose: string | null;

  @OneToMany(() => ExpenseItem, (item) => item.expense, { cascade: true })
  items: ExpenseItem[];

  @CreateDateColumn({ type: 'timestamp' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamp' })
  updatedAt: Date;
}
