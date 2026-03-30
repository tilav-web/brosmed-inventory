import { Bot, Context } from 'grammy';
import { Injectable } from '@nestjs/common';
import { BotContentService } from '../services/bot-content.service';

@Injectable()
export class ExpensesCommand {
  constructor(private readonly botContentService: BotContentService) {}

  register(bot: Bot) {
    bot.command('expenses', async (ctx: Context) => {
      if (!ctx.from) {
        return;
      }

      const text = await this.botContentService.buildExpensesMessage(
        ctx.from.id,
      );
      await ctx.reply(text, { parse_mode: 'HTML' });
    });
  }
}
