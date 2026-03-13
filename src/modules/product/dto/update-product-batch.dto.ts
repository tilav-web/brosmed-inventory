import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateProductBatchDto {
  @ApiPropertyOptional({ example: '2027-12-31' })
  @IsOptional()
  @IsDateString()
  expiration_date?: string;

  @ApiPropertyOptional({ example: '2027-12-01' })
  @IsOptional()
  @IsDateString()
  expiration_alert_date?: string;

  @ApiPropertyOptional({ example: 'BATCH-2026-001' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  batch_number?: string;
}
