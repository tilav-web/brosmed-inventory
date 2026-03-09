import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';
import { WarehouseType } from '../enums/warehouse-type.enum';

export class UpdateWarehouseDto {
  @ApiPropertyOptional({ example: 'Xo`jalik ombori' })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(128)
  name?: string;

  @ApiPropertyOptional({
    enum: WarehouseType,
    example: WarehouseType.HOUSEHOLD,
  })
  @IsOptional()
  @IsEnum(WarehouseType)
  type?: WarehouseType;

  @ApiPropertyOptional({ example: 'Korpus B, podval' })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(255)
  location?: string;

  @ApiPropertyOptional({ example: 'uuid-of-new-warehouse-user' })
  @IsOptional()
  @IsUUID('4')
  manager_id?: string;
}
