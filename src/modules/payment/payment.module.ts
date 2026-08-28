import { Module } from '@nestjs/common';
import { PaymentProcessor } from './payment.processor.js';
import { makeHistogramProvider } from '@willsoto/nestjs-prometheus';

@Module({
  imports: [],
  controllers: [],
  providers: [
    PaymentProcessor,
    makeHistogramProvider({
      name: 'payment_duration_seconds',
      help: 'Time spent processing a payment',
      labelNames: ['result'],
      buckets: [0.1, 0.5, 1, 2, 3, 5, 10],
    }),
  ],
  exports: [],
})
export class PaymentModule {}
