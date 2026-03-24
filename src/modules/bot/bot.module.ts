import { Module } from '@nestjs/common';
import { BotService } from './bot.service';
import { StartCommand } from './commands/start.command';
import { HelpCommand } from './commands/help.command';
import { WarehousesCommand } from './commands/warehouses.command';
import { AlertsCommand } from './commands/alerts.command';
import { MessageEvent } from './events/message.event';
import { WarehouseModule } from '../warehouse/warehouse.module';

@Module({
  imports: [WarehouseModule],
  providers: [
    BotService,
    StartCommand,
    HelpCommand,
    WarehousesCommand,
    AlertsCommand,
    MessageEvent,
  ],
  exports: [BotService],
})
export class BotModule {}
