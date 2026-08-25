import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../core/database/prisma.service.js';
import { OrderStatus } from '../../generated/prisma/enums.js';
import { CreateOrderDto } from './dto/create-order.dto.js';
import { Decimal } from '@prisma/client/runtime/client';

@Injectable()
export class OrderService {
  private readonly logger = new Logger(OrderService.name);

  constructor(private readonly prisma: PrismaService) {}

  async createOrderSync(dto: CreateOrderDto) {
    this.logger.log(
      `Creating order synchronously for customer: ${dto.customerId}`,
    );

    return this.prisma.$transaction(async (tx) => {
      let totalAmount = 0;
      type OrderItemToCreate = {
        productId: string;
        quantity: number;
        unitPrice: Decimal;
      };
      const orderItemsToCreate: OrderItemToCreate[] = [];

      for (const item of dto.items) {
        const product = await tx.product.findUnique({
          where: { id: item.productId },
        });

        if (!product) {
          throw new NotFoundException(`Product ${item.productId} not found`);
        }

        if (product.stock < item.quantity) {
          throw new BadRequestException(
            `Insufficient stock for product ${product.name}. Available: ${product.stock}, Requested: ${item.quantity}`,
          );
        }

        // Deduct stock directly
        await tx.product.update({
          where: { id: product.id },
          data: { stock: product.stock - item.quantity },
        });

        const itemTotal = Number(product.price) * item.quantity;
        totalAmount += itemTotal;

        orderItemsToCreate.push({
          productId: product.id,
          quantity: item.quantity,
          unitPrice: product.price,
        });
      }

      // Simulate external payment gateway call (blocking for 1.5 seconds)
      await new Promise((resolve) => setTimeout(resolve, 1500));

      // Create Order
      const order = await tx.order.create({
        data: {
          customerId: dto.customerId,
          totalAmount,
          status: OrderStatus.CONFIRMED,
          items: {
            create: orderItemsToCreate,
          },
        },
        include: {
          items: true,
        },
      });

      this.logger.log(`Order ${order.id} confirmed successfully`);
      return order;
    });
  }

  async getOrderById(id: string) {
    const order = await this.prisma.order.findUnique({
      where: { id },
      include: { items: { include: { product: true } } },
    });

    if (!order) {
      throw new NotFoundException(`Order with ID ${id} not found`);
    }

    return order;
  }
}
