import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';
import { OrderStatus } from '../enums/order-status.enum';

export class UpdatePurchaseOrderStatusDto {
  @ApiProperty({ enum: OrderStatus, example: OrderStatus.CONFIRMED })
  @IsEnum(OrderStatus)
  status: OrderStatus;

  @ApiProperty({ required: false, example: '2026-03-15T12:00:00.000Z' })
  @IsOptional()
  delivery_date?: string;
}
