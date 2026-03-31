import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { ExpenseStatus } from '../enums/expense-status.enum';
import { ExpenseType } from '../enums/expense-type.enum';

export class ListExpensesQueryDto {
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
    example: ExpenseStatus.CREATED,
  })
  @IsOptional()
  @IsEnum(ExpenseStatus)
  @Transform(({ value }: { value: string }) =>
    value === '' ? undefined : value,
  )
  status?: ExpenseStatus;

  @ApiPropertyOptional({
    enum: ExpenseType,
    example: ExpenseType.USAGE,
  })
  @IsOptional()
  @IsEnum(ExpenseType)
  @Transform(({ value }: { value: string }) =>
    value === '' ? undefined : value,
  )
  type?: ExpenseType;
}
