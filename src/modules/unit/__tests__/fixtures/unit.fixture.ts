import { Unit } from '../../entities/unit.entity';
import { CreateUnitDto } from '../../dto/create-unit.dto';
import { UpdateUnitDto } from '../../dto/update-unit.dto';

/**
 * Test ichida ishlatadigan mock/fake datalar
 * Barcha testlarda ishlatilib, kod repetition kamayadi
 */

export const MOCK_UNITS: Record<string, Unit> = {
  kg: {
    id: '123e4567-e89b-12d3-a456-426614174000',
    name: 'kg',
    createdAt: new Date('2025-01-01'),
    updatedAt: new Date('2025-01-01'),
  },

  gr: {
    id: '223e4567-e89b-12d3-a456-426614174001',
    name: 'gr',
    createdAt: new Date('2025-01-02'),
    updatedAt: new Date('2025-01-02'),
  },

  litr: {
    id: '323e4567-e89b-12d3-a456-426614174002',
    name: 'litr',
    createdAt: new Date('2025-01-03'),
    updatedAt: new Date('2025-01-03'),
  },

  metr: {
    id: '423e4567-e89b-12d3-a456-426614174003',
    name: 'metr',
    createdAt: new Date('2025-01-04'),
    updatedAt: new Date('2025-01-04'),
  },
};

export const MOCK_CREATE_DTOS: Record<string, CreateUnitDto> = {
  valid: {
    name: 'kg',
  },

  validWithLongName: {
    name: "kilogramm (kg) - og'irlik o'lchov birligi",
  },

  invalidShort: {
    name: '',
  },

  invalidLong: {
    name: 'a'.repeat(65), // Max length 64
  },
};

export const MOCK_UPDATE_DTOS: Record<string, UpdateUnitDto> = {
  valid: {
    name: 'kilogramm',
  },

  partialUpdate: {
    name: 'kg (kilogramm)',
  },

  empty: {},
};

export const MOCK_PAGINATION = {
  page1Limit10: {
    page: 1,
    limit: 10,
    search: '',
  },

  page2Limit5: {
    page: 2,
    limit: 5,
  },

  withSearch: {
    page: 1,
    limit: 10,
    search: 'kg',
  },

  invalidLimit: {
    page: 1,
    limit: 1000, // Maksimal 100 ga tushiriladi
  },
};

export const MOCK_IDS = {
  valid: '123e4567-e89b-12d3-a456-426614174000',
  invalid: 'invalid-uuid',
  notFoundUuid: '999e9999-e99b-99d3-a999-999999999999',
};
