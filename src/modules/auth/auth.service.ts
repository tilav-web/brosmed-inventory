import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { UserService } from '../user/services/user.service';
import { AuthUser } from './interfaces/auth-user.interface';
import { JwtPayload } from './interfaces/jwt-payload.interface';

@Injectable()
export class AuthService {
  constructor(
    private readonly userService: UserService,
    private readonly jwtService: JwtService,
  ) {}

  async validateUser(username: string, password: string): Promise<AuthUser> {
    const user = await this.userService.findByUsername(username);
    if (!user) {
      throw new UnauthorizedException('Username yoki password xato');
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      throw new UnauthorizedException('Username yoki password xato');
    }

    return { id: user.id, username: user.username, role: user.role };
  }

  async login(user: AuthUser) {
    const payload: JwtPayload = {
      sub: user.id,
      username: user.username,
      role: user.role,
    };

    return {
      accessToken: await this.jwtService.signAsync(payload),
      user,
    };
  }
}
