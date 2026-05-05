import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsDateString,
  IsOptional,
  IsUUID,
  ValidateNested,
} from 'class-validator';

export class ReceiveOrderItemDto {
  @ApiProperty({ example: 'order-item-uuid' })
  @IsUUID('4')
  order_item_id: string;

  @ApiPropertyOptional({
    example: '2027-12-31',
    description:
      'Sroka. Yuborilmasa, bu batch uchun sroka mantig`i ishlamaydi (oddiy stock).',
  })
  @IsOptional()
  @IsDateString()
  expiration_date?: string;

  @ApiPropertyOptional({
    example: '2027-12-01',
    description:
      'Ogohlantirish sanasi (sroka tugashidan oldin warning ko`rsatish uchun). expiration_date majburiy.',
  })
  @IsOptional()
  @IsDateString()
  expiration_alert_date?: string;
}

export class ReceivePurchaseOrderDto {
  @ApiPropertyOptional({
    type: [ReceiveOrderItemDto],
    description:
      'Ixtiyoriy. Yuborilmasa yoki bo`sh bo`lsa, har bir order item uchun avtomatik batch yaratiladi (sroka kuzatilmaydi). Mijoz har item uchun alohida qaror qiladi.',
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ReceiveOrderItemDto)
  items?: ReceiveOrderItemDto[];
}
