import { Bot, Context } from 'grammy';
import { Injectable } from '@nestjs/common';
import { mainKeyboard } from '../keyboards/main.keyboard';
import { BotUserService } from 'src/modules/bot-user/services/bot-user.service';

@Injectable()
export class StartCommand {
  constructor(private readonly botUserService: BotUserService) {}

  register(bot: Bot) {
    bot.command('start', async (ctx: Context) => {
      const telegramUser = ctx.from;
      if (!telegramUser) return;

      const user = await this.botUserService.findOrCreate({
        telegram_id: telegramUser.id,
        first_name: telegramUser.first_name,
        last_name: telegramUser.last_name,
        username: telegramUser.username,
      });

      const name =
        telegramUser.first_name || telegramUser.username || 'Foydalanuvchi';

      if (user.is_approved) {
        await ctx.reply(
          `Salom, <b>${name}</b>! 👋\n\n` +
            `Brosmed Inventory botiga xush kelibsiz.\n` +
            `Omborxonalar boshqarish tizimini shu yerda nazorat qilishingiz mumkin.\n\n` +
            `Buyruqlar uchun tugmalardan foydalaning yoki /help ni bosing.`,
          {
            parse_mode: 'HTML',
            reply_markup: mainKeyboard(),
          },
        );
      } else {
        await ctx.reply(
          `Salom, <b>${name}</b>! 👋\n\n` +
            `Brosmed Inventory botiga xush kelibsiz.\n\n` +
            `⏳ Sizning so'rovingiz admin tomonidan ko'rib chiqilmoqda.\n` +
            `Tasdiqlangandan so'ng botdan foydalanishingiz mumkin.`,
          {
            parse_mode: 'HTML',
            reply_markup: { remove_keyboard: true },
          },
        );
      }
    });
  }
}
