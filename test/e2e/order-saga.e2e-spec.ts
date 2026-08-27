import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { AppModule } from '../../src/app.module.js';
import { PrismaService } from '../../src/core/database/prisma.service.js';
import { OrderStatus } from '../../src/generated/prisma/enums.js';

const POLL_INTERVAL_MS = 500;
const POLL_TIMEOUT_MS = 30_000;

describe('Order Saga (E2E)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let testProductId: string;
  const createdOrderIds: string[] = [];

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    await app.init();

    prisma = app.get(PrismaService);

    const product = await prisma.product.create({
      data: {
        sku: `TEST-SKU-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        name: 'Test Product',
        price: 100.0,
        stock: 10,
      },
    });
    testProductId = product.id;
  });

  afterAll(async () => {
    if (createdOrderIds.length) {
      await prisma.order
        .deleteMany({ where: { id: { in: createdOrderIds } } })
        .catch(() => undefined);
    }
    if (testProductId) {
      await prisma.product
        .delete({ where: { id: testProductId } })
        .catch(() => undefined);
    }
    await app.close();
  });

  async function waitForStatus(
    orderId: string,
    target: OrderStatus,
    timeoutMs = POLL_TIMEOUT_MS,
  ): Promise<OrderStatus> {
    const deadline = Date.now() + timeoutMs;
    let status = OrderStatus.PENDING;
    while (Date.now() < deadline) {
      const order = await prisma.order.findUnique({ where: { id: orderId } });
      status = (order?.status as OrderStatus) ?? ('PENDING' as OrderStatus);
      if (status === target) break;
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    }
    return status;
  }

  it('Scenario 1: Happy Path - should create order and eventually reach CONFIRMED state', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/orders')
      .send({
        customerId: 'cust_happy_path',
        items: [{ productId: testProductId, quantity: 2 }],
      })
      .expect(202);

    const { orderId } = res.body;
    expect(orderId).toBeDefined();
    createdOrderIds.push(orderId);

    const finalStatus = await waitForStatus(orderId, OrderStatus.CONFIRMED);
    expect(finalStatus).toBe('CONFIRMED');

    // Stock should have been deducted by 2 (10 -> 8)
    const updatedProduct = await prisma.product.findUnique({
      where: { id: testProductId },
    });
    expect(updatedProduct?.stock).toBe(8);
  });

  it('Scenario 2: Compensation Path - should rollback inventory if payment fails', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/orders')
      .send({
        customerId: 'fail_payment',
        items: [{ productId: testProductId, quantity: 2 }],
      })
      .expect(202);

    const { orderId } = res.body;
    expect(orderId).toBeDefined();
    createdOrderIds.push(orderId);

    const finalStatus = await waitForStatus(orderId, OrderStatus.CANCELLED);
    expect(finalStatus).toBe('CANCELLED');

    // Stock must be restored back to 8 (reserve 8->6, release 6->8)
    const productAfterCompensation = await prisma.product.findUnique({
      where: { id: testProductId },
    });
    expect(productAfterCompensation?.stock).toBe(8);
  });

  it('Scenario 3: Idempotency - replaying the same Idempotency-Key returns the original response', async () => {
    const payload = {
      customerId: 'cust_idempotent',
      items: [{ productId: testProductId, quantity: 1 }],
    };
    const key = `idem-${Date.now()}-${Math.random().toString(36).slice(2)}`;

    const first = await request(app.getHttpServer())
      .post('/api/v1/orders')
      .set('Idempotency-Key', key)
      .send(payload)
      .expect(202);
    createdOrderIds.push(first.body.orderId);

    const second = await request(app.getHttpServer())
      .post('/api/v1/orders')
      .set('Idempotency-Key', key)
      .send(payload)
      .expect(202);

    expect(second.body.orderId).toBe(first.body.orderId);
  });
});
