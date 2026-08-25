import { Module } from '@nestjs/common';
import { OrderController } from './order.controller.js';
import { OrderService } from './order.service.js';

@Module({
  imports: [],
  controllers: [OrderController],
  providers: [OrderService],
  exports: [],
})
export class OrderModule {}
