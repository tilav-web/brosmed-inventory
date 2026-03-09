import { Role } from '../../user/enums/role.enum';

export interface AuthUser {
  id: string;
  username: string;
  role: Role;
}
