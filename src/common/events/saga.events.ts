import { OrderStatus } from '../../generated/prisma/enums.js';

export const QUEUES = {
  ORDER: 'order-queue',
  INVENTORY: 'inventory-queue',
  PAYMENT: 'payment-queue',
  NOTIFICATION: 'notification-queue',
} as const;

export const SAGA_EVENTS = {
  // Order Events
  ORDER_CREATED: 'order.created',

  // Inventory Events
  INVENTORY_FAILED: 'inventory.failed',
  INVENTORY_RELEASED: 'inventory.released',

  // Payment Events
  PROCESS_PAYMENT: 'payment.process',
  PAYMENT_SUCCESS: 'payment.success',
  PAYMENT_FAILED: 'payment.failed',

  // Notification Events
  SEND_NOTIFICATION: 'notification.send',
} as const;

export interface OrderCreatedPayload {
  orderId: string;
  customerId: string;
  items: Array<{ productId: string; quantity: number; unitPrice: number }>;
  totalAmount: number;
}

export interface InventoryFailedPayload {
  orderId: string;
  reason: string;
}

export interface InventoryReleasedPayload {
  orderId: string;
}

export interface InventoryReservedPayload {
  orderId: string;
  customerId: string;
  totalAmount: number;
  items: Array<{ productId: string; quantity: number }>;
}

export interface PaymentProcessedPayload {
  orderId: string;
  customerId: string;
  paymentId: string;
  amount: number;
  success: boolean;
  reason?: string;
}

export interface PaymentSuccessPayload {
  orderId: string;
  paymentId: string;
}

export interface PaymentFailedPayload {
  orderId: string;
  reason: string;
}

export interface NotificationProcessedPayload {
  orderId: string;
  customerId: string;
  status: OrderStatus;
}
