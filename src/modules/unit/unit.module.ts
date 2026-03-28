import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Product } from '../product/entities/product.entity';
import { UnitController } from './controllers/unit.controller';
import { Unit } from './entities/unit.entity';
import { UnitService } from './services/unit.service';

@Module({
  imports: [TypeOrmModule.forFeature([Unit, Product])],
  controllers: [UnitController],
  providers: [UnitService],
  exports: [UnitService],
})
export class UnitModule {}
