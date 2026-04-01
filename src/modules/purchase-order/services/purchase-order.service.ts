import {
  BadRequestException,
  ForbiddenException,
  forwardRef,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import Redis from 'ioredis';
import { InlineKeyboard } from 'grammy';
import { BotService } from 'src/modules/bot/bot.service';
import { BotUserService } from 'src/modules/bot-user/services/bot-user.service';
import { AuthUser } from 'src/modules/auth/interfaces/auth-user.interface';
import { Product } from 'src/modules/product/entities/product.entity';
import { ProductBatch } from 'src/modules/product/entities/product-batch.entity';
import { Supplier } from 'src/modules/supplier/entities/supplier.entity';
import { User } from 'src/modules/user/entities/user.entity';
import { Role } from 'src/modules/user/enums/role.enum';
import { Warehouse } from 'src/modules/warehouse/entities/warehouse.entity';
import { CreatePurchaseOrderDto } from '../dto/create-purchase-order.dto';
import { ListPurchaseOrdersQueryDto } from '../dto/list-purchase-orders-query.dto';
import {
  ReceiveOrderItemDto,
  ReceivePurchaseOrderDto,
} from '../dto/update-purchase-order-status.dto';
import { UpdatePurchaseOrderDto } from '../dto/update-purchase-order.dto';
import { OrderStatus } from '../enums/order-status.enum';
import { OrderItem } from '../entities/order-item.entity';
import { PurchaseOrder } from '../entities/purchase-order.entity';

@Injectable()
export class PurchaseOrderService {
  private readonly logger = new Logger(PurchaseOrderService.name);

  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(PurchaseOrder)
    private readonly purchaseOrderRepository: Repository<PurchaseOrder>,
    @InjectRepository(Product)
    private readonly productRepository: Repository<Product>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @Inject('REDIS_CLIENT')
    private readonly redis: Redis,
    @Inject(forwardRef(() => BotService))
    private readonly botService: BotService,
    private readonly botUserService: BotUserService,
  ) {}

  private async generateOrderNumber(manager: EntityManager): Promise<string> {
    const year = new Date().getFullYear();

    await manager.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
      `purchase_order:${year}`,
    ]);

    const result = await manager
      .getRepository(PurchaseOrder)
      .createQueryBuilder('po')
      .select("MAX(CAST(SPLIT_PART(po.order_number, '-', 3) AS int))", 'max')
      .where('po.order_number LIKE :prefix', { prefix: `PO-${year}-%` })
      .getRawOne<{ max: string | null }>();

    const last = result?.max ? parseInt(result.max, 10) : 0;
    return `PO-${year}-${String(last + 1).padStart(3, '0')}`;
  }

  private async lockProductForUpdate(
    manager: EntityManager,
    productId: string,
  ): Promise<Product> {
    const product = await manager
      .getRepository(Product)
      .createQueryBuilder('product')
      .setLock('pessimistic_write')
      .where('product.id = :productId', { productId })
      .getOne();

    if (!product) {
      throw new NotFoundException(`Product topilmadi: ${productId}`);
    }

    return product;
  }

  private async recalculateProductQuantity(
    manager: EntityManager,
    product: Product,
  ): Promise<void> {
    const totalRaw = await manager
      .getRepository(ProductBatch)
      .createQueryBuilder('batch')
      .select('COALESCE(SUM(batch.quantity), 0)', 'total')
      .where('batch.product_id = :productId', { productId: product.id })
      .getRawOne<{ total: string | null }>();

    product.quantity = Number(Number(totalRaw?.total ?? 0).toFixed(2));
    await manager.getRepository(Product).save(product);
  }

  private buildAutoBatchNumber(orderNumber: string, itemIndex: number): string {
    return `BATCH-${orderNumber}-${String(itemIndex + 1).padStart(3, '0')}`;
  }

  private ensureOrderVisibleToUser(order: PurchaseOrder, user: AuthUser) {
    if (user.role === Role.ACCOUNTANT && order.created_by_id !== user.id) {
      throw new ForbiddenException("Siz faqat o'zingiz yaratgan xaridlarni ko'ra olasiz");
    }
  }

  private ensureAccountantOwnsOrder(order: PurchaseOrder, userId: string) {
    if (order.created_by_id !== userId) {
      throw new ForbiddenException("Siz faqat o'zingiz yaratgan xaridni boshqara olasiz");
    }
  }

  private hasAnyNonStatusUpdates(dto: UpdatePurchaseOrderDto) {
    return (
      dto.supplier_id !== undefined ||
      dto.warehouse_id !== undefined ||
      dto.order_date !== undefined ||
      dto.delivery_date !== undefined ||
      (dto.items_to_add?.length ?? 0) > 0 ||
      (dto.items_to_remove?.length ?? 0) > 0
    );
  }

  private hasStructuralUpdates(dto: UpdatePurchaseOrderDto) {
    return (
      dto.supplier_id !== undefined ||
      dto.warehouse_id !== undefined ||
      dto.order_date !== undefined ||
      (dto.items_to_add?.length ?? 0) > 0 ||
      (dto.items_to_remove?.length ?? 0) > 0
    );
  }

  async findAll(query: ListPurchaseOrdersQueryDto, user: AuthUser) {
    const page = query.page ?? 1;
    const limit = Math.min(query.limit ?? 10, 100);
    const search = query.search?.trim();

    const qb = this.purchaseOrderRepository
      .createQueryBuilder('po')
      .leftJoinAndSelect('po.supplier', 'supplier')
      .leftJoinAndSelect('po.warehouse', 'warehouse');

    if (user.role === Role.ACCOUNTANT) {
      qb.andWhere('po.created_by_id = :createdById', {
        createdById: user.id,
      });
    }

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

  async findById(id: string, user?: AuthUser, manager?: EntityManager) {
    const repo = manager
      ? manager.getRepository(PurchaseOrder)
      : this.purchaseOrderRepository;

    const order = await repo.findOne({
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

    if (user) {
      this.ensureOrderVisibleToUser(order, user);
    }

    return order;
  }

  private async lockOrderForUpdate(
    manager: EntityManager,
    orderId: string,
  ): Promise<void> {
    const order = await manager
      .getRepository(PurchaseOrder)
      .createQueryBuilder('order')
      .setLock('pessimistic_write')
      .where('order.id = :orderId', { orderId })
      .getOne();

    if (!order) {
      throw new NotFoundException('Purchase order topilmadi');
    }
  }

  async getStatistics(user: AuthUser): Promise<Record<string, number>> {
    const cacheKey =
      user.role === Role.ADMIN
        ? 'purchase-orders:statistics'
        : `purchase-orders:statistics:${user.id}`;
    const cached = await this.redis.get(cacheKey);
    if (cached) return JSON.parse(cached) as Record<string, number>;

    const qb = this.purchaseOrderRepository.createQueryBuilder('po');

    if (user.role === Role.ACCOUNTANT) {
      qb.where('po.created_by_id = :createdById', { createdById: user.id });
    }

    const stats = await qb
      .select('po.status', 'status')
      .addSelect('COUNT(po.id)', 'count')
      .groupBy('po.status')
      .getRawMany<{ status: OrderStatus; count: string }>();

    const result: Record<string, number> = {
      [OrderStatus.PENDING]: 0,
      [OrderStatus.CONFIRMED]: 0,
      [OrderStatus.DELIVERED]: 0,
      [OrderStatus.CANCELLED]: 0,
      total: 0,
    };

    let total = 0;
    stats.forEach((stat) => {
      const count = parseInt(stat.count, 10);
      result[stat.status] = count;
      total += count;
    });

    result.total = total;

    await this.redis.set(cacheKey, JSON.stringify(result), 'EX', 30);
    return result;
  }

  async create(dto: CreatePurchaseOrderDto, actor: AuthUser) {
    if (actor.role !== Role.ACCOUNTANT) {
      throw new ForbiddenException('Faqat hisobchi purchase order yarata oladi');
    }

    const result = await this.dataSource.transaction(async (manager) => {
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
          is_received: false,
          created_by_id: actor.id,
          decided_by_id: null,
          decided_at: null,
          received_by_id: null,
          received_at: null,
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

        const priceAtPurchase = Number(item.price_at_purchase);
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

      return this.findById(order.id, undefined, manager);
    });

    await this.invalidateRelatedCaches();
    await this.notifyAdminsAboutNewOrder(result).catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Admin bot notification yuborilmadi: ${message}`);
    });
    return result;
  }

  async updateOrder(id: string, dto: UpdatePurchaseOrderDto, actor: AuthUser) {
    if (actor.role === Role.ADMIN) {
      return this.decideOrder(id, dto, actor.id);
    }

    if (actor.role === Role.ACCOUNTANT) {
      return this.updateOrderAsAccountant(id, dto, actor.id);
    }

    throw new ForbiddenException('Bu amal siz uchun ruxsat etilmagan');
  }

  private async decideOrder(
    id: string,
    dto: UpdatePurchaseOrderDto,
    adminUserId: string | null,
  ) {
    const nextStatus = dto.status;

    if (
      !nextStatus ||
      ![OrderStatus.CONFIRMED, OrderStatus.CANCELLED].includes(nextStatus)
    ) {
      throw new BadRequestException(
        'Admin faqat purchase orderni tasdiqlashi yoki bekor qilishi mumkin',
      );
    }

    if (this.hasAnyNonStatusUpdates(dto)) {
      throw new BadRequestException(
        'Admin faqat statusni yangilashi mumkin',
      );
    }

    const result = await this.dataSource.transaction(async (manager) => {
      const orderRepo = manager.getRepository(PurchaseOrder);
      const order = await orderRepo.findOne({ where: { id } });

      if (!order) {
        throw new NotFoundException('Purchase order topilmadi');
      }

      if (order.is_received) {
        throw new BadRequestException(
          'Qabul qilingan buyurtmani bekor qilish yoki tasdiqlash mumkin emas',
        );
      }

      if (order.status !== OrderStatus.PENDING) {
        throw new BadRequestException(
          'Faqat PENDING statusdagi buyurtma tasdiqlanishi yoki bekor qilinishi mumkin',
        );
      }

      order.status = nextStatus;
      order.decided_by_id = adminUserId;
      order.decided_at = new Date();
      await orderRepo.save(order);

      return this.findById(order.id, undefined, manager);
    });

    await this.invalidateRelatedCaches();
    await this.notifyAccountantAboutDecision(result).catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `Accountant decision notification yuborilmadi: ${message}`,
      );
    });
    return result;
  }

  async handleAdminDecisionFromBot(
    orderId: string,
    action: 'approve' | 'cancel',
    adminUserId: string | null,
  ) {
    return this.decideOrder(
      orderId,
      {
        status:
          action === 'approve'
            ? OrderStatus.CONFIRMED
            : OrderStatus.CANCELLED,
      },
      adminUserId,
    );
  }

  private async updateOrderAsAccountant(
    id: string,
    dto: UpdatePurchaseOrderDto,
    accountantUserId: string,
  ) {
    const result = await this.dataSource.transaction(async (manager) => {
      const orderRepo = manager.getRepository(PurchaseOrder);
      const orderItemRepo = manager.getRepository(OrderItem);
      const supplierRepo = manager.getRepository(Supplier);
      const warehouseRepo = manager.getRepository(Warehouse);
      const productRepo = manager.getRepository(Product);

      const order = await orderRepo.findOne({
        where: { id },
        relations: {
          items: {
            product: {
              warehouse: true,
            },
          },
          supplier: true,
          warehouse: true,
        },
      });

      if (!order) {
        throw new NotFoundException('Purchase order topilmadi');
      }

      this.ensureAccountantOwnsOrder(order, accountantUserId);

      if (order.is_received) {
        throw new BadRequestException(
          'Qabul qilingan buyurtmani o`zgartirib bo`lmaydi',
        );
      }

      if (dto.status !== undefined) {
        if (dto.status !== OrderStatus.DELIVERED) {
          throw new BadRequestException(
            'Hisobchi faqat delivered holatiga o`tkaza oladi',
          );
        }

        if (this.hasStructuralUpdates(dto)) {
          throw new BadRequestException(
            'Delivered qilishda supplier, warehouse, sana yoki itemlarni o`zgartirib bo`lmaydi',
          );
        }

        if (order.status !== OrderStatus.CONFIRMED) {
          throw new BadRequestException(
            'Faqat CONFIRMED statusdagi buyurtmani delivered qilish mumkin',
          );
        }

        order.status = OrderStatus.DELIVERED;
        order.delivery_date =
          dto.delivery_date !== undefined
            ? dto.delivery_date
              ? new Date(String(dto.delivery_date))
              : null
            : order.delivery_date ?? new Date();

        await orderRepo.save(order);
        return this.findById(order.id, undefined, manager);
      }

      if (order.status !== OrderStatus.PENDING) {
        throw new BadRequestException(
          'Faqat PENDING statusdagi buyurtmani tahrirlash mumkin',
        );
      }

      const supplierId =
        dto.supplier_id !== undefined ? String(dto.supplier_id) : undefined;
      const warehouseId =
        dto.warehouse_id !== undefined ? String(dto.warehouse_id) : undefined;
      const orderDate =
        dto.order_date !== undefined
          ? dto.order_date
            ? new Date(String(dto.order_date))
            : undefined
          : undefined;
      const deliveryDate =
        dto.delivery_date !== undefined
          ? dto.delivery_date
            ? new Date(String(dto.delivery_date))
            : null
          : undefined;

      if (supplierId) {
        const supplier = await supplierRepo.findOne({
          where: { id: supplierId },
        });
        if (!supplier) {
          throw new NotFoundException('Supplier topilmadi');
        }
        order.supplier = supplier;
        order.supplier_id = supplier.id;
      }

      if (warehouseId) {
        const warehouse = await warehouseRepo.findOne({
          where: { id: warehouseId },
        });
        if (!warehouse) {
          throw new NotFoundException('Warehouse topilmadi');
        }

        for (const item of order.items ?? []) {
          if (item.product?.warehouse?.id !== warehouse.id) {
            throw new BadRequestException(
              `Product ${item.product?.id} tanlangan warehousega tegishli emas`,
            );
          }
        }

        order.warehouse = warehouse;
        order.warehouse_id = warehouse.id;
      }

      if (orderDate !== undefined) {
        order.order_date = orderDate ?? order.order_date;
      }

      if (deliveryDate !== undefined) {
        order.delivery_date = deliveryDate;
      }

      const itemsToRemove = dto.items_to_remove ?? [];
      if (itemsToRemove.length > 0) {
        const orderItemIds = new Set((order.items ?? []).map((i) => i.id));

        for (const itemId of itemsToRemove) {
          if (!orderItemIds.has(itemId)) {
            throw new NotFoundException(`Order item topilmadi: ${itemId}`);
          }
        }

        await orderItemRepo.delete(itemsToRemove);
        order.items = (order.items ?? []).filter(
          (item) => !itemsToRemove.includes(item.id),
        );
      }

      const itemsToAdd = dto.items_to_add ?? [];
      if (itemsToAdd.length > 0) {
        for (const item of itemsToAdd) {
          const product = await productRepo.findOne({
            where: { id: item.product_id },
            relations: { warehouse: true },
          });

          if (!product) {
            throw new NotFoundException(
              `Product topilmadi: ${item.product_id}`,
            );
          }

          if (product.warehouse?.id !== order.warehouse_id) {
            throw new BadRequestException(
              `Product ${product.id} tanlangan warehousega tegishli emas`,
            );
          }

          const priceAtPurchase = Number(item.price_at_purchase);

          await orderItemRepo.save(
            orderItemRepo.create({
              purchase_order: order,
              product,
              quantity: item.quantity,
              price_at_purchase: Number(priceAtPurchase.toFixed(2)),
            }),
          );
        }
      }

      const updatedItems = await orderItemRepo.find({
        where: { purchase_order: { id: order.id } },
      });

      order.items = updatedItems;

      const totalAmount = updatedItems.reduce((sum, item) => {
        const price = Number(item.price_at_purchase);
        return sum + price * Number(item.quantity);
      }, 0);

      order.total_amount = Number(totalAmount.toFixed(2));
      await orderRepo.save(order);

      return this.findById(order.id, undefined, manager);
    });

    await this.invalidateRelatedCaches();
    return result;
  }

  async deleteOrder(id: string) {
    const result = await this.dataSource.transaction(async (manager) => {
      const orderRepo = manager.getRepository(PurchaseOrder);
      const orderItemRepo = manager.getRepository(OrderItem);

      const order = await orderRepo.findOne({
        where: { id },
        relations: {
          items: true,
        },
      });

      if (!order) {
        throw new NotFoundException('Purchase order topilmadi');
      }

      if (order.is_received || order.status === OrderStatus.DELIVERED) {
        throw new BadRequestException(
          'Delivered/qabul qilingan buyurtmani o`chirib bo`lmaydi',
        );
      }

      await orderItemRepo
        .createQueryBuilder()
        .delete()
        .from(OrderItem)
        .where('purchase_order_id = :id', { id: order.id })
        .execute();

      await orderRepo.delete(order.id);
      return { message: 'Purchase order o`chirildi' };
    });

    await this.invalidateRelatedCaches();
    return result;
  }

  async receiveOrder(id: string, dto: ReceivePurchaseOrderDto, actor: AuthUser) {
    if (actor.role !== Role.ACCOUNTANT) {
      throw new ForbiddenException('Faqat hisobchi kirimni qabul qila oladi');
    }

    const result = await this.dataSource.transaction(async (manager) => {
      const orderRepo = manager.getRepository(PurchaseOrder);
      const productBatchRepo = manager.getRepository(ProductBatch);

      await this.lockOrderForUpdate(manager, id);
      const order = await this.findById(id, actor, manager);

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
      const orderItemIds = new Set(order.items.map((item) => item.id));

      for (const update of dto.items) {
        if (itemUpdates.has(update.order_item_id)) {
          throw new BadRequestException(
            `Order item takror yuborilgan: ${update.order_item_id}`,
          );
        }
        if (!orderItemIds.has(update.order_item_id)) {
          throw new BadRequestException(
            `Order item topilmadi: ${update.order_item_id}`,
          );
        }
        itemUpdates.set(update.order_item_id, update);
      }

      const lockedProducts = new Map<string, Product>();
      const productIds = Array.from(
        new Set(order.items.map((item) => item.product.id)),
      ).sort((left, right) => left.localeCompare(right));

      for (const productId of productIds) {
        lockedProducts.set(
          productId,
          await this.lockProductForUpdate(manager, productId),
        );
      }

      for (const [index, item] of order.items.entries()) {
        const update = itemUpdates.get(item.id);

        let expiration_date: Date | null = null;
        let expiration_alert_date: Date | null = null;
        let batch_number = this.buildAutoBatchNumber(order.order_number, index);
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
          const requestedBatchNumber = update.batch_number?.trim();
          batch_number = requestedBatchNumber || batch_number;
          serial_number = update.serial_number?.trim() || null;
        }

        const product = lockedProducts.get(item.product.id);

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
      }

      for (const product of lockedProducts.values()) {
        await this.recalculateProductQuantity(manager, product);
      }

      order.is_received = true;
      order.received_by_id = actor.id;
      order.received_at = new Date();
      await orderRepo.save(order);

      return this.findById(order.id, undefined, manager);
    });

    await this.invalidateRelatedCaches();
    await this.notifyAdminsAboutReceivedOrder(result).catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Kirim bot notification yuborilmadi: ${message}`);
    });
    return result;
  }

  private buildOrderItemsSummary(order: PurchaseOrder) {
    return order.items
      .map((item) => {
        const productName = item.product?.name ?? "Noma'lum mahsulot";
        return `• ${this.escapeHtml(productName)} - <b>${Number(item.quantity)}</b>`;
      })
      .join('\n');
  }

  private async notifyAdminsAboutReceivedOrder(order: PurchaseOrder) {
    const receiver = order.received_by_id
      ? await this.userRepository.findOne({
          where: { id: order.received_by_id },
        })
      : null;

    const receiverName =
      receiver
        ? [receiver.first_name, receiver.last_name].filter(Boolean).join(' ') ||
          receiver.username
        : (order.received_by_id ?? "Noma'lum");

    const text =
      `📥 <b>Kirim qabul qilindi</b>\n\n` +
      `📄 Buyurtma: <b>${order.order_number}</b>\n` +
      `🏢 Warehouse: <b>${this.escapeHtml(order.warehouse?.name ?? order.warehouse_id)}</b>\n` +
      `👤 Qabul qilgan: <b>${this.escapeHtml(receiverName)}</b>\n` +
      `💰 Summa: <b>${this.formatCurrency(Number(order.total_amount))}</b>\n\n` +
      `📦 <b>Mahsulotlar:</b>\n${this.buildOrderItemsSummary(order)}`;

    await this.botService.sendToApprovedUsers(text, Role.ADMIN);
  }

  private async notifyAdminsAboutNewOrder(order: PurchaseOrder) {
    const creator = order.created_by_id
      ? await this.userRepository.findOne({
          where: { id: order.created_by_id },
        })
      : null;

    const creatorName =
      creator
        ? [creator.first_name, creator.last_name].filter(Boolean).join(' ') ||
          creator.username
        : (order.created_by_id ?? "Noma'lum");

    const text =
      `🛒 <b>Yangi xarid so'rovi</b>\n\n` +
      `📄 Buyurtma: <b>${order.order_number}</b>\n` +
      `👤 Hisobchi: <b>${this.escapeHtml(creatorName)}</b>\n` +
      `🏢 Supplier: <b>${this.escapeHtml(order.supplier?.company_name ?? order.supplier_id)}</b>\n` +
      `📦 Warehouse: <b>${this.escapeHtml(order.warehouse?.name ?? order.warehouse_id)}</b>\n` +
      `💰 Summa: <b>${this.formatCurrency(Number(order.total_amount))}</b>\n` +
      `📌 Status: <b>${order.status}</b>`;

    const keyboard = new InlineKeyboard()
      .text('✅ Tasdiqlash', `purchase_order:approve:${order.id}`)
      .text('❌ Bekor qilish', `purchase_order:cancel:${order.id}`);

    await this.botService.sendToApprovedUsers(text, Role.ADMIN, {
      reply_markup: keyboard,
    });
  }

  private async notifyAccountantAboutDecision(order: PurchaseOrder) {
    if (!order.created_by_id) {
      return;
    }

    const botUser = await this.botUserService.findApprovedByLinkedUserId(
      order.created_by_id,
    );
    if (!botUser) {
      return;
    }

    const actionText =
      order.status === OrderStatus.CONFIRMED ? 'tasdiqlandi' : 'bekor qilindi';

    const text =
      `🛒 <b>Xarid so'rovingiz ${actionText}</b>\n\n` +
      `📄 Buyurtma: <b>${order.order_number}</b>\n` +
      `📌 Status: <b>${order.status}</b>\n` +
      `🏢 Supplier: <b>${this.escapeHtml(order.supplier?.company_name ?? order.supplier_id)}</b>\n` +
      `📦 Warehouse: <b>${this.escapeHtml(order.warehouse?.name ?? order.warehouse_id)}</b>\n` +
      `💰 Summa: <b>${this.formatCurrency(Number(order.total_amount))}</b>`;

    await this.botService.sendMessage(botUser.telegram_id, text);
  }

  private formatCurrency(value: number) {
    return `${new Intl.NumberFormat('uz-UZ', {
      minimumFractionDigits: value % 1 === 0 ? 0 : 2,
      maximumFractionDigits: 2,
    }).format(Number(value.toFixed(2)))} sum`;
  }

  private escapeHtml(value: string) {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  private async invalidateRelatedCaches() {
    const statisticKeys = await this.redis.keys('purchase-orders:statistics*');
    const keys = [
      ...statisticKeys,
      'expenses:dashboard:overview',
      'expenses:dashboard:summary',
    ];

    if (keys.length > 0) {
      await this.redis.del(...keys);
    }
  }
}
