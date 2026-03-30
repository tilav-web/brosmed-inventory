import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEnum,
  IsOptional,
  IsUUID,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { BotUserStatus } from '../enums/bot-user-status.enum';
import { Role } from 'src/modules/user/enums/role.enum';

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

  @ApiPropertyOptional({
    enum: Role,
    example: Role.WAREHOUSE,
    description:
      "Ixtiyoriy. linked_user_id yuborilsa role tizim useridan avtomatik olinadi. linked_user_id yo'q bo'lsa vaqtinchalik role sifatida ishlatiladi.",
  })
  @IsOptional()
  @IsEnum(Role)
  role?: Role;

  @ApiPropertyOptional({
    example: '06c3a893-5b95-4ff4-b26d-84c7f7aabcde',
    nullable: true,
  })
  @IsOptional()
  @Transform(({ value }: { value: string | null | undefined }) => {
    if (value === '' || value === 'null') return null;
    return value;
  })
  @IsUUID()
  linked_user_id?: string | null;
}
