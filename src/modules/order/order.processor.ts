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
import { InjectMetric } from '@willsoto/nestjs-prometheus';
import { Counter, Histogram } from 'prom-client';
import { SpanKind } from '@opentelemetry/api';
import { TracingService } from '../../common/tracing/tracing.module.js';

@Processor(QUEUES.ORDER)
export class OrderProcessor extends WorkerHost {
  private readonly logger = new Logger(OrderProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly outboxService: OutboxService,
    private readonly deduplicationService: ConsumerDeduplicationService,
    private readonly tracing: TracingService,
    @InjectMetric('saga_duration_seconds')
    private readonly sagaDuration: Histogram<string>,
    @InjectMetric('orders_total')
    private readonly ordersCounter: Counter<string>,
  ) {
    super();
  }

  async process(job: Job): Promise<any> {
    const envelope = job.data as IEventEnvelope;
    return this.tracing.withSpan(
      `saga.process ${job.name}`,
      {
        kind: SpanKind.CONSUMER,
        attributes: {
          'messaging.system': 'bullmq',
          'messaging.destination.name': QUEUES.ORDER,
          'messaging.message.id': String(job.id),
          'messaging.message.retry.count': job.attemptsMade,
          'saga.event': job.name,
          'correlation.id': envelope?.metadata?.correlationId,
        },
        // Continue the trace from the outbox publish span.
        parentCarrier: envelope?.metadata,
      },
      async (span) => {
        await this.prisma.$transaction(async (tx) => {
          const shouldProcess =
            await this.deduplicationService.shouldProcessEvent(
              tx,
              envelope.id,
              job.name,
              'OrderWorker',
            );

          if (!shouldProcess) {
            span.setAttribute('saga.duplicate', true);
            return { skipped: true, reason: 'DUPLICATE_EVENT' };
          }

          switch (job.name) {
            case SAGA_EVENTS.PAYMENT_SUCCESS:
              return this.handlePaymentSuccess(
                tx,
                envelope as IEventEnvelope<PaymentSuccessPayload>,
              );
            case SAGA_EVENTS.INVENTORY_FAILED:
            case SAGA_EVENTS.INVENTORY_RELEASED:
              return this.handleOrderCancellation(tx, envelope);
          }
        });
      },
    );
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
    this.sagaDuration.observe(
      {
        result: 'confirmed',
      },
      (Date.now() - order.createdAt.getTime()) / 1000,
    );

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

    const order = await tx.order.update({
      where: { id: data.payload.orderId },
      data: { status: OrderStatus.CANCELLED },
    });
    this.sagaDuration.observe(
      {
        result: 'cancelled',
      },
      (Date.now() - order.createdAt.getTime()) / 1000,
    );
    this.ordersCounter.inc({ status: 'cancelled' });
  }
}
