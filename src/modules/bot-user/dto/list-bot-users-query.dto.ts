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
import { BotUserStatus } from '../enums/bot-user-status.enum';

export class ListBotUsersQueryDto {
  @ApiPropertyOptional({ example: 'ali' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  @Transform(({ value }: { value: string }) =>
    value === '' ? undefined : value,
  )
  search?: string;

  @ApiPropertyOptional({ enum: BotUserStatus })
  @IsOptional()
  @IsEnum(BotUserStatus)
  @Transform(({ value }: { value: BotUserStatus | '' }) =>
    value === '' ? undefined : value,
  )
  status?: BotUserStatus;

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
