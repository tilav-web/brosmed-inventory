import { Bot, Context } from 'grammy';
import { Injectable } from '@nestjs/common';

@Injectable()
export class HelpCommand {
  register(bot: Bot) {
    bot.command('help', async (ctx: Context) => {
      const text =
        `📖 <b>Buyruqlar ro'yxati:</b>\n\n` +
        `/start - Botni ishga tushirish\n` +
        `/help - Yordam\n` +
        `/stats - Umumiy statistika\n` +
        `/products - Mahsulotlar holati\n` +
        `/expenses - So'nggi chiqimlar\n` +
        `/settings - Profil va sozlamalar\n` +
        `/warehouses - Omborlar ro'yxati\n` +
        `/alerts - Ogohlantirishlar\n\n` +
        `💡 Tugmalar orqali ham harakat qilishingiz mumkin.`;

      await ctx.reply(text, { parse_mode: 'HTML' });
    });
  }
}
