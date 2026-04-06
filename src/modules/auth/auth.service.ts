import {
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { StringValue } from 'ms';
import { compare } from 'bcrypt';
import { UserService } from '../user/services/user.service';
import { AuthUser } from './interfaces/auth-user.interface';
import { JwtPayload } from './interfaces/jwt-payload.interface';

type CookieSameSite = 'strict' | 'lax' | 'none';

@Injectable()
export class AuthService {
  private static readonly SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
  private static readonly DEV_ACCESS_TOKEN_EXPIRES_IN: StringValue = '7d';
  private static readonly PROD_ACCESS_TOKEN_EXPIRES_IN: StringValue = '15m';

  constructor(
    private readonly userService: UserService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async validateUser(username: string, password: string): Promise<AuthUser> {
    const user = await this.userService.findByUsername(username);
    if (!user) {
      throw new NotFoundException('Username yoki password xato');
    }

    const isMatch = await compare(password, user.password);
    if (!isMatch) {
      throw new NotFoundException('Username yoki password xato');
    }

    return {
      id: user.id,
      username: user.username,
      role: user.role,
    };
  }

  private isDevelopment(): boolean {
    return this.configService.get<string>('NODE_ENV') === 'development';
  }

  private getAccessTokenExpiresIn(): StringValue {
    return (
      this.configService.get<StringValue>('JWT_ACCESS_EXPIRES_IN') ??
      this.configService.get<StringValue>('JWT_EXPIRES_IN') ??
      (this.isDevelopment()
        ? AuthService.DEV_ACCESS_TOKEN_EXPIRES_IN
        : AuthService.PROD_ACCESS_TOKEN_EXPIRES_IN)
    );
  }

  private getRefreshCookieSameSite(): CookieSameSite {
    const configuredSameSite = this.configService
      .get<string>('AUTH_REFRESH_COOKIE_SAME_SITE')
      ?.trim()
      .toLowerCase();

    if (
      configuredSameSite === 'strict' ||
      configuredSameSite === 'lax' ||
      configuredSameSite === 'none'
    ) {
      return configuredSameSite;
    }

    return this.isDevelopment() ? 'lax' : 'none';
  }

  getRefreshCookieOptions() {
    const isProduction =
      this.configService.get<string>('NODE_ENV') === 'production';

    return {
      httpOnly: true,
      secure: isProduction,
      sameSite: this.getRefreshCookieSameSite(),
      maxAge: AuthService.SEVEN_DAYS_MS,
      path: '/',
    };
  }

  getRefreshCookieClearOptions() {
    const cookieOptions = this.getRefreshCookieOptions();
    return {
      httpOnly: cookieOptions.httpOnly,
      secure: cookieOptions.secure,
      sameSite: cookieOptions.sameSite,
      path: cookieOptions.path,
    };
  }

  private createPayload(
    user: AuthUser,
    tokenType: 'access' | 'refresh',
  ): JwtPayload {
    return {
      sub: user.id,
      username: user.username,
      role: user.role,
      tokenType,
    };
  }

  async generateAccessToken(user: AuthUser): Promise<string> {
    return this.jwtService.signAsync(this.createPayload(user, 'access'), {
      expiresIn: this.getAccessTokenExpiresIn(),
    });
  }

  async generateRefreshToken(user: AuthUser): Promise<string> {
    return this.jwtService.signAsync(this.createPayload(user, 'refresh'), {
      expiresIn: '7d',
    });
  }

  async login(user: AuthUser) {
    const safeUser = await this.userService.findSafeByIdOrFail(user.id);

    return {
      accessToken: await this.generateAccessToken(user),
      refreshToken: await this.generateRefreshToken(user),
      user: safeUser,
    };
  }

  async refreshAccessToken(refreshToken: string) {
    let payload: JwtPayload;

    try {
      payload = await this.jwtService.verifyAsync<JwtPayload>(refreshToken);
    } catch {
      throw new UnauthorizedException('Yaroqsiz yoki eskirgan refresh token');
    }

    if (payload.tokenType !== 'refresh') {
      throw new UnauthorizedException('Yaroqsiz refresh token turi');
    }

    const user: AuthUser = {
      id: payload.sub,
      username: payload.username,
      role: payload.role,
    };

    return {
      access_token: await this.generateAccessToken(user),
      refresh_token: await this.generateRefreshToken(user),
    };
  }
}
