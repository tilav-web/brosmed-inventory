import { Bot, Context } from 'grammy';
import { Injectable, Logger } from '@nestjs/common';
import { WarehouseService } from 'src/modules/warehouse/services/warehouse.service';

@Injectable()
export class MessageEvent {
  private readonly logger = new Logger(MessageEvent.name);

  constructor(private readonly warehouseService: WarehouseService) {}

  register(bot: Bot) {
    bot.on('message:text', async (ctx: Context) => {
      const text = ctx.message?.text;
      if (!text) return;

      switch (text) {
        case '📦 Omborlar':
          await this.handleWarehouses(ctx);
          break;

        case '📊 Statistika':
          await ctx.reply("📊 Statistika bo'limi hali tayyor emas.");
          break;

        case '💊 Mahsulotlar':
          await ctx.reply("💊 Mahsulotlar bo'limi hali tayyor emas.");
          break;

        case '📋 Chiqimlar':
          await ctx.reply("📋 Chiqimlar bo'limi hali tayyor emas.");
          break;

        case '🔔 Ogohlantirishlar':
          await this.handleAlerts(ctx);
          break;

        case '⚙️ Sozlamalar':
          await ctx.reply("⚙️ Sozlamalar bo'limi hali tayyor emas.");
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
      const query = { page: 1, limit: 20 };
      const result = await this.warehouseService.findAll(query);

      const warehouses = (result as { data: any[] }).data;

      if (!warehouses || warehouses.length === 0) {
        await ctx.reply('📦 Hozircha omborlar mavjud emas.');
        return;
      }

      let text = `📦 <b>Omborlar ro'yxati:</b>\n\n`;

      for (const warehouse of warehouses) {
        text += `🔹 <b>${warehouse.name}</b>\n`;
        text += `   📍 ${warehouse.location}\n`;
        text += `   🏷️ Turi: ${warehouse.type}\n\n`;
      }

      await ctx.reply(text, { parse_mode: 'HTML' });
    } catch (error) {
      this.logger.error('Omborlarni yuklashda xatolik:', error);
      await ctx.reply('❌ Omborlarni yuklashda xatolik yuz berdi.');
    }
  }

  private async handleAlerts(ctx: Context) {
    try {
      const result = (await this.warehouseService.findAll({
        page: 1,
        limit: 100,
      })) as { data: { id: string; name: string }[] };

      let text = `🔔 <b>Ogohlantirishlar:</b>\n\n`;
      let hasAlerts = false;

      for (const warehouse of result.data) {
        const details = (await this.warehouseService.findByIdWithDetails(
          warehouse.id,
        )) as {
          alerts: {
            count: number;
            items: { type: string; message: string }[];
          };
        };

        if (details.alerts.count > 0) {
          hasAlerts = true;
          text += `📦 <b>${warehouse.name}</b>\n`;

          for (const alert of details.alerts.items) {
            const icon = alert.type === 'low_stock' ? '⚠️' : '⏰';
            text += `   ${icon} ${alert.message}\n`;
          }
          text += '\n';
        }
      }

      if (!hasAlerts) {
        text += "✅ Hozircha ogohlantirishlar yo'q.";
      }

      await ctx.reply(text, { parse_mode: 'HTML' });
    } catch (error) {
      this.logger.error('Ogohlantirishlarni yuklashda xatolik:', error);
      await ctx.reply('❌ Ogohlantirishlarni yuklashda xatolik yuz berdi.');
    }
  }
}
