import { Bot, Context } from 'grammy';
import { Injectable } from '@nestjs/common';
import { BotContentService } from '../services/bot-content.service';

@Injectable()
export class AlertsCommand {
  constructor(private readonly botContentService: BotContentService) {}

  register(bot: Bot) {
    bot.command('alerts', async (ctx: Context) => {
      try {
        const text = await this.botContentService.buildAlertsMessage();
        await ctx.reply(text, { parse_mode: 'HTML' });
      } catch {
        await ctx.reply('❌ Ogohlantirishlarni yuklashda xatolik yuz berdi.');
      }
    });
  }
}
