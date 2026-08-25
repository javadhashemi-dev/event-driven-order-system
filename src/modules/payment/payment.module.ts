import { Module } from '@nestjs/common';
import { PaymentProcessor } from './payment.processor.js';
import { BullModule } from '@nestjs/bullmq';
import { QUEUES } from '../../common/events/saga.events.js';

@Module({
  imports: [
    BullModule.registerQueue({ name: QUEUES.ORDER }),
    BullModule.registerQueue({ name: QUEUES.INVENTORY }),
  ],
  controllers: [],
  providers: [PaymentProcessor],
  exports: [],
})
export class PaymentModule {}
