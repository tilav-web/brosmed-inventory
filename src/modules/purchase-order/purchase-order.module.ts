import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Product } from '../product/entities/product.entity';
import { Supplier } from '../supplier/entities/supplier.entity';
import { Warehouse } from '../warehouse/entities/warehouse.entity';
import { PurchaseOrderController } from './controllers/purchase-order.controller';
import { OrderItem } from './entities/order-item.entity';
import { PurchaseOrder } from './entities/purchase-order.entity';
import { ProductBatch } from '../product/entities/product-batch.entity';
import { PurchaseOrderService } from './services/purchase-order.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      PurchaseOrder,
      OrderItem,
      ProductBatch,
      Supplier,
      Warehouse,
      Product,
    ]),
  ],
  controllers: [PurchaseOrderController],
  providers: [PurchaseOrderService],
  exports: [PurchaseOrderService],
})
export class PurchaseOrderModule {}
