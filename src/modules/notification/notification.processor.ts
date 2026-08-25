import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { QUEUES, SAGA_EVENTS } from '../../common/events/saga.events.js';

@Processor(QUEUES.NOTIFICATION)
export class NotificationProcessor extends WorkerHost {
  private readonly logger = new Logger(NotificationProcessor.name);

  async process(job: Job): Promise<any> {
    if (job.name === SAGA_EVENTS.SEND_NOTIFICATION) {
      const { orderId, customerId, status } = job.data;
      this.logger.log(
        `📧 [Notification] Email sent to Customer ${customerId}: Your order ${orderId} is ${status}!`,
      );
    }
  }
}
