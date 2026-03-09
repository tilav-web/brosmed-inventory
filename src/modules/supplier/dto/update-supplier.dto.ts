import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class UpdateSupplierDto {
  @ApiPropertyOptional({ example: 'OOO Prodsnab Plus' })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(255)
  company_name?: string;

  @ApiPropertyOptional({ example: 'Ivan Ivanov' })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(255)
  contact_person?: string;

  @ApiPropertyOptional({ example: 'new-supplier@example.com' })
  @IsOptional()
  @IsEmail()
  @MaxLength(255)
  email?: string;

  @ApiPropertyOptional({ example: '+998909999999' })
  @IsOptional()
  @IsString()
  @MinLength(5)
  @MaxLength(50)
  phone?: string;

  @ApiPropertyOptional({ example: 'Oldindan to`lov' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  payment_terms?: string;

  @ApiPropertyOptional({ example: 'Yangilangan description' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;
}
