import {
  Body,
  Controller,
  Inject,
  forwardRef,
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
import { BotService } from 'src/modules/bot/bot.service';

type BotUserView = Awaited<ReturnType<BotUserService['findById']>>;

@Controller('bot-users')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
@ApiTags('bot-users')
@ApiBearerAuth('bearer')
export class BotUserController {
  constructor(
    private readonly botUserService: BotUserService,
    @Inject(forwardRef(() => BotService))
    private readonly botService: BotService,
  ) {}

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
      "Bot userga biriktirish uchun tizim userlari ro'yxati (admin ham chiqadi, linklanganlari ham flag bilan keladi)",
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
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateBotUserDto,
  ) {
    const before = await this.botUserService.findById(id);
    const updated = await this.botUserService.update(id, dto);
    await this.notifyUserIfAccessGranted(before, updated);
    return updated;
  }

  private async notifyUserIfAccessGranted(
    before: BotUserView,
    after: Exclude<BotUserView, null>,
  ) {
    if (!after.is_approved || !after.linked_user_id || !after.role) {
      return;
    }

    const becameApproved = !before?.is_approved && after.is_approved;
    const linkedUserChanged = before?.linked_user_id !== after.linked_user_id;

    if (!becameApproved && !linkedUserChanged) {
      return;
    }

    const roleLabel = this.getRoleLabel(after.role);
    const linkedName = [
      after.linked_user?.first_name,
      after.linked_user?.last_name,
    ]
      .filter(Boolean)
      .join(' ')
      .trim();

    const message =
      becameApproved && linkedUserChanged
        ? `✅ Akkauntingiz tasdiqlandi va tizimga biriktirildi.\n\nSiz <b>${roleLabel}</b> roliga ega foydalanuvchi${
            linkedName ? ` <b>${linkedName}</b>` : ''
          } bilan bog'landingiz.\nBotdan foydalanishni boshlash uchun /start ni bosing.`
        : `🔄 Bot akkauntingiz yangilandi.\n\nSiz <b>${roleLabel}</b> roliga ega foydalanuvchi${
            linkedName ? ` <b>${linkedName}</b>` : ''
          } bilan bog'landingiz.\nYangilangan menyuni ko'rish uchun /start ni bosing.`;

    await this.botService.sendMessage(after.telegram_id, message);
  }

  private getRoleLabel(role: Role): string {
    if (role === Role.ADMIN) {
      return 'admin';
    }

    if (role === Role.ACCOUNTANT) {
      return 'hisobchi';
    }

    return 'warehouse';
  }
}
