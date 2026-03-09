import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { Repository } from 'typeorm';
import { Role } from '../enums/role.enum';
import { User } from '../entities/user.entity';

@Injectable()
export class UserService implements OnModuleInit {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly configService: ConfigService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.ensureDefaultUsers();
  }

  async findByUsername(username: string): Promise<User | null> {
    return this.userRepository.findOne({ where: { username } });
  }

  async findById(id: string): Promise<User | null> {
    return this.userRepository.findOne({ where: { id } });
  }

  private async ensureDefaultUsers(): Promise<void> {
    const defaults: Array<{ username: string; password: string; role: Role }> = [
      {
        username: this.configService.get<string>('ADMIN_USERNAME', 'admin'),
        password: this.configService.get<string>('ADMIN_PASSWORD', 'admin12345'),
        role: Role.Admin,
      },
      {
        username: this.configService.get<string>('WAREHOUSE_USERNAME', 'warehouse'),
        password: this.configService.get<string>('WAREHOUSE_PASSWORD', 'warehouse12345'),
        role: Role.Warehouse,
      },
    ];

    for (const account of defaults) {
      const existing = await this.findByUsername(account.username);
      if (existing) {
        continue;
      }

      const hashedPassword = await bcrypt.hash(account.password, 10);
      await this.userRepository.save(
        this.userRepository.create({
          username: account.username,
          password: hashedPassword,
          role: account.role,
        }),
      );
    }
  }
}
