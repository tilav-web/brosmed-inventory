import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Role } from '../enums/role.enum';
import { JwtAuthGuard } from 'src/modules/auth/guards/jwt-auth.guard';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { Roles } from 'src/common/decorators/roles.decorator';

@Controller('users')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiTags('users')
@ApiBearerAuth('bearer')
export class UserController {
  @Get('profile')
  @ApiOperation({ summary: 'Joriy foydalanuvchi profilini olish' })
  @ApiOkResponse({ description: 'Foydalanuvchi profili' })
  @ApiUnauthorizedResponse({ description: "Token yoq yoki noto'g'ri" })
  getProfile(@Req() req: { user: unknown }) {
    return req.user;
  }

  @Get('admin-area')
  @Roles(Role.Admin)
  @ApiOperation({ summary: 'Faqat adminlar uchun endpoint' })
  @ApiOkResponse({ description: 'Admin area response' })
  @ApiUnauthorizedResponse({ description: "Token yoq yoki noto'g'ri" })
  @ApiForbiddenResponse({ description: 'Role: Admin talab qilinadi' })
  getAdminArea() {
    return { message: 'Admin area' };
  }

  @Get('warehouse-area')
  @Roles(Role.Warehouse)
  @ApiOperation({ summary: 'Faqat warehouse roli uchun endpoint' })
  @ApiOkResponse({ description: 'Warehouse area response' })
  @ApiUnauthorizedResponse({ description: "Token yoq yoki noto'g'ri" })
  @ApiForbiddenResponse({ description: 'Role: Warehouse talab qilinadi' })
  getWarehouseArea() {
    return { message: 'Warehouse area' };
  }
}
