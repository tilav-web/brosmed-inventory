import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Category } from '../category/entities/category.entity';
import { ImageModule } from '../image/image.module';
import { Supplier } from '../supplier/entities/supplier.entity';
import { Unit } from '../unit/entities/unit.entity';
import { Warehouse } from '../warehouse/entities/warehouse.entity';
import { ProductController } from './controllers/product.controller';
import { ProductBatchController } from './controllers/product-batch.controller';
import { Product } from './entities/product.entity';
import { ProductBatch } from './entities/product-batch.entity';
import { ProductService } from './services/product.service';
import { ProductBatchService } from './services/product-batch.service';

@Module({
  imports: [
    ImageModule,
    TypeOrmModule.forFeature([
      Product,
      ProductBatch,
      Category,
      Warehouse,
      Unit,
      Supplier,
    ]),
  ],
  controllers: [ProductController, ProductBatchController],
  providers: [ProductService, ProductBatchService],
  exports: [ProductService],
})
export class ProductModule {}
