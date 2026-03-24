import { Bot, Context } from 'grammy';
import { Injectable } from '@nestjs/common';
import { WarehouseService } from 'src/modules/warehouse/services/warehouse.service';

interface WarehouseItem {
  id: string;
  name: string;
  location: string;
  type: string;
}

@Injectable()
export class WarehousesCommand {
  constructor(private readonly warehouseService: WarehouseService) {}

  register(bot: Bot) {
    bot.command('warehouses', async (ctx: Context) => {
      try {
        const query = { page: 1, limit: 20 };
        const result = await this.warehouseService.findAll(query);

        const warehouses = (result as { data: WarehouseItem[] }).data;

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
      } catch {
        await ctx.reply('❌ Omborlarni yuklashda xatolik yuz berdi.');
      }
    });
  }
}
