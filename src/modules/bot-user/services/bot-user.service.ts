import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BotUser } from '../entities/bot-user.entity';
import { BotUserStatus } from '../enums/bot-user-status.enum';
import { ListBotUsersQueryDto } from '../dto/list-bot-users-query.dto';
import { UpdateBotUserDto } from '../dto/update-bot-user.dto';

@Injectable()
export class BotUserService {
  constructor(
    @InjectRepository(BotUser)
    private readonly botUserRepository: Repository<BotUser>,
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

    qb.skip((page - 1) * limit).take(limit);

    const [data, total] = await qb.getManyAndCount();

    return {
      data,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  async getApprovedUsers(): Promise<BotUser[]> {
    return this.botUserRepository.find({
      where: {
        is_approved: true,
        status: BotUserStatus.ACTIVE,
      },
    });
  }

  async findById(id: string): Promise<BotUser | null> {
    return this.botUserRepository.findOne({ where: { id } });
  }

  async update(id: string, dto: UpdateBotUserDto): Promise<BotUser> {
    const user = await this.botUserRepository.findOne({ where: { id } });
    if (!user) {
      throw new NotFoundException('Bot user topilmadi');
    }
    if (dto.status !== undefined) {
      user.status = dto.status;
    }
    if (dto.is_approved !== undefined) {
      user.is_approved = dto.is_approved;
    }
    return this.botUserRepository.save(user);
  }
}
