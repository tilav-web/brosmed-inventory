import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsUUID } from 'class-validator';

export class DeletePurchaseOrderItemsDto {
  @ApiProperty({ type: [String], example: ['order-item-uuid-1'] })
  @IsArray()
  @ArrayMinSize(1)
  @IsUUID('4', { each: true })
  @Type(() => String)
  item_ids: string[];
}
