import { Bot, Context } from 'grammy';
import { Injectable } from '@nestjs/common';
import { BotContentService } from '../services/bot-content.service';

@Injectable()
export class StatsCommand {
  constructor(private readonly botContentService: BotContentService) {}

  register(bot: Bot) {
    bot.command('stats', async (ctx: Context) => {
      const text = await this.botContentService.buildStatsMessage();
      await ctx.reply(text, { parse_mode: 'HTML' });
    });
  }
}
