import { Global, Module } from '@nestjs/common';
import { OutboxService } from './outbox.service.js';
import { OutboxRelayerService } from './outbox-relayer.service.js';
import { BullModule } from '@nestjs/bullmq';
import { QUEUES } from '../../common/events/saga.events.js';
import { makeHistogramProvider } from '@willsoto/nestjs-prometheus';

@Global()
@Module({
  imports: [
    BullModule.registerQueue({ name: QUEUES.ORDER }),
    BullModule.registerQueue({ name: QUEUES.INVENTORY }),
    BullModule.registerQueue({ name: QUEUES.PAYMENT }),
    BullModule.registerQueue({ name: QUEUES.NOTIFICATION }),
  ],
  controllers: [],
  providers: [
    OutboxService,
    OutboxRelayerService,
    makeHistogramProvider({
      name: 'outbox_relay_latency_seconds',
      help: 'Time from outbox event creation until relay publication',
      labelNames: ['result'],
      buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10],
    }),
  ],
  exports: [OutboxService],
})
export class OutboxModule {}
