import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  OnModuleInit,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { compare, hash } from 'bcrypt';
import { Brackets, QueryFailedError, Repository } from 'typeorm';
import { Warehouse } from 'src/modules/warehouse/entities/warehouse.entity';
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
    @InjectRepository(Warehouse)
    private readonly warehouseRepository: Repository<Warehouse>,
    private readonly configService: ConfigService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.ensureDefaultAdmin();
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

  async findUserForAdmin(id: string): Promise<Omit<User, 'password'>> {
    const user = await this.findById(id);
    if (!user) {
      throw new NotFoundException('Foydalanuvchi topilmadi');
    }

    this.assertTargetIsNotAdmin(user);
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

  private assertTargetIsNotAdmin(user: User): void {
    if (user.role === Role.ADMIN) {
      throw new ForbiddenException(
        "Admin role'li userni boshqarish taqiqlangan",
      );
    }
  }

  private assertRoleCreatableOrAssignable(role: Role): void {
    if (role === Role.ADMIN) {
      throw new ForbiddenException(
        "Admin role'ni yaratish yoki biriktirish mumkin emas",
      );
    }
  }

  private async ensureRoleTransitionAllowed(
    user: User,
    nextRole: Role,
  ): Promise<void> {
    if (user.role === nextRole) {
      return;
    }

    if (user.role === Role.WAREHOUSE && nextRole !== Role.WAREHOUSE) {
      const assignedWarehouses = await this.warehouseRepository.count({
        where: { manager_id: user.id },
      });

      if (assignedWarehouses > 0) {
        throw new ForbiddenException(
          "Warehousega biriktirilgan user rolini o'zgartirib bo'lmaydi. Avval warehouse managerini almashtiring",
        );
      }
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
      if (!dto.current_password) {
        throw new BadRequestException(
          'Parolni yangilash uchun joriy parolni kiriting',
        );
      }

      const isCurrentPasswordValid = await compare(
        dto.current_password,
        user.password,
      );
      if (!isCurrentPasswordValid) {
        throw new UnauthorizedException('Joriy parol xato');
      }

      user.password = await hash(dto.password, 10);
    }

    const updatedUser = await this.userRepository.save(user);
    return this.sanitizeUser(updatedUser);
  }

  async createUserByAdmin(dto: AdminCreateUserDto) {
    this.assertRoleCreatableOrAssignable(dto.role);

    const hashedPassword = await hash(dto.password, 10);
    try {
      const createdUser = await this.userRepository.save(
        this.userRepository.create({
          username: dto.username,
          password: hashedPassword,
          first_name: dto.first_name ?? '-',
          last_name: dto.last_name ?? '-',
          role: dto.role,
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
            .orWhere('user.username ILIKE :search', { search: `%${search}%` })
            .orWhere(
              "CONCAT_WS(' ', user.first_name, user.last_name) ILIKE :search",
              {
                search: `%${search}%`,
              },
            )
            .orWhere(
              "CONCAT_WS(' ', user.last_name, user.first_name) ILIKE :search",
              {
                search: `%${search}%`,
              },
            );
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

  async updateUserByAdmin(userId: string, dto: AdminUpdateUserDto) {
    const user = await this.findById(userId);
    if (!user) {
      throw new NotFoundException('Foydalanuvchi topilmadi');
    }

    this.assertTargetIsNotAdmin(user);

    if (dto.role !== undefined) {
      this.assertRoleCreatableOrAssignable(dto.role);
      await this.ensureRoleTransitionAllowed(user, dto.role);
      user.role = dto.role;
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

  async deleteUserByAdmin(userId: string) {
    const user = await this.findById(userId);
    if (!user) {
      throw new NotFoundException('Foydalanuvchi topilmadi');
    }

    this.assertTargetIsNotAdmin(user);

    if (user.role === Role.WAREHOUSE) {
      const assignedWarehouses = await this.warehouseRepository.count({
        where: { manager_id: user.id },
      });

      if (assignedWarehouses > 0) {
        throw new ConflictException(
          'Bu warehouse userga ombor biriktirilgan. Avval warehouse managerini almashtiring',
        );
      }
    }

    await this.userRepository.delete(user.id);
    return { message: "User o'chirildi" };
  }

  private async ensureDefaultAdmin(): Promise<void> {
    const existingAdmin = await this.userRepository.findOne({
      where: { role: Role.ADMIN },
    });
    if (existingAdmin) {
      return;
    }

    const username = this.configService.get<string>(
      'ADMIN_USERNAME',
      'nodir_hamrayev',
    );
    const password = this.configService.get<string>(
      'ADMIN_PASSWORD',
      '12345678',
    );

    const existingWithUsername = await this.findByUsername(username);
    if (existingWithUsername) {
      throw new ConflictException(
        `ADMIN_USERNAME=${username} allaqachon mavjud, lekin admin role bilan emas`,
      );
    }

    const hashedPassword = await hash(password, 10);
    await this.userRepository.save(
      this.userRepository.create({
        username,
        password: hashedPassword,
        role: Role.ADMIN,
      }),
    );
  }
}
