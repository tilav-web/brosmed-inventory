import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ILike, Repository } from 'typeorm';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { UnitService } from '../services/unit.service';
import { Unit } from '../entities/unit.entity';
import { CreateUnitDto } from '../dto/create-unit.dto';
import { UpdateUnitDto } from '../dto/update-unit.dto';
import { ListUnitsQueryDto } from '../dto/list-units-query.dto';
import {
  MOCK_UNITS,
  MOCK_CREATE_DTOS,
  MOCK_PAGINATION,
} from './fixtures/unit.fixture';

describe('UnitService (Unit Tests)', () => {
  let service: UnitService;

  const { kg: mockUnit, gr, litr } = MOCK_UNITS;
  const mockUnits: Unit[] = [mockUnit, gr, litr];

  // Repository Mock
  const mockRepository = {
    findOne: jest.fn(),
    findAndCount: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    delete: jest.fn(),
  };

  beforeEach(async () => {
    // Testing Module yaratamiz
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UnitService,
        {
          provide: getRepositoryToken(Unit),
          useValue: mockRepository,
        },
      ],
    }).compile();

    service = module.get<UnitService>(UnitService);
    module.get<Repository<Unit>>(getRepositoryToken(Unit));

    // Barcha mock larni reset qilamiz
    jest.clearAllMocks();
  });

  describe('findAll', () => {
    it('barcha unitlarni pagination bilan qaytarishi kerak', async () => {
      const query: ListUnitsQueryDto = MOCK_PAGINATION.page1Limit10;

      mockRepository.findAndCount.mockResolvedValue([mockUnits, 3]);

      const result = await service.findAll(query);

      expect(result).toEqual({
        data: mockUnits,
        meta: {
          page: 1,
          limit: 10,
          total: 3,
          total_pages: 1,
        },
      });

      expect(mockRepository.findAndCount).toHaveBeenCalledWith({
        where: undefined,
        order: { createdAt: 'DESC' },
        skip: 0,
        take: 10,
      });
    });

    it('search qilib unitlarni topish', async () => {
      const query: ListUnitsQueryDto = MOCK_PAGINATION.withSearch;

      mockRepository.findAndCount.mockResolvedValue([[mockUnit], 1]);

      const result = await service.findAll(query);

      expect(result.data).toHaveLength(1);
      expect(result.meta.total).toBe(1);
    });

    it('limit maksimal qiymatini 100 ga cheklashi kerak', async () => {
      const query: ListUnitsQueryDto = MOCK_PAGINATION.invalidLimit;

      mockRepository.findAndCount.mockResolvedValue([mockUnits, 3]);

      await service.findAll(query);

      // to'rta parametr tekshiramiz
      expect(mockRepository.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 100, // 1000 dan 100 ga tushiriladi
        }),
      );
    });

    it('default page 1, limit 10 bo`lishi kerak', async () => {
      const query: ListUnitsQueryDto = {
        page: 1,
        limit: 10,
        search: undefined,
      };

      mockRepository.findAndCount.mockResolvedValue([mockUnits, 3]);

      await service.findAll(query);

      expect(mockRepository.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 0,
          take: 10,
        }),
      );
    });
  });

  describe('findById', () => {
    it("ID bo'yicha unitni qaytarishi kerak", async () => {
      mockRepository.findOne.mockResolvedValue(mockUnit);

      const result = await service.findById(mockUnit.id);

      expect(result).toEqual(mockUnit);
      expect(mockRepository.findOne).toHaveBeenCalledWith({
        where: { id: mockUnit.id },
      });
    });

    it('Unit topilmasa NotFoundException throw qilishi kerak', async () => {
      mockRepository.findOne.mockResolvedValue(null);

      await expect(service.findById('invalid-id')).rejects.toThrow(
        NotFoundException,
      );
      await expect(service.findById('invalid-id')).rejects.toThrow(
        'Unit topilmadi',
      );
    });
  });

  describe('create', () => {
    it('yangi unit yaratishi kerak', async () => {
      const createDto: CreateUnitDto = MOCK_CREATE_DTOS.valid;

      mockRepository.findOne.mockResolvedValue(null); // Mavjud emas
      mockRepository.create.mockReturnValue(createDto);
      mockRepository.save.mockResolvedValue(mockUnit);

      const result = await service.create(createDto);

      expect(result).toEqual(mockUnit);
      expect(mockRepository.findOne).toHaveBeenCalledWith({
        where: { name: ILike(createDto.name) },
      });
      expect(mockRepository.create).toHaveBeenCalledWith({
        name: createDto.name,
      });
      expect(mockRepository.save).toHaveBeenCalled();
    });

    it("duplicate unit name bo'lsa ConflictException throw qilishi kerak", async () => {
      const createDto: CreateUnitDto = MOCK_CREATE_DTOS.valid;

      mockRepository.findOne.mockResolvedValue(mockUnit);

      await expect(service.create(createDto)).rejects.toThrow(
        ConflictException,
      );
      await expect(service.create(createDto)).rejects.toThrow(
        'Bunday unit name mavjud',
      );
    });
  });

  describe('update', () => {
    it('unit ni yangilashi kerak', async () => {
      const updateDto: UpdateUnitDto = { name: 'kg (kilogramm)' };
      const updatedUnit = { ...mockUnit, ...updateDto };

      mockRepository.findOne.mockResolvedValueOnce(mockUnit); // findById chun
      mockRepository.findOne.mockResolvedValueOnce(null); // duplicate check chun
      mockRepository.save.mockResolvedValue(updatedUnit);

      const result = await service.update(mockUnit.id, updateDto);

      expect(result.name).toBe('kg (kilogramm)');
      expect(mockRepository.findOne).toHaveBeenNthCalledWith(1, {
        where: { id: mockUnit.id },
      });
      expect(mockRepository.findOne).toHaveBeenNthCalledWith(2, {
        where: { name: ILike(updateDto.name) },
      });
      expect(mockRepository.save).toHaveBeenCalled();
    });

    it("yangi name duplicate bo'lsa ConflictException throw qilishi kerak", async () => {
      const updateDto: UpdateUnitDto = { name: 'gr' };

      mockRepository.findOne.mockResolvedValueOnce(mockUnit);
      mockRepository.findOne.mockResolvedValueOnce(mockUnits[1]); // gr allaqachon mavjud

      await expect(service.update(mockUnit.id, updateDto)).rejects.toThrow(
        ConflictException,
      );
      expect(mockRepository.findOne).toHaveBeenNthCalledWith(2, {
        where: { name: ILike(updateDto.name) },
      });
    });

    it('Unit topilmasa NotFoundException throw qilishi kerak', async () => {
      mockRepository.findOne.mockResolvedValue(null);

      await expect(
        service.update('invalid-id', { name: 'new-name' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('delete', () => {
    it("unit ni o'chirishi kerak", async () => {
      mockRepository.findOne.mockResolvedValue(mockUnit);
      mockRepository.delete.mockResolvedValue({ affected: 1 });

      const result = await service.delete(mockUnit.id);

      expect(result).toEqual({ message: "Unit o'chirildi" });
      expect(mockRepository.findOne).toHaveBeenCalledWith({
        where: { id: mockUnit.id },
      });
      expect(mockRepository.delete).toHaveBeenCalledWith(mockUnit.id);
    });

    it('Unit topilmasa NotFoundException throw qilishi kerak', async () => {
      mockRepository.findOne.mockResolvedValue(null);

      await expect(service.delete('invalid-id')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
