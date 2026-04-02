import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { BotUserStatus } from '../enums/bot-user-status.enum';

@Entity('bot_users')
export class BotUser {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index({ unique: true })
  @Column({ type: 'bigint' })
  telegram_id: number;

  @Column({ type: 'varchar', nullable: true })
  first_name: string | null;

  @Column({ type: 'varchar', nullable: true })
  last_name: string | null;

  @Index({ unique: true })
  @Column({ type: 'varchar', nullable: true })
  username: string | null;

  @Column({
    type: 'enum',
    enum: BotUserStatus,
    default: BotUserStatus.ACTIVE,
  })
  status: BotUserStatus;

  @Column({ type: 'boolean', default: false })
  is_approved: boolean;

  @Column({ type: 'uuid', nullable: true })
  linked_user_id: string | null;

  @Column({ type: 'timestamp', nullable: true })
  last_active_at: Date | null;

  @CreateDateColumn({ type: 'timestamp' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamp' })
  updatedAt: Date;
}
