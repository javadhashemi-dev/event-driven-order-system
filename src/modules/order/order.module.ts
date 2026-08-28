import { Module } from '@nestjs/common';
import { OrderController } from './order.controller.js';
import { OrderService } from './order.service.js';
import { OrderProcessor } from './order.processor.js';
import {
  makeCounterProvider,
  makeHistogramProvider,
} from '@willsoto/nestjs-prometheus';

@Module({
  imports: [],
  controllers: [OrderController],
  providers: [
    OrderService,
    OrderProcessor,
    makeCounterProvider({
      name: 'orders_total',
      help: 'Total count of created orders',
      labelNames: ['status'],
    }),
    makeHistogramProvider({
      name: 'saga_duration_seconds',
      help: 'Time from order creation until the saga reaches a terminal state',
      labelNames: ['result'],
      buckets: [0.1, 0.5, 1, 2, 5, 10, 30, 60, 120],
    }),
  ],
  exports: [],
})
export class OrderModule {}
