import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsUUID,
  Min,
} from 'class-validator';

export enum InventoryReportType {
  INVENTORY_BALANCE = 'inventory_balance',
}

export enum ReportExportFormat {
  EXCEL = 'excel',
  PDF = 'pdf',
}

export class GetInventoryReportQueryDto {
  @ApiPropertyOptional({
    enum: InventoryReportType,
    example: InventoryReportType.INVENTORY_BALANCE,
  })
  @IsOptional()
  @IsEnum(InventoryReportType)
  @Transform(({ value }: { value: string }) =>
    value === '' ? undefined : value,
  )
  report_type?: InventoryReportType;

  @ApiPropertyOptional({ example: 'warehouse-uuid' })
  @IsOptional()
  @IsUUID('4')
  @Transform(({ value }: { value: string }) =>
    value === '' ? undefined : value,
  )
  warehouse_id?: string;

  @ApiPropertyOptional({
    example: '2026-01-01',
    description:
      'Inventory reportda bu filter batch received_at bo`yicha qo`llanadi',
  })
  @IsOptional()
  @IsDateString()
  date_from?: string;

  @ApiPropertyOptional({
    example: '2026-02-09',
    description:
      'Inventory reportda bu filter batch received_at bo`yicha qo`llanadi',
  })
  @IsOptional()
  @IsDateString()
  date_to?: string;

  @ApiPropertyOptional({ example: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @ApiPropertyOptional({ example: 50, default: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit: number = 50;
}

export class ExportInventoryReportQueryDto extends GetInventoryReportQueryDto {
  @ApiPropertyOptional({
    enum: ReportExportFormat,
    example: ReportExportFormat.EXCEL,
  })
  @IsOptional()
  @IsEnum(ReportExportFormat)
  @Transform(({ value }: { value: string }) =>
    value === '' ? undefined : value,
  )
  format?: ReportExportFormat;
}
