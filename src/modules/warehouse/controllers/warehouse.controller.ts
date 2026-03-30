import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
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
import { CreateWarehouseDto } from '../dto/create-warehouse.dto';
import { GetWarehouseDashboardQueryDto } from '../dto/get-warehouse-dashboard-query.dto';
import { ListWarehousesQueryDto } from '../dto/list-warehouses-query.dto';
import { ListCategoryStatsQueryDto } from '../dto/list-category-stats-query.dto';
import { ListWarehouseExpensesQueryDto } from '../dto/list-warehouse-expenses-query.dto';
import { UpdateWarehouseDto } from '../dto/update-warehouse.dto';
import { WarehouseService } from '../services/warehouse.service';

@Controller('warehouses')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
@ApiTags('warehouses')
@ApiBearerAuth('bearer')
export class WarehouseController {
  constructor(private readonly warehouseService: WarehouseService) {}

  @Get()
  @Roles(Role.ADMIN, Role.ACCOUNTANT)
  @ApiOperation({ summary: 'Barcha warehouse larni olish (admin/hisobchi)' })
  @ApiOkResponse({ description: 'Warehouse lar ro`yxati' })
  @ApiUnauthorizedResponse({ description: "Token yoq yoki noto'g'ri" })
  @ApiForbiddenResponse({ description: 'Faqat admin/hisobchi kirishi mumkin' })
  findAll(@Query() query: ListWarehousesQueryDto) {
    return this.warehouseService.findAll(query);
  }

  @Get('my/dashboard')
  @Roles(Role.WAREHOUSE)
  @ApiOperation({
    summary:
      'Joriy warehouse userga biriktirilgan warehouse bo`yicha umumiy ma`lumot',
  })
  @ApiOkResponse({ description: 'Joriy warehouse user dashboard ma`lumotlari' })
  @ApiUnauthorizedResponse({ description: "Token yoq yoki noto'g'ri" })
  @ApiForbiddenResponse({ description: 'Faqat warehouse user kirishi mumkin' })
  getMyDashboard(@Req() req: { user: AuthUser }) {
    return this.warehouseService.getMyDashboard(req.user.id);
  }

  @Get('my')
  @Roles(Role.WAREHOUSE)
  @ApiOperation({
    summary: 'Joriy warehouse userga biriktirilgan warehouse ni olish',
  })
  @ApiOkResponse({ description: 'Joriy warehouse topildi' })
  @ApiUnauthorizedResponse({ description: "Token yoq yoki noto'g'ri" })
  @ApiForbiddenResponse({ description: 'Faqat warehouse user kirishi mumkin' })
  getMyWarehouse(@Req() req: { user: AuthUser }) {
    return this.warehouseService.getMyWarehouse(req.user.id);
  }

  @Get('my/dashboard/stats')
  @Roles(Role.WAREHOUSE)
  @ApiOperation({
    summary: 'Joriy warehouse user uchun dashboard statistikasi',
  })
  @ApiOkResponse({ description: 'Dashboard statistikasi qaytdi' })
  @ApiUnauthorizedResponse({ description: "Token yoq yoki noto'g'ri" })
  @ApiForbiddenResponse({ description: 'Faqat warehouse user kirishi mumkin' })
  getMyDashboardStats(@Req() req: { user: AuthUser }) {
    return this.warehouseService.getMyDashboardStats(req.user.id);
  }

  @Get('my/dashboard/recent-expenses')
  @Roles(Role.WAREHOUSE)
  @ApiOperation({
    summary: 'Joriy warehouse user uchun so`nggi chiqimlar',
  })
  @ApiOkResponse({ description: 'So`nggi chiqimlar qaytdi' })
  @ApiUnauthorizedResponse({ description: "Token yoq yoki noto'g'ri" })
  @ApiForbiddenResponse({ description: 'Faqat warehouse user kirishi mumkin' })
  getMyRecentExpenses(
    @Req() req: { user: AuthUser },
    @Query() query: GetWarehouseDashboardQueryDto,
  ) {
    return this.warehouseService.getMyRecentExpenses(req.user.id, query);
  }

  @Get('my/details')
  @Roles(Role.WAREHOUSE)
  @ApiOperation({
    summary: 'Joriy warehouse user uchun warehouse batafsil ma`lumotlari',
  })
  @ApiOkResponse({ description: 'Warehouse batafsil ma`lumotlari qaytdi' })
  @ApiUnauthorizedResponse({ description: "Token yoq yoki noto'g'ri" })
  @ApiForbiddenResponse({ description: 'Faqat warehouse user kirishi mumkin' })
  getMyDetails(@Req() req: { user: AuthUser }) {
    return this.warehouseService.getMyDetails(req.user.id);
  }

  @Get('my/expenses')
  @Roles(Role.WAREHOUSE)
  @ApiOperation({
    summary: 'Joriy warehouse user uchun expense lar ro`yxati',
  })
  @ApiOkResponse({ description: 'Warehouse expense lar qaytdi' })
  @ApiUnauthorizedResponse({ description: "Token yoq yoki noto'g'ri" })
  @ApiForbiddenResponse({ description: 'Faqat warehouse user kirishi mumkin' })
  getMyExpenses(
    @Req() req: { user: AuthUser },
    @Query() query: ListWarehouseExpensesQueryDto,
  ) {
    return this.warehouseService.getMyWarehouseExpenses(req.user.id, query);
  }

  @Get('my/products')
  @Roles(Role.WAREHOUSE)
  @ApiOperation({
    summary: 'Joriy warehouse user uchun mahsulotlar ro`yxati',
  })
  @ApiOkResponse({ description: 'Warehouse productlari qaytdi' })
  @ApiUnauthorizedResponse({ description: "Token yoq yoki noto'g'ri" })
  @ApiForbiddenResponse({ description: 'Faqat warehouse user kirishi mumkin' })
  getMyProducts(@Req() req: { user: AuthUser }) {
    return this.warehouseService.getMyProducts(req.user.id);
  }

  @Get('my/category-stats')
  @Roles(Role.WAREHOUSE)
  @ApiOperation({
    summary: 'Joriy warehouse user uchun kategoriya statistikasi',
  })
  @ApiOkResponse({ description: 'Kategoriya statistikasi qaytdi' })
  @ApiUnauthorizedResponse({ description: "Token yoq yoki noto'g'ri" })
  @ApiForbiddenResponse({ description: 'Faqat warehouse user kirishi mumkin' })
  getMyCategoryStats(
    @Req() req: { user: AuthUser },
    @Query() query: ListCategoryStatsQueryDto,
  ) {
    return this.warehouseService.getMyCategoryStats(req.user.id, query);
  }

  @Get('my/low-stock')
  @Roles(Role.WAREHOUSE)
  @ApiOperation({
    summary: 'Joriy warehouse user uchun kam qolgan mahsulotlar',
  })
  @ApiOkResponse({ description: 'Kam qolgan mahsulotlar qaytdi' })
  @ApiUnauthorizedResponse({ description: "Token yoq yoki noto'g'ri" })
  @ApiForbiddenResponse({ description: 'Faqat warehouse user kirishi mumkin' })
  getMyLowStockProducts(
    @Req() req: { user: AuthUser },
    @Query() query: ListCategoryStatsQueryDto,
  ) {
    return this.warehouseService.getMyLowStockProducts(req.user.id, query);
  }

  @Get(':id')
  @Roles(Role.ADMIN, Role.ACCOUNTANT)
  @ApiOperation({
    summary: 'Bitta warehouse ni id bo`yicha olish (admin/hisobchi)',
  })
  @ApiOkResponse({ description: 'Warehouse topildi' })
  @ApiUnauthorizedResponse({ description: "Token yoq yoki noto'g'ri" })
  @ApiForbiddenResponse({ description: 'Faqat admin/hisobchi kirishi mumkin' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.warehouseService.findById(id);
  }

  @Get(':id/dashboard')
  @Roles(Role.ADMIN)
  @ApiOperation({
    summary:
      'Warehouse dashboard: summary kartalar va recent expenses bitta response da',
  })
  @ApiOkResponse({ description: 'Warehouse dashboard ma`lumotlari' })
  @ApiUnauthorizedResponse({ description: "Token yoq yoki noto'g'ri" })
  @ApiForbiddenResponse({ description: 'Faqat admin/warehouse kirishi mumkin' })
  getDashboard(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: GetWarehouseDashboardQueryDto,
  ) {
    return this.warehouseService.getDashboard(id, query);
  }

  @Get(':id/details')
  @Roles(Role.ADMIN)
  @ApiOperation({
    summary:
      'Warehouse toliq malumotlari - statistika, chiqimlar, ogohlantirishlar',
  })
  @ApiOkResponse({ description: 'Warehouse toliq malumotlari' })
  @ApiUnauthorizedResponse({ description: "Token yoq yoki noto'g'ri" })
  @ApiForbiddenResponse({ description: 'Faqat admin/warehouse kirishi mumkin' })
  findOneWithDetails(@Param('id', ParseUUIDPipe) id: string) {
    return this.warehouseService.findByIdWithDetails(id);
  }

  @Get(':id/expenses')
  @Roles(Role.ADMIN)
  @ApiOperation({
    summary: 'Warehouse sarflari (pagination + search)',
  })
  @ApiOkResponse({ description: 'Warehouse sarflari royxati' })
  @ApiUnauthorizedResponse({ description: "Token yoq yoki noto'g'ri" })
  @ApiForbiddenResponse({ description: 'Faqat admin/warehouse kirishi mumkin' })
  getWarehouseExpenses(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: ListWarehouseExpensesQueryDto,
  ) {
    return this.warehouseService.getWarehouseExpenses(id, query);
  }

  @Get(':id/products')
  @Roles(Role.ADMIN)
  @ApiOperation({
    summary: 'Tanlangan warehouse dagi productlar ro`yxati',
  })
  @ApiOkResponse({ description: 'Warehouse productlari' })
  @ApiUnauthorizedResponse({ description: "Token yoq yoki noto'g'ri" })
  @ApiForbiddenResponse({ description: 'Faqat admin/warehouse kirishi mumkin' })
  getProductsByWarehouse(@Param('id', ParseUUIDPipe) id: string) {
    return this.warehouseService.getProductsByWarehouseId(id);
  }

  @Get(':id/category-stats')
  @Roles(Role.ADMIN)
  @ApiOperation({
    summary: 'Warehouse kategoriyalari bo`yicha statistika (pagination)',
  })
  @ApiOkResponse({ description: 'Kategoriya statistikasi' })
  @ApiUnauthorizedResponse({ description: "Token yoq yoki noto'g'ri" })
  @ApiForbiddenResponse({ description: 'Faqat admin/warehouse kirishi mumkin' })
  getCategoryStats(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: ListCategoryStatsQueryDto,
  ) {
    return this.warehouseService.getCategoryStats(id, query);
  }

  @Get(':id/low-stock')
  @Roles(Role.ADMIN)
  @ApiOperation({
    summary: 'Zakupka kerak bolgan mahsulotlar (quantity <= min_limit)',
  })
  @ApiOkResponse({ description: 'Kam qolgan mahsulotlar royxati' })
  @ApiUnauthorizedResponse({ description: "Token yoq yoki noto'g'ri" })
  @ApiForbiddenResponse({ description: 'Faqat admin/warehouse kirishi mumkin' })
  getLowStockProducts(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: ListCategoryStatsQueryDto,
  ) {
    return this.warehouseService.getLowStockProductsPaginated(id, query);
  }

  @Post()
  @ApiOperation({ summary: 'Warehouse qo`shish (faqat admin)' })
  @ApiBody({ type: CreateWarehouseDto })
  @ApiOkResponse({ description: 'Warehouse yaratildi' })
  @ApiUnauthorizedResponse({ description: "Token yoq yoki noto'g'ri" })
  @ApiForbiddenResponse({ description: 'Faqat admin kirishi mumkin' })
  create(@Body() dto: CreateWarehouseDto) {
    return this.warehouseService.create(dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Warehouse yangilash (faqat admin)' })
  @ApiBody({ type: UpdateWarehouseDto })
  @ApiOkResponse({ description: 'Warehouse yangilandi' })
  @ApiUnauthorizedResponse({ description: "Token yoq yoki noto'g'ri" })
  @ApiForbiddenResponse({ description: 'Faqat admin kirishi mumkin' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateWarehouseDto,
  ) {
    return this.warehouseService.update(id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Warehouse o`chirish (faqat admin)' })
  @ApiOkResponse({ description: 'Warehouse o`chirildi' })
  @ApiUnauthorizedResponse({ description: "Token yoq yoki noto'g'ri" })
  @ApiForbiddenResponse({ description: 'Faqat admin kirishi mumkin' })
  delete(@Param('id', ParseUUIDPipe) id: string) {
    return this.warehouseService.delete(id);
  }
}
