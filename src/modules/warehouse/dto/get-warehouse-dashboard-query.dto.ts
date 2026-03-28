import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

export class GetWarehouseDashboardQueryDto {
  @ApiPropertyOptional({
    example: 5,
    default: 5,
    description: 'Recent expenses soni',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(20)
  recent_limit: number = 5;
}
