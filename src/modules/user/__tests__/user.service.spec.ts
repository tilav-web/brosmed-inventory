import {
  BadRequestException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { compare, hash } from 'bcrypt';
import { Warehouse } from 'src/modules/warehouse/entities/warehouse.entity';
import { User } from '../entities/user.entity';
import { Role } from '../enums/role.enum';
import { UserService } from '../services/user.service';

jest.mock('bcrypt', () => ({
  compare: jest.fn(),
  hash: jest.fn(),
}));

describe('UserService (Unit Tests)', () => {
  let service: UserService;

  const mockUserRepository = {
    findOne: jest.fn(),
    save: jest.fn(),
    createQueryBuilder: jest.fn(),
    create: jest.fn(),
    delete: jest.fn(),
  };

  const mockWarehouseRepository = {
    count: jest.fn(),
  };

  const mockConfigService = {
    get: jest.fn(),
  };

  const mockUser: User = {
    id: 'f76c76ff-f9a3-4fc1-b9b6-f4a290e49710',
    first_name: 'Ali',
    last_name: 'Valiyev',
    username: 'ali.valiyev',
    password: 'stored-hash',
    role: Role.WAREHOUSE,
    warehouses: [],
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UserService,
        {
          provide: getRepositoryToken(User),
          useValue: mockUserRepository,
        },
        {
          provide: getRepositoryToken(Warehouse),
          useValue: mockWarehouseRepository,
        },
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    service = module.get<UserService>(UserService);

    jest.clearAllMocks();
    mockWarehouseRepository.count.mockResolvedValue(0);
    mockConfigService.get.mockReturnValue(undefined);
  });

  describe('updateOwnProfile', () => {
    it('password yuborilganda current_password bo`lmasa BadRequestException throw qiladi', async () => {
      mockUserRepository.findOne.mockResolvedValue(mockUser);

      await expect(
        service.updateOwnProfile(mockUser.id, {
          password: 'newStrongPassword123',
        }),
      ).rejects.toThrow(BadRequestException);

      expect(compare).not.toHaveBeenCalled();
      expect(hash).not.toHaveBeenCalled();
      expect(mockUserRepository.save).not.toHaveBeenCalled();
    });

    it('current_password noto`g`ri bo`lsa UnauthorizedException throw qiladi', async () => {
      mockUserRepository.findOne.mockResolvedValue(mockUser);
      (compare as jest.Mock).mockResolvedValue(false);

      await expect(
        service.updateOwnProfile(mockUser.id, {
          current_password: 'wrongPassword123',
          password: 'newStrongPassword123',
        }),
      ).rejects.toThrow(UnauthorizedException);

      expect(compare).toHaveBeenCalledWith('wrongPassword123', mockUser.password);
      expect(hash).not.toHaveBeenCalled();
      expect(mockUserRepository.save).not.toHaveBeenCalled();
    });

    it('to`g`ri current_password bilan profil va password ni yangilaydi', async () => {
      const savedUser: User = {
        ...mockUser,
        first_name: 'Ali',
        last_name: 'Karimov',
        password: 'new-password-hash',
      };

      mockUserRepository.findOne.mockResolvedValue({ ...mockUser });
      mockUserRepository.save.mockResolvedValue(savedUser);
      (compare as jest.Mock).mockResolvedValue(true);
      (hash as jest.Mock).mockResolvedValue('new-password-hash');

      const result = await service.updateOwnProfile(mockUser.id, {
        current_password: 'oldStrongPassword123',
        password: 'newStrongPassword123',
        last_name: 'Karimov',
      });

      expect(compare).toHaveBeenCalledWith(
        'oldStrongPassword123',
        mockUser.password,
      );
      expect(hash).toHaveBeenCalledWith('newStrongPassword123', 10);
      expect(mockUserRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          id: mockUser.id,
          last_name: 'Karimov',
          password: 'new-password-hash',
        }),
      );
      expect(result).toEqual({
        id: savedUser.id,
        first_name: savedUser.first_name,
        last_name: savedUser.last_name,
        username: savedUser.username,
        role: savedUser.role,
        warehouses: savedUser.warehouses,
        createdAt: savedUser.createdAt,
        updatedAt: savedUser.updatedAt,
      });
    });
  });
});
