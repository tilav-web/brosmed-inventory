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
import { Role } from 'src/modules/user/enums/role.enum';
import { CreateWarehouseDto } from '../dto/create-warehouse.dto';
import { ListWarehousesQueryDto } from '../dto/list-warehouses-query.dto';
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
  @ApiOperation({ summary: 'Barcha warehouse larni olish (faqat admin)' })
  @ApiOkResponse({ description: 'Warehouse lar ro`yxati' })
  @ApiUnauthorizedResponse({ description: "Token yoq yoki noto'g'ri" })
  @ApiForbiddenResponse({ description: 'Faqat admin kirishi mumkin' })
  findAll(@Query() query: ListWarehousesQueryDto) {
    return this.warehouseService.findAll(query);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Bitta warehouse ni id bo`yicha olish (faqat admin)',
  })
  @ApiOkResponse({ description: 'Warehouse topildi' })
  @ApiUnauthorizedResponse({ description: "Token yoq yoki noto'g'ri" })
  @ApiForbiddenResponse({ description: 'Faqat admin kirishi mumkin' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.warehouseService.findById(id);
  }

  @Get(':id/products')
  @Roles(Role.ADMIN, Role.WAREHOUSE)
  @ApiOperation({
    summary: 'Tanlangan warehouse dagi productlar ro`yxati',
  })
  @ApiOkResponse({ description: 'Warehouse productlari' })
  @ApiUnauthorizedResponse({ description: "Token yoq yoki noto'g'ri" })
  @ApiForbiddenResponse({ description: 'Faqat admin/warehouse kirishi mumkin' })
  getProductsByWarehouse(@Param('id', ParseUUIDPipe) id: string) {
    return this.warehouseService.getProductsByWarehouseId(id);
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
