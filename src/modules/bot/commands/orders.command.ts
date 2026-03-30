import { Bot, Context } from 'grammy';
import { Injectable } from '@nestjs/common';
import { BotContentService } from '../services/bot-content.service';

@Injectable()
export class OrdersCommand {
  constructor(private readonly botContentService: BotContentService) {}

  register(bot: Bot) {
    bot.command('orders', async (ctx: Context) => {
      if (!ctx.from) {
        return;
      }

      const text = await this.botContentService.buildOrdersMessage(ctx.from.id);
      await ctx.reply(text, { parse_mode: 'HTML' });
    });
  }
}
