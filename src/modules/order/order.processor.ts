import { Processor, WorkerHost } from '@nestjs/bullmq';
import {
  ORDER_QUEUE,
  OrderJobs,
  ProcessOrderJobPayload,
} from './order.constants.js';
import { Logger } from '@nestjs/common';
import { PrismaService } from '../../core/database/prisma.service.js';
import { Job } from 'bullmq';
import { OrderStatus } from '../../generated/prisma/enums.js';

@Processor(ORDER_QUEUE)
export class OrderProcessor extends WorkerHost {
  private readonly logger = new Logger(OrderProcessor.name);
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async process(job: Job<ProcessOrderJobPayload, any, string>): Promise<any> {
    this.logger.log(
      `[Worker] Started processing job ${job.id} for order ${job.data.orderId}`,
    );

    switch (job.name) {
      case OrderJobs.PROCESS_ORDER:
        return this.handleOrderProcess(job.data);
      default:
        this.logger.warn(`Unknown job name: ${job.name}`);
    }
  }

  private async handleOrderProcess(data: ProcessOrderJobPayload) {
    const { orderId, items } = data;

    // Execute fulfillment in background transaction
    return this.prisma.$transaction(async (tx) => {
      // 1. Check & deduct inventory
      for (const item of items) {
        const product = await tx.product.findUnique({
          where: { id: item.productId },
        });

        if (!product || product.stock < item.quantity) {
          this.logger.error(
            `[Worker] Insufficient stock for product ${item.productId}. Cancelling order ${orderId}`,
          );

          await tx.order.update({
            where: { id: orderId },
            data: { status: OrderStatus.CANCELLED },
          });

          return { success: false, reason: 'OUT_OF_STOCK' };
        }

        await tx.product.update({
          where: { id: item.productId },
          data: { stock: product.stock - item.quantity },
        });
      }

      // 2. Simulate payment processing (async background task)
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // 3. Mark order as CONFIRMED
      const confirmedOrder = await tx.order.update({
        where: { id: orderId },
        data: { status: OrderStatus.CONFIRMED },
      });

      this.logger.log(`[Worker] Order ${orderId} successfully CONFIRMED!`);
      return { success: true, orderId: confirmedOrder.id };
    });
  }
}
