import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ILike, Repository } from 'typeorm';
import { CreateUnitDto } from '../dto/create-unit.dto';
import { ListUnitsQueryDto } from '../dto/list-units-query.dto';
import { UpdateUnitDto } from '../dto/update-unit.dto';
import { Unit } from '../entities/unit.entity';

@Injectable()
export class UnitService {
  constructor(
    @InjectRepository(Unit)
    private readonly unitRepository: Repository<Unit>,
  ) {}

  async findAll(query: ListUnitsQueryDto) {
    const page = query.page ?? 1;
    const limit = Math.min(query.limit ?? 10, 100);
    const search = query.search?.trim();

    const [units, total] = await this.unitRepository.findAndCount({
      where: search
        ? {
            name: ILike(`%${search}%`),
          }
        : undefined,
      order: {
        createdAt: 'DESC',
      },
      skip: (page - 1) * limit,
      take: limit,
    });

    return {
      data: units,
      meta: {
        page,
        limit,
        total,
        total_pages: Math.ceil(total / limit) || 1,
      },
    };
  }

  async findById(id: string) {
    const unit = await this.unitRepository.findOne({ where: { id } });
    if (!unit) {
      throw new NotFoundException('Unit topilmadi');
    }
    return unit;
  }

  async create(dto: CreateUnitDto) {
    const existing = await this.unitRepository.findOne({
      where: { name: dto.name },
    });

    if (existing) {
      throw new ConflictException('Bunday unit name mavjud');
    }

    return this.unitRepository.save(
      this.unitRepository.create({
        name: dto.name,
      }),
    );
  }

  async update(id: string, dto: UpdateUnitDto) {
    const unit = await this.findById(id);

    if (dto.name !== undefined && dto.name !== unit.name) {
      const existing = await this.unitRepository.findOne({
        where: { name: dto.name },
      });
      if (existing) {
        throw new ConflictException('Bunday unit name mavjud');
      }
      unit.name = dto.name;
    }

    return this.unitRepository.save(unit);
  }

  async delete(id: string) {
    const unit = await this.findById(id);
    await this.unitRepository.delete(unit.id);

    return { message: "Unit o'chirildi" };
  }
}
