import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';
import { ExpenseStatus } from '../enums/expense-status.enum';
import { ExpenseType } from '../enums/expense-type.enum';

export enum ExportTarget {
  BOT = 'bot',
  DOWNLOAD = 'download',
}

export class ListExpenseItemsQueryDto {
  @ApiPropertyOptional({ example: 'ali' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  @Transform(({ value }: { value: string }) =>
    value === '' ? undefined : value,
  )
  search?: string;

  @ApiPropertyOptional({ example: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @ApiPropertyOptional({ example: 10, default: 10 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit: number = 10;

  @ApiPropertyOptional({
    enum: ExpenseStatus,
    example: ExpenseStatus.COMPLETED,
  })
  @IsOptional()
  @IsEnum(ExpenseStatus)
  status?: ExpenseStatus;

  @ApiPropertyOptional({
    enum: ExpenseType,
    example: ExpenseType.USAGE,
  })
  @IsOptional()
  @IsEnum(ExpenseType)
  type?: ExpenseType;

  @ApiPropertyOptional({ example: '6b3f4c20-8b87-4f4f-9b7c-5f4e6c3f7c2a' })
  @IsOptional()
  @IsUUID()
  warehouse_id?: string;

  @ApiPropertyOptional({ example: '2026-03-01' })
  @IsOptional()
  @IsDateString()
  date_from?: string;

  @ApiPropertyOptional({ example: '2026-03-31' })
  @IsOptional()
  @IsDateString()
  date_to?: string;

  @ApiPropertyOptional({
    enum: ExportTarget,
    example: ExportTarget.DOWNLOAD,
  })
  @IsOptional()
  @IsEnum(ExportTarget)
  export_target?: ExportTarget;
}
