import {
  Body,
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
import { ListLinkableUsersQueryDto } from '../dto/list-linkable-users-query.dto';
import { UpdateBotUserDto } from '../dto/update-bot-user.dto';

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

  @Get('linkable-users')
  @ApiOperation({
    summary:
      "Bot userga biriktirish mumkin bo'lgan tizim userlari (admin ham chiqadi)",
  })
  @ApiOkResponse({ description: "Biriktirish uchun tizim userlar ro'yxati" })
  @ApiUnauthorizedResponse({ description: "Token yoq yoki noto'g'ri" })
  @ApiForbiddenResponse({ description: 'Faqat admin kirishi mumkin' })
  listLinkableUsers(@Query() query: ListLinkableUsersQueryDto) {
    return this.botUserService.listLinkableUsers(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Bitta bot foydalanuvchini olish' })
  @ApiOkResponse({ description: 'Bot user topildi' })
  @ApiUnauthorizedResponse({ description: "Token yoq yoki noto'g'ri" })
  @ApiForbiddenResponse({ description: 'Faqat admin kirishi mumkin' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.botUserService.findById(id);
  }

  @Patch(':id')
  @ApiOperation({
    summary:
      "Bot foydalanuvchini yangilash (status, is_approved, linked_user_id). linked_user_id berilsa role avtomatik aniqlanadi",
  })
  @ApiOkResponse({ description: 'Bot user yangilandi' })
  @ApiUnauthorizedResponse({ description: "Token yoq yoki noto'g'ri" })
  @ApiForbiddenResponse({ description: 'Faqat admin kirishi mumkin' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateBotUserDto,
  ) {
    return this.botUserService.update(id, dto);
  }
}
