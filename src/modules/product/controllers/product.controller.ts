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
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { Roles } from 'src/common/decorators/roles.decorator';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { JwtAuthGuard } from 'src/modules/auth/guards/jwt-auth.guard';
import { Role } from 'src/modules/user/enums/role.enum';
import { CreateProductDto } from '../dto/create-product.dto';
import { ListProductsQueryDto } from '../dto/list-products-query.dto';
import { UpdateProductDto } from '../dto/update-product.dto';
import { ProductService } from '../services/product.service';

interface UploadedImage {
  buffer: Buffer;
  mimetype: string;
}

@Controller('products')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiTags('products')
@ApiBearerAuth('bearer')
export class ProductController {
  constructor(private readonly productService: ProductService) {}

  @Get()
  @ApiOperation({ summary: 'Barcha productlarni olish' })
  @ApiOkResponse({ description: 'Productlar ro`yxati' })
  @ApiUnauthorizedResponse({ description: "Token yoq yoki noto'g'ri" })
  findAll(@Query() query: ListProductsQueryDto) {
    return this.productService.findAll(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Bitta productni id bo`yicha olish' })
  @ApiOkResponse({ description: 'Product topildi' })
  @ApiUnauthorizedResponse({ description: "Token yoq yoki noto'g'ri" })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.productService.findById(id);
  }

  @Post()
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Product qo`shish (faqat admin)' })
  @ApiBody({ type: CreateProductDto })
  @ApiOkResponse({ description: 'Product yaratildi' })
  @ApiUnauthorizedResponse({ description: "Token yoq yoki noto'g'ri" })
  @ApiForbiddenResponse({ description: 'Faqat admin kirishi mumkin' })
  @UseInterceptors(FileInterceptor('image'))
  create(@Body() dto: CreateProductDto) {
    return this.productService.create(dto);
  }

  @Patch(':id')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Product yangilash (faqat admin)' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({ type: UpdateProductDto })
  @ApiOkResponse({ description: 'Product yangilandi' })
  @ApiUnauthorizedResponse({ description: "Token yoq yoki noto'g'ri" })
  @ApiForbiddenResponse({ description: 'Faqat admin kirishi mumkin' })
  @UseInterceptors(
    FileInterceptor('image', {
      limits: { fileSize: 10 * 1024 * 1024 },
    }),
  )
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateProductDto,
    @UploadedFile() image?: UploadedImage,
  ) {
    return this.productService.update(id, { ...dto, image });
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Product o`chirish (faqat admin)' })
  @ApiOkResponse({ description: 'Product o`chirildi' })
  @ApiUnauthorizedResponse({ description: "Token yoq yoki noto'g'ri" })
  @ApiForbiddenResponse({ description: 'Faqat admin kirishi mumkin' })
  delete(@Param('id', ParseUUIDPipe) id: string) {
    return this.productService.delete(id);
  }
}
