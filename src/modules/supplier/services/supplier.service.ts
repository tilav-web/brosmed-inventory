import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ILike, Repository } from 'typeorm';
import { CreateSupplierDto } from '../dto/create-supplier.dto';
import { ListSuppliersQueryDto } from '../dto/list-suppliers-query.dto';
import { UpdateSupplierDto } from '../dto/update-supplier.dto';
import { Supplier } from '../entities/supplier.entity';

@Injectable()
export class SupplierService {
  constructor(
    @InjectRepository(Supplier)
    private readonly supplierRepository: Repository<Supplier>,
  ) {}

  async findAll(query: ListSuppliersQueryDto) {
    const page = query.page ?? 1;
    const limit = Math.min(query.limit ?? 10, 100);
    const search = query.search?.trim();

    const [suppliers, total] = await this.supplierRepository.findAndCount({
      where: search ? [{ company_name: ILike(`%${search}%`) }] : undefined,
      order: {
        createdAt: 'DESC',
      },
      skip: (page - 1) * limit,
      take: limit,
    });

    return {
      data: suppliers,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  async findById(id: string) {
    const supplier = await this.supplierRepository.findOne({ where: { id } });
    if (!supplier) {
      throw new NotFoundException('Supplier topilmadi');
    }
    return supplier;
  }

  async create(dto: CreateSupplierDto) {
    const existing = await this.supplierRepository.findOne({
      where: { email: dto.email },
    });

    if (existing) {
      throw new ConflictException('Bu email bilan supplier allaqachon mavjud');
    }

    return this.supplierRepository.save(
      this.supplierRepository.create({
        company_name: dto.company_name,
        contact_person: dto.contact_person,
        email: dto.email,
        phone: dto.phone,
        payment_terms: dto.payment_terms ?? null,
        description: dto.description ?? null,
      }),
    );
  }

  async update(id: string, dto: UpdateSupplierDto) {
    const supplier = await this.findById(id);

    if (dto.email !== undefined && dto.email !== supplier.email) {
      const emailExists = await this.supplierRepository.findOne({
        where: { email: dto.email },
      });
      if (emailExists) {
        throw new ConflictException(
          'Bu email bilan supplier allaqachon mavjud',
        );
      }
      supplier.email = dto.email;
    }

    if (dto.company_name !== undefined) {
      supplier.company_name = dto.company_name;
    }
    if (dto.contact_person !== undefined) {
      supplier.contact_person = dto.contact_person;
    }
    if (dto.phone !== undefined) {
      supplier.phone = dto.phone;
    }
    if (dto.payment_terms !== undefined) {
      supplier.payment_terms = dto.payment_terms;
    }
    if (dto.description !== undefined) {
      supplier.description = dto.description;
    }

    return this.supplierRepository.save(supplier);
  }

  async delete(id: string) {
    const supplier = await this.findById(id);
    await this.supplierRepository.delete(supplier.id);
    return { message: "Supplier o'chirildi" };
  }
}
