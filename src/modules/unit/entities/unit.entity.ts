import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

// Unit: o`lchov birligi (dona, kg, litr va h.k.).
@Entity({ name: 'units' })
export class Unit {
  // Unikal identifikator (UUID).
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // O`lchov birligi nomi (unikal).
  @Index({ unique: true })
  @Column({ type: 'varchar', length: 64 })
  name: string;

  // Yaratilgan vaqt.
  @CreateDateColumn({ type: 'timestamp' })
  createdAt: Date;

  // Oxirgi yangilangan vaqt.
  @UpdateDateColumn({ type: 'timestamp' })
  updatedAt: Date;
}
