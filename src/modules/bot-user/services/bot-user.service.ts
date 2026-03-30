import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { User } from 'src/modules/user/entities/user.entity';
import { Role } from 'src/modules/user/enums/role.enum';
import { BotUser } from '../entities/bot-user.entity';
import { BotUserStatus } from '../enums/bot-user-status.enum';
import { ListBotUsersQueryDto } from '../dto/list-bot-users-query.dto';
import { UpdateBotUserDto } from '../dto/update-bot-user.dto';

type SafeLinkedUser = Pick<
  User,
  'id' | 'first_name' | 'last_name' | 'username' | 'role'
>;

@Injectable()
export class BotUserService {
  constructor(
    @InjectRepository(BotUser)
    private readonly botUserRepository: Repository<BotUser>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  async findOrCreate(data: {
    telegram_id: number;
    first_name?: string;
    last_name?: string;
    username?: string;
  }): Promise<BotUser> {
    let user = await this.botUserRepository.findOne({
      where: { telegram_id: data.telegram_id },
    });

    if (user) {
      user.first_name = data.first_name ?? user.first_name;
      user.last_name = data.last_name ?? user.last_name;
      user.username = data.username ?? user.username;
      user.last_active_at = new Date();

      if (user.status === BotUserStatus.BLOCKED) {
        user.status = BotUserStatus.ACTIVE;
      }

      return this.botUserRepository.save(user);
    }

    user = this.botUserRepository.create({
      telegram_id: data.telegram_id,
      first_name: data.first_name ?? null,
      last_name: data.last_name ?? null,
      username: data.username ?? null,
      status: BotUserStatus.PENDING,
      role: null,
      linked_user_id: null,
      last_active_at: new Date(),
    });

    return this.botUserRepository.save(user);
  }

  async findByTelegramId(telegramId: number): Promise<BotUser | null> {
    return this.botUserRepository.findOne({
      where: { telegram_id: telegramId },
    });
  }

  async save(user: BotUser): Promise<BotUser> {
    return this.botUserRepository.save(user);
  }

  async touchActivity(telegramId: number): Promise<void> {
    await this.botUserRepository.update(
      { telegram_id: telegramId },
      { last_active_at: new Date() },
    );
  }

  async markAsBlocked(telegramId: number): Promise<void> {
    await this.botUserRepository.update(
      { telegram_id: telegramId },
      { status: BotUserStatus.BLOCKED },
    );
  }

  async approve(id: string): Promise<BotUser> {
    const user = await this.botUserRepository.findOne({ where: { id } });
    if (!user) {
      throw new Error('Bot user topilmadi');
    }

    await this.validateResolvedState({
      currentUserId: user.id,
      role: user.role,
      linkedUserId: user.linked_user_id,
      isApproved: true,
    });

    user.is_approved = true;
    user.status = BotUserStatus.ACTIVE;
    return this.botUserRepository.save(user);
  }

  async revokeApproval(id: string): Promise<BotUser> {
    const user = await this.botUserRepository.findOne({ where: { id } });
    if (!user) {
      throw new Error('Bot user topilmadi');
    }
    user.is_approved = false;
    return this.botUserRepository.save(user);
  }

  async findAll(query: ListBotUsersQueryDto) {
    const page = query.page ?? 1;
    const limit = Math.min(query.limit ?? 10, 100);

    const qb = this.botUserRepository
      .createQueryBuilder('bot_user')
      .orderBy('bot_user.createdAt', 'DESC');

    if (query.search) {
      qb.andWhere(
        '(bot_user.first_name ILIKE :search OR bot_user.last_name ILIKE :search OR bot_user.username ILIKE :search)',
        { search: `%${query.search}%` },
      );
    }

    if (query.status) {
      qb.andWhere('bot_user.status = :status', { status: query.status });
    }

    if (query.role) {
      qb.andWhere('bot_user.role = :role', { role: query.role });
    }

    qb.skip((page - 1) * limit).take(limit);

    const [data, total] = await qb.getManyAndCount();
    const linkedUsers = await this.loadLinkedUsersMap(data);

    return {
      data: data.map((user) => this.mapBotUser(user, linkedUsers)),
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  async getApprovedUsers(role?: Role): Promise<BotUser[]> {
    const where: {
      is_approved: boolean;
      status: BotUserStatus;
      role?: Role;
    } = {
      is_approved: true,
      status: BotUserStatus.ACTIVE,
    };

    if (role) {
      where.role = role;
    }

    return this.botUserRepository.find({ where });
  }

  async findById(id: string) {
    const user = await this.botUserRepository.findOne({ where: { id } });
    if (!user) {
      return null;
    }

    const linkedUsers = await this.loadLinkedUsersMap([user]);
    return this.mapBotUser(user, linkedUsers);
  }

  async update(id: string, dto: UpdateBotUserDto) {
    const user = await this.botUserRepository.findOne({ where: { id } });
    if (!user) {
      throw new NotFoundException('Bot user topilmadi');
    }

    const nextRole =
      dto.role !== undefined ? dto.role : (user.role ?? null);
    const nextLinkedUserId =
      dto.linked_user_id !== undefined
        ? dto.linked_user_id
        : (user.linked_user_id ?? null);
    const nextIsApproved =
      dto.is_approved !== undefined ? dto.is_approved : user.is_approved;
    const resolvedLinkedUserId = await this.validateResolvedState({
      currentUserId: user.id,
      role: nextRole,
      linkedUserId: nextLinkedUserId,
      isApproved: nextIsApproved,
    });

    if (dto.status !== undefined) {
      user.status = dto.status;
    }
    if (dto.is_approved !== undefined) {
      user.is_approved = dto.is_approved;
    }
    if (dto.role !== undefined) {
      user.role = dto.role;
    }
    if (dto.linked_user_id !== undefined || dto.role !== undefined) {
      user.linked_user_id = resolvedLinkedUserId;
    }

    const saved = await this.botUserRepository.save(user);
    const linkedUsers = await this.loadLinkedUsersMap([saved]);
    return this.mapBotUser(saved, linkedUsers);
  }

  private async validateResolvedState(input: {
    currentUserId?: string;
    role: Role | null;
    linkedUserId: string | null;
    isApproved: boolean;
  }): Promise<string | null> {
    if (!input.role) {
      if (input.linkedUserId) {
        throw new BadRequestException(
          "linked_user_id berish uchun avval role tanlanishi kerak",
        );
      }

      if (input.isApproved) {
        throw new BadRequestException(
          "Tasdiqlangan bot foydalanuvchi uchun role majburiy",
        );
      }

      return null;
    }

    if (input.role === Role.ADMIN) {
      const qb = this.botUserRepository
        .createQueryBuilder('bot_user')
        .where('bot_user.role = :role', { role: Role.ADMIN });

      if (input.currentUserId) {
        qb.andWhere('bot_user.id != :currentUserId', {
          currentUserId: input.currentUserId,
        });
      }

      const existingAdminCount = await qb.getCount();
      if (existingAdminCount > 0) {
        throw new ConflictException("Bot userlar orasida faqat bitta admin bo'lishi mumkin");
      }
    }

    if (!input.linkedUserId) {
      if (
        input.role === Role.WAREHOUSE ||
        input.role === Role.ACCOUNTANT
      ) {
        throw new BadRequestException(
          `${input.role} role uchun linked_user_id majburiy`,
        );
      }

      return null;
    }

    const linkedUser = await this.userRepository.findOne({
      where: { id: input.linkedUserId },
    });

    if (!linkedUser) {
      throw new NotFoundException("Bog'langan tizim foydalanuvchisi topilmadi");
    }

    if (linkedUser.role !== input.role) {
      throw new BadRequestException(
        `Bog'langan tizim useri ${input.role} role da bo'lishi kerak`,
      );
    }

    return linkedUser.id;
  }

  private async loadLinkedUsersMap(botUsers: BotUser[]) {
    const ids = Array.from(
      new Set(
        botUsers
          .map((user) => user.linked_user_id)
          .filter((value): value is string => Boolean(value)),
      ),
    );

    if (!ids.length) {
      return new Map<string, SafeLinkedUser>();
    }

    const users = await this.userRepository.find({
      where: { id: In(ids) },
    });

    return new Map<string, SafeLinkedUser>(
      users.map((user) => [
        user.id,
        {
          id: user.id,
          first_name: user.first_name,
          last_name: user.last_name,
          username: user.username,
          role: user.role,
        },
      ]),
    );
  }

  private mapBotUser(
    user: BotUser,
    linkedUsers: Map<string, SafeLinkedUser>,
  ) {
    return {
      ...user,
      linked_user: user.linked_user_id
        ? linkedUsers.get(user.linked_user_id) ?? null
        : null,
    };
  }
}
