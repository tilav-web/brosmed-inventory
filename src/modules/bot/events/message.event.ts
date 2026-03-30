import { Bot, Context } from 'grammy';
import { Injectable, Logger } from '@nestjs/common';
import { BotContentService } from '../services/bot-content.service';
import { resolveMainAction } from '../keyboards/main.keyboard';

@Injectable()
export class MessageEvent {
  private readonly logger = new Logger(MessageEvent.name);

  constructor(private readonly botContentService: BotContentService) {}

  register(bot: Bot) {
    bot.on('message:text', async (ctx: Context) => {
      const text = ctx.message?.text;
      if (!text) return;
      if (text.startsWith('/')) return;

      switch (resolveMainAction(text)) {
        case 'warehouses':
          await this.handleWarehouses(ctx);
          break;

        case 'stats':
          await this.handleStats(ctx);
          break;

        case 'products':
          await this.handleProducts(ctx);
          break;

        case 'expenses':
          await this.handleExpenses(ctx);
          break;

        case 'alerts':
          await this.handleAlerts(ctx);
          break;

        case 'settings':
          await this.handleSettings(ctx);
          break;

        case 'orders':
          await this.handleOrders(ctx);
          break;

        default:
          await ctx.reply(
            '❓ Tushunmadim. Tugmalardan foydalaning yoki /help ni bosing.',
          );
          break;
      }
    });
  }

  private async handleWarehouses(ctx: Context) {
    try {
      if (!ctx.from) {
        return;
      }

      const text = await this.botContentService.buildWarehousesMessage(
        ctx.from.id,
      );
      await ctx.reply(text, { parse_mode: 'HTML' });
    } catch (error) {
      this.logger.error('Omborlarni yuklashda xatolik:', error);
      await ctx.reply('❌ Omborlarni yuklashda xatolik yuz berdi.');
    }
  }

  private async handleAlerts(ctx: Context) {
    try {
      if (!ctx.from) {
        return;
      }

      const text = await this.botContentService.buildAlertsMessage(ctx.from.id);
      await ctx.reply(text, { parse_mode: 'HTML' });
    } catch (error) {
      this.logger.error('Ogohlantirishlarni yuklashda xatolik:', error);
      await ctx.reply('❌ Ogohlantirishlarni yuklashda xatolik yuz berdi.');
    }
  }

  private async handleStats(ctx: Context) {
    try {
      if (!ctx.from) {
        return;
      }

      const text = await this.botContentService.buildStatsMessage(ctx.from.id);
      await ctx.reply(text, { parse_mode: 'HTML' });
    } catch (error) {
      this.logger.error('Statistikani yuklashda xatolik:', error);
      await ctx.reply('❌ Statistikani yuklashda xatolik yuz berdi.');
    }
  }

  private async handleProducts(ctx: Context) {
    try {
      if (!ctx.from) {
        return;
      }

      const text = await this.botContentService.buildProductsMessage(
        ctx.from.id,
      );
      await ctx.reply(text, { parse_mode: 'HTML' });
    } catch (error) {
      this.logger.error('Mahsulotlarni yuklashda xatolik:', error);
      await ctx.reply('❌ Mahsulotlarni yuklashda xatolik yuz berdi.');
    }
  }

  private async handleExpenses(ctx: Context) {
    try {
      if (!ctx.from) {
        return;
      }

      const text = await this.botContentService.buildExpensesMessage(
        ctx.from.id,
      );
      await ctx.reply(text, { parse_mode: 'HTML' });
    } catch (error) {
      this.logger.error('Chiqimlarni yuklashda xatolik:', error);
      await ctx.reply('❌ Chiqimlarni yuklashda xatolik yuz berdi.');
    }
  }

  private async handleSettings(ctx: Context) {
    try {
      if (!ctx.from) {
        await ctx.reply("❌ Foydalanuvchi ma'lumoti topilmadi.");
        return;
      }

      const text = await this.botContentService.buildSettingsMessage(
        ctx.from.id,
      );
      await ctx.reply(text, { parse_mode: 'HTML' });
    } catch (error) {
      this.logger.error('Sozlamalarni yuklashda xatolik:', error);
      await ctx.reply('❌ Sozlamalarni yuklashda xatolik yuz berdi.');
    }
  }

  private async handleOrders(ctx: Context) {
    try {
      if (!ctx.from) {
        return;
      }

      const text = await this.botContentService.buildOrdersMessage(ctx.from.id);
      await ctx.reply(text, { parse_mode: 'HTML' });
    } catch (error) {
      this.logger.error('Xaridlarni yuklashda xatolik:', error);
      await ctx.reply('❌ Xaridlarni yuklashda xatolik yuz berdi.');
    }
  }
}
