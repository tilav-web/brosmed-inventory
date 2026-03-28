import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class CreateProductDto {
  @ApiProperty({ example: 'Antibiotik Amoksitsillin 500mg' })
  @IsString()
  @MinLength(2)
  @MaxLength(255)
  name: string;

  @ApiPropertyOptional({
    example: '12345678901234567',
    minLength: 17,
    maxLength: 17,
  })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() || undefined : value,
  )
  @IsOptional()
  @IsString()
  @Length(17, 17)
  mxik_code?: string;

  @ApiPropertyOptional({ example: 10, default: 10 })
  @IsOptional()
  @IsInt()
  @Min(0)
  min_limit?: number;

  @ApiPropertyOptional({ example: 'Salqin va quruq joyda saqlash' })
  @IsOptional()
  @IsString()
  storage_conditions?: string;

  @ApiProperty({ example: 'supplier-uuid' })
  @IsUUID('4')
  supplier_id: string;

  @ApiProperty({ example: 'category-uuid' })
  @IsUUID('4')
  category_id: string;

  @ApiProperty({ example: 'warehouse-uuid' })
  @IsUUID('4')
  warehouse_id: string;

  @ApiProperty({ example: 'unit-uuid' })
  @IsUUID('4')
  unit_id: string;
}
