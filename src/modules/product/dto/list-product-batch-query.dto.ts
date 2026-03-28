import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, IsUUID, Min } from 'class-validator';

export class ListProductBatchsQueryDto {
  @ApiPropertyOptional({ example: 'product-uuid' })
  @IsOptional()
  @IsUUID('4')
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' && value !== '' ? value : undefined,
  )
  product_id?: string;

  @ApiPropertyOptional({
    example: false,
    default: false,
    description:
      'true bo‘lsa, quantity 0 yoki undan kichik bo‘lgan tugagan batchlar ham qaytariladi',
  })
  @IsOptional()
  @IsBoolean()
  @Transform(({ value }: { value: unknown }) => {
    if (typeof value === 'boolean') {
      return value;
    }

    if (typeof value === 'string') {
      const normalizedValue = value.trim().toLowerCase();

      if (normalizedValue === 'true' || normalizedValue === '1') {
        return true;
      }

      if (normalizedValue === 'false' || normalizedValue === '0' || normalizedValue === '') {
        return false;
      }
    }

    return value;
  })
  include_depleted: boolean = false;

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
}
