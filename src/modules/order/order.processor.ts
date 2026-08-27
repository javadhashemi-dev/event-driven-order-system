import { Processor, WorkerHost } from '@nestjs/bullmq';
import {
  NotificationProcessedPayload,
  PaymentSuccessPayload,
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
import { ConsumerDeduplicationService } from '../../common/deduplication/consumer-deduplication.service.js';
import { Prisma } from '../../generated/prisma/client.js';

@Processor(QUEUES.ORDER)
export class OrderProcessor extends WorkerHost {
  private readonly logger = new Logger(OrderProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly outboxService: OutboxService,
    private readonly deduplicationService: ConsumerDeduplicationService,
  ) {
    super();
  }

  async process(job: Job): Promise<any> {
    try {
      await this.prisma.$transaction(async (tx) => {
        const shouldProcess =
          await this.deduplicationService.shouldProcessEvent(
            tx,
            job.data.id,
            job.name,
            'OrderWorker',
          );

        if (!shouldProcess) {
          return { skipped: true, reason: 'DUPLICATE_EVENT' };
        }

        switch (job.name) {
          case SAGA_EVENTS.PAYMENT_SUCCESS:
            return this.handlePaymentSuccess(tx, job.data);
          case SAGA_EVENTS.INVENTORY_FAILED:
          case SAGA_EVENTS.INVENTORY_RELEASED:
            return this.handleOrderCancellation(tx, job.data);
        }
      });
    } catch (error: any) {
      throw error;
    }
  }

  private async handlePaymentSuccess(
    tx: Prisma.TransactionClient,
    data: IEventEnvelope<PaymentSuccessPayload>,
  ) {
    this.logger.log(`[Saga] Confirming Order ${data.payload.orderId}`);

    const order = await tx.order.update({
      where: { id: data.payload.orderId },
      data: { status: OrderStatus.CONFIRMED },
    });

    const envelope = EventEnvelopeFactory.create<NotificationProcessedPayload>(
      'Order',
      order.id,
      SAGA_EVENTS.SEND_NOTIFICATION,
      {
        orderId: order.id,
        customerId: order.customerId,
        status: 'CONFIRMED',
      },
      'order-service',
    );
    await this.outboxService.appendInTransaction(tx, envelope);
  }

  private async handleOrderCancellation(
    tx: Prisma.TransactionClient,
    data: {
      payload: {
        orderId: string;
        reason?: string;
      };
    },
  ) {
    this.logger.warn(
      `[Saga] Cancelling Order ${data.payload.orderId}. Reason: ${data.payload.reason || 'Saga compensation'}`,
    );

    await tx.order.update({
      where: { id: data.payload.orderId },
      data: { status: OrderStatus.CANCELLED },
    });
  }
}
