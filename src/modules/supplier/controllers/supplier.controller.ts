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
import { CreateSupplierDto } from '../dto/create-supplier.dto';
import { ListSuppliersQueryDto } from '../dto/list-suppliers-query.dto';
import { UpdateSupplierDto } from '../dto/update-supplier.dto';
import { SupplierService } from '../services/supplier.service';

@Controller('suppliers')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
@ApiTags('suppliers')
@ApiBearerAuth('bearer')
export class SupplierController {
  constructor(private readonly supplierService: SupplierService) {}

  @Get()
  @ApiOperation({ summary: 'Barcha supplierlarni olish (faqat admin)' })
  @ApiOkResponse({ description: 'Supplierlar ro`yxati' })
  @ApiUnauthorizedResponse({ description: "Token yoq yoki noto'g'ri" })
  @ApiForbiddenResponse({ description: 'Faqat admin kirishi mumkin' })
  findAll(@Query() query: ListSuppliersQueryDto) {
    return this.supplierService.findAll(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Bitta supplierni id bo`yicha olish (faqat admin)' })
  @ApiOkResponse({ description: 'Supplier topildi' })
  @ApiUnauthorizedResponse({ description: "Token yoq yoki noto'g'ri" })
  @ApiForbiddenResponse({ description: 'Faqat admin kirishi mumkin' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.supplierService.findById(id);
  }

  @Post()
  @ApiOperation({ summary: 'Supplier qo`shish (faqat admin)' })
  @ApiBody({ type: CreateSupplierDto })
  @ApiOkResponse({ description: 'Supplier yaratildi' })
  @ApiUnauthorizedResponse({ description: "Token yoq yoki noto'g'ri" })
  @ApiForbiddenResponse({ description: 'Faqat admin kirishi mumkin' })
  create(@Body() dto: CreateSupplierDto) {
    return this.supplierService.create(dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Supplier yangilash (faqat admin)' })
  @ApiBody({ type: UpdateSupplierDto })
  @ApiOkResponse({ description: 'Supplier yangilandi' })
  @ApiUnauthorizedResponse({ description: "Token yoq yoki noto'g'ri" })
  @ApiForbiddenResponse({ description: 'Faqat admin kirishi mumkin' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateSupplierDto,
  ) {
    return this.supplierService.update(id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Supplier o`chirish (faqat admin)' })
  @ApiOkResponse({ description: 'Supplier o`chirildi' })
  @ApiUnauthorizedResponse({ description: "Token yoq yoki noto'g'ri" })
  @ApiForbiddenResponse({ description: 'Faqat admin kirishi mumkin' })
  delete(@Param('id', ParseUUIDPipe) id: string) {
    return this.supplierService.delete(id);
  }
}
