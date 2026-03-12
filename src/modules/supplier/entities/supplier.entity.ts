import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Product } from 'src/modules/product/entities/product.entity';

// Supplier: mahsulotlarni yetkazib beruvchi kompaniya yoki shaxs.
@Entity({ name: 'suppliers' })
export class Supplier {
  // Unikal identifikator (UUID).
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // Kompaniya nomi.
  @Column({ type: 'varchar' })
  company_name: string;

  // Aloqa shaxsi.
  @Column({ type: 'varchar' })
  contact_person: string;

  // Email (unikal).
  @Column({ type: 'varchar', unique: true })
  email: string;

  // Telefon raqam.
  @Column({ type: 'varchar' })
  phone: string;

  // To`lov shartlari (ixtiyoriy).
  @Column({ type: 'varchar', nullable: true })
  payment_terms: string | null;

  // Qo`shimcha izoh (ixtiyoriy).
  @Column({ type: 'text', nullable: true })
  description: string | null;

  // Ushbu supplier yetkazgan productlar.
  @OneToMany(() => Product, (product) => product.supplier)
  products: Product[];

  // Yaratilgan vaqt.
  @CreateDateColumn({ type: 'timestamp' })
  createdAt: Date;

  // Oxirgi yangilangan vaqt.
  @UpdateDateColumn({ type: 'timestamp' })
  updatedAt: Date;
}
