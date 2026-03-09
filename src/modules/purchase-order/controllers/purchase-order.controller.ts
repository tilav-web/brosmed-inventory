import {
  Body,
  Controller,
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
import { UpdatePurchaseOrderStatusDto } from '../dto/update-purchase-order-status.dto';
import { PurchaseOrderService } from '../services/purchase-order.service';

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

  @Patch(':id/status')
  @ApiOperation({ summary: 'Purchase order statusini yangilash' })
  @ApiBody({ type: UpdatePurchaseOrderStatusDto })
  @ApiOkResponse({ description: 'Purchase order statusi yangilandi' })
  @ApiUnauthorizedResponse({ description: "Token yoq yoki noto'g'ri" })
  @ApiForbiddenResponse({ description: 'Faqat admin/warehouse kirishi mumkin' })
  updateStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePurchaseOrderStatusDto,
  ) {
    return this.purchaseOrderService.updateStatus(id, dto);
  }
}
