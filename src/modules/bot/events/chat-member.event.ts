import { Bot } from 'grammy';
import { Injectable, Logger } from '@nestjs/common';
import { BotUserService } from 'src/modules/bot-user/services/bot-user.service';
import { BotUserStatus } from 'src/modules/bot-user/enums/bot-user-status.enum';

@Injectable()
export class ChatMemberEvent {
  private readonly logger = new Logger(ChatMemberEvent.name);

  constructor(private readonly botUserService: BotUserService) {}

  register(bot: Bot) {
    bot.on('my_chat_member', async (ctx) => {
      const telegramId = ctx.from?.id;
      if (!telegramId) return;

      const status = ctx.myChatMember.new_chat_member.status;

      if (status === 'kicked' || status === 'left') {
        await this.botUserService.markAsBlocked(telegramId);
        this.logger.warn(`User ${telegramId} botni blokladi. status: blocked`);
      } else if (status === 'member' || status === 'administrator') {
        const user = await this.botUserService.findByTelegramId(telegramId);
        if (
          user &&
          [BotUserStatus.BLOCKED, BotUserStatus.PENDING].includes(user.status)
        ) {
          user.status = BotUserStatus.ACTIVE;
          await this.botUserService.save(user);
          this.logger.log(
            `User ${telegramId} botni qayta faollashtirdi. status: active`,
          );
        }
      }
    });
  }
}
