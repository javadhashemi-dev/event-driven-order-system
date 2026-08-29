import { Processor, WorkerHost } from '@nestjs/bullmq';
import {
  OrderCreatedPayload,
  PaymentFailedPayload,
  PaymentSuccessPayload,
  QUEUES,
  SAGA_EVENTS,
} from '../../common/events/saga.events.js';
import { Logger } from '@nestjs/common';
import { PrismaService } from '../../core/database/prisma.service.js';
import { Job } from 'bullmq';
import { PaymentStatus } from '../../generated/prisma/enums.js';
import {
  EventEnvelopeFactory,
  IEventEnvelope,
} from '../../common/events/event-envelope.interface.js';
import { OutboxService } from '../outbox/outbox.service.js';
import { ConsumerDeduplicationService } from '../../common/deduplication/consumer-deduplication.service.js';
import { Prisma } from '../../generated/prisma/client.js';
import { InjectMetric } from '@willsoto/nestjs-prometheus';
import { Histogram } from 'prom-client';
import { SpanKind } from '@opentelemetry/api';
import { TracingService } from '../../common/tracing/tracing.module.js';

@Processor(QUEUES.PAYMENT)
export class PaymentProcessor extends WorkerHost {
  private readonly logger = new Logger(PaymentProcessor.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly outboxService: OutboxService,
    private readonly deduplicationService: ConsumerDeduplicationService,
    private readonly tracing: TracingService,
    @InjectMetric('payment_duration_seconds')
    private readonly paymentDuration: Histogram<string>,
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
          'messaging.destination.name': QUEUES.PAYMENT,
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
              'PaymentWorker',
            );

          if (!shouldProcess) {
            span.setAttribute('saga.duplicate', true);
            return { skipped: true, reason: 'DUPLICATE_EVENT' };
          }

          if (job.name === SAGA_EVENTS.PROCESS_PAYMENT) {
            return this.handleProcessPayment(
              tx,
              envelope as IEventEnvelope<OrderCreatedPayload>,
            );
          }
        });
      },
    );
  }

  private async handleProcessPayment(
    tx: Prisma.TransactionClient,
    data: IEventEnvelope<OrderCreatedPayload>,
  ) {
    const endTimer = this.paymentDuration.startTimer();
    let result = 'success';

    this.logger.log(
      `[Payment] Processing $${data.payload.totalAmount} for Order ${data.payload.orderId}`,
    );
    try {
      // Simulate network delay
      await new Promise((r) => setTimeout(r, 3000));

      // Test helper: If customerId is 'fail_payment', simulate card decline!
      const isPaymentSuccessful = data.payload.customerId !== 'fail_payment';

      if (isPaymentSuccessful) {
        const payment = await tx.payment.create({
          data: {
            orderId: data.payload.orderId,
            amount: data.payload.totalAmount,
            status: PaymentStatus.SUCCESS,
            gatewayTxnId: `txn_${Date.now()}`,
          },
        });

        const envelope = EventEnvelopeFactory.create<PaymentSuccessPayload>(
          'Payment',
          data.payload.orderId,
          SAGA_EVENTS.PAYMENT_SUCCESS,
          {
            orderId: data.payload.orderId,
            paymentId: payment.id,
          },
          'payment-service',
          {
            correlationId: data.metadata.correlationId,
            causationId: data.eventType,
          },
        );
        await this.outboxService.appendInTransaction(tx, envelope);

        this.logger.log(
          `[Payment] Payment succeeded for Order ${data.payload.orderId}`,
        );
      } else {
        await tx.payment.create({
          data: {
            orderId: data.payload.orderId,
            amount: data.payload.totalAmount,
            status: PaymentStatus.FAILED,
            failureReason: 'Card declined / Insufficient customer funds',
          },
        });

        const envelope = EventEnvelopeFactory.create<PaymentFailedPayload>(
          'Payment',
          data.payload.orderId,
          SAGA_EVENTS.PAYMENT_FAILED,
          {
            orderId: data.payload.orderId,
            reason: 'Payment declined',
          },
          'payment-service',
          {
            correlationId: data.metadata.correlationId,
            causationId: data.eventType,
          },
        );
        await this.outboxService.appendInTransaction(tx, envelope);
        result = 'failed';
        this.logger.error(
          `[Payment] Payment FAILED for Order ${data.payload.orderId}. Triggering Saga compensation.`,
        );
      }
    } catch (error) {
      result = 'error';
      throw error;
    } finally {
      endTimer({ result });
    }
  }
}
