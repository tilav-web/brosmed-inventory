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
import { CreateUnitDto } from '../dto/create-unit.dto';
import { ListUnitsQueryDto } from '../dto/list-units-query.dto';
import { UpdateUnitDto } from '../dto/update-unit.dto';
import { UnitService } from '../services/unit.service';

@Controller('units')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
@ApiTags('units')
@ApiBearerAuth('bearer')
export class UnitController {
  constructor(private readonly unitService: UnitService) {}

  @Get()
  @ApiOperation({ summary: 'Barcha unitlarni olish (faqat admin)' })
  @ApiOkResponse({ description: 'Unitlar ro`yxati' })
  @ApiUnauthorizedResponse({ description: "Token yoq yoki noto'g'ri" })
  @ApiForbiddenResponse({ description: 'Faqat admin kirishi mumkin' })
  findAll(@Query() query: ListUnitsQueryDto) {
    return this.unitService.findAll(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Bitta unitni id bo`yicha olish (faqat admin)' })
  @ApiOkResponse({ description: 'Unit topildi' })
  @ApiUnauthorizedResponse({ description: "Token yoq yoki noto'g'ri" })
  @ApiForbiddenResponse({ description: 'Faqat admin kirishi mumkin' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.unitService.findById(id);
  }

  @Post()
  @ApiOperation({ summary: 'Unit qo`shish (faqat admin)' })
  @ApiBody({ type: CreateUnitDto })
  @ApiOkResponse({ description: 'Unit yaratildi' })
  @ApiUnauthorizedResponse({ description: "Token yoq yoki noto'g'ri" })
  @ApiForbiddenResponse({ description: 'Faqat admin kirishi mumkin' })
  create(@Body() dto: CreateUnitDto) {
    return this.unitService.create(dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Unit yangilash (faqat admin)' })
  @ApiBody({ type: UpdateUnitDto })
  @ApiOkResponse({ description: 'Unit yangilandi' })
  @ApiUnauthorizedResponse({ description: "Token yoq yoki noto'g'ri" })
  @ApiForbiddenResponse({ description: 'Faqat admin kirishi mumkin' })
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateUnitDto) {
    return this.unitService.update(id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Unit o`chirish (faqat admin)' })
  @ApiOkResponse({ description: 'Unit o`chirildi' })
  @ApiUnauthorizedResponse({ description: "Token yoq yoki noto'g'ri" })
  @ApiForbiddenResponse({ description: 'Faqat admin kirishi mumkin' })
  delete(@Param('id', ParseUUIDPipe) id: string) {
    return this.unitService.delete(id);
  }
}
