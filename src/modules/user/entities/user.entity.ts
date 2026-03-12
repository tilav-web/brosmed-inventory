import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Warehouse } from 'src/modules/warehouse/entities/warehouse.entity';
import { Role } from '../enums/role.enum';

// User: tizim foydalanuvchilari (admin, manager va h.k.).
@Entity({ name: 'users' })
export class User {
  // Unikal identifikator (UUID).
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // Foydalanuvchi ismi.
  @Column({ type: 'varchar', default: '-' })
  first_name: string;

  // Foydalanuvchi familiyasi.
  @Column({ type: 'varchar', default: '-' })
  last_name: string;

  // Login uchun username (unikal).
  @Index({ unique: true })
  @Column({ type: 'varchar', length: 64 })
  username: string;

  // Parol (hash ko`rinishida saqlanishi kerak).
  @Column({ type: 'varchar' })
  password: string;

  // Foydalanuvchi roli.
  @Column({ type: 'enum', enum: Role })
  role: Role;

  // Foydalanuvchiga biriktirilgan omborlar.
  @OneToMany(() => Warehouse, (warehouse) => warehouse.manager)
  warehouses: Warehouse[];

  // Yaratilgan vaqt.
  @CreateDateColumn({ type: 'timestamp' })
  createdAt: Date;

  // Oxirgi yangilangan vaqt.
  @UpdateDateColumn({ type: 'timestamp' })
  updatedAt: Date;
}
