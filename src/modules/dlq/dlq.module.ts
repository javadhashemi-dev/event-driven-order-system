import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { QUEUES } from '../../common/events/saga.events.js';
import { DlqService } from './dlq.service.js';
import { DlqController } from './dlq.controller.js';

@Module({
  imports: [
    BullModule.registerQueue({ name: QUEUES.ORDER }),
    BullModule.registerQueue({ name: QUEUES.INVENTORY }),
    BullModule.registerQueue({ name: QUEUES.PAYMENT }),
    BullModule.registerQueue({ name: QUEUES.NOTIFICATION }),
    BullModule.registerQueue({ name: QUEUES.DLQ }),
  ],
  controllers: [DlqController],
  providers: [DlqService],
  exports: [],
})
export class DlqModule {}
