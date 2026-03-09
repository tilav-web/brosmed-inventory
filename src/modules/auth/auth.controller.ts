import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import {
  ApiBody,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { LoginDto } from './dto/login.dto';
import { LocalAuthGuard } from './guards/local-auth.guard';
import { AuthService } from './auth.service';
import { AuthUser } from './interfaces/auth-user.interface';

@Controller('auth')
@ApiTags('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @UseGuards(LocalAuthGuard)
  @ApiOperation({ summary: 'Login qilib JWT token olish' })
  @ApiBody({ type: LoginDto })
  @ApiOkResponse({
    description: 'Muvaffaqiyatli login',
    schema: {
      example: {
        access_token: '<jwt-token>',
      },
    },
  })
  @ApiUnauthorizedResponse({ description: "Login yoki parol noto'g'ri" })
  login(@Body() _loginDto: LoginDto, @Req() req: { user: AuthUser }) {
    return this.authService.login(req.user);
  }
}
