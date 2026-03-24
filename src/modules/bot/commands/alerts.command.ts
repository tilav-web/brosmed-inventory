import { Context } from 'grammy';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Warehouse } from 'src/modules/warehouse/entities/warehouse.entity';
import { WarehouseService } from 'src/modules/warehouse/services/warehouse.service';

@Injectable()
export class AlertsCommand {
  constructor(
    private readonly warehouseService: WarehouseService,
    @InjectRepository(Warehouse)
    private readonly warehouseRepository: Repository<Warehouse>,
  ) {}

  async handle(ctx: Context) {
    try {
      const warehouses = await this.warehouseRepository.find();
      let text = `🔔 <b>Ogohlantirishlar:</b>\n\n`;
      let hasAlerts = false;

      for (const warehouse of warehouses) {
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
