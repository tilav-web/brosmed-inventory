import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

export class CreateWarehouseDto {
  @ApiProperty({ example: 'Kuxonnyy sklad' })
  @IsString()
  @MinLength(2)
  @MaxLength(128)
  name: string;

  @ApiProperty({ example: 'Kuxonnyy' })
  @IsString()
  @MinLength(2)
  @MaxLength(64)
  type: string;

  @ApiProperty({ example: 'Korpus A, 1 etaj' })
  @IsString()
  @MinLength(2)
  @MaxLength(255)
  location: string;

  @ApiProperty({ example: 'uuid-of-warehouse-user' })
  @IsUUID('4')
  manager_id: string;
}
