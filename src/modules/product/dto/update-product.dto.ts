import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class UpdateProductDto {
  @ApiPropertyOptional({ example: 'Yangi nom' })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(255)
  name?: string;

  @ApiPropertyOptional({ example: 18000 })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  price?: number;

  @ApiPropertyOptional({ example: 25 })
  @IsOptional()
  @IsInt()
  @Min(0)
  quantity?: number;

  @ApiPropertyOptional({ example: 5 })
  @IsOptional()
  @IsInt()
  @Min(0)
  min_limit?: number;

  @ApiPropertyOptional({ example: '2028-01-10' })
  @IsOptional()
  @IsDateString()
  expiration_date?: string;

  @ApiPropertyOptional({ example: 'category-uuid' })
  @IsOptional()
  @IsUUID('4')
  category_id?: string;

  @ApiPropertyOptional({ example: 'warehouse-uuid' })
  @IsOptional()
  @IsUUID('4')
  warehouse_id?: string;

  @ApiPropertyOptional({ example: 'unit-uuid' })
  @IsOptional()
  @IsUUID('4')
  unit_id?: string;
}
