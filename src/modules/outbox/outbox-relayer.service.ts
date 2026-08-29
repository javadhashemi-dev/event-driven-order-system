import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../core/database/prisma.service.js';
import { InjectQueue } from '@nestjs/bullmq';
import { QUEUES, SAGA_EVENTS } from '../../common/events/saga.events.js';
import { Queue } from 'bullmq';
import { Interval } from '@nestjs/schedule';
import { OutboxStatus } from '../../generated/prisma/enums.js';
import { InjectMetric } from '@willsoto/nestjs-prometheus';
import { Histogram } from 'prom-client';
import { SpanKind } from '@opentelemetry/api';
import { TracingService } from '../../common/tracing/tracing.module.js';

interface PendingOutboxEvent {
  id: string;
  aggregateType: string;
  aggregateId: string;
  eventType: string;
  payload: unknown;
  metadata: unknown;
  retryCount: number;
}

@Injectable()
export class OutboxRelayerService {
  private readonly logger = new Logger(OutboxRelayerService.name);
  private isPolling = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly tracing: TracingService,
    @InjectQueue(QUEUES.INVENTORY) private readonly inventoryQueue: Queue,
    @InjectQueue(QUEUES.PAYMENT) private readonly paymentQueue: Queue,
    @InjectQueue(QUEUES.ORDER) private readonly orderQueue: Queue,
    @InjectQueue(QUEUES.NOTIFICATION) private readonly notificationQueue: Queue,
    @InjectMetric('outbox_relay_latency_seconds')
    private readonly outboxRelayLatency: Histogram<string>,
  ) {}

  @Interval(250)
  async pollAndPublish() {
    if (this.isPolling) return;
    this.isPolling = true;
    try {
      // 1. Fetch pending events with PostgreSQL row locking (SKIP LOCKED)

      const pendingEvents = await this.prisma.$transaction(async (tx) => {
        const pendingEvents = await tx.$queryRawUnsafe<PendingOutboxEvent[]>(`
        SELECT id, aggregate_type as "aggregateType", aggregate_id as "aggregateId",
               event_type as "eventType", payload, metadata, retry_count as "retryCount"
        FROM outbox_events
        WHERE status = 'PENDING'
        ORDER BY created_at ASC
        LIMIT 50
        FOR UPDATE SKIP LOCKED
      `);

        await tx.outboxEvent.updateMany({
          where: {
            id: { in: pendingEvents.map((pe) => pe.id) },
          },
          data: {
            status: OutboxStatus.PROCESSING,
          },
        });
        return pendingEvents;
      });

      if (!pendingEvents || pendingEvents.length === 0) {
        return;
      }

      this.logger.log(`Relaying ${pendingEvents.length} outbox event(s)...`);

      for (const event of pendingEvents) {
        const metadata = event.metadata as { correlationId?: string } | null;
        try {
          const publishResult = await this.tracing.withSpan(
            `outbox.publish ${event.eventType}`,
            {
              kind: SpanKind.PRODUCER,
              attributes: {
                'messaging.system': 'bullmq',
                'outbox.event_id': event.id,
                'outbox.event_type': event.eventType,
                'outbox.aggregate_type': event.aggregateType,
                'outbox.aggregate_id': event.aggregateId,
                'outbox.retry_count': event.retryCount,
                'correlation.id': metadata?.correlationId,
              },
              // Continue the trace started when the event was created.
              parentCarrier: metadata,
            },
            async (span) => {
              // Re-stamp the envelope so the consumer continues this publish span.
              this.tracing.injectContext(metadata);
              const published = await this.routeAndPublish(event);
              span.setAttribute('outbox.published', published);
              return published;
            },
          );
          // 2. Mark as PUBLISHED upon broker acknowledgment
          const updatedEvent = await this.prisma.outboxEvent.update({
            where: { id: event.id },
            data: {
              status: publishResult
                ? OutboxStatus.PUBLISHED
                : OutboxStatus.FAILED,
              publishedAt: new Date(),
            },
          });
          this.outboxRelayLatency.observe(
            { result: publishResult ? 'published' : 'failed' },
            (Date.now() - updatedEvent.createdAt.getTime()) / 1000,
          );
        } catch (error: unknown) {
          const message =
            error instanceof Error ? error.message : String(error);
          this.logger.error(
            `Failed to publish outbox event ${event.id}: ${message}`,
          );
          const updatedEvent = await this.prisma.outboxEvent.update({
            where: { id: event.id },
            data: {
              status:
                event.retryCount >= 5
                  ? OutboxStatus.FAILED
                  : OutboxStatus.PENDING,
              retryCount: { increment: 1 },
              errorMessage: message,
            },
          });
          this.outboxRelayLatency.observe(
            { result: 'error' },
            (Date.now() - updatedEvent.createdAt.getTime()) / 1000,
          );
        }
      }
    } finally {
      this.isPolling = false;
    }
  }

  private async routeAndPublish(event: PendingOutboxEvent): Promise<boolean> {
    const { eventType, id } = event;

    switch (eventType) {
      case SAGA_EVENTS.INVENTORY_FAILED:
      case SAGA_EVENTS.INVENTORY_RELEASED:
      case SAGA_EVENTS.PAYMENT_SUCCESS:
        await this.orderQueue.add(eventType, event, { jobId: id });
        return true;

      case SAGA_EVENTS.ORDER_CREATED:
      case SAGA_EVENTS.PAYMENT_FAILED:
        await this.inventoryQueue.add(eventType, event, { jobId: id });
        return true;

      case SAGA_EVENTS.PROCESS_PAYMENT:
        await this.paymentQueue.add(eventType, event, { jobId: id });
        return true;

      case SAGA_EVENTS.SEND_NOTIFICATION:
        await this.notificationQueue.add(eventType, event, { jobId: id });
        return true;
      default:
        return false;
    }
  }
}
