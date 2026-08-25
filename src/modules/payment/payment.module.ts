import { Module } from '@nestjs/common';
import { PaymentProcessor } from './payment.processor.js';

@Module({
  imports: [],
  controllers: [],
  providers: [PaymentProcessor],
  exports: [],
})
export class PaymentModule {}
