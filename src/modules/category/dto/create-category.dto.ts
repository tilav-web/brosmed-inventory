import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateCategoryDto {
  @ApiProperty({ example: 'Medicines' })
  @IsString()
  @MinLength(2)
  @MaxLength(128)
  name: string;

  @ApiPropertyOptional({ example: 'General medicine items' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;
}
