import { Module } from '@nestjs/common';
import { OrderController } from './order.controller.js';
import { OrderService } from './order.service.js';
import { OrderProcessor } from './order.processor.js';

@Module({
  imports: [],
  controllers: [OrderController],
  providers: [OrderService, OrderProcessor],
  exports: [],
})
export class OrderModule {}
