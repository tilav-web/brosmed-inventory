import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsOptional,
  IsUUID,
  ValidateNested,
} from 'class-validator';
import { CreateOrderItemDto } from './create-purchase-order.dto';
import { OrderStatus } from '../enums/order-status.enum';

export class UpdatePurchaseOrderDto {
  @ApiPropertyOptional({ enum: OrderStatus, example: OrderStatus.CONFIRMED })
  @IsOptional()
  @IsEnum(OrderStatus)
  status?: OrderStatus;

  @ApiPropertyOptional({ example: 'supplier-uuid' })
  @IsOptional()
  @IsUUID('4')
  @Type(() => String)
  supplier_id?: string;

  @ApiPropertyOptional({ example: 'warehouse-uuid' })
  @IsOptional()
  @IsUUID('4')
  @Type(() => String)
  warehouse_id?: string;

  @ApiPropertyOptional({ example: '2026-03-09T12:00:00.000Z' })
  @IsOptional()
  @IsDateString()
  order_date?: string;

  @ApiPropertyOptional({ example: '2026-03-15T12:00:00.000Z' })
  @IsOptional()
  @IsDateString()
  delivery_date?: string;

  @ApiPropertyOptional({ type: [CreateOrderItemDto] })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateOrderItemDto)
  items_to_add?: CreateOrderItemDto[];

  @ApiPropertyOptional({ type: [String], example: ['order-item-uuid-1'] })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @IsUUID('4', { each: true })
  @Type(() => String)
  items_to_remove?: string[];
}
