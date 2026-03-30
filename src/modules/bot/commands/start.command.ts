import { Bot, Context } from 'grammy';
import { Injectable } from '@nestjs/common';
import { mainKeyboard } from '../keyboards/main.keyboard';
import { BotUserService } from 'src/modules/bot-user/services/bot-user.service';
import { Role } from 'src/modules/user/enums/role.enum';

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
        if (!user.role) {
          await ctx.reply(
            `Salom, <b>${name}</b>! 👋\n\n` +
              `Akkauntingiz tasdiqlangan, lekin bot roli hali biriktirilmagan.\n` +
              `Admin profilingizga <b>admin</b> yoki <b>warehouse</b> role biriktirishi kerak.`,
            {
              parse_mode: 'HTML',
              reply_markup: { remove_keyboard: true },
            },
          );
          return;
        }

        if (
          (user.role === Role.WAREHOUSE || user.role === Role.ACCOUNTANT) &&
          !user.linked_user_id
        ) {
          await ctx.reply(
            `Salom, <b>${name}</b>! 👋\n\n` +
              `Sizga ${user.role} roli tanlangan, lekin tizimdagi user hali bog'lanmagan.\n` +
              `Admin <b>linked_user_id</b> biriktirgach, profilingiz to'liq faollashadi.`,
            {
              parse_mode: 'HTML',
              reply_markup: { remove_keyboard: true },
            },
          );
          return;
        }

        const intro =
          user.role === Role.ADMIN
            ? `Brosmed Inventory botiga xush kelibsiz.\n` +
              `Tizim bo'yicha umumiy ombor nazorati shu yerda mavjud.`
            : user.role === Role.ACCOUNTANT
              ? `Brosmed Inventory botiga xush kelibsiz.\n` +
                `Xarid va chiqim hujjatlarini kuzatishingiz mumkin.`
            : `Brosmed Inventory botiga xush kelibsiz.\n` +
              `Sizga biriktirilgan omborlar bo'yicha ma'lumotlarni shu yerda ko'rishingiz mumkin.`;

        const commandHint =
          user.role === Role.ADMIN
            ? `Asosiy buyruqlar: /stats, /products, /expenses, /warehouses, /alerts`
            : user.role === Role.ACCOUNTANT
              ? `Asosiy buyruqlar: /orders, /expenses, /stats, /settings`
            : `Asosiy buyruqlar: /stats, /products, /expenses, /warehouses, /alerts`;

        await ctx.reply(
          `Salom, <b>${name}</b>! 👋\n\n` +
            `${intro}\n\n` +
            `Buyruqlar uchun tugmalardan foydalaning yoki /help ni bosing.\n` +
            `${commandHint}`,
          {
            parse_mode: 'HTML',
            reply_markup: mainKeyboard(user.role),
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
