import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { Role } from '../enums/role.enum';

export class AdminCreateUserDto {
  @ApiProperty({ example: 'warehouse.user1' })
  @IsString()
  @MinLength(3)
  @MaxLength(64)
  username: string;

  @ApiProperty({
    enum: Role,
    example: Role.ACCOUNTANT,
    description: "Admin faqat admin'dan boshqa role yaratishi mumkin",
  })
  @IsEnum(Role)
  role: Role;

  @ApiProperty({ example: 'warehouse12345' })
  @IsString()
  @MinLength(8)
  @MaxLength(64)
  password: string;

  @ApiPropertyOptional({ example: 'Sardor' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  first_name?: string;

  @ApiPropertyOptional({ example: 'Tursunov' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  last_name?: string;
}
