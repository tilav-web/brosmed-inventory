import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';
import { ExpenseType } from '../enums/expense-type.enum';

export class CreateExpenseItemDto {
  @ApiProperty({ example: 'product-uuid' })
  @IsUUID('4')
  product_id: string;

  @ApiProperty({ example: 'warehouse-uuid' })
  @IsUUID('4')
  warehouse_id: string;

  @ApiProperty({ example: 'product-batch-uuid' })
  @IsUUID('4')
  product_batch_id: string;

  @ApiProperty({ example: 5 })
  @IsNumber()
  @Min(0.01)
  quantity: number;
}

export class CreateExpenseDto {
  @ApiProperty({ example: 'Ali Valiyev' })
  @IsString()
  staff_name: string;

  @ApiPropertyOptional({ example: 'Klinika ehtiyojlari uchun' })
  @IsOptional()
  @IsString()
  purpose?: string;

  @ApiPropertyOptional({ enum: ExpenseType, example: ExpenseType.USAGE })
  @IsOptional()
  @IsEnum(ExpenseType)
  type?: ExpenseType;

  @ApiProperty({ type: [CreateExpenseItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateExpenseItemDto)
  items: CreateExpenseItemDto[];
}
