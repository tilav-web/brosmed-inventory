import {
  Controller,
  Get,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
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
import {
  ExportInventoryReportQueryDto,
  GetInventoryReportQueryDto,
} from '../dto/get-inventory-report-query.dto';
import { ReportService } from '../services/report.service';

@Controller('reports')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.WAREHOUSE)
@ApiTags('reports')
@ApiBearerAuth('bearer')
export class ReportController {
  constructor(private readonly reportService: ReportService) {}

  @Get('inventory')
  @ApiOperation({
    summary:
      'Inventory hisobotlari: summary, warehouse distribution va detail list',
  })
  @ApiOkResponse({ description: 'Inventory report muvaffaqiyatli olindi' })
  @ApiUnauthorizedResponse({ description: "Token yoq yoki noto'g'ri" })
  @ApiForbiddenResponse({ description: 'Faqat admin/warehouse kirishi mumkin' })
  getInventoryReport(@Query() query: GetInventoryReportQueryDto) {
    return this.reportService.getInventoryReport(query);
  }

  @Get('inventory/export')
  @ApiOperation({
    summary: 'Inventory hisobotini Excel yoki PDF ko`rinishida yuklab olish',
  })
  @ApiOkResponse({ description: 'Inventory report fayl ko`rinishida qaytdi' })
  @ApiUnauthorizedResponse({ description: "Token yoq yoki noto'g'ri" })
  @ApiForbiddenResponse({ description: 'Faqat admin/warehouse kirishi mumkin' })
  async exportInventoryReport(
    @Query() query: ExportInventoryReportQueryDto,
    @Res() res: Response,
  ) {
    const file = await this.reportService.buildInventoryExportBuffer(query);

    res.setHeader('Content-Type', file.contentType);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${file.filename}"`,
    );

    return res.status(200).send(file.buffer);
  }
}
