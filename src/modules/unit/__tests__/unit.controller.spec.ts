import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, NotFoundException } from '@nestjs/common';
import { UnitController } from '../controllers/unit.controller';
import { UnitService } from '../services/unit.service';
import { CreateUnitDto } from '../dto/create-unit.dto';
import { UpdateUnitDto } from '../dto/update-unit.dto';

describe('UnitController (Integration Tests)', () => {
  let app: INestApplication;

  const mockUnit = {
    id: '123e4567-e89b-12d3-a456-426614174000',
    name: 'kg',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockService = {
    findAll: jest.fn(),
    findById: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [UnitController],
      providers: [
        {
          provide: UnitService,
          useValue: mockService,
        },
      ],
    })
      .overrideGuard('JwtAuthGuard')
      .useValue(true) // Auth guard ni disable qilamiz
      .overrideGuard('RolesGuard')
      .useValue(true) // Roles guard ni disable qilamiz
      .compile();

    app = module.createNestApplication();
    module.get<UnitService>(UnitService);
    await app.init();

    jest.clearAllMocks();
  });

  afterEach(async () => {
    await app.close();
  });

  describe('findAll', () => {
    it('barcha unitlarni qaytarishi kerak', async () => {
      const mockResponse = {
        data: [mockUnit],
        meta: { page: 1, limit: 10, total: 1, total_pages: 1 },
      };

      mockService.findAll.mockResolvedValue(mockResponse);

      const controller = app.get(UnitController);
      const result = await controller.findAll({ page: 1, limit: 10 });

      expect(result).toEqual(mockResponse);
      expect(mockService.findAll).toHaveBeenCalled();
    });
  });

  describe('findOne', () => {
    it("ID bo'yicha unit qaytarishi kerak", async () => {
      mockService.findById.mockResolvedValue(mockUnit);

      const controller = app.get(UnitController);
      const result = await controller.findOne(mockUnit.id);

      expect(result).toEqual(mockUnit);
      expect(mockService.findById).toHaveBeenCalledWith(mockUnit.id);
    });

    it('Unit topilmasa exception throw qilishi kerak', async () => {
      mockService.findById.mockRejectedValue(
        new NotFoundException('Unit topilmadi'),
      );

      const controller = app.get(UnitController);

      await expect(controller.findOne('invalid-id')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('create', () => {
    it('yangi unit yaratishi kerak', async () => {
      const createDto: CreateUnitDto = { name: 'kg' };

      mockService.create.mockResolvedValue(mockUnit);

      const controller = app.get(UnitController);
      const result = await controller.create(createDto);

      expect(result).toEqual(mockUnit);
      expect(mockService.create).toHaveBeenCalledWith(createDto);
    });
  });

  describe('update', () => {
    it('unit ni yangilashi kerak', async () => {
      const updateDto: UpdateUnitDto = { name: 'kilogramm' };
      const updatedUnit = { ...mockUnit, name: 'kilogramm' };

      mockService.update.mockResolvedValue(updatedUnit);

      const controller = app.get(UnitController);
      const result = await controller.update(mockUnit.id, updateDto);

      expect(result.name).toBe('kilogramm');
      expect(mockService.update).toHaveBeenCalledWith(mockUnit.id, updateDto);
    });
  });

  describe('delete', () => {
    it("unit ni o'chirishi kerak", async () => {
      const deleteResponse = { message: "Unit o'chirildi" };

      mockService.delete.mockResolvedValue(deleteResponse);

      const controller = app.get(UnitController);
      const result = await controller.delete(mockUnit.id);

      expect(result).toEqual(deleteResponse);
      expect(mockService.delete).toHaveBeenCalledWith(mockUnit.id);
    });
  });
});
