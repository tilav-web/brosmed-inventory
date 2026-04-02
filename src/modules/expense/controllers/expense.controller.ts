import {
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
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Roles } from 'src/common/decorators/roles.decorator';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { JwtAuthGuard } from 'src/modules/auth/guards/jwt-auth.guard';
import { AuthUser } from 'src/modules/auth/interfaces/auth-user.interface';
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
@ApiTags('expenses')
@ApiBearerAuth('bearer')
export class ExpenseController {
  constructor(
    private readonly expenseService: ExpenseService,
    private readonly botUserService: BotUserService,
    private readonly expenseExportService: ExpenseExportService,
    private readonly expenseExportQueueService: ExpenseExportQueueService,
  ) {}

  @Get('dashboard/summary')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Dashboard statistikasi' })
  @ApiOkResponse({ description: 'Dashboard statistikasi' })
  @ApiUnauthorizedResponse({ description: "Token yoq yoki noto'g'ri" })
  @ApiForbiddenResponse({ description: 'Faqat admin kirishi mumkin' })
  getDashboardSummary() {
    return this.expenseService.getDashboardSummary();
  }

  @Get('dashboard/overview')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Dashboard overview statistikasi' })
  @ApiOkResponse({ description: 'Dashboard overview statistikasi' })
  @ApiUnauthorizedResponse({ description: "Token yoq yoki noto'g'ri" })
  @ApiForbiddenResponse({ description: 'Faqat admin kirishi mumkin' })
  getDashboardOverview() {
    return this.expenseService.getDashboardSummary();
  }

  @Get()
  @Roles(Role.ADMIN, Role.WAREHOUSE, Role.ACCOUNTANT)
  @ApiOperation({ summary: "Expense lar ro'yxati (pagination + filter)" })
  @ApiOkResponse({ description: "Expense lar ro'yxati" })
  @ApiUnauthorizedResponse({ description: "Token yoq yoki noto'g'ri" })
  @ApiForbiddenResponse({
    description: 'Faqat admin/warehouse/hisobchi kirishi mumkin',
  })
  findAll(
    @Req() req: { user: AuthUser },
    @Query() query: ListExpensesQueryDto,
  ) {
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
        message: "Export job navbatga qo'yildi. Excel bot orqali yuboriladi.",
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
  @Roles(Role.ADMIN, Role.ACCOUNTANT, Role.WAREHOUSE)
  @ApiOperation({
    summary: "Expense itemlar ro'yxati (pagination + filter)",
  })
  @ApiOkResponse({ description: "Expense itemlar ro'yxati" })
  @ApiUnauthorizedResponse({ description: "Token yoq yoki noto'g'ri" })
  @ApiForbiddenResponse({
    description: 'Faqat admin/hisobchi/warehouse kirishi mumkin',
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
    summary: "Warehouse bo'yicha expense item statistikasi",
  })
  @ApiOkResponse({ description: 'Warehouse statistikasi' })
  @ApiUnauthorizedResponse({ description: "Token yoq yoki noto'g'ri" })
  @ApiForbiddenResponse({ description: 'Faqat admin/warehouse kirishi mumkin' })
  getWarehouseStats(@Query() query: ListExpenseItemsQueryDto) {
    return this.expenseService.getWarehouseStats(query);
  }

  @Get(':id')
  @Roles(Role.ADMIN, Role.WAREHOUSE, Role.ACCOUNTANT)
  @ApiOperation({ summary: "Bitta expense ni id bo'yicha olish" })
  @ApiOkResponse({ description: 'Expense topildi' })
  @ApiUnauthorizedResponse({ description: "Token yoq yoki noto'g'ri" })
  @ApiForbiddenResponse({
    description: 'Faqat admin/warehouse/hisobchi kirishi mumkin',
  })
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: { user: AuthUser },
  ) {
    return this.expenseService.findById(id, req.user);
  }

  @Post()
  @Roles(Role.WAREHOUSE)
  @ApiOperation({
    summary:
      "Chiqim yaratish: warehouse user o'z omboridagi mahsulotlarni chiqim qiladi",
  })
  @ApiBody({ type: CreateExpenseDto })
  @ApiOkResponse({ description: 'Expense yaratildi va receipt qaytarildi' })
  @ApiUnauthorizedResponse({ description: "Token yoq yoki noto'g'ri" })
  @ApiForbiddenResponse({
    description: 'Faqat warehouse kirishi mumkin',
  })
  create(@Body() dto: CreateExpenseDto, @Req() req: { user: AuthUser }) {
    return this.expenseService.create(dto, req.user);
  }

  @Post(':id/issue')
  @Roles(Role.WAREHOUSE)
  @ApiOperation({
    summary: 'Chiqimni berilgan deb belgilash (status: CREATED → ISSUED)',
  })
  @ApiOkResponse({ description: 'Chiqim berildi' })
  @ApiUnauthorizedResponse({ description: "Token yoq yoki noto'g'ri" })
  @ApiForbiddenResponse({ description: 'Faqat warehouse kirishi mumkin' })
  markAsIssued(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: { user: AuthUser },
  ) {
    return this.expenseService.markAsIssued(id, req.user);
  }

  @Post(':id/cancel')
  @Roles(Role.ADMIN, Role.WAREHOUSE)
  @ApiOperation({
    summary:
      "Chiqimni bekor qilish: admin har qanday CREATED chiqimni, warehouse esa o'zi yaratgan CREATED chiqimni bekor qiladi",
  })
  @ApiOkResponse({ description: 'Chiqim bekor qilindi' })
  @ApiUnauthorizedResponse({ description: "Token yoq yoki noto'g'ri" })
  @ApiForbiddenResponse({
    description: 'Faqat admin yoki warehouse kirishi mumkin',
  })
  cancelExpense(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: { user: AuthUser },
  ) {
    return this.expenseService.cancelExpense(id, req.user);
  }

  @Post(':id/expired-approve')
  @Roles(Role.ACCOUNTANT)
  @ApiOperation({
    summary:
      'Muddati o`tgan batch chiqimini tasdiqlash (status: PENDING_APPROVAL -> ISSUED)',
  })
  @ApiOkResponse({ description: 'Muddati o`tgan batch chiqimi tasdiqlandi' })
  @ApiUnauthorizedResponse({ description: "Token yoq yoki noto'g'ri" })
  @ApiForbiddenResponse({ description: 'Faqat hisobchi kirishi mumkin' })
  approveExpiredExpense(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: { user: AuthUser },
  ) {
    return this.expenseService.approveExpiredExpense(id, req.user);
  }

  @Post(':id/expired-reject')
  @Roles(Role.ACCOUNTANT)
  @ApiOperation({
    summary:
      'Muddati o`tgan batch chiqimini rad etish (status: PENDING_APPROVAL -> CANCELLED)',
  })
  @ApiOkResponse({ description: 'Muddati o`tgan batch chiqimi rad etildi' })
  @ApiUnauthorizedResponse({ description: "Token yoq yoki noto'g'ri" })
  @ApiForbiddenResponse({ description: 'Faqat hisobchi kirishi mumkin' })
  rejectExpiredExpense(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: { user: AuthUser },
  ) {
    return this.expenseService.rejectExpiredExpense(id, req.user);
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
