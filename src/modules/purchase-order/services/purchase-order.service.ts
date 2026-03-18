import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { Product } from 'src/modules/product/entities/product.entity';
import { ProductBatch } from 'src/modules/product/entities/product-batch.entity';
import { Supplier } from 'src/modules/supplier/entities/supplier.entity';
import { Warehouse } from 'src/modules/warehouse/entities/warehouse.entity';
import { CreatePurchaseOrderDto } from '../dto/create-purchase-order.dto';
import { ListPurchaseOrdersQueryDto } from '../dto/list-purchase-orders-query.dto';
import {
  UpdatePurchaseOrderStatusDto,
  ReceivePurchaseOrderDto,
  ReceiveOrderItemDto,
} from '../dto/update-purchase-order-status.dto';
import { OrderStatus } from '../enums/order-status.enum';
import { OrderItem } from '../entities/order-item.entity';
import { PurchaseOrder } from '../entities/purchase-order.entity';

@Injectable()
export class PurchaseOrderService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(PurchaseOrder)
    private readonly purchaseOrderRepository: Repository<PurchaseOrder>,
    @InjectRepository(Product)
    private readonly productRepository: Repository<Product>,
  ) {}

  private async generateOrderNumber(manager: EntityManager): Promise<string> {
    const year = new Date().getFullYear();

    const totalThisYear = await manager
      .getRepository(PurchaseOrder)
      .createQueryBuilder('po')
      .where('EXTRACT(YEAR FROM po.createdAt) = :year', { year })
      .getCount();

    return `PO-${year}-${String(totalThisYear + 1).padStart(3, '0')}`;
  }

  async findAll(query: ListPurchaseOrdersQueryDto) {
    const page = query.page ?? 1;
    const limit = Math.min(query.limit ?? 10, 100);
    const search = query.search?.trim();

    const qb = this.purchaseOrderRepository
      .createQueryBuilder('po')
      .leftJoinAndSelect('po.supplier', 'supplier')
      .leftJoinAndSelect('po.warehouse', 'warehouse')
      .leftJoinAndSelect('po.items', 'item')
      .leftJoinAndSelect('item.product', 'product');

    if (search) {
      qb.andWhere(
        '(po.order_number ILIKE :search OR supplier.company_name ILIKE :search)',
        {
          search: `%${search}%`,
        },
      );
    }

    if (query.status) {
      qb.andWhere('po.status = :status', { status: query.status });
    }

    qb.orderBy('po.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    const [orders, total] = await qb.getManyAndCount();

    return {
      data: orders,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  async findById(id: string) {
    const order = await this.purchaseOrderRepository.findOne({
      where: { id },
      relations: {
        supplier: true,
        warehouse: true,
        items: {
          product: true,
        },
      },
    });

    if (!order) {
      throw new NotFoundException('Purchase order topilmadi');
    }

    return order;
  }

  async create(dto: CreatePurchaseOrderDto) {
    return this.dataSource.transaction(async (manager) => {
      const orderRepo = manager.getRepository(PurchaseOrder);
      const orderItemRepo = manager.getRepository(OrderItem);
      const supplierRepo = manager.getRepository(Supplier);
      const warehouseRepo = manager.getRepository(Warehouse);
      const productRepo = manager.getRepository(Product);

      const [supplier, warehouse] = await Promise.all([
        supplierRepo.findOne({ where: { id: dto.supplier_id } }),
        warehouseRepo.findOne({ where: { id: dto.warehouse_id } }),
      ]);

      if (!supplier) {
        throw new NotFoundException('Supplier topilmadi');
      }

      if (!warehouse) {
        throw new NotFoundException('Warehouse topilmadi');
      }

      const orderNumber = await this.generateOrderNumber(manager);

      const order = await orderRepo.save(
        orderRepo.create({
          order_number: orderNumber,
          status: OrderStatus.PENDING,
          order_date: dto.order_date ? new Date(dto.order_date) : new Date(),
          delivery_date: dto.delivery_date ? new Date(dto.delivery_date) : null,
          total_amount: 0,
          supplier_id: supplier.id,
          warehouse_id: warehouse.id,
        }),
      );

      let totalAmount = 0;

      for (const item of dto.items) {
        const product = await productRepo.findOne({
          where: { id: item.product_id },
          relations: { warehouse: true },
        });

        if (!product) {
          throw new NotFoundException(`Product topilmadi: ${item.product_id}`);
        }

        if (product.warehouse?.id !== warehouse.id) {
          throw new BadRequestException(
            `Product ${product.id} tanlangan warehousega tegishli emas`,
          );
        }

        const priceAtPurchase =
          item.price_at_purchase !== undefined
            ? Number(item.price_at_purchase)
            : 0;

        const lineTotal = priceAtPurchase * item.quantity;
        totalAmount += lineTotal;

        await orderItemRepo.save(
          orderItemRepo.create({
            purchase_order: order,
            product,
            quantity: item.quantity,
            price_at_purchase: Number(priceAtPurchase.toFixed(2)),
          }),
        );
      }

      order.total_amount = Number(totalAmount.toFixed(2));
      await orderRepo.save(order);

      return this.findById(order.id);
    });
  }

  async updateStatus(id: string, dto: UpdatePurchaseOrderStatusDto) {
    const order = await this.purchaseOrderRepository.findOne({
      where: { id },
    });

    if (!order) {
      throw new NotFoundException('Purchase order topilmadi');
    }

    if (order.status === OrderStatus.CANCELLED) {
      throw new BadRequestException(
        'Bekor qilingan buyurtma statusini o`zgartirib bo`lmaydi',
      );
    }

    if (
      order.status === OrderStatus.DELIVERED &&
      dto.status !== OrderStatus.DELIVERED
    ) {
      throw new BadRequestException(
        'Delivered bo`lgan buyurtmani boshqa statusga qaytarib bo`lmaydi',
      );
    }

    order.status = dto.status;

    if (dto.delivery_date !== undefined) {
      order.delivery_date = dto.delivery_date
        ? new Date(dto.delivery_date)
        : null;
    }

    await this.purchaseOrderRepository.save(order);
    return this.findById(order.id);
  }

  async receiveOrder(id: string, dto: ReceivePurchaseOrderDto) {
    return this.dataSource.transaction(async (manager) => {
      const orderRepo = manager.getRepository(PurchaseOrder);
      const productRepo = manager.getRepository(Product);
      const productBatchRepo = manager.getRepository(ProductBatch);

      const order = await orderRepo.findOne({
        where: { id },
        relations: {
          items: {
            product: true,
          },
          supplier: true,
          warehouse: true,
        },
      });

      if (!order) {
        throw new NotFoundException('Purchase order topilmadi');
      }

      if (order.status !== OrderStatus.DELIVERED) {
        throw new BadRequestException(
          'Faqat DELIVERED statusidagi buyurtmalarni omborga qabul qilish mumkin',
        );
      }

      if (order.is_received) {
        throw new BadRequestException(
          'Ushbu buyurtma allaqachon omborga qabul qilingan',
        );
      }

      const itemUpdates = new Map<string, ReceiveOrderItemDto>();
      const orderItemIds = new Set(order.items.map((i) => i.id));

      for (const update of dto.items) {
        if (!orderItemIds.has(update.order_item_id)) {
          throw new BadRequestException(
            `Order item topilmadi: ${update.order_item_id}`,
          );
        }
        itemUpdates.set(update.order_item_id, update);
      }

      for (const item of order.items) {
        const update = itemUpdates.get(item.id);

        let expiration_date: Date | null = null;
        let expiration_alert_date: Date | null = null;
        let batch_number: string | null = null;
        let serial_number: string | null = null;

        if (update) {
          if (update.expiration_alert_date && !update.expiration_date) {
            throw new BadRequestException(
              `Item ${item.id}: expiration_alert_date berilsa, expiration_date ham berilishi kerak`,
            );
          }

          if (update.expiration_alert_date && update.expiration_date) {
            const alertDate = new Date(update.expiration_alert_date);
            const expirationDate = new Date(update.expiration_date);
            if (alertDate > expirationDate) {
              throw new BadRequestException(
                `Item ${item.id}: expiration_alert_date expiration_date dan oldin bo‘lishi kerak`,
              );
            }
          }

          expiration_date = update.expiration_date
            ? new Date(update.expiration_date)
            : null;
          expiration_alert_date = update.expiration_alert_date
            ? new Date(update.expiration_alert_date)
            : null;
          batch_number = update.batch_number ?? null;
          serial_number = update.serial_number ?? null;
        }

        const product = await productRepo.findOne({
          where: { id: item.product.id },
        });

        if (!product) {
          throw new NotFoundException(`Product topilmadi: ${item.product.id}`);
        }

        await productBatchRepo.save(
          productBatchRepo.create({
            product,
            product_id: product.id,
            warehouse: order.warehouse,
            warehouse_id: order.warehouse_id,
            supplier: order.supplier ?? null,
            supplier_id: order.supplier_id ?? null,
            quantity: Number(item.quantity),
            price_at_purchase: Number(item.price_at_purchase),
            expiration_date,
            expiration_alert_date,
            batch_number,
            serial_number,
          }),
        );

        product.quantity = Number(product.quantity) + Number(item.quantity);
        await productRepo.save(product);
      }

      order.is_received = true;
      await orderRepo.save(order);

      return this.findById(order.id);
    });
  }
}
