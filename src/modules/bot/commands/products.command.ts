import { Bot, Context } from 'grammy';
import { Injectable } from '@nestjs/common';
import { BotContentService } from '../services/bot-content.service';

@Injectable()
export class ProductsCommand {
  constructor(private readonly botContentService: BotContentService) {}

  register(bot: Bot) {
    bot.command('products', async (ctx: Context) => {
      const text = await this.botContentService.buildProductsMessage();
      await ctx.reply(text, { parse_mode: 'HTML' });
    });
  }
}
