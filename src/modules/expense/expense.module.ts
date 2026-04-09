import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Product } from '../product/entities/product.entity';
import { ProductBatch } from '../product/entities/product-batch.entity';
import { Warehouse } from '../warehouse/entities/warehouse.entity';
import { User } from '../user/entities/user.entity';
import { BotModule } from '../bot/bot.module';
import { BotUserModule } from '../bot-user/bot-user.module';
import { ExpenseController } from './controllers/expense.controller';
import { ExpenseItem } from './entities/expense-item.entity';
import { Expense } from './entities/expense.entity';
import { ExpenseExportQueueService } from './services/expense-export-queue.service';
import { ExpenseExportService } from './services/expense-export.service';
import { ExpenseReceiptQueueService } from './services/expense-receipt-queue.service';
import { ExpenseService } from './services/expense.service';

@Module({
  imports: [
    forwardRef(() => BotModule),
    BotUserModule,
    TypeOrmModule.forFeature([
      Expense,
      ExpenseItem,
      Product,
      ProductBatch,
      Warehouse,
      User,
    ]),
  ],
  controllers: [ExpenseController],
  providers: [
    ExpenseService,
    ExpenseExportService,
    ExpenseExportQueueService,
    ExpenseReceiptQueueService,
  ],
  exports: [ExpenseService],
})
export class ExpenseModule {}
