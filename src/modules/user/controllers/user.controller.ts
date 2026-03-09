import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { Role } from '../enums/role.enum';
import { JwtAuthGuard } from 'src/modules/auth/guards/jwt-auth.guard';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { Roles } from 'src/common/decorators/roles.decorator';

@Controller('users')
@UseGuards(JwtAuthGuard, RolesGuard)
export class UserController {
  @Get('profile')
  getProfile(@Req() req: { user: unknown }) {
    return req.user;
  }

  @Get('admin-area')
  @Roles(Role.Admin)
  getAdminArea() {
    return { message: 'Admin area' };
  }

  @Get('warehouse-area')
  @Roles(Role.Warehouse)
  getWarehouseArea() {
    return { message: 'Warehouse area' };
  }
}
