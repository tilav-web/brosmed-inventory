import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateNested,
} from 'class-validator';

export class ReceiveOrderItemDto {
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

  @ApiPropertyOptional({
    example: 'BATCH-2026-001',
    description:
      'Ixtiyoriy. Yuborilmasa tizim avtomatik batch number yaratadi',
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  batch_number?: string;

  @ApiPropertyOptional({ example: 'SN-12345678' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  serial_number?: string;
}

export class ReceivePurchaseOrderDto {
  @ApiProperty({ type: [ReceiveOrderItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ReceiveOrderItemDto)
  items: ReceiveOrderItemDto[];
}
