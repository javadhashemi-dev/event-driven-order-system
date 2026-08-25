import { Module } from '@nestjs/common';
import { OrderController } from './order.controller.js';
import { OrderService } from './order.service.js';
import { BullModule } from '@nestjs/bullmq';
import { OrderProcessor } from './order.processor.js';
import { QUEUES } from '../../common/events/saga.events.js';

@Module({
  imports: [
    BullModule.registerQueue({ name: QUEUES.NOTIFICATION }),
    BullModule.registerQueue({ name: QUEUES.INVENTORY }),
  ],
  controllers: [OrderController],
  providers: [OrderService, OrderProcessor],
  exports: [],
})
export class OrderModule {}
