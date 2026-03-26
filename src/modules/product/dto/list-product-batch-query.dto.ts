import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsInt, IsOptional, IsUUID, Min } from 'class-validator';

export class ListProductBatchsQueryDto {
  @ApiPropertyOptional({ example: 'product-uuid' })
  @IsOptional()
  @IsUUID('4')
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' && value !== '' ? value : undefined,
  )
  product_id?: string;

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
