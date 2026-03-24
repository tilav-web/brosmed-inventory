import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Roles } from 'src/common/decorators/roles.decorator';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { JwtAuthGuard } from 'src/modules/auth/guards/jwt-auth.guard';
import { Role } from 'src/modules/user/enums/role.enum';
import { BotUserService } from '../services/bot-user.service';
import { ListBotUsersQueryDto } from '../dto/list-bot-users-query.dto';

@Controller('bot-users')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
@ApiTags('bot-users')
@ApiBearerAuth('bearer')
export class BotUserController {
  constructor(private readonly botUserService: BotUserService) {}

  @Get()
  @ApiOperation({ summary: 'Bot foydalanuvchilar ro`yxati (pagination)' })
  @ApiOkResponse({ description: 'Bot userlar ro`yxati' })
  @ApiUnauthorizedResponse({ description: "Token yoq yoki noto'g'ri" })
  @ApiForbiddenResponse({ description: 'Faqat admin kirishi mumkin' })
  findAll(@Query() query: ListBotUsersQueryDto) {
    return this.botUserService.findAll(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Bitta bot foydalanuvchini olish' })
  @ApiOkResponse({ description: 'Bot user topildi' })
  @ApiUnauthorizedResponse({ description: "Token yoq yoki noto'g'ri" })
  @ApiForbiddenResponse({ description: 'Faqat admin kirishi mumkin' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.botUserService.findById(id);
  }

  @Patch(':id/approve')
  @ApiOperation({
    summary: 'Bot foydalanuvchini tasdiqlash (notification olishi uchun)',
  })
  @ApiOkResponse({ description: 'Bot user tasdiqlandi' })
  @ApiUnauthorizedResponse({ description: "Token yoq yoki noto'g'ri" })
  @ApiForbiddenResponse({ description: 'Faqat admin kirishi mumkin' })
  approve(@Param('id', ParseUUIDPipe) id: string) {
    return this.botUserService.approve(id);
  }

  @Patch(':id/revoke')
  @ApiOperation({ summary: 'Bot foydalanuvchini tasdiqni bekor qilish' })
  @ApiOkResponse({ description: 'Bot user tasdiq bekor qilindi' })
  @ApiUnauthorizedResponse({ description: "Token yoq yoki noto'g'ri" })
  @ApiForbiddenResponse({ description: 'Faqat admin kirishi mumkin' })
  revoke(@Param('id', ParseUUIDPipe) id: string) {
    return this.botUserService.revokeApproval(id);
  }
}
