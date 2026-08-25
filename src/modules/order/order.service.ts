import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../core/database/prisma.service.js';
import { OrderStatus } from '../../generated/prisma/enums.js';
import { CreateOrderDto } from './dto/create-order.dto.js';
import { Decimal } from '@prisma/client/runtime/client';
import { InjectQueue } from '@nestjs/bullmq';

import { Queue } from 'bullmq';
import {
  OrderCreatedPayload,
  QUEUES,
  SAGA_EVENTS,
} from '../../common/events/saga.events.js';

@Injectable()
export class OrderService {
  private readonly logger = new Logger(OrderService.name);

  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue(QUEUES.INVENTORY) private readonly inventoryQueue: Queue,
  ) {}

  async createOrderSync(dto: CreateOrderDto) {
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
    const order = await this.prisma.order.create({
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

    // 3. Enqueue background processing job
    const payload: OrderCreatedPayload = {
      orderId: order.id,
      customerId: order.customerId,
      items: itemsToCreate.map((i) => ({
        productId: i.productId,
        quantity: i.quantity,
        unitPrice: Number(i.unitPrice),
      })),
      totalAmount,
    };

    await this.inventoryQueue.add(SAGA_EVENTS.ORDER_CREATED, payload, {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 1000,
      },
      removeOnComplete: false,
    });

    this.logger.log(
      `Order ${order.id} persisted as PENDING and queued for background processing.`,
    );

    // 4. Return immediately to the client
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
