import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import {
  OrderCreatedPayload,
  QUEUES,
  SAGA_EVENTS,
} from '../../common/events/saga.events.js';
import { Logger } from '@nestjs/common';
import { PrismaService } from '../../core/database/prisma.service.js';
import { Job, Queue } from 'bullmq';
import { PaymentStatus } from '../../generated/prisma/enums.js';

@Processor(QUEUES.PAYMENT)
export class PaymentProcessor extends WorkerHost {
  private readonly logger = new Logger(PaymentProcessor.name);
  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue(QUEUES.ORDER) private readonly orderQueue: Queue,
    @InjectQueue(QUEUES.INVENTORY) private readonly inventoryQueue: Queue,
  ) {
    super();
  }

  async process(job: Job): Promise<any> {
    if (job.name === SAGA_EVENTS.PROCESS_PAYMENT) {
      return this.handleProcessPayment(job.data as OrderCreatedPayload);
    }
  }

  private async handleProcessPayment(payload: OrderCreatedPayload) {
    this.logger.log(
      `[Payment] Processing $${payload.totalAmount} for Order ${payload.orderId}`,
    );

    // Simulate network delay
    await new Promise((r) => setTimeout(r, 3000));

    // Test helper: If customerId is 'fail_payment', simulate card decline!
    const isPaymentSuccessful = payload.customerId !== 'fail_payment';

    if (isPaymentSuccessful) {
      const payment = await this.prisma.payment.create({
        data: {
          orderId: payload.orderId,
          amount: payload.totalAmount,
          status: PaymentStatus.SUCCESS,
          gatewayTxnId: `txn_${Date.now()}`,
        },
      });

      this.logger.log(
        `[Payment] Payment succeeded for Order ${payload.orderId}`,
      );
      await this.orderQueue.add(SAGA_EVENTS.PAYMENT_SUCCESS, {
        orderId: payload.orderId,
        paymentId: payment.id,
      });
    } else {
      await this.prisma.payment.create({
        data: {
          orderId: payload.orderId,
          amount: payload.totalAmount,
          status: PaymentStatus.FAILED,
          failureReason: 'Card declined / Insufficient customer funds',
        },
      });

      this.logger.error(
        `[Payment] Payment FAILED for Order ${payload.orderId}. Triggering Saga compensation.`,
      );
      // Emit payment.failed to trigger inventory stock rollback
      await this.inventoryQueue.add(SAGA_EVENTS.PAYMENT_FAILED, {
        orderId: payload.orderId,
        reason: 'Payment declined',
      });
    }
  }
}
