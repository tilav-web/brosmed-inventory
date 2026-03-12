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

// Expense: chiqimlar bo`yicha hujjat/smeta. Bir nechta itemlardan iborat.
@Entity({ name: 'expenses' })
export class Expense {
  // Unikal identifikator (UUID).
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // Chiqim raqami (unikal).
  @Column({ type: 'varchar', unique: true })
  expense_number: string;

  // Chiqim statusi (tasdiqlash jarayoni).
  @Column({
    type: 'enum',
    enum: ExpenseStatus,
    default: ExpenseStatus.PENDING_ISSUE,
  })
  status: ExpenseStatus;

  // Chek/rasm URL (ixtiyoriy).
  @Column({ type: 'varchar', nullable: true })
  check_image_url: string | null;

  // Jami summa (itemlar yig`indisi).
  @Column({ type: 'decimal', precision: 15, scale: 2, default: 0 })
  total_price: number;

  // Mas`ul manager ID (ixtiyoriy).
  @Column({ type: 'uuid', nullable: true })
  manager_id: string | null;

  // Mas`ul manager obyekti (ixtiyoriy).
  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'manager_id' })
  manager: User | null;

  // Chiqimni rasmiylashtirgan xodim ismi.
  @Column({ type: 'varchar' })
  staff_name: string;

  // Chiqim maqsadi (ixtiyoriy).
  @Column({ type: 'text', nullable: true })
  purpose: string | null;

  // Chiqim itemlari ro`yxati.
  @OneToMany(() => ExpenseItem, (item) => item.expense, { cascade: true })
  items: ExpenseItem[];

  // Yaratilgan vaqt.
  @CreateDateColumn({ type: 'timestamp' })
  createdAt: Date;

  // Oxirgi yangilangan vaqt.
  @UpdateDateColumn({ type: 'timestamp' })
  updatedAt: Date;
}
