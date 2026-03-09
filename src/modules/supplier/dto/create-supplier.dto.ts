import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateSupplierDto {
  @ApiProperty({ example: 'OOO Prodsnab' })
  @IsString()
  @MinLength(2)
  @MaxLength(255)
  company_name: string;

  @ApiProperty({ example: 'Aleksey Petrov' })
  @IsString()
  @MinLength(2)
  @MaxLength(255)
  contact_person: string;

  @ApiProperty({ example: 'supplier@example.com' })
  @IsEmail()
  @MaxLength(255)
  email: string;

  @ApiProperty({ example: '+998901234567' })
  @IsString()
  @MinLength(5)
  @MaxLength(50)
  phone: string;

  @ApiPropertyOptional({ example: '30 kun' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  payment_terms?: string;

  @ApiPropertyOptional({ example: 'Asosiy yetkazib beruvchi' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;
}
