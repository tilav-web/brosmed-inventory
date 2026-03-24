import { Context } from 'grammy';
import { Injectable } from '@nestjs/common';
import { mainKeyboard } from '../keyboards/main.keyboard';

@Injectable()
export class StartCommand {
  async handle(ctx: Context) {
    const name = ctx.from?.first_name || ctx.from?.username || 'Foydalanuvchi';

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
  }
}
