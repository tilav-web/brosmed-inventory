import { Bot, Context } from 'grammy';
import { Injectable } from '@nestjs/common';
import { BotContentService } from '../services/bot-content.service';

@Injectable()
export class WarehousesCommand {
  constructor(private readonly botContentService: BotContentService) {}

  register(bot: Bot) {
    bot.command('warehouses', async (ctx: Context) => {
      try {
        if (!ctx.from) {
          return;
        }

        const text = await this.botContentService.buildWarehousesMessage(
          ctx.from.id,
        );
        await ctx.reply(text, { parse_mode: 'HTML' });
      } catch {
        await ctx.reply('❌ Omborlarni yuklashda xatolik yuz berdi.');
      }
    });
  }
}
