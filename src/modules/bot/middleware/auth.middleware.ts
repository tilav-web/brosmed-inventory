import { Bot, Context } from 'grammy';
import { Injectable } from '@nestjs/common';
import { BotUserService } from 'src/modules/bot-user/services/bot-user.service';
import { BotUserStatus } from 'src/modules/bot-user/enums/bot-user-status.enum';
import { Role } from 'src/modules/user/enums/role.enum';

@Injectable()
export class AuthMiddleware {
  constructor(private readonly botUserService: BotUserService) {}

  register(bot: Bot) {
    bot.use(async (ctx: Context, next) => {
      const telegramUser = ctx.from;
      if (!telegramUser) return next();

      const user = await this.botUserService.findByTelegramId(telegramUser.id);

      if (!user) {
        await ctx.reply("❗ Avval /start buyrug'ini bosing.");
        return;
      }

      await this.botUserService.touchActivity(telegramUser.id);

      if (user.status === BotUserStatus.BLOCKED) {
        await ctx.reply("🚫 Siz bloklangansiz. Admin bilan bog'laning.");
        return;
      }

      if (!user.is_approved) {
        await ctx.reply(
          '⏳ Siz hali tasdiqlanmagansiz.\n' +
            'Admin sizni tasdiqlashini kuting.',
        );
        return;
      }

      if (!user.role) {
        await ctx.reply(
          "⏳ Akkauntingiz tasdiqlangan, lekin bot roli hali biriktirilmagan.\nAdmin bilan bog'laning.",
        );
        return;
      }

      if (
        (user.role === Role.WAREHOUSE || user.role === Role.ACCOUNTANT) &&
        !user.linked_user_id
      ) {
        await ctx.reply(
          `⏳ ${user.role} roli berilgan, lekin tizimdagi user hali bog'lanmagan.\nAdmin bilan bog'laning.`,
        );
        return;
      }

      return next();
    });
  }
}
