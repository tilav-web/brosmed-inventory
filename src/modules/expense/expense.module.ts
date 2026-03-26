import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ImageModule } from '../image/image.module';
import { Product } from '../product/entities/product.entity';
import { ProductBatch } from '../product/entities/product-batch.entity';
import { PurchaseOrder } from '../purchase-order/entities/purchase-order.entity';
import { Warehouse } from '../warehouse/entities/warehouse.entity';
import { BotModule } from '../bot/bot.module';
import { BotUserModule } from '../bot-user/bot-user.module';
import { ExpenseController } from './controllers/expense.controller';
import { ExpenseItem } from './entities/expense-item.entity';
import { Expense } from './entities/expense.entity';
import { ExpenseExportQueueService } from './services/expense-export-queue.service';
import { ExpenseExportService } from './services/expense-export.service';
import { ExpenseService } from './services/expense.service';

@Module({
  imports: [
    ImageModule,
    BotModule,
    BotUserModule,
    TypeOrmModule.forFeature([
      Expense,
      ExpenseItem,
      Product,
      ProductBatch,
      PurchaseOrder,
      Warehouse,
    ]),
  ],
  controllers: [ExpenseController],
  providers: [ExpenseService, ExpenseExportService, ExpenseExportQueueService],
  exports: [ExpenseService],
})
export class ExpenseModule {}
