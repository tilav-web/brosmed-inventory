import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { Roles } from 'src/common/decorators/roles.decorator';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { JwtAuthGuard } from 'src/modules/auth/guards/jwt-auth.guard';
import { AuthUser } from 'src/modules/auth/interfaces/auth-user.interface';
import { FileFolderEnum } from 'src/modules/image/enums/file-folder.enum';
import { ImageService } from 'src/modules/image/services/image.service';
import { Role } from 'src/modules/user/enums/role.enum';
import { CreateExpenseDto } from '../dto/create-expense.dto';
import { ListExpensesQueryDto } from '../dto/list-expenses-query.dto';
import { ExpenseService } from '../services/expense.service';

@Controller('expenses')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.WAREHOUSE)
@ApiTags('expenses')
@ApiBearerAuth('bearer')
export class ExpenseController {
  constructor(
    private readonly expenseService: ExpenseService,
    private readonly imageService: ImageService,
  ) {}

  @Get('dashboard/summary')
  @ApiOperation({ summary: 'Ombor dashboard statistikasi' })
  @ApiOkResponse({ description: 'Dashboard statistikasi' })
  @ApiUnauthorizedResponse({ description: "Token yoq yoki noto'g'ri" })
  @ApiForbiddenResponse({ description: 'Faqat admin/warehouse kirishi mumkin' })
  getDashboardSummary() {
    return this.expenseService.getDashboardSummary();
  }

  @Get()
  @ApiOperation({ summary: 'Expense lar ro`yxati (pagination + filter)' })
  @ApiOkResponse({ description: 'Expense lar ro`yxati' })
  @ApiUnauthorizedResponse({ description: "Token yoq yoki noto'g'ri" })
  @ApiForbiddenResponse({ description: 'Faqat admin/warehouse kirishi mumkin' })
  findAll(@Query() query: ListExpensesQueryDto) {
    return this.expenseService.findAll(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Bitta expense ni id bo`yicha olish' })
  @ApiOkResponse({ description: 'Expense topildi' })
  @ApiUnauthorizedResponse({ description: "Token yoq yoki noto'g'ri" })
  @ApiForbiddenResponse({ description: 'Faqat admin/warehouse kirishi mumkin' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.expenseService.findById(id);
  }

  @Post('save-and-receipt')
  @ApiOperation({ summary: 'Sarfni saqlash va chek ma`lumotini qaytarish' })
  @ApiBody({ type: CreateExpenseDto })
  @ApiOkResponse({ description: 'Expense saqlandi va receipt qaytarildi' })
  @ApiUnauthorizedResponse({ description: "Token yoq yoki noto'g'ri" })
  @ApiForbiddenResponse({ description: 'Faqat admin/warehouse kirishi mumkin' })
  createAndGetReceipt(
    @Body() dto: CreateExpenseDto,
    @Req() req: { user: AuthUser },
  ) {
    return this.expenseService.createAndGetReceipt(dto, req.user.id);
  }

  @Post(':id/issue')
  @ApiOperation({
    summary: 'Выдать товар: statusni ожидает подтверждения ga o`tkazish',
  })
  @ApiOkResponse({ description: 'Tovar berildi, foto tasdiq kutilmoqda' })
  @ApiUnauthorizedResponse({ description: "Token yoq yoki noto'g'ri" })
  @ApiForbiddenResponse({ description: 'Faqat admin/warehouse kirishi mumkin' })
  issueExpense(@Param('id', ParseUUIDPipe) id: string) {
    return this.expenseService.issueExpense(id);
  }

  @Post(':id/upload-check')
  @ApiOperation({ summary: 'Check fotosini yuklash va expense ni yakunlash' })
  @ApiConsumes('multipart/form-data')
  @ApiOkResponse({ description: 'Foto saqlandi va expense yakunlandi' })
  @ApiUnauthorizedResponse({ description: "Token yoq yoki noto'g'ri" })
  @ApiForbiddenResponse({ description: 'Faqat admin/warehouse kirishi mumkin' })
  @UseInterceptors(
    FileInterceptor('file', {
      limits: {
        fileSize: 10 * 1024 * 1024,
      },
    }),
  )
  async uploadCheck(
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() file?: { buffer: Buffer; mimetype?: string },
  ) {
    if (!file?.buffer) {
      throw new BadRequestException('Check rasmi yuborilmadi');
    }

    if (!file.mimetype?.startsWith('image/')) {
      throw new BadRequestException('Faqat rasm fayli yuborish mumkin');
    }

    const checkImageUrl = await this.imageService.saveImage({
      file,
      folder: FileFolderEnum.CHECKS,
      entityId: id,
    });

    return this.expenseService.attachCheckImageAndComplete(id, checkImageUrl);
  }
}
