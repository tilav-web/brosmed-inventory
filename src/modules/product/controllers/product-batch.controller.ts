import {
  Body,
  Controller,
  Param,
  ParseUUIDPipe,
  Patch,
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
import { UpdateProductBatchDto } from '../dto/update-product-batch.dto';
import { ProductBatchService } from '../services/product-batch.service';

@Controller('product-batches')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiTags('product-batches')
@ApiBearerAuth('bearer')
export class ProductBatchController {
  constructor(private readonly productBatchService: ProductBatchService) {}

  @Patch(':id')
  @Roles(Role.ADMIN, Role.WAREHOUSE)
  @ApiOperation({ summary: 'Product batch srokini yangilash' })
  @ApiBody({ type: UpdateProductBatchDto })
  @ApiOkResponse({ description: 'Product batch yangilandi' })
  @ApiUnauthorizedResponse({ description: "Token yoq yoki noto'g'ri" })
  @ApiForbiddenResponse({ description: 'Faqat admin/warehouse kirishi mumkin' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateProductBatchDto,
  ) {
    return this.productBatchService.update(id, dto);
  }
}
