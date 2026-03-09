import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class LoginDto {
  @ApiProperty({
    example: 'admin',
    description: 'Foydalanuvchi logini',
  })
  @IsString()
  username: string;

  @ApiProperty({
    example: 'admin123',
    description: 'Kamida 6 belgidan iborat parol',
    minLength: 6,
  })
  @IsString()
  @MinLength(6)
  password: string;
}
