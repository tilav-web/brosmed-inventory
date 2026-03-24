import { Context } from 'grammy';
import { Injectable } from '@nestjs/common';
import { WarehouseService } from 'src/modules/warehouse/services/warehouse.service';

@Injectable()
export class AlertsCommand {
  constructor(private readonly warehouseService: WarehouseService) {}

  async handle(ctx: Context) {
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
          alerts: { count: number; items: { type: string; message: string }[] };
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
    } catch {
      await ctx.reply('❌ Ogohlantirishlarni yuklashda xatolik yuz berdi.');
    }
  }
}
