import { Test } from '@nestjs/testing';
import { describe, it, expect, beforeAll, afterAll, jest } from '@jest/globals';
import { PrismaService } from '../../src/core/database/prisma.service.js';
import { OutboxRelayerService } from '../../src/modules/outbox/outbox-relayer.service.js';
import { QUEUES } from '../../src/common/events/saga.events.js';
import { getQueueToken } from '@nestjs/bullmq';

describe('OutboxRelayerService (Integration)', () => {
  let prisma: PrismaService;
  let relayer: OutboxRelayerService;
  const mockInventoryQueue = { add: jest.fn().mockResolvedValue({}) };
  const silentQueue = { add: jest.fn().mockResolvedValue({}) };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        PrismaService,
        OutboxRelayerService,
        {
          provide: getQueueToken(QUEUES.INVENTORY),
          useValue: mockInventoryQueue,
        },
        { provide: getQueueToken(QUEUES.PAYMENT), useValue: silentQueue },
        { provide: getQueueToken(QUEUES.ORDER), useValue: silentQueue },
        { provide: getQueueToken(QUEUES.NOTIFICATION), useValue: silentQueue },
      ],
    }).compile();

    prisma = moduleRef.get(PrismaService);
    relayer = moduleRef.get(OutboxRelayerService);
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('should fetch PENDING outbox events, publish to BullMQ, and mark as PUBLISHED', async () => {
    // 1. Seed a pending outbox event
    const event = await prisma.outboxEvent.create({
      data: {
        aggregateType: 'Order',
        aggregateId: 'test-ord-1',
        eventType: 'order.created',
        payload: { orderId: 'test-ord-1' },
        status: 'PENDING',
      },
    });

    // 2. Trigger relayer poll
    await relayer.pollAndPublish();

    // 3. Verify event was published to the inventory queue
    expect(mockInventoryQueue.add).toHaveBeenCalledWith(
      'order.created',
      expect.objectContaining({ id: event.id, eventType: 'order.created' }),
      expect.objectContaining({ jobId: event.id }),
    );

    // 4. Verify DB status was updated to PUBLISHED
    const updated = await prisma.outboxEvent.findUnique({
      where: { id: event.id },
    });
    expect(updated?.status).toBe('PUBLISHED');
    expect(updated?.publishedAt).not.toBeNull();

    // cleanup
    await prisma.outboxEvent.delete({ where: { id: event.id } });
  });

  it('should leave the event PENDING (with incremented retryCount) when publishing throws', async () => {
    const failingQueue = {
      add: jest.fn().mockRejectedValue(new Error('broker down')),
    };
    const moduleRef = await Test.createTestingModule({
      providers: [
        PrismaService,
        OutboxRelayerService,
        { provide: getQueueToken(QUEUES.INVENTORY), useValue: failingQueue },
        { provide: getQueueToken(QUEUES.PAYMENT), useValue: silentQueue },
        { provide: getQueueToken(QUEUES.ORDER), useValue: silentQueue },
        { provide: getQueueToken(QUEUES.NOTIFICATION), useValue: silentQueue },
      ],
    }).compile();
    const localRelayer = moduleRef.get(OutboxRelayerService);

    const event = await prisma.outboxEvent.create({
      data: {
        aggregateType: 'Order',
        aggregateId: 'test-ord-fail',
        eventType: 'order.created',
        payload: { orderId: 'test-ord-fail' },
        status: 'PENDING',
      },
    });

    await localRelayer.pollAndPublish();

    const updated = await prisma.outboxEvent.findUnique({
      where: { id: event.id },
    });
    expect(updated?.status).toBe('PENDING');
    expect(updated?.retryCount).toBe(1);
    expect(updated?.errorMessage).toContain('broker down');

    await prisma.outboxEvent.delete({ where: { id: event.id } });
  });
});
