import { Processor, WorkerHost } from '@nestjs/bullmq';
import {
  InventoryFailedPayload,
  InventoryReleasedPayload,
  OrderCreatedPayload,
  PaymentProcessedPayload,
  QUEUES,
  SAGA_EVENTS,
} from '../../common/events/saga.events.js';
import { PrismaService } from '../../core/database/prisma.service.js';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { OrderStatus } from '../../generated/prisma/enums.js';
import {
  EventEnvelopeFactory,
  IEventEnvelope,
} from '../../common/events/event-envelope.interface.js';
import { OutboxService } from '../outbox/outbox.service.js';

@Processor(QUEUES.INVENTORY)
export class InventoryProcessor extends WorkerHost {
  private readonly logger = new Logger(InventoryProcessor.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly outboxService: OutboxService,
  ) {
    super();
  }

  async process(job: Job): Promise<any> {
    switch (job.name) {
      case SAGA_EVENTS.ORDER_CREATED:
        return this.handleReserveStock(
          job.data as IEventEnvelope<OrderCreatedPayload>,
        );
      case SAGA_EVENTS.PAYMENT_FAILED:
        return this.handleReleaseStock(
          job.data as IEventEnvelope<PaymentProcessedPayload>,
        );
      default:
        this.logger.warn(`Unknown job name: ${job.name}`);
    }
  }

  private async handleReserveStock(data: IEventEnvelope<OrderCreatedPayload>) {
    this.logger.log(
      `[Inventory] Reserving stock for Order ${data.payload.orderId}`,
    );

    await this.prisma.$transaction(async (tx) => {
      // Check stock availability
      for (const item of data.payload.items) {
        const product = await tx.product.findUnique({
          where: { id: item.productId },
        });
        if (!product || product.stock < item.quantity) {
          const envelope = EventEnvelopeFactory.create<InventoryFailedPayload>(
            'Inventory',
            data.payload.orderId,
            SAGA_EVENTS.INVENTORY_FAILED,
            {
              orderId: data.payload.orderId,
              reason: `Insufficient stock for product ${item.productId}`,
            },
            'inventory-service',
            {
              correlationId: data.metadata.correlationId,
              causationId: data.eventType,
            },
          );
          await this.outboxService.appendInTransaction(tx, envelope);
          this.logger.error(
            `[Inventory] Stock reservation failed for Order ${data.payload.orderId}: Insufficient stock for product ${item.productId}`,
          );
          return;
        }
      }

      // Deduct stock
      for (const item of data.payload.items) {
        await tx.product.update({
          where: { id: item.productId },
          data: { stock: { decrement: item.quantity } },
        });
      }

      await tx.order.update({
        where: { id: data.payload.orderId },
        data: { status: OrderStatus.INVENTORY_RESERVED },
      });

      const envelope = EventEnvelopeFactory.create<OrderCreatedPayload>(
        'Inventory',
        data.payload.orderId,
        SAGA_EVENTS.PROCESS_PAYMENT,
        data.payload,
        'inventory-service',
        {
          correlationId: data.metadata.correlationId,
          causationId: data.eventType,
        },
      );
      await this.outboxService.appendInTransaction(tx, envelope);
      this.logger.log(
        `[Inventory] Stock reserved for Order ${data.payload.orderId}. Forwarding to Payment.`,
      );
    });
  }

  private async handleReleaseStock(
    data: IEventEnvelope<PaymentProcessedPayload>,
  ) {
    this.logger.warn(
      `[Inventory Compensation] Releasing stock for failed Order ${data.payload.orderId}`,
    );

    const order = await this.prisma.order.findUnique({
      where: { id: data.payload.orderId },
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

      const envelope = EventEnvelopeFactory.create<InventoryReleasedPayload>(
        'Inventory',
        data.payload.orderId,
        SAGA_EVENTS.INVENTORY_RELEASED,
        {
          orderId: data.payload.orderId,
        },
        'inventory-service',
        {
          correlationId: data.metadata.correlationId,
          causationId: data.eventType,
        },
      );
      await this.outboxService.appendInTransaction(tx, envelope);
    });

    this.logger.log(
      `[Inventory Compensation] Stock restored for Order ${data.payload.orderId}. Notifying Order service.`,
    );
  }
}
