import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsEnum, IsOptional } from 'class-validator';
import { Transform } from 'class-transformer';
import { BotUserStatus } from '../enums/bot-user-status.enum';

export class UpdateBotUserDto {
  @ApiPropertyOptional({ enum: BotUserStatus, example: BotUserStatus.ACTIVE })
  @IsOptional()
  @IsEnum(BotUserStatus)
  status?: BotUserStatus;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  @Transform(({ value }): boolean => {
    if (value === 'true') return true;
    if (value === 'false') return false;
    return value as boolean;
  })
  is_approved?: boolean;
}
