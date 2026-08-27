import { Processor, WorkerHost } from '@nestjs/bullmq';
import { BadGatewayException, Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { QUEUES, SAGA_EVENTS } from '../../common/events/saga.events.js';
import { ConsumerDeduplicationService } from '../../common/deduplication/consumer-deduplication.service.js';
import { PrismaService } from '../../core/database/prisma.service.js';

@Processor(QUEUES.NOTIFICATION)
export class NotificationProcessor extends WorkerHost {
  private readonly logger = new Logger(NotificationProcessor.name);
  constructor(
    private readonly prisma: PrismaService,
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
            job.id || job.data.eventId,
            job.name,
            'NotificationWorker',
          );
        if (!shouldProcess) {
          return { skipped: true, reason: 'DUPLICATE_EVENT' };
        }
        if (job.name === SAGA_EVENTS.SEND_NOTIFICATION) {
          const { orderId, customerId, status } = job.data.payload;
          this.logger.log(
            `📧 [Notification] Email sent to Customer ${customerId}: Your order ${orderId} is ${status}!`,
          );
        }
      });
    } catch (error: any) {
      throw error;
    }
  }
}
