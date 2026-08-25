import { Module } from '@nestjs/common';
import { InventoryProcessor } from './inventory.processor.js';
import { BullModule } from '@nestjs/bullmq';
import { QUEUES } from '../../common/events/saga.events.js';

@Module({
  imports: [
    BullModule.registerQueue({ name: QUEUES.ORDER }),
    BullModule.registerQueue({ name: QUEUES.PAYMENT }),
  ],
  controllers: [],
  providers: [InventoryProcessor],
  exports: [],
})
export class InventoryModule {}
