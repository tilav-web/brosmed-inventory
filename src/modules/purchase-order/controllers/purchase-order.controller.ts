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
import { CreatePurchaseOrderDto } from '../dto/create-purchase-order.dto';
import { ListPurchaseOrdersQueryDto } from '../dto/list-purchase-orders-query.dto';
import { UpdatePurchaseOrderDto } from '../dto/update-purchase-order.dto';
import { PurchaseOrderService } from '../services/purchase-order.service';
import { ReceivePurchaseOrderDto } from '../dto/update-purchase-order-status.dto';

@Controller('purchase-orders')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.ACCOUNTANT)
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
  @ApiForbiddenResponse({ description: 'Faqat admin/hisobchi kirishi mumkin' })
  findAll(
    @Query() query: ListPurchaseOrdersQueryDto,
    @Req() req: { user: AuthUser },
  ) {
    return this.purchaseOrderService.findAll(query, req.user);
  }

  @Get('statistics')
  @ApiOperation({ summary: 'Purchase order statuslar bo`yicha statistikasi' })
  @ApiOkResponse({ description: 'Statistika muvaffaqiyatli olindi' })
  @ApiUnauthorizedResponse({ description: "Token yoq yoki noto'g'ri" })
  @ApiForbiddenResponse({ description: 'Faqat admin/hisobchi kirishi mumkin' })
  getStatistics(@Req() req: { user: AuthUser }) {
    return this.purchaseOrderService.getStatistics(req.user);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Bitta purchase orderni id bo`yicha olish' })
  @ApiOkResponse({ description: 'Purchase order topildi' })
  @ApiUnauthorizedResponse({ description: "Token yoq yoki noto'g'ri" })
  @ApiForbiddenResponse({ description: 'Faqat admin/hisobchi kirishi mumkin' })
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: { user: AuthUser },
  ) {
    return this.purchaseOrderService.findById(id, req.user);
  }

  @Post()
  @Roles(Role.ACCOUNTANT)
  @ApiOperation({ summary: 'Yangi purchase order yaratish (faqat hisobchi)' })
  @ApiBody({ type: CreatePurchaseOrderDto })
  @ApiOkResponse({ description: 'Purchase order yaratildi' })
  @ApiUnauthorizedResponse({ description: "Token yoq yoki noto'g'ri" })
  @ApiForbiddenResponse({ description: 'Faqat hisobchi kirishi mumkin' })
  create(
    @Body() dto: CreatePurchaseOrderDto,
    @Req() req: { user: AuthUser },
  ) {
    return this.purchaseOrderService.create(dto, req.user);
  }

  @Patch(':id')
  @Roles(Role.ADMIN, Role.ACCOUNTANT)
  @ApiOperation({
    summary:
      'Purchase orderni yangilash: admin tasdiqlaydi/bekor qiladi, hisobchi esa tahrirlaydi yoki delivered qiladi',
  })
  @ApiBody({ type: UpdatePurchaseOrderDto })
  @ApiOkResponse({ description: 'Purchase order yangilandi' })
  @ApiUnauthorizedResponse({ description: "Token yoq yoki noto'g'ri" })
  @ApiForbiddenResponse({ description: 'Faqat admin/hisobchi kirishi mumkin' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePurchaseOrderDto,
    @Req() req: { user: AuthUser },
  ) {
    return this.purchaseOrderService.updateOrder(id, dto, req.user);
  }

  @Post(':id/receive')
  @Roles(Role.ACCOUNTANT)
  @ApiOperation({ summary: 'Purchase orderni omborga qabul qilish (receive)' })
  @ApiBody({ type: ReceivePurchaseOrderDto })
  @ApiOkResponse({ description: 'Purchase order omborga qabul qilindi' })
  @ApiUnauthorizedResponse({ description: "Token yoq yoki noto'g'ri" })
  @ApiForbiddenResponse({ description: 'Faqat hisobchi kirishi mumkin' })
  receive(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReceivePurchaseOrderDto,
    @Req() req: { user: AuthUser },
  ) {
    return this.purchaseOrderService.receiveOrder(id, dto, req.user);
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
