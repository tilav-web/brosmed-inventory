import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class CreateUnitDto {
  @ApiProperty({ example: 'kg' })
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  name: string;
}
