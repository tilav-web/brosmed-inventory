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
import { ListLinkableUsersQueryDto } from '../dto/list-linkable-users-query.dto';
import { UpdateBotUserDto } from '../dto/update-bot-user.dto';

type SafeLinkedUser = Pick<
  User,
  'id' | 'first_name' | 'last_name' | 'username' | 'role'
>;

type BotUserWithLinkedUser = BotUser & {
  role: Role | null;
  linked_user?: SafeLinkedUser | null;
};

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
  }): Promise<BotUserWithLinkedUser> {
    let user = await this.botUserRepository.findOne({
      where: { telegram_id: data.telegram_id },
    });

    if (user) {
      user.first_name = data.first_name ?? user.first_name;
      user.last_name = data.last_name ?? user.last_name;
      user.username = data.username ?? user.username;
      user.last_active_at = new Date();
      user.status = BotUserStatus.ACTIVE;

      const saved = await this.botUserRepository.save(user);
      return this.normalizeSingleBotUser(saved);
    }

    user = this.botUserRepository.create({
      telegram_id: data.telegram_id,
      first_name: data.first_name ?? null,
      last_name: data.last_name ?? null,
      username: data.username ?? null,
      status: BotUserStatus.ACTIVE,
      linked_user_id: null,
      last_active_at: new Date(),
    });

    const saved = await this.botUserRepository.save(user);
    return this.normalizeSingleBotUser(saved);
  }

  async findByTelegramId(
    telegramId: number,
  ): Promise<BotUserWithLinkedUser | null> {
    let user = await this.botUserRepository.findOne({
      where: { telegram_id: telegramId },
    });
    if (!user) {
      return null;
    }

    user = await this.normalizeLegacyPendingStatus(user);
    return this.normalizeSingleBotUser(user);
  }

  async save(user: BotUser): Promise<BotUserWithLinkedUser> {
    const saved = await this.botUserRepository.save(user);
    return this.normalizeSingleBotUser(saved);
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

  async approve(id: string): Promise<BotUserWithLinkedUser> {
    const user = await this.botUserRepository.findOne({ where: { id } });
    if (!user) {
      throw new Error('Bot user topilmadi');
    }

    const resolvedState = await this.validateResolvedState({
      currentUserId: user.id,
      linkedUserId: user.linked_user_id,
      isApproved: true,
    });

    user.is_approved = true;
    user.status = BotUserStatus.ACTIVE;
    user.linked_user_id = resolvedState.linkedUserId;

    const saved = await this.botUserRepository.save(user);
    return this.normalizeSingleBotUser(saved);
  }

  async revokeApproval(id: string): Promise<BotUserWithLinkedUser> {
    const user = await this.botUserRepository.findOne({ where: { id } });
    if (!user) {
      throw new Error('Bot user topilmadi');
    }
    user.is_approved = false;
    const saved = await this.botUserRepository.save(user);
    return this.normalizeSingleBotUser(saved);
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

    const data = await qb.getMany();
    const linkedUsers = await this.loadLinkedUsersMap(data);
    const normalized = data.map((user) => this.mapBotUser(user, linkedUsers));
    const filtered = query.role
      ? normalized.filter((user) => user.role === query.role)
      : normalized;
    const total = filtered.length;
    const paginated = filtered.slice((page - 1) * limit, page * limit);

    return {
      data: paginated,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  async listLinkableUsers(query: ListLinkableUsersQueryDto) {
    const page = query.page ?? 1;
    const limit = Math.min(query.limit ?? 10, 100);
    const search = query.search?.trim();

    const qb = this.userRepository
      .createQueryBuilder('user')
      .select([
        'user.id',
        'user.first_name',
        'user.last_name',
        'user.username',
        'user.role',
        'user.createdAt',
        'user.updatedAt',
      ]);

    if (search) {
      qb.andWhere(
        "(user.first_name ILIKE :search OR user.last_name ILIKE :search OR user.username ILIKE :search OR CONCAT_WS(' ', user.first_name, user.last_name) ILIKE :search OR CONCAT_WS(' ', user.last_name, user.first_name) ILIKE :search)",
        { search: `%${search}%` },
      );
    }

    qb.orderBy('user.createdAt', 'DESC');

    const users = await qb.getMany();
    const linkedBotUsers = await this.botUserRepository.find({
      where: {
        linked_user_id: In(users.map((user) => user.id)),
      },
    });

    const linkedBotUserByUserId = new Map(
      linkedBotUsers
        .filter((botUser) => Boolean(botUser.linked_user_id))
        .map((botUser) => [botUser.linked_user_id!, botUser.id]),
    );

    const paginated = users.slice((page - 1) * limit, page * limit);

    return {
      data: paginated.map((user) => ({
        id: user.id,
        first_name: user.first_name,
        last_name: user.last_name,
        username: user.username,
        role: user.role,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
        linked_bot_user_id: linkedBotUserByUserId.get(user.id) ?? null,
        is_linked: linkedBotUserByUserId.has(user.id),
      })),
      meta: {
        page,
        limit,
        total: users.length,
        total_pages: Math.ceil(users.length / limit) || 1,
      },
    };
  }

  async getApprovedUsers(role?: Role): Promise<BotUserWithLinkedUser[]> {
    const users = await this.botUserRepository.find({
      where: {
        is_approved: true,
      },
    });

    const reachableUsers = await Promise.all(
      users
        .filter((user) => user.status !== BotUserStatus.BLOCKED)
        .map((user) => this.normalizeLegacyPendingStatus(user)),
    );

    const linkedUsers = await this.loadLinkedUsersMap(reachableUsers);
    const normalized = reachableUsers
      .map((user) => this.mapBotUser(user, linkedUsers))
      .filter(
        (user): user is BotUserWithLinkedUser =>
          Boolean(user.linked_user_id && user.role),
      );

    if (!role) {
      return normalized;
    }

    return normalized.filter((user) => user.role === role);
  }

  async findApprovedByLinkedUserId(
    linkedUserId: string,
  ): Promise<BotUserWithLinkedUser | null> {
    const botUser = await this.botUserRepository.findOne({
      where: {
        linked_user_id: linkedUserId,
        is_approved: true,
      },
    });

    if (!botUser || botUser.status === BotUserStatus.BLOCKED) {
      return null;
    }

    const normalizedUser = await this.normalizeLegacyPendingStatus(botUser);
    return this.normalizeSingleBotUser(normalizedUser);
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

    const nextLinkedUserId =
      dto.linked_user_id !== undefined
        ? dto.linked_user_id
        : (user.linked_user_id ?? null);
    const nextIsApproved =
      dto.is_approved !== undefined ? dto.is_approved : user.is_approved;
    const resolvedState = await this.validateResolvedState({
      currentUserId: user.id,
      linkedUserId: nextLinkedUserId,
      isApproved: nextIsApproved,
    });

    if (dto.status !== undefined) {
      user.status = dto.status;
    } else if (user.status !== BotUserStatus.BLOCKED) {
      user.status = BotUserStatus.ACTIVE;
    }
    if (dto.is_approved !== undefined) {
      user.is_approved = dto.is_approved;
    }
    if (dto.linked_user_id !== undefined || dto.is_approved !== undefined) {
      user.linked_user_id = resolvedState.linkedUserId;
    }

    const saved = await this.botUserRepository.save(user);
    const linkedUsers = await this.loadLinkedUsersMap([saved]);
    return this.mapBotUser(saved, linkedUsers);
  }

  private async validateResolvedState(input: {
    currentUserId?: string;
    linkedUserId: string | null;
    isApproved: boolean;
  }): Promise<{ role: Role | null; linkedUserId: string | null }> {
    if (input.linkedUserId) {
      const linkedUser = await this.userRepository.findOne({
        where: { id: input.linkedUserId },
      });

      if (!linkedUser) {
        throw new NotFoundException("Bog'langan tizim foydalanuvchisi topilmadi");
      }

      await this.ensureLinkedUserIsUnique(linkedUser.id, input.currentUserId);

      return {
        role: linkedUser.role,
        linkedUserId: linkedUser.id,
      };
    }

    if (input.isApproved) {
      throw new BadRequestException(
        "Tasdiqlangan bot foydalanuvchi uchun linked_user_id majburiy",
      );
    }

    return {
      role: null,
      linkedUserId: null,
    };
  }

  private async ensureLinkedUserIsUnique(
    linkedUserId: string,
    currentBotUserId?: string,
  ) {
    const qb = this.botUserRepository
      .createQueryBuilder('bot_user')
      .where('bot_user.linked_user_id = :linkedUserId', {
        linkedUserId,
      });

    if (currentBotUserId) {
      qb.andWhere('bot_user.id != :currentBotUserId', {
        currentBotUserId,
      });
    }

    const existingAdminLinkCount = await qb.getCount();
    if (existingAdminLinkCount > 0) {
      throw new ConflictException(
        "Bu tizim useri allaqachon boshqa bot userga biriktirilgan",
      );
    }
  }

  private async normalizeSingleBotUser(
    user: BotUser,
  ): Promise<BotUserWithLinkedUser> {
    user = await this.normalizeLegacyPendingStatus(user);
    const linkedUsers = await this.loadLinkedUsersMap([user]);
    return this.mapBotUser(user, linkedUsers);
  }

  private async normalizeLegacyPendingStatus(user: BotUser): Promise<BotUser> {
    if (user.status !== BotUserStatus.PENDING) {
      return user;
    }

    user.status = BotUserStatus.ACTIVE;
    return this.botUserRepository.save(user);
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
  ): BotUserWithLinkedUser {
    const linkedUser = user.linked_user_id
      ? linkedUsers.get(user.linked_user_id) ?? null
      : null;

    return {
      ...user,
      role: linkedUser?.role ?? null,
      linked_user: linkedUser,
    };
  }
}
