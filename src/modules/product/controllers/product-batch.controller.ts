import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
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
  ApiResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Roles } from 'src/common/decorators/roles.decorator';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { JwtAuthGuard } from 'src/modules/auth/guards/jwt-auth.guard';
import { AuthUser } from 'src/modules/auth/interfaces/auth-user.interface';
import { Role } from 'src/modules/user/enums/role.enum';
import { UpdateProductBatchDto } from '../dto/update-product-batch.dto';
import { ProductBatchService } from '../services/product-batch.service';
import { ListProductBatchsQueryDto } from '../dto/list-product-batch-query.dto';

@Controller('product-batches')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiTags('product-batches')
@ApiBearerAuth('bearer')
export class ProductBatchController {
  constructor(private readonly productBatchService: ProductBatchService) {}

  @Get()
  @ApiOperation({ summary: 'Barcha partiyalarni pagination bilan olish' })
  @ApiResponse({ status: 200, description: 'Muvaffaqiyatli qaytarildi.' })
  @ApiUnauthorizedResponse({ description: "Token yoq yoki noto'g'ri" })
  @ApiForbiddenResponse({ description: 'Faqat admin/warehouse/hisobchi kirishi mumkin' })
  @Roles(Role.ADMIN, Role.WAREHOUSE, Role.ACCOUNTANT)
  async findAll(
    @Req() req: { user: AuthUser },
    @Query() query: ListProductBatchsQueryDto,
  ) {
    return await this.productBatchService.findAll(query, req.user);
  }

  @Get('alerts')
  @ApiOperation({
    summary: 'Sroki yaqinlashgan partiyalarni pagination bilan olish',
  })
  @ApiResponse({
    status: 200,
    description: 'Sroki yaqinlashgan partiyalar muvaffaqiyatli qaytarildi.',
  })
  @ApiUnauthorizedResponse({ description: "Token yoq yoki noto'g'ri" })
  @ApiForbiddenResponse({ description: 'Faqat admin/warehouse/hisobchi kirishi mumkin' })
  @Roles(Role.ADMIN, Role.WAREHOUSE, Role.ACCOUNTANT)
  async findAlerts(
    @Req() req: { user: AuthUser },
    @Query() query: ListProductBatchsQueryDto,
  ) {
    return await this.productBatchService.findAlerts(query, req.user);
  }

  @Patch(':id')
  @Roles(Role.ADMIN, Role.WAREHOUSE, Role.ACCOUNTANT)
  @ApiOperation({ summary: 'Product batch ma`lumotlarini yangilash' })
  @ApiBody({ type: UpdateProductBatchDto })
  @ApiOkResponse({ description: 'Product batch yangilandi' })
  @ApiUnauthorizedResponse({ description: "Token yoq yoki noto'g'ri" })
  @ApiForbiddenResponse({ description: 'Faqat admin/warehouse/hisobchi kirishi mumkin' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: { user: AuthUser },
    @Body() dto: UpdateProductBatchDto,
  ) {
    return this.productBatchService.update(id, dto, req.user);
  }

  @Get(':id')
  @Roles(Role.ADMIN, Role.WAREHOUSE, Role.ACCOUNTANT)
  @ApiOperation({ summary: 'Bitta product batchni id bo`yicha olish' })
  @ApiOkResponse({ description: 'Product batch topildi' })
  @ApiUnauthorizedResponse({ description: "Token yoq yoki noto'g'ri" })
  @ApiForbiddenResponse({ description: 'Faqat admin/warehouse/hisobchi kirishi mumkin' })
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: { user: AuthUser },
  ) {
    return this.productBatchService.findById(id, req.user);
  }
}
