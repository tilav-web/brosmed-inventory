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
import { Brackets, QueryFailedError, Repository } from 'typeorm';
import { Role } from '../enums/role.enum';
import { User } from '../entities/user.entity';
import { AdminCreateUserDto } from '../dto/admin-create-user.dto';
import { AdminUpdateUserDto } from '../dto/admin-update-user.dto';
import { UpdateOwnProfileDto } from '../dto/update-own-profile.dto';
import { AdminListUsersQueryDto } from '../dto/admin-list-users-query.dto';

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

  async findSafeByIdOrFail(id: string): Promise<Omit<User, 'password'>> {
    const user = await this.findById(id);
    if (!user) {
      throw new NotFoundException('Foydalanuvchi topilmadi');
    }

    return this.sanitizeUser(user);
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
    const hashedPassword = await hash(dto.password, 10);
    try {
      const createdUser = await this.userRepository.save(
        this.userRepository.create({
          username: dto.username,
          password: hashedPassword,
          first_name: dto.first_name ?? '-',
          last_name: dto.last_name ?? '-',
          role: Role.WAREHOUSE,
        }),
      );
      return this.sanitizeUser(createdUser);
    } catch (error) {
      if (
        error instanceof QueryFailedError &&
        (error as unknown as { code: string }).code === '23505'
      ) {
        throw new ConflictException('Bunday username allaqachon mavjud');
      }
      throw error;
    }
  }

  async listUsersForAdmin(adminUserId: string, query: AdminListUsersQueryDto) {
    const page = query.page ?? 1;
    const limit = Math.min(query.limit ?? 10, 100);
    const search = query.search?.trim();

    const qb = this.userRepository
      .createQueryBuilder('user')
      .where('user.id != :adminUserId', { adminUserId });

    if (search) {
      qb.andWhere(
        new Brackets((whereQb) => {
          whereQb
            .where('user.first_name ILIKE :search', { search: `%${search}%` })
            .orWhere('user.last_name ILIKE :search', { search: `%${search}%` })
            .orWhere('user.username ILIKE :search', { search: `%${search}%` });
        }),
      );
    }

    qb.orderBy('user.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    const [users, total] = await qb.getManyAndCount();

    return {
      data: users.map((user) => this.sanitizeUser(user)),
      meta: {
        page,
        limit,
        total,
        total_pages: Math.ceil(total / limit) || 1,
      },
    };
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
