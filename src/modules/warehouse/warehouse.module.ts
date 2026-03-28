import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Expense } from '../expense/entities/expense.entity';
import { Product } from '../product/entities/product.entity';
import { ProductBatch } from '../product/entities/product-batch.entity';
import { User } from '../user/entities/user.entity';
import { ExpenseItem } from '../expense/entities/expense-item.entity';
import { Category } from '../category/entities/category.entity';
import { WarehouseController } from './controllers/warehouse.controller';
import { Warehouse } from './entities/warehouse.entity';
import { WarehouseService } from './services/warehouse.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Warehouse,
      User,
      Product,
      ProductBatch,
      Expense,
      ExpenseItem,
      Category,
    ]),
  ],
  controllers: [WarehouseController],
  providers: [WarehouseService],
  exports: [WarehouseService],
})
export class WarehouseModule {}
