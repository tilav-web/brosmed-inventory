import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  Res,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import type { Response } from 'express';
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
import { FilesInterceptor } from '@nestjs/platform-express';
import { Roles } from 'src/common/decorators/roles.decorator';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { JwtAuthGuard } from 'src/modules/auth/guards/jwt-auth.guard';
import { AuthUser } from 'src/modules/auth/interfaces/auth-user.interface';
import { FileFolderEnum } from 'src/modules/image/enums/file-folder.enum';
import { ImageService } from 'src/modules/image/services/image.service';
import { Role } from 'src/modules/user/enums/role.enum';
import { CreateExpenseDto } from '../dto/create-expense.dto';
import {
  ExportTarget,
  ListExpenseItemsQueryDto,
} from '../dto/list-expense-items-query.dto';
import { ListExpensesQueryDto } from '../dto/list-expenses-query.dto';
import { RequestExpenseRevisionDto } from '../dto/request-expense-revision.dto';
import { BotUserService } from 'src/modules/bot-user/services/bot-user.service';
import { ExpenseExportQueueService } from '../services/expense-export-queue.service';
import { ExpenseExportService } from '../services/expense-export.service';
import { ExpenseService } from '../services/expense.service';

@Controller('expenses')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiTags('expenses')
@ApiBearerAuth('bearer')
export class ExpenseController {
  constructor(
    private readonly expenseService: ExpenseService,
    private readonly imageService: ImageService,
    private readonly botUserService: BotUserService,
    private readonly expenseExportService: ExpenseExportService,
    private readonly expenseExportQueueService: ExpenseExportQueueService,
  ) {}

  @Get('dashboard/summary')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Ombor dashboard statistikasi' })
  @ApiOkResponse({ description: 'Dashboard statistikasi' })
  @ApiUnauthorizedResponse({ description: "Token yoq yoki noto'g'ri" })
  @ApiForbiddenResponse({ description: 'Faqat admin/warehouse kirishi mumkin' })
  getDashboardSummary() {
    return this.expenseService.getDashboardSummary();
  }

  @Get('dashboard/overview')
  @Roles(Role.ADMIN)
  @ApiOperation({
    summary:
      'Dashboard overview: kartalar, ogohlantirishlar va chartlar uchun umumiy statistika',
  })
  @ApiOkResponse({ description: 'Dashboard overview statistikasi' })
  @ApiUnauthorizedResponse({ description: "Token yoq yoki noto'g'ri" })
  @ApiForbiddenResponse({ description: 'Faqat admin/warehouse kirishi mumkin' })
  getDashboardOverview() {
    return this.expenseService.getDashboardOverview();
  }

  @Get()
  @Roles(Role.ADMIN, Role.WAREHOUSE, Role.ACCOUNTANT)
  @ApiOperation({ summary: 'Expense lar ro`yxati (pagination + filter)' })
  @ApiOkResponse({ description: 'Expense lar ro`yxati' })
  @ApiUnauthorizedResponse({ description: "Token yoq yoki noto'g'ri" })
  @ApiForbiddenResponse({
    description: 'Faqat admin/warehouse/hisobchi kirishi mumkin',
  })
  findAll(@Req() req: { user: AuthUser }, @Query() query: ListExpensesQueryDto) {
    return this.expenseService.findAll(query, req.user);
  }

  @Get('export')
  @Roles(Role.ADMIN, Role.ACCOUNTANT)
  @ApiOperation({
    summary: 'Expense itemlarini Excel formatda export qilish',
  })
  @ApiOkResponse({ description: 'Excel eksport' })
  @ApiUnauthorizedResponse({ description: "Token yoq yoki noto'g'ri" })
  @ApiForbiddenResponse({ description: 'Faqat admin/hisobchi kirishi mumkin' })
  async exportItems(
    @Query() query: ListExpenseItemsQueryDto,
    @Req() req: { user: AuthUser },
    @Res() res: Response,
  ) {
    const exportTarget = query.export_target ?? ExportTarget.DOWNLOAD;

    if (exportTarget === ExportTarget.BOT) {
      if (req.user.role !== Role.ADMIN) {
        throw new ForbiddenException(
          'Exportni botga yuborish faqat admin uchun ruxsat etilgan',
        );
      }

      const approvedUsers = await this.botUserService.getApprovedUsers(
        Role.ADMIN,
      );
      if (approvedUsers.length === 0) {
        return res.status(409).json({
          message:
            'Tasdiqlangan bot user topilmadi. export_target=download yuboring.',
        });
      }

      const job = await this.expenseExportQueueService.enqueueExportJob({
        query,
      });
      return res.status(202).json({
        message: 'Export job navbatga qo`yildi. Excel bot orqali yuboriladi.',
        job_id: job.id,
        recipients: approvedUsers.length,
      });
    }

    const buffer = await this.expenseExportService.buildExcelBuffer(
      query,
      req.user,
    );
    const filename = this.buildDefaultFilename('expenses');

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.status(200).send(buffer);
  }

  @Get('items')
  @Roles(Role.ADMIN, Role.ACCOUNTANT)
  @ApiOperation({
    summary: 'Expense itemlar ro`yxati (pagination + filter)',
  })
  @ApiOkResponse({ description: 'Expense itemlar ro`yxati' })
  @ApiUnauthorizedResponse({ description: "Token yoq yoki noto'g'ri" })
  @ApiForbiddenResponse({
    description: 'Faqat admin/hisobchi kirishi mumkin',
  })
  findAllItems(
    @Query() query: ListExpenseItemsQueryDto,
    @Req() req: { user: AuthUser },
  ) {
    return this.expenseService.findAllItems(query, req.user);
  }

  @Get('warehouse-stats')
  @Roles(Role.ADMIN)
  @ApiOperation({
    summary: 'Warehouse bo`yicha expense item statistikasi',
  })
  @ApiOkResponse({ description: 'Warehouse statistikasi' })
  @ApiUnauthorizedResponse({ description: "Token yoq yoki noto'g'ri" })
  @ApiForbiddenResponse({ description: 'Faqat admin/warehouse kirishi mumkin' })
  getWarehouseStats(@Query() query: ListExpenseItemsQueryDto) {
    return this.expenseService.getWarehouseStats(query);
  }

  @Get(':id')
  @Roles(Role.ADMIN, Role.WAREHOUSE, Role.ACCOUNTANT)
  @ApiOperation({ summary: 'Bitta expense ni id bo`yicha olish' })
  @ApiOkResponse({ description: 'Expense topildi' })
  @ApiUnauthorizedResponse({ description: "Token yoq yoki noto'g'ri" })
  @ApiForbiddenResponse({
    description: 'Faqat admin/warehouse/hisobchi kirishi mumkin',
  })
  findOne(@Param('id', ParseUUIDPipe) id: string, @Req() req: { user: AuthUser }) {
    return this.expenseService.findById(id, req.user);
  }

  @Post('save-and-receipt')
  @Roles(Role.ADMIN, Role.ACCOUNTANT)
  @ApiOperation({
    summary:
      'Chiqimni yaratish: hisobchi uchun tasdiq kutiladi, admin uchun esa darhol issue bosqichiga tayyor bo`ladi',
  })
  @ApiBody({ type: CreateExpenseDto })
  @ApiOkResponse({ description: 'Expense saqlandi va receipt qaytarildi' })
  @ApiUnauthorizedResponse({ description: "Token yoq yoki noto'g'ri" })
  @ApiForbiddenResponse({
    description: 'Faqat admin/hisobchi kirishi mumkin',
  })
  createAndGetReceipt(
    @Body() dto: CreateExpenseDto,
    @Req() req: { user: AuthUser },
  ) {
    return this.expenseService.createAndGetReceipt(dto, req.user);
  }

  @Post(':id/approve')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Hisobchi yaratgan chiqim so`rovini tasdiqlash' })
  @ApiOkResponse({ description: 'Expense issue bosqichiga tasdiqlandi' })
  @ApiUnauthorizedResponse({ description: "Token yoq yoki noto'g'ri" })
  @ApiForbiddenResponse({ description: 'Faqat admin kirishi mumkin' })
  approveExpense(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: { user: AuthUser },
  ) {
    return this.expenseService.approveExpense(id, req.user.id);
  }

  @Post(':id/cancel')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Chiqim so`rovini bekor qilish' })
  @ApiOkResponse({ description: 'Expense bekor qilindi' })
  @ApiUnauthorizedResponse({ description: "Token yoq yoki noto'g'ri" })
  @ApiForbiddenResponse({ description: 'Faqat admin kirishi mumkin' })
  cancelExpense(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: { user: AuthUser },
  ) {
    return this.expenseService.cancelExpense(id, req.user.id);
  }

  @Post(':id/request-revision')
  @Roles(Role.ADMIN)
  @ApiOperation({
    summary: 'Foto yoki hujjatda xato bo`lsa qayta ko`rib chiqish so`rash',
  })
  @ApiBody({ type: RequestExpenseRevisionDto })
  @ApiOkResponse({ description: 'Expense qayta ko`rib chiqish uchun yuborildi' })
  @ApiUnauthorizedResponse({ description: "Token yoq yoki noto'g'ri" })
  @ApiForbiddenResponse({ description: 'Faqat admin kirishi mumkin' })
  requestRevision(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RequestExpenseRevisionDto,
    @Req() req: { user: AuthUser },
  ) {
    return this.expenseService.requestRevision(id, dto.reason, req.user.id);
  }

  @Post(':id/issue')
  @Roles(Role.ADMIN, Role.WAREHOUSE)
  @ApiOperation({
    summary: 'Tovar berish: statusni PENDING_PHOTO ga o`tkazish',
  })
  @ApiOkResponse({ description: 'Tovar berildi, foto tasdiq kutilmoqda' })
  @ApiUnauthorizedResponse({ description: "Token yoq yoki noto'g'ri" })
  @ApiForbiddenResponse({ description: 'Faqat admin/warehouse kirishi mumkin' })
  issueExpense(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: { user: AuthUser },
  ) {
    return this.expenseService.issueExpense(id, req.user);
  }

  @Post(':id/upload-check')
  @Roles(Role.ADMIN, Role.WAREHOUSE)
  @ApiOperation({
    summary: 'Check rasmlarini yuklash va expense ni tasdiq kutish bosqichiga o`tkazish',
  })
  @ApiConsumes('multipart/form-data')
  @ApiOkResponse({ description: 'Foto saqlandi va expense yakunlandi' })
  @ApiUnauthorizedResponse({ description: "Token yoq yoki noto'g'ri" })
  @ApiForbiddenResponse({ description: 'Faqat admin/warehouse kirishi mumkin' })
  @UseInterceptors(
    FilesInterceptor('files', 10, {
      limits: {
        fileSize: 10 * 1024 * 1024,
      },
    }),
  )
  async uploadCheck(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: { user: AuthUser },
    @UploadedFiles() files?: { buffer: Buffer; mimetype?: string }[],
  ) {
    if (!files?.length) {
      throw new BadRequestException('Check rasmlari yuborilmadi');
    }

    const hasNonImage = files.some(
      (file) => !file.mimetype?.startsWith('image/'),
    );
    if (hasNonImage) {
      throw new BadRequestException('Faqat rasm fayllari yuborish mumkin');
    }

    const images = await this.imageService.saveImages({
      files,
      folder: FileFolderEnum.CHECKS,
      entityId: id,
    });

    return this.expenseService.attachImagesAndMarkPendingConfirmation(
      id,
      images,
      req.user,
    );
  }

  @Post(':id/confirm')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Foto yuklangan expense ni yakuniy tasdiqlash' })
  @ApiOkResponse({ description: 'Expense tasdiqlandi' })
  @ApiUnauthorizedResponse({ description: "Token yoq yoki noto'g'ri" })
  @ApiForbiddenResponse({ description: 'Faqat admin kirishi mumkin' })
  confirmExpense(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: { user: AuthUser },
  ) {
    return this.expenseService.confirmExpense(id, req.user.id);
  }

  private buildDefaultFilename(prefix: string) {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    return `${prefix}_${year}${month}${day}_${hours}${minutes}${seconds}.xlsx`;
  }
}
