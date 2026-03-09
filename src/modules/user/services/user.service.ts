import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { hash } from 'bcrypt';
import { Repository } from 'typeorm';
import { Role } from '../enums/role.enum';
import { User } from '../entities/user.entity';
import { AdminCreateUserDto } from '../dto/admin-create-user.dto';
import { AdminUpdateUserDto } from '../dto/admin-update-user.dto';
import { UpdateOwnProfileDto } from '../dto/update-own-profile.dto';

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

  private sanitizeUser(user: User): Omit<User, 'password'> {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { password, ...safeUser } = user;
    return safeUser;
  }

  private async findByUsernameExcludingId(
    username: string,
    userId: string,
  ): Promise<User | null> {
    return this.userRepository
      .createQueryBuilder('user')
      .where('user.username = :username', { username })
      .andWhere('user.id != :userId', { userId })
      .getOne();
  }

  private assertWarehouseTarget(user: User): void {
    if (user.role !== Role.WAREHOUSE) {
      throw new ForbiddenException(
        "Admin faqat warehouse role'li userlarni o'zgartira oladi",
      );
    }
  }

  async updateOwnProfile(userId: string, dto: UpdateOwnProfileDto) {
    const user = await this.findById(userId);
    if (!user) {
      throw new NotFoundException('Foydalanuvchi topilmadi');
    }

    if (dto.first_name !== undefined) {
      user.first_name = dto.first_name;
    }
    if (dto.last_name !== undefined) {
      user.last_name = dto.last_name;
    }
    if (dto.password !== undefined) {
      user.password = await hash(dto.password, 10);
    }

    const updatedUser = await this.userRepository.save(user);
    return this.sanitizeUser(updatedUser);
  }

  async createWarehouseUserByAdmin(dto: AdminCreateUserDto) {
    const existingUser = await this.findByUsername(dto.username);
    if (existingUser) {
      throw new ConflictException('Bunday username allaqachon mavjud');
    }

    const hashedPassword = await hash(dto.password, 10);
    const createdUser = await this.userRepository.save(
      this.userRepository.create({
        username: dto.username,
        password: hashedPassword,
        first_name: dto.first_name ?? '-',
        last_name: dto.last_name ?? '-',
      }),
    );

    return this.sanitizeUser(createdUser);
  }

  async updateWarehouseUserByAdmin(userId: string, dto: AdminUpdateUserDto) {
    const user = await this.findById(userId);
    if (!user) {
      throw new NotFoundException('Foydalanuvchi topilmadi');
    }

    this.assertWarehouseTarget(user);

    if (dto.role !== undefined) {
      throw new ForbiddenException("Role ni o'zgartirish mumkin emas");
    }

    if (dto.username !== undefined && dto.username !== user.username) {
      const conflict = await this.findByUsernameExcludingId(
        dto.username,
        user.id,
      );
      if (conflict) {
        throw new ConflictException('Bunday username allaqachon mavjud');
      }
      user.username = dto.username;
    }

    if (dto.first_name !== undefined) {
      user.first_name = dto.first_name;
    }
    if (dto.last_name !== undefined) {
      user.last_name = dto.last_name;
    }
    if (dto.password !== undefined) {
      user.password = await hash(dto.password, 10);
    }

    const updatedUser = await this.userRepository.save(user);
    return this.sanitizeUser(updatedUser);
  }

  async deleteWarehouseUserByAdmin(userId: string) {
    const user = await this.findById(userId);
    if (!user) {
      throw new NotFoundException('Foydalanuvchi topilmadi');
    }

    this.assertWarehouseTarget(user);

    await this.userRepository.delete(user.id);
    return { message: "Warehouse user o'chirildi" };
  }

  private async ensureDefaultUsers(): Promise<void> {
    const defaults: Array<{ username: string; password: string; role: Role }> =
      [
        {
          username: this.configService.get<string>('ADMIN_USERNAME', 'admin'),
          password: this.configService.get<string>(
            'ADMIN_PASSWORD',
            'admin12345',
          ),
          role: Role.ADMIN,
        },
        {
          username: this.configService.get<string>(
            'WAREHOUSE_USERNAME',
            'warehouse',
          ),
          password: this.configService.get<string>(
            'WAREHOUSE_PASSWORD',
            'warehouse12345',
          ),
          role: Role.WAREHOUSE,
        },
      ];

    for (const account of defaults) {
      const existing = await this.findByUsername(account.username);
      if (existing) {
        continue;
      }

      const hashedPassword = await hash(account.password, 10);
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
