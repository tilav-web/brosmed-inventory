import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { Role } from '../enums/role.enum';

export class AdminUpdateUserDto {
  @ApiPropertyOptional({ example: 'warehouse.user2' })
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(64)
  username?: string;

  @ApiPropertyOptional({ example: 'newWarehousePass123' })
  @IsOptional()
  @IsString()
  @MinLength(8)
  @MaxLength(64)
  password?: string;

  @ApiPropertyOptional({ example: 'Bekzod' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  first_name?: string;

  @ApiPropertyOptional({ example: 'Karimov' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  last_name?: string;

  @ApiPropertyOptional({
    enum: Role,
    description: "Admin tomonidan role o'zgartirish taqiqlanadi",
  })
  @IsOptional()
  @IsEnum(Role)
  role?: Role;
}
