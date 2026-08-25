import { Global, Module } from '@nestjs/common';
import { OutboxService } from './outbox.service.js';
import { OutboxRelayerService } from './outbox-relayer.service.js';
import { BullModule } from '@nestjs/bullmq';
import { QUEUES } from '../../common/events/saga.events.js';

@Global()
@Module({
  imports: [
    BullModule.registerQueue({ name: QUEUES.ORDER }),
    BullModule.registerQueue({ name: QUEUES.INVENTORY }),
    BullModule.registerQueue({ name: QUEUES.PAYMENT }),
    BullModule.registerQueue({ name: QUEUES.NOTIFICATION }),
  ],
  controllers: [],
  providers: [OutboxService, OutboxRelayerService],
  exports: [OutboxService],
})
export class OutboxModule {}
