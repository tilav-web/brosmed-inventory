import { Context } from 'grammy';
import { Injectable } from '@nestjs/common';

@Injectable()
export class HelpCommand {
  async handle(ctx: Context) {
    const text =
      `📖 <b>Buyruqlar ro'yxati:</b>\n\n` +
      `/start - Botni ishga tushirish\n` +
      `/help - Yordam\n` +
      `/warehouses - Omborlar ro'yxati\n` +
      `/products - Mahsulotlar ro'yxati\n` +
      `/alerts - Ogohlantirishlar\n\n` +
      `💡 Tugmalar orqali ham harakat qilishingiz mumkin.`;

    await ctx.reply(text, { parse_mode: 'HTML' });
  }
}
