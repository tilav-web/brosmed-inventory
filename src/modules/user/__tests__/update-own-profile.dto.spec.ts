import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdateOwnProfileDto } from '../dto/update-own-profile.dto';

describe('UpdateOwnProfileDto', () => {
  it('first_name va last_name qiymatlarini trim qiladi', async () => {
    const dto = plainToInstance(UpdateOwnProfileDto, {
      first_name: '  Ali  ',
      last_name: '  Valiyev  ',
    });

    const errors = await validate(dto);

    expect(errors).toHaveLength(0);
    expect(dto.first_name).toBe('Ali');
    expect(dto.last_name).toBe('Valiyev');
  });

  it('faqat bo`sh joy yuborilgan first_name ni reject qiladi', async () => {
    const dto = plainToInstance(UpdateOwnProfileDto, {
      first_name: '   ',
    });

    const errors = await validate(dto);

    expect(errors.map((error) => error.property)).toContain('first_name');
  });

  it('password yuborilganda current_password ni majburiy qiladi', async () => {
    const dto = plainToInstance(UpdateOwnProfileDto, {
      password: 'newStrongPassword123',
    });

    const errors = await validate(dto);

    expect(errors.map((error) => error.property)).toContain('current_password');
  });
});
