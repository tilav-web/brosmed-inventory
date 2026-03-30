import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';

export class ListLinkableUsersQueryDto {
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
    example: '06c3a893-5b95-4ff4-b26d-84c7f7aabcde',
    description:
      'Agar bot user edit qilinayotgan bo‘lsa, shu bot userning current linked useri ham ro‘yxatda qolsin',
  })
  @IsOptional()
  @Transform(({ value }: { value: string | undefined }) =>
    value === '' ? undefined : value,
  )
  @IsUUID()
  current_bot_user_id?: string;
}
