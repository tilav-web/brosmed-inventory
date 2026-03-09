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
import { Product } from 'src/modules/product/entities/product.entity';
import { User } from 'src/modules/user/entities/user.entity';
import { WarehouseType } from '../enums/warehouse-type.enum';

@Entity({ name: 'warehouses' })
export class Warehouse {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar' })
  name: string;

  @Column({
    type: 'enum',
    enum: WarehouseType,
    default: WarehouseType.MEDICAL,
  })
  type: WarehouseType;

  @Column({ type: 'varchar' })
  location: string;

  @Column({ type: 'uuid' })
  manager_id: string;

  @ManyToOne(() => User, (user) => user.warehouses)
  @JoinColumn({ name: 'manager_id' })
  manager: User;

  @OneToMany(() => Product, (product) => product.warehouse)
  products: Product[];

  @CreateDateColumn({ type: 'timestamp' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamp' })
  updatedAt: Date;
}
