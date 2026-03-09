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

@Entity({ name: 'users' })
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', default: '-' })
  first_name: string;

  @Column({ type: 'varchar', default: '-' })
  last_name: string;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 64 })
  username: string;

  @Column({ type: 'varchar' })
  password: string;

  @Column({ type: 'enum', enum: Role })
  role: Role;

  @OneToMany(() => Warehouse, (warehouse) => warehouse.manager)
  warehouses: Warehouse[];

  @CreateDateColumn({ type: 'timestamp' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamp' })
  updatedAt: Date;
}
