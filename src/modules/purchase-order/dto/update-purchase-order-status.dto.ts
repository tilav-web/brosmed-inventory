import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { OrderStatus } from '../enums/order-status.enum';

export class UpdateOrderItemDeliveryDto {
  @ApiProperty({ example: 'order-item-uuid' })
  @IsUUID('4')
  order_item_id: string;

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

export class UpdatePurchaseOrderStatusDto {
  @ApiProperty({ enum: OrderStatus, example: OrderStatus.CONFIRMED })
  @IsEnum(OrderStatus)
  status: OrderStatus;

  @ApiProperty({ required: false, example: '2026-03-15T12:00:00.000Z' })
  @IsOptional()
  delivery_date?: string;

  @ApiPropertyOptional({ type: [UpdateOrderItemDeliveryDto] })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => UpdateOrderItemDeliveryDto)
  items?: UpdateOrderItemDeliveryDto[];
}
