import { Role } from '../../user/enums/role.enum';

export interface JwtPayload {
  sub: string;
  username: string;
  role: Role;
}
