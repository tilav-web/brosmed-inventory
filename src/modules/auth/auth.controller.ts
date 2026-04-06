import {
  Body,
  Controller,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBody,
  ApiCookieAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { LoginDto } from './dto/login.dto';
import { LocalAuthGuard } from './guards/local-auth.guard';
import { AuthService } from './auth.service';
import { AuthUser } from './interfaces/auth-user.interface';

@Controller('auth')
@ApiTags('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  private getCookieValue(req: Request, cookieName: string): string | undefined {
    const cookieHeader = req.headers.cookie;
    if (!cookieHeader) {
      return undefined;
    }

    const cookies = cookieHeader.split(';');
    for (const cookie of cookies) {
      const [name, ...valueParts] = cookie.trim().split('=');
      if (name === cookieName) {
        return decodeURIComponent(valueParts.join('='));
      }
    }

    return undefined;
  }

  @Post('login')
  @UseGuards(LocalAuthGuard)
  @ApiOperation({ summary: 'Login qilib JWT token olish' })
  @ApiBody({ type: LoginDto })
  @ApiOkResponse({
    description: 'Muvaffaqiyatli login',
    schema: {
      example: {
        accessToken: '<jwt-token>',
      },
    },
  })
  @ApiUnauthorizedResponse({ description: "Login yoki parol noto'g'ri" })
  async login(
    @Body() _loginDto: LoginDto,
    @Req() req: { user: AuthUser },
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.login(req.user);

    res.cookie(
      'refresh_token',
      result.refreshToken,
      this.authService.getRefreshCookieOptions(),
    );

    return {
      accessToken: result.accessToken,
      user: result.user,
    };
  }

  @Post('refresh-token')
  @ApiCookieAuth('refresh_token')
  @ApiOperation({
    summary: "Cookie'dagi refresh token orqali tokenlarni yangilash",
  })
  @ApiOkResponse({
    description: 'Yangi access token qaytarildi',
    schema: {
      example: {
        accessToken: '<new-jwt-token>',
      },
    },
  })
  @ApiUnauthorizedResponse({ description: 'Refresh token yaroqsiz yoki yo‘q' })
  async refreshToken(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const refreshToken = this.getCookieValue(req, 'refresh_token');
    if (!refreshToken) {
      throw new UnauthorizedException('Refresh token cookie ichida topilmadi');
    }

    const tokens = await this.authService.refreshAccessToken(refreshToken);
    res.cookie(
      'refresh_token',
      tokens.refresh_token,
      this.authService.getRefreshCookieOptions(),
    );

    return {
      access_token: tokens.access_token,
    };
  }

  @Post('logout')
  @ApiOperation({ summary: 'Logout qilish va refresh token cookieni tozalash' })
  @ApiOkResponse({ description: 'Muvaffaqiyatli logout qilindi' })
  logout(@Res({ passthrough: true }) res: Response) {
    res.clearCookie(
      'refresh_token',
      this.authService.getRefreshCookieClearOptions(),
    );

    return { message: 'Muvaffaqiyatli logout qilindi' };
  }
}
