import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BotService } from './bot.service';
import { BotController } from './bot.controller';
import { StartCommand } from './commands/start.command';
import { HelpCommand } from './commands/help.command';
import { WarehousesCommand } from './commands/warehouses.command';
import { AlertsCommand } from './commands/alerts.command';
import { StatsCommand } from './commands/stats.command';
import { ProductsCommand } from './commands/products.command';
import { ExpensesCommand } from './commands/expenses.command';
import { SettingsCommand } from './commands/settings.command';
import { OrdersCommand } from './commands/orders.command';
import { MessageEvent } from './events/message.event';
import { ChatMemberEvent } from './events/chat-member.event';
import { ExpenseCallbackEvent } from './events/expense-callback.event';
import { PurchaseOrderCallbackEvent } from './events/purchase-order-callback.event';
import { AuthMiddleware } from './middleware/auth.middleware';
import { WarehouseModule } from '../warehouse/warehouse.module';
import { BotUserModule } from '../bot-user/bot-user.module';
import { UserModule } from '../user/user.module';
import { Product } from '../product/entities/product.entity';
import { ProductBatch } from '../product/entities/product-batch.entity';
import { Expense } from '../expense/entities/expense.entity';
import { PurchaseOrder } from '../purchase-order/entities/purchase-order.entity';
import { PurchaseOrderModule } from '../purchase-order/purchase-order.module';
import { Warehouse } from '../warehouse/entities/warehouse.entity';
import { BotContentService } from './services/bot-content.service';
import { ExpenseModule } from '../expense/expense.module';

@Module({
  imports: [
    WarehouseModule,
    BotUserModule,
    UserModule,
    forwardRef(() => ExpenseModule),
    forwardRef(() => PurchaseOrderModule),
    TypeOrmModule.forFeature([
      Product,
      ProductBatch,
      Expense,
      PurchaseOrder,
      Warehouse,
    ]),
  ],
  controllers: [BotController],
  providers: [
    BotService,
    BotContentService,
    StartCommand,
    HelpCommand,
    WarehousesCommand,
    AlertsCommand,
    StatsCommand,
    ProductsCommand,
    ExpensesCommand,
    SettingsCommand,
    OrdersCommand,
    MessageEvent,
    ChatMemberEvent,
    ExpenseCallbackEvent,
    PurchaseOrderCallbackEvent,
    AuthMiddleware,
  ],
  exports: [BotService],
})
export class BotModule {}
