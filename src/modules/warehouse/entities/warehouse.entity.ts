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

// Warehouse: mahsulotlar saqlanadigan ombor/punkt.
@Entity({ name: 'warehouses' })
export class Warehouse {
  // Unikal identifikator (UUID).
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // Ombor nomi.
  @Column({ type: 'varchar' })
  name: string;

  // Ombor turi (masalan, tibbiy).
  @Column({
    type: 'enum',
    enum: WarehouseType,
    default: WarehouseType.MEDICAL,
  })
  type: WarehouseType;

  // Ombor joylashuvi/manzili.
  @Column({ type: 'varchar' })
  location: string;

  // Mas`ul manager ID.
  @Column({ type: 'uuid' })
  manager_id: string;

  // Mas`ul manager obyekti.
  @ManyToOne(() => User, (user) => user.warehouses)
  @JoinColumn({ name: 'manager_id' })
  manager: User;

  // Ombordagi productlar.
  @OneToMany(() => Product, (product) => product.warehouse)
  products: Product[];

  // Yaratilgan vaqt.
  @CreateDateColumn({ type: 'timestamp' })
  createdAt: Date;

  // Oxirgi yangilangan vaqt.
  @UpdateDateColumn({ type: 'timestamp' })
  updatedAt: Date;
}
