import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsInt,
  IsNumber,
  IsOptional,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';

export class CreateOrderItemDto {
  @ApiProperty({ example: 'product-uuid' })
  @IsUUID('4')
  product_id: string;

  @ApiProperty({ example: 10 })
  @IsInt()
  @Min(1)
  quantity: number;

  @ApiPropertyOptional({ example: 12000.5 })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  price_at_purchase?: number;
}

export class CreatePurchaseOrderDto {
  @ApiProperty({ example: 'supplier-uuid' })
  @IsUUID('4')
  supplier_id: string;

  @ApiProperty({ example: 'warehouse-uuid' })
  @IsUUID('4')
  warehouse_id: string;

  @ApiPropertyOptional({ example: '2026-03-09T12:00:00.000Z' })
  @IsOptional()
  order_date?: string;

  @ApiPropertyOptional({ example: '2026-03-15T12:00:00.000Z' })
  @IsOptional()
  delivery_date?: string;

  @ApiProperty({ type: [CreateOrderItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateOrderItemDto)
  items: CreateOrderItemDto[];
}
