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
import { CreateCategoryDto } from '../dto/create-category.dto';
import { ListCategoriesQueryDto } from '../dto/list-categories-query.dto';
import { UpdateCategoryDto } from '../dto/update-category.dto';
import { CategoryService } from '../services/category.service';

@Controller('categories')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiTags('categories')
@ApiBearerAuth('bearer')
export class CategoryController {
  constructor(private readonly categoryService: CategoryService) {}

  @Get()
  @ApiOperation({ summary: 'Barcha categorylarni olish (to`liq)' })
  @ApiOkResponse({ description: 'Categorylar ro`yxati (to`liq)' })
  @ApiUnauthorizedResponse({ description: "Token yoq yoki noto'g'ri" })
  findAll(@Query() query: ListCategoriesQueryDto) {
    return this.categoryService.findAll(query);
  }

  @Get('simple')
  @ApiOperation({ summary: 'Barcha categorylarni olish (faqat category)' })
  @ApiOkResponse({ description: 'Categorylar ro`yxati (oddiy)' })
  @ApiUnauthorizedResponse({ description: "Token yoq yoki noto'g'ri" })
  findAllSimple(@Query() query: ListCategoriesQueryDto) {
    return this.categoryService.findAllSimple(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Bitta categoryni id bo`yicha olish' })
  @ApiOkResponse({ description: 'Category topildi' })
  @ApiUnauthorizedResponse({ description: "Token yoq yoki noto'g'ri" })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.categoryService.findById(id);
  }

  @Post()
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Category qo`shish (faqat admin)' })
  @ApiBody({ type: CreateCategoryDto })
  @ApiOkResponse({ description: 'Category yaratildi' })
  @ApiUnauthorizedResponse({ description: "Token yoq yoki noto'g'ri" })
  @ApiForbiddenResponse({ description: 'Faqat admin kirishi mumkin' })
  create(@Body() dto: CreateCategoryDto) {
    return this.categoryService.create(dto);
  }

  @Patch(':id')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Category yangilash (faqat admin)' })
  @ApiBody({ type: UpdateCategoryDto })
  @ApiOkResponse({ description: 'Category yangilandi' })
  @ApiUnauthorizedResponse({ description: "Token yoq yoki noto'g'ri" })
  @ApiForbiddenResponse({ description: 'Faqat admin kirishi mumkin' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCategoryDto,
  ) {
    return this.categoryService.update(id, dto);
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Category o`chirish (faqat admin)' })
  @ApiOkResponse({ description: 'Category o`chirildi' })
  @ApiUnauthorizedResponse({ description: "Token yoq yoki noto'g'ri" })
  @ApiForbiddenResponse({ description: 'Faqat admin kirishi mumkin' })
  delete(@Param('id', ParseUUIDPipe) id: string) {
    return this.categoryService.delete(id);
  }
}
