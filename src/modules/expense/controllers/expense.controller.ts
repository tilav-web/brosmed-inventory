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
import { BotUserService } from 'src/modules/bot-user/services/bot-user.service';
import { ExpenseExportQueueService } from '../services/expense-export-queue.service';
import { ExpenseExportService } from '../services/expense-export.service';
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
    private readonly botUserService: BotUserService,
    private readonly expenseExportService: ExpenseExportService,
    private readonly expenseExportQueueService: ExpenseExportQueueService,
  ) {}

  @Get('dashboard/summary')
  @ApiOperation({ summary: 'Ombor dashboard statistikasi' })
  @ApiOkResponse({ description: 'Dashboard statistikasi' })
  @ApiUnauthorizedResponse({ description: "Token yoq yoki noto'g'ri" })
  @ApiForbiddenResponse({ description: 'Faqat admin/warehouse kirishi mumkin' })
  getDashboardSummary() {
    return this.expenseService.getDashboardSummary();
  }

  @Get('dashboard/overview')
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
  @ApiOperation({ summary: 'Expense lar ro`yxati (pagination + filter)' })
  @ApiOkResponse({ description: 'Expense lar ro`yxati' })
  @ApiUnauthorizedResponse({ description: "Token yoq yoki noto'g'ri" })
  @ApiForbiddenResponse({ description: 'Faqat admin/warehouse kirishi mumkin' })
  findAll(@Query() query: ListExpensesQueryDto) {
    return this.expenseService.findAll(query);
  }

  @Get('export')
  @ApiOperation({
    summary: 'Expense itemlarini Excel formatda export qilish',
  })
  @ApiOkResponse({ description: 'Excel eksport' })
  @ApiUnauthorizedResponse({ description: "Token yoq yoki noto'g'ri" })
  @ApiForbiddenResponse({ description: 'Faqat admin/warehouse kirishi mumkin' })
  async exportItems(
    @Query() query: ListExpenseItemsQueryDto,
    @Res() res: Response,
  ) {
    const exportTarget = query.export_target ?? ExportTarget.DOWNLOAD;

    if (exportTarget === ExportTarget.BOT) {
      const approvedUsers = await this.botUserService.getApprovedUsers();
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

    const buffer = await this.expenseExportService.buildExcelBuffer(query);
    const filename = this.buildDefaultFilename('expenses');

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.status(200).send(buffer);
  }

  @Get('items')
  @ApiOperation({
    summary: 'Expense itemlar ro`yxati (pagination + filter)',
  })
  @ApiOkResponse({ description: 'Expense itemlar ro`yxati' })
  @ApiUnauthorizedResponse({ description: "Token yoq yoki noto'g'ri" })
  @ApiForbiddenResponse({ description: 'Faqat admin/warehouse kirishi mumkin' })
  findAllItems(@Query() query: ListExpenseItemsQueryDto) {
    return this.expenseService.findAllItems(query);
  }

  @Get('warehouse-stats')
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
    summary: 'Tovar berish: statusni PENDING_PHOTO ga o`tkazish',
  })
  @ApiOkResponse({ description: 'Tovar berildi, foto tasdiq kutilmoqda' })
  @ApiUnauthorizedResponse({ description: "Token yoq yoki noto'g'ri" })
  @ApiForbiddenResponse({ description: 'Faqat admin/warehouse kirishi mumkin' })
  issueExpense(@Param('id', ParseUUIDPipe) id: string) {
    return this.expenseService.issueExpense(id);
  }

  @Post(':id/upload-check')
  @ApiOperation({ summary: 'Check rasmlarini yuklash va expense ni yakunlash' })
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

    return this.expenseService.attachImagesAndComplete(id, images);
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
