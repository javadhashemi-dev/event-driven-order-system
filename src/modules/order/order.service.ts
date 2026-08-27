import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../core/database/prisma.service.js';
import { OrderStatus } from '../../generated/prisma/enums.js';
import { CreateOrderDto } from './dto/create-order.dto.js';
import { Decimal } from '@prisma/client/runtime/client';

import {
  OrderCreatedPayload,
  SAGA_EVENTS,
} from '../../common/events/saga.events.js';
import { EventEnvelopeFactory } from '../../common/events/event-envelope.interface.js';
import { OutboxService } from '../outbox/outbox.service.js';

@Injectable()
export class OrderService {
  private readonly logger = new Logger(OrderService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly outboxService: OutboxService,
  ) {}

  async createOrder(dto: CreateOrderDto, correlationId: string) {
    this.logger.log(`Ingesting order for customer: ${dto.customerId}`);

    // 1. Validate items & compute totals
    type OrderItemToCreate = {
      productId: string;
      quantity: number;
      unitPrice: Decimal;
    };
    let totalAmount = 0;
    const itemsToCreate: OrderItemToCreate[] = [];

    for (const item of dto.items) {
      const product = await this.prisma.product.findUnique({
        where: { id: item.productId },
      });

      if (!product) {
        throw new NotFoundException(`Product ${item.productId} not found`);
      }
      const itemTotal = Number(product.price) * item.quantity;
      totalAmount += itemTotal;

      itemsToCreate.push({
        productId: product.id,
        quantity: item.quantity,
        unitPrice: product.price,
      });
    }

    // 2. Persist initial order in PENDING state

    const order = await this.prisma.$transaction(async (tx) => {
      const order = await tx.order.create({
        data: {
          customerId: dto.customerId,
          totalAmount,
          status: OrderStatus.PENDING,
          items: {
            create: itemsToCreate,
          },
        },
        include: {
          items: true,
        },
      });

      const envelope = EventEnvelopeFactory.create<OrderCreatedPayload>(
        'Order',
        order.id,
        SAGA_EVENTS.ORDER_CREATED,
        {
          orderId: order.id,
          customerId: order.customerId,
          items: itemsToCreate.map((i) => ({
            productId: i.productId,
            quantity: i.quantity,
            unitPrice: Number(i.unitPrice),
          })),
          totalAmount,
        },
        'order-service',
        {
          correlationId: correlationId,
        },
      );
      await this.outboxService.appendInTransaction(tx, envelope);
      return order;
    });

    this.logger.log(
      `Order ${order.id} persisted as PENDING and queued for background processing.`,
    );

    return {
      orderId: order.id,
      status: order.status,
      totalAmount: order.totalAmount,
      message: 'Order received and is being processed in the background',
    };
  }

  async getOrderById(id: string) {
    const order = await this.prisma.order.findUnique({
      where: { id },
      include: { items: { include: { product: true } } },
    });

    if (!order) {
      throw new NotFoundException(`Order with ID ${id} not found`);
    }

    return order;
  }
}
