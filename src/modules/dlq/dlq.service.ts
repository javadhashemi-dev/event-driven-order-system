import { InjectQueue } from '@nestjs/bullmq';
import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { Queue, QueueEvents, randomUUID } from 'bullmq';
import { QUEUES } from '../../common/events/saga.events.js';

export interface DeadLetterJobData {
  originalQueue: string;
  originalJobId: string | undefined;
  jobName: string;
  data: any;
  failedReason: string;
  stack?: string;
  failedAt: string;
  attemptsMade: number;
  maxAttempts: number;
}

@Injectable()
export class DlqService implements OnModuleInit {
  private readonly logger = new Logger(DlqService.name);
  private queueEvents: QueueEvents[] = [];
  private readonly queues: Record<string, Queue>;

  constructor(
    @InjectQueue(QUEUES.ORDER) private readonly orderQueue: Queue,
    @InjectQueue(QUEUES.INVENTORY) private readonly inventoryQueue: Queue,
    @InjectQueue(QUEUES.PAYMENT) private readonly paymentQueue: Queue,
    @InjectQueue(QUEUES.NOTIFICATION) private readonly notificationQueue: Queue,
    @InjectQueue(QUEUES.DLQ) private readonly dlqQueue: Queue,
  ) {
    this.queues = {
      [QUEUES.ORDER]: orderQueue,
      [QUEUES.INVENTORY]: inventoryQueue,
      [QUEUES.PAYMENT]: paymentQueue,
      [QUEUES.NOTIFICATION]: notificationQueue,
    };
  }

  async onModuleInit() {
    const queues = [
      { queue: this.orderQueue, name: QUEUES.ORDER },
      { queue: this.inventoryQueue, name: QUEUES.INVENTORY },
      { queue: this.paymentQueue, name: QUEUES.PAYMENT },
      { queue: this.notificationQueue, name: QUEUES.NOTIFICATION },
    ];

    for (const { queue, name } of queues) {
      await this.attachQueueEventListeners(queue, name);
    }
  }

  private async attachQueueEventListeners(queue: Queue, queueName: string) {
    const queueEvents = new QueueEvents(queue.name, {
      connection: queue.opts?.connection,
    });

    queueEvents.on('failed', async ({ jobId, failedReason }) => {
      try {
        const job = await queue.getJob(jobId);
        if (!job) {
          this.logger.warn(`Job ${jobId} not found in ${queueName}`);
          return;
        }

        const maxAttempts = job.opts.attempts || 3;

        if (job.attemptsMade >= maxAttempts) {
          this.logger.warn(
            `Job ${jobId} from ${queueName} exhausted all ${maxAttempts} attempts | reason: ${failedReason}. Moving to DLQ...`,
          );

          const dlqData: DeadLetterJobData = {
            originalQueue: queueName,
            originalJobId: job.id,
            jobName: job.name,
            data: job.data,
            failedReason: failedReason || 'Unknown error',
            stack: job.stacktrace?.join('\n'),
            failedAt: new Date().toISOString(),
            attemptsMade: job.attemptsMade,
            maxAttempts,
          };

          await this.dlqQueue.add('dead-letter-job', dlqData, {
            jobId: `dlq-${queueName}-${job.id}-${Date.now()}`,
          });

          this.logger.log(`Job ${jobId} moved to DLQ successfully`);
        }
      } catch (error: any) {
        this.logger.error(
          `Error handling failed job ${jobId} from ${queueName}: ${error.message}`,
        );
      }
    });

    this.queueEvents.push(queueEvents);
    this.logger.log(`DLQ listener attached to ${queueName}`);
  }

  async replay(dlqJobId: string) {
    const dlqJob = await this.dlqQueue.getJob(dlqJobId);

    if (!dlqJob) {
      throw new NotFoundException('Dlq job nout found');
    }

    const data = dlqJob.data as DeadLetterJobData;
    const queue = this.queues[data.originalQueue];

    if (!queue) {
      throw new BadRequestException(
        `Unsupported original queue: ${data.originalQueue}`,
      );
    }

    console.log('jobName:', data.jobName);
    console.log('job data:', data.data);

    const replayJob = await queue.add(data.jobName, data.data, {
      jobId: `replay-${dlqJob.id}-${randomUUID()}`,
    });

    await dlqJob.remove();

    return {
      replayed: true,
      dlqJobId: dlqJob.id,
      replayJobId: replayJob.id,
      originalQueue: data.originalQueue,
      jobName: data.jobName,
    };
  }

  listFailedJobs() {
    return this.dlqQueue.getJobs(['completed', 'failed', 'waiting']);
  }
  onModuleDestroy() {
    // Cleanup event listeners
    this.queueEvents.forEach((events) => events.close());
  }
}
