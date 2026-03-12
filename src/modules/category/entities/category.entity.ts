import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Product } from 'src/modules/product/entities/product.entity';

// Category: productlarni guruhlash va kataloglash uchun kerak.
@Entity({ name: 'categories' })
export class Category {
  // Unikal identifikator (UUID).
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // Kategoriya nomi (unikal).
  @Index({ unique: true })
  @Column({ type: 'varchar', length: 128 })
  name: string;

  // Kategoriya haqida ixtiyoriy izoh.
  @Column({ type: 'text', nullable: true })
  description: string | null;

  // Ushbu kategoriyaga tegishli productlar.
  @OneToMany(() => Product, (product) => product.category)
  products: Product[];

  // Yaratilgan vaqt.
  @CreateDateColumn({ type: 'timestamp' })
  createdAt: Date;

  // Oxirgi yangilangan vaqt.
  @UpdateDateColumn({ type: 'timestamp' })
  updatedAt: Date;
}
