import { Module } from '@nestjs/common';
import { OrderController } from './order.controller.js';
import { OrderService } from './order.service.js';
import { BullModule } from '@nestjs/bullmq';
import { ORDER_QUEUE } from './order.constants.js';
import { OrderProcessor } from './order.processor.js';

@Module({
  imports: [BullModule.registerQueue({ name: ORDER_QUEUE })],
  controllers: [OrderController],
  providers: [OrderService, OrderProcessor],
  exports: [],
})
export class OrderModule {}
