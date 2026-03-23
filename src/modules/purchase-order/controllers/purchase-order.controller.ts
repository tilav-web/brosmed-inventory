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
import { CreatePurchaseOrderDto } from '../dto/create-purchase-order.dto';
import { ListPurchaseOrdersQueryDto } from '../dto/list-purchase-orders-query.dto';
import {
  UpdatePurchaseOrderDto,
} from '../dto/update-purchase-order.dto';
import { PurchaseOrderService } from '../services/purchase-order.service';
import { ReceivePurchaseOrderDto } from '../dto/update-purchase-order-status.dto';

@Controller('purchase-orders')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.WAREHOUSE)
@ApiTags('purchase-orders')
@ApiBearerAuth('bearer')
export class PurchaseOrderController {
  constructor(private readonly purchaseOrderService: PurchaseOrderService) {}

  @Get()
  @ApiOperation({
    summary: 'Xarid buyurtmalari ro`yxati (pagination + filter)',
  })
  @ApiOkResponse({ description: 'Purchase order ro`yxati' })
  @ApiUnauthorizedResponse({ description: "Token yoq yoki noto'g'ri" })
  @ApiForbiddenResponse({ description: 'Faqat admin/warehouse kirishi mumkin' })
  findAll(@Query() query: ListPurchaseOrdersQueryDto) {
    return this.purchaseOrderService.findAll(query);
  }

  @Get('statistics')
  @ApiOperation({ summary: 'Purchase order statuslar bo`yicha statistikasi' })
  @ApiOkResponse({ description: 'Statistika muvaffaqiyatli olindi' })
  @ApiUnauthorizedResponse({ description: "Token yoq yoki noto'g'ri" })
  @ApiForbiddenResponse({ description: 'Faqat admin/warehouse kirishi mumkin' })
  getStatistics() {
    return this.purchaseOrderService.getStatistics();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Bitta purchase orderni id bo`yicha olish' })
  @ApiOkResponse({ description: 'Purchase order topildi' })
  @ApiUnauthorizedResponse({ description: "Token yoq yoki noto'g'ri" })
  @ApiForbiddenResponse({ description: 'Faqat admin/warehouse kirishi mumkin' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.purchaseOrderService.findById(id);
  }

  @Post()
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Yangi purchase order yaratish (faqat admin)' })
  @ApiBody({ type: CreatePurchaseOrderDto })
  @ApiOkResponse({ description: 'Purchase order yaratildi' })
  @ApiUnauthorizedResponse({ description: "Token yoq yoki noto'g'ri" })
  @ApiForbiddenResponse({ description: 'Faqat admin kirishi mumkin' })
  create(@Body() dto: CreatePurchaseOrderDto) {
    return this.purchaseOrderService.create(dto);
  }

  @Patch(':id')
  @Roles(Role.ADMIN)
  @ApiOperation({
    summary:
      'Purchase orderni yangilash (status, order fieldlari + item qo`shish/o`chirish)',
  })
  @ApiBody({ type: UpdatePurchaseOrderDto })
  @ApiOkResponse({ description: 'Purchase order yangilandi' })
  @ApiUnauthorizedResponse({ description: "Token yoq yoki noto'g'ri" })
  @ApiForbiddenResponse({ description: 'Faqat admin kirishi mumkin' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePurchaseOrderDto,
  ) {
    return this.purchaseOrderService.updateOrder(id, dto);
  }

  @Post(':id/receive')
  @Roles(Role.ADMIN, Role.WAREHOUSE)
  @ApiOperation({ summary: 'Purchase orderni omborga qabul qilish (receive)' })
  @ApiBody({ type: ReceivePurchaseOrderDto })
  @ApiOkResponse({ description: 'Purchase order omborga qabul qilindi' })
  @ApiUnauthorizedResponse({ description: "Token yoq yoki noto'g'ri" })
  @ApiForbiddenResponse({ description: 'Faqat admin/warehouse kirishi mumkin' })
  receive(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReceivePurchaseOrderDto,
  ) {
    return this.purchaseOrderService.receiveOrder(id, dto);
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Purchase orderni o`chirish (faqat admin)' })
  @ApiOkResponse({ description: 'Purchase order o`chirildi' })
  @ApiUnauthorizedResponse({ description: "Token yoq yoki noto'g'ri" })
  @ApiForbiddenResponse({ description: 'Faqat admin kirishi mumkin' })
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.purchaseOrderService.deleteOrder(id);
  }
}
