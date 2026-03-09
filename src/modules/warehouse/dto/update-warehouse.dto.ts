import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

export class UpdateWarehouseDto {
  @ApiPropertyOptional({ example: 'Xo`jalik ombori' })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(128)
  name?: string;

  @ApiPropertyOptional({ example: 'Xo`jalik' })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(64)
  type?: string;

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
