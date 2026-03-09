import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class CreateExpenseItemDto {
  @ApiProperty({ example: 'product-uuid' })
  @IsUUID('4')
  product_id: string;

  @ApiProperty({ example: 'warehouse-uuid' })
  @IsUUID('4')
  warehouse_id: string;

  @ApiProperty({ example: 2 })
  @IsInt()
  @Min(1)
  quantity: number;
}

export class CreateExpenseDto {
  @ApiProperty({ example: 'Ali Valiyev' })
  @IsString()
  @MinLength(2)
  @MaxLength(255)
  staff_name: string;

  @ApiPropertyOptional({ example: 'Jarrohlik bo`limi uchun' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  purpose?: string;

  @ApiProperty({ type: [CreateExpenseItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateExpenseItemDto)
  items: CreateExpenseItemDto[];
}
