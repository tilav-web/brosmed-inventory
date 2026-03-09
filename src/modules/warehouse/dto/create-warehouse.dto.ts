import { ApiProperty } from '@nestjs/swagger';
import {
  IsEnum,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';
import { WarehouseType } from '../enums/warehouse-type.enum';

export class CreateWarehouseDto {
  @ApiProperty({ example: 'Kuxonnyy sklad' })
  @IsString()
  @MinLength(2)
  @MaxLength(128)
  name: string;

  @ApiProperty({ enum: WarehouseType, example: WarehouseType.KITCHEN })
  @IsEnum(WarehouseType)
  type: WarehouseType;

  @ApiProperty({ example: 'Korpus A, 1 etaj' })
  @IsString()
  @MinLength(2)
  @MaxLength(255)
  location: string;

  @ApiProperty({ example: 'uuid-of-warehouse-user' })
  @IsUUID('4')
  manager_id: string;
}
