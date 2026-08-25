import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import {
  OrderCreatedPayload,
  PaymentProcessedPayload,
  QUEUES,
  SAGA_EVENTS,
} from '../../common/events/saga.events.js';
import { PrismaService } from '../../core/database/prisma.service.js';
import { Job, Queue } from 'bullmq';
import { Logger } from '@nestjs/common';
import { OrderStatus } from '../../generated/prisma/enums.js';

@Processor(QUEUES.INVENTORY)
export class InventoryProcessor extends WorkerHost {
  private readonly logger = new Logger(InventoryProcessor.name);
  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue(QUEUES.PAYMENT) private readonly paymentQueue: Queue,
    @InjectQueue(QUEUES.ORDER) private readonly orderQueue: Queue,
  ) {
    super();
  }

  async process(job: Job): Promise<any> {
    switch (job.name) {
      case SAGA_EVENTS.ORDER_CREATED:
        return this.handleReserveStock(job.data as OrderCreatedPayload);
      case SAGA_EVENTS.PAYMENT_FAILED:
        return this.handleReleaseStock(job.data as PaymentProcessedPayload);
      default:
        this.logger.warn(`Unknown job name: ${job.name}`);
    }
  }

  private async handleReserveStock(payload: OrderCreatedPayload) {
    this.logger.log(`[Inventory] Reserving stock for Order ${payload.orderId}`);

    const result = await this.prisma.$transaction(async (tx) => {
      // Check stock availability
      for (const item of payload.items) {
        const product = await tx.product.findUnique({
          where: { id: item.productId },
        });
        if (!product || product.stock < item.quantity) {
          return {
            success: false,
            reason: `Insufficient stock for product ${item.productId}`,
          };
        }
      }

      // Deduct stock
      for (const item of payload.items) {
        await tx.product.update({
          where: { id: item.productId },
          data: { stock: { decrement: item.quantity } },
        });
      }

      await tx.order.update({
        where: { id: payload.orderId },
        data: { status: OrderStatus.INVENTORY_RESERVED },
      });

      return { success: true };
    });

    if (result.success) {
      this.logger.log(
        `[Inventory] Stock reserved for Order ${payload.orderId}. Forwarding to Payment.`,
      );
      await this.paymentQueue.add(SAGA_EVENTS.PROCESS_PAYMENT, payload);
    } else {
      this.logger.error(
        `[Inventory] Stock reservation failed for Order ${payload.orderId}: ${result.reason}`,
      );
      await this.orderQueue.add(SAGA_EVENTS.INVENTORY_FAILED, {
        orderId: payload.orderId,
        reason: result.reason,
      });
    }
  }

  private async handleReleaseStock(payload: PaymentProcessedPayload) {
    this.logger.warn(
      `[Inventory Compensation] Releasing stock for failed Order ${payload.orderId}`,
    );

    const order = await this.prisma.order.findUnique({
      where: { id: payload.orderId },
      include: { items: true },
    });

    if (!order) return;

    await this.prisma.$transaction(async (tx) => {
      for (const item of order.items) {
        await tx.product.update({
          where: { id: item.productId },
          data: { stock: { increment: item.quantity } },
        });
      }
    });

    this.logger.log(
      `[Inventory Compensation] Stock restored for Order ${payload.orderId}. Notifying Order service.`,
    );
    await this.orderQueue.add(SAGA_EVENTS.INVENTORY_RELEASED, {
      orderId: payload.orderId,
    });
  }
}
