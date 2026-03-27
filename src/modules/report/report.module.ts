import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Product } from '../product/entities/product.entity';
import { ProductBatch } from '../product/entities/product-batch.entity';
import { Warehouse } from '../warehouse/entities/warehouse.entity';
import { ReportController } from './controllers/report.controller';
import { ReportService } from './services/report.service';

@Module({
  imports: [TypeOrmModule.forFeature([Product, ProductBatch, Warehouse])],
  controllers: [ReportController],
  providers: [ReportService],
})
export class ReportModule {}
