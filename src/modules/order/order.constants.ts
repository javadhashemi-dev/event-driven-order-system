export const ORDER_QUEUE = 'order-queue';

export enum OrderJobs {
  PROCESS_ORDER = 'order.process',
}

export interface ProcessOrderJobPayload {
  orderId: string;
  customerId: string;
  items: Array<{
    productId: string;
    quantity: number;
    unitPrice: number;
  }>;
  totalAmount: number;
}
