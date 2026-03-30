import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class RequestExpenseRevisionDto {
  @ApiProperty({
    example: "Rasmlar aniq emas, chekni to'liq kadrda qayta yuklang",
  })
  @IsString()
  @MinLength(3)
  @MaxLength(1000)
  reason: string;
}
