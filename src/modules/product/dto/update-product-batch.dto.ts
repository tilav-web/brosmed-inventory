import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateProductBatchDto {
  @ApiPropertyOptional({ example: '2027-12-31', nullable: true })
  @IsOptional()
  @IsDateString()
  expiration_date?: string | null;

  @ApiPropertyOptional({ example: '2027-12-01', nullable: true })
  @IsOptional()
  @IsDateString()
  expiration_alert_date?: string | null;

  @ApiPropertyOptional({ example: 'BATCH-2026-001', nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  batch_number?: string | null;

  @ApiPropertyOptional({ example: 'SN-12345678', nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  serial_number?: string | null;
}
