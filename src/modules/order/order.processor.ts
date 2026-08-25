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

@Processor(QUEUES.ORDER)
export class OrderProcessor extends WorkerHost {
  private readonly logger = new Logger(OrderProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly outboxService: OutboxService,
  ) {
    super();
  }

  async process(job: Job): Promise<any> {
    switch (job.name) {
      case SAGA_EVENTS.PAYMENT_SUCCESS:
        return this.handlePaymentSuccess(job.data);
      case SAGA_EVENTS.INVENTORY_FAILED:
      case SAGA_EVENTS.INVENTORY_RELEASED:
        return this.handleOrderCancellation(job.data);
    }
  }

  private async handlePaymentSuccess(
    data: IEventEnvelope<PaymentSuccessPayload>,
  ) {
    this.logger.log(`[Saga] Confirming Order ${data.payload.orderId}`);

    await this.prisma.$transaction(async (tx) => {
      const order = await tx.order.update({
        where: { id: data.payload.orderId },
        data: { status: OrderStatus.CONFIRMED },
      });

      const envelope =
        EventEnvelopeFactory.create<NotificationProcessedPayload>(
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
    });
  }

  private async handleOrderCancellation(data: {
    payload: {
      orderId: string;
      reason?: string;
    };
  }) {
    this.logger.warn(
      `[Saga] Cancelling Order ${data.payload.orderId}. Reason: ${data.payload.reason || 'Saga compensation'}`,
    );

    await this.prisma.order.update({
      where: { id: data.payload.orderId },
      data: { status: OrderStatus.CANCELLED },
    });
  }
}
