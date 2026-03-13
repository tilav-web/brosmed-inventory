import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ImageModule } from '../image/image.module';
import { Product } from '../product/entities/product.entity';
import { ProductBatch } from '../product/entities/product-batch.entity';
import { Warehouse } from '../warehouse/entities/warehouse.entity';
import { ExpenseController } from './controllers/expense.controller';
import { ExpenseItem } from './entities/expense-item.entity';
import { Expense } from './entities/expense.entity';
import { ExpenseService } from './services/expense.service';

@Module({
  imports: [
    ImageModule,
    TypeOrmModule.forFeature([
      Expense,
      ExpenseItem,
      Product,
      ProductBatch,
      Warehouse,
    ]),
  ],
  controllers: [ExpenseController],
  providers: [ExpenseService],
  exports: [ExpenseService],
})
export class ExpenseModule {}
