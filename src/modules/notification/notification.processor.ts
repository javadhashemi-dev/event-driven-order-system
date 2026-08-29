import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { IEventEnvelope } from '../../common/events/event-envelope.interface.js';
import {
  NotificationProcessedPayload,
  QUEUES,
  SAGA_EVENTS,
} from '../../common/events/saga.events.js';
import { ConsumerDeduplicationService } from '../../common/deduplication/consumer-deduplication.service.js';
import { PrismaService } from '../../core/database/prisma.service.js';
import { SpanKind } from '@opentelemetry/api';
import { TracingService } from '../../common/tracing/tracing.module.js';

@Processor(QUEUES.NOTIFICATION)
export class NotificationProcessor extends WorkerHost {
  private readonly logger = new Logger(NotificationProcessor.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly deduplicationService: ConsumerDeduplicationService,
    private readonly tracing: TracingService,
  ) {
    super();
  }
  async process(job: Job): Promise<any> {
    const envelope = job.data as
      IEventEnvelope<NotificationProcessedPayload> | undefined;
    return this.tracing.withSpan(
      `saga.process ${job.name}`,
      {
        kind: SpanKind.CONSUMER,
        attributes: {
          'messaging.system': 'bullmq',
          'messaging.destination.name': QUEUES.NOTIFICATION,
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
              envelope?.id ?? '',
              job.name,
              'NotificationWorker',
            );
          if (!shouldProcess) {
            span.setAttribute('saga.duplicate', true);
            return { skipped: true, reason: 'DUPLICATE_EVENT' };
          }
          if (job.name === SAGA_EVENTS.SEND_NOTIFICATION && envelope) {
            const { orderId, customerId, status } = envelope.payload;
            this.logger.log(
              `📧 [Notification] Email sent to Customer ${customerId}: Your order ${orderId} is ${status}!`,
            );
          }
        });
      },
    );
  }
}
