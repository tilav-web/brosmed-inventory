import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
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

  @ApiPropertyOptional({ example: '2027-12-31' })
  @IsOptional()
  @IsDateString()
  expiration_date?: string;

  @ApiPropertyOptional({ example: '2027-12-01' })
  @IsOptional()
  @IsDateString()
  expiration_alert_date?: string;

  @ApiPropertyOptional({ example: 'BATCH-2026-001' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  batch_number?: string;
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
