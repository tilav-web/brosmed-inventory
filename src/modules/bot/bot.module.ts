import { Module } from '@nestjs/common';
import { BotService } from './bot.service';
import { BotController } from './bot.controller';
import { StartCommand } from './commands/start.command';
import { HelpCommand } from './commands/help.command';
import { WarehousesCommand } from './commands/warehouses.command';
import { AlertsCommand } from './commands/alerts.command';
import { MessageEvent } from './events/message.event';
import { ChatMemberEvent } from './events/chat-member.event';
import { AuthMiddleware } from './middleware/auth.middleware';
import { WarehouseModule } from '../warehouse/warehouse.module';
import { BotUserModule } from '../bot-user/bot-user.module';

@Module({
  imports: [WarehouseModule, BotUserModule],
  controllers: [BotController],
  providers: [
    BotService,
    StartCommand,
    HelpCommand,
    WarehousesCommand,
    AlertsCommand,
    MessageEvent,
    ChatMemberEvent,
    AuthMiddleware,
  ],
  exports: [BotService],
})
export class BotModule {}
