import { Context } from 'grammy';
import { Injectable } from '@nestjs/common';
import { WarehousesCommand } from '../commands/warehouses.command';
import { AlertsCommand } from '../commands/alerts.command';

@Injectable()
export class MessageEvent {
  constructor(
    private readonly warehousesCommand: WarehousesCommand,
    private readonly alertsCommand: AlertsCommand,
  ) {}

  async handle(ctx: Context) {
    const text = ctx.message?.text;
    if (!text) return;

    switch (text) {
      case '📦 Omborlar':
        await this.warehousesCommand.handle(ctx);
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
        await this.alertsCommand.handle(ctx);
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
  }
}
