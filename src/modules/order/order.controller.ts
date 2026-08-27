import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseInterceptors,
} from '@nestjs/common';
import { OrderService } from './order.service.js';
import { CreateOrderDto } from './dto/create-order.dto.js';
import { IdempotencyInterceptor } from '../../common/interceptors/idempotency.interceptor.js';

@Controller('orders')
export class OrderController {
  constructor(private readonly orderService: OrderService) {}

  @UseInterceptors(IdempotencyInterceptor)
  @Post()
  @HttpCode(HttpStatus.ACCEPTED)
  createOrder(
    @Body() dto: CreateOrderDto,
    @Headers('x-correlation-id') correlationId: string,
  ) {
    return this.orderService.createOrder(dto, correlationId);
  }

  @Get(':id')
  getOrder(@Param('id') id: string) {
    return this.orderService.getOrderById(id);
  }
}
