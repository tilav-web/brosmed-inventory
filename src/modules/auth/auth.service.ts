import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { StringValue } from 'ms';
import { compare } from 'bcrypt';
import { UserService } from '../user/services/user.service';
import { AuthUser } from './interfaces/auth-user.interface';
import { JwtPayload } from './interfaces/jwt-payload.interface';

@Injectable()
export class AuthService {
  private static readonly SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

  constructor(
    private readonly userService: UserService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async validateUser(username: string, password: string): Promise<AuthUser> {
    const user = await this.userService.findByUsername(username);
    if (!user) {
      throw new UnauthorizedException('Username yoki password xato');
    }

    const isMatch = await compare(password, user.password);
    if (!isMatch) {
      throw new UnauthorizedException('Username yoki password xato');
    }

    return { id: user.id, username: user.username, role: user.role };
  }

  private isDevelopment(): boolean {
    return this.configService.get<string>('NODE_ENV') === 'development';
  }

  private getAccessTokenExpiresIn(): StringValue {
    return this.isDevelopment() ? '7d' : '15m';
  }

  getRefreshCookieOptions() {
    const isProduction =
      this.configService.get<string>('NODE_ENV') === 'production';

    return {
      httpOnly: true,
      secure: isProduction,
      sameSite: 'strict' as const,
      maxAge: AuthService.SEVEN_DAYS_MS,
      path: '/',
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
    return {
      accessToken: await this.generateAccessToken(user),
      refreshToken: await this.generateRefreshToken(user),
      user,
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
      accessToken: await this.generateAccessToken(user),
      refreshToken: await this.generateRefreshToken(user),
    };
  }
}
