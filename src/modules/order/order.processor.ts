import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { QUEUES, SAGA_EVENTS } from '../../common/events/saga.events.js';
import { PrismaService } from '../../core/database/prisma.service.js';
import { Job, Queue } from 'bullmq';
import { Logger } from '@nestjs/common';
import { OrderStatus } from '../../generated/prisma/enums.js';

@Processor(QUEUES.ORDER)
export class OrderProcessor extends WorkerHost {
  private readonly logger = new Logger(OrderProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue(QUEUES.NOTIFICATION) private readonly notificationQueue: Queue,
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

  private async handlePaymentSuccess(data: {
    orderId: string;
    paymentId: string;
  }) {
    this.logger.log(`[Saga] Confirming Order ${data.orderId}`);

    const order = await this.prisma.order.update({
      where: { id: data.orderId },
      data: { status: OrderStatus.CONFIRMED },
    });

    // Notify customer
    await this.notificationQueue.add(SAGA_EVENTS.SEND_NOTIFICATION, {
      orderId: order.id,
      customerId: order.customerId,
      status: 'CONFIRMED',
    });
  }

  private async handleOrderCancellation(data: {
    orderId: string;
    reason?: string;
  }) {
    this.logger.warn(
      `[Saga] Cancelling Order ${data.orderId}. Reason: ${data.reason || 'Saga compensation'}`,
    );

    await this.prisma.order.update({
      where: { id: data.orderId },
      data: { status: OrderStatus.CANCELLED },
    });
  }
}
