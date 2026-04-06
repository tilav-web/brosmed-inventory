import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';

export class UpdateOwnProfileDto {
  @ApiPropertyOptional({
    example: 'oldStrongPassword123',
    description: "Yangi password yuborilganda joriy password majburiy",
  })
  @ValidateIf(
    (object: UpdateOwnProfileDto) =>
      object.password !== undefined || object.current_password !== undefined,
  )
  @IsString()
  @MinLength(8)
  @MaxLength(64)
  current_password?: string;

  @ApiPropertyOptional({ example: 'newStrongPassword123' })
  @IsOptional()
  @IsString()
  @MinLength(8)
  @MaxLength(64)
  password?: string;

  @ApiPropertyOptional({ example: 'Ali' })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  first_name?: string;

  @ApiPropertyOptional({ example: 'Valiyev' })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  last_name?: string;
}
