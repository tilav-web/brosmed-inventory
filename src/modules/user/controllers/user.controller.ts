import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Role } from '../enums/role.enum';
import { JwtAuthGuard } from 'src/modules/auth/guards/jwt-auth.guard';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { Roles } from 'src/common/decorators/roles.decorator';
import { UserService } from '../services/user.service';
import { AuthUser } from 'src/modules/auth/interfaces/auth-user.interface';
import { UpdateOwnProfileDto } from '../dto/update-own-profile.dto';
import { AdminCreateUserDto } from '../dto/admin-create-user.dto';
import { AdminUpdateUserDto } from '../dto/admin-update-user.dto';

@Controller('users')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiTags('users')
@ApiBearerAuth('bearer')
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Get('profile')
  @ApiOperation({ summary: 'Joriy foydalanuvchi profilini olish' })
  @ApiOkResponse({ description: 'Foydalanuvchi profili' })
  @ApiUnauthorizedResponse({ description: "Token yoq yoki noto'g'ri" })
  getProfile(@Req() req: { user: AuthUser }) {
    return req.user;
  }

  @Patch('/')
  @ApiOperation({
    summary:
      "Joriy user ma'lumotlarini yangilash (username dan tashqari: password, first_name, last_name)",
  })
  @ApiBody({ type: UpdateOwnProfileDto })
  @ApiOkResponse({ description: "Joriy user ma'lumotlari yangilandi" })
  @ApiUnauthorizedResponse({ description: "Token yoq yoki noto'g'ri" })
  async updateOwnProfile(
    @Req() req: { user: AuthUser },
    @Body() dto: UpdateOwnProfileDto,
  ) {
    return this.userService.updateOwnProfile(req.user.id, dto);
  }

  @Post('admin/users')
  @Roles(Role.ADMIN)
  @ApiOperation({
    summary: "Admin tomonidan warehouse role'li user yaratish",
  })
  @ApiBody({ type: AdminCreateUserDto })
  @ApiOkResponse({ description: 'Warehouse user muvaffaqiyatli yaratildi' })
  @ApiUnauthorizedResponse({ description: "Token yoq yoki noto'g'ri" })
  @ApiForbiddenResponse({
    description:
      "Faqat admin kirishi mumkin yoki admin role'li user yaratish taqiqlangan",
  })
  async adminCreateWarehouseUser(@Body() dto: AdminCreateUserDto) {
    return this.userService.createWarehouseUserByAdmin(dto);
  }

  @Patch('admin/users/:id')
  @Roles(Role.ADMIN)
  @ApiOperation({
    summary: 'Admin tomonidan warehouse userni yangilash (role dan tashqari)',
  })
  @ApiBody({ type: AdminUpdateUserDto })
  @ApiOkResponse({ description: 'Warehouse user yangilandi' })
  @ApiUnauthorizedResponse({ description: "Token yoq yoki noto'g'ri" })
  @ApiForbiddenResponse({
    description:
      "Faqat admin kirishi mumkin yoki admin role'li userni o'zgartirish taqiqlangan",
  })
  @ApiNotFoundResponse({ description: 'Foydalanuvchi topilmadi' })
  async adminUpdateWarehouseUser(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AdminUpdateUserDto,
  ) {
    return this.userService.updateWarehouseUserByAdmin(id, dto);
  }

  @Delete('admin/users/:id')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: "Admin tomonidan warehouse userni o'chirish" })
  @ApiOkResponse({ description: "Warehouse user o'chirildi" })
  @ApiUnauthorizedResponse({ description: "Token yoq yoki noto'g'ri" })
  @ApiForbiddenResponse({
    description:
      "Faqat admin kirishi mumkin yoki admin role'li userni o'chirish taqiqlangan",
  })
  @ApiNotFoundResponse({ description: 'Foydalanuvchi topilmadi' })
  async adminDeleteWarehouseUser(@Param('id', ParseUUIDPipe) id: string) {
    return this.userService.deleteWarehouseUserByAdmin(id);
  }
}
