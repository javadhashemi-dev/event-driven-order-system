import { Test } from '@nestjs/testing';
import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { PrismaService } from '../../src/core/database/prisma.service.js';
import { ConsumerDeduplicationService } from '../../src/common/deduplication/consumer-deduplication.service.js';

describe('ConsumerDeduplicationService (Integration)', () => {
  let prisma: PrismaService;
  let dedup: ConsumerDeduplicationService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [PrismaService, ConsumerDeduplicationService],
    }).compile();
    prisma = moduleRef.get(PrismaService);
    dedup = moduleRef.get(ConsumerDeduplicationService);
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('should allow processing an event the first time and reject duplicate deliveries', async () => {
    const eventId = `evt-${Date.now()}-${Math.random()}`;
    const eventType = 'order.created';

    const first = await prisma.$transaction((tx) =>
      dedup.shouldProcessEvent(tx, eventId, eventType, 'InventoryWorker'),
    );
    expect(first).toBe(true);

    // A second delivery of the same event (any consumer) must be skipped,
    // because processed_events.event_id has a UNIQUE constraint.
    const second = await prisma.$transaction((tx) =>
      dedup.shouldProcessEvent(tx, eventId, eventType, 'InventoryWorker'),
    );
    expect(second).toBe(false);

    const thirdOtherConsumer = await prisma.$transaction((tx) =>
      dedup.shouldProcessEvent(tx, eventId, eventType, 'PaymentWorker'),
    );
    expect(thirdOtherConsumer).toBe(false);

    // A brand-new event id is processed normally.
    const newEventId = `evt-${Date.now()}-${Math.random()}-new`;
    const fresh = await prisma.$transaction((tx) =>
      dedup.shouldProcessEvent(tx, newEventId, eventType, 'PaymentWorker'),
    );
    expect(fresh).toBe(true);

    // cleanup
    await prisma.processedEvent.deleteMany({
      where: { eventId: { in: [eventId, newEventId] } },
    });
  });

  it('should reject a replayed event id even across different event types', async () => {
    const eventId = `evt-iso-${Date.now()}-${Math.random()}`;
    const first = await prisma.$transaction((tx) =>
      dedup.shouldProcessEvent(tx, eventId, 'payment.success', 'OrderWorker'),
    );
    expect(first).toBe(true);
    const dup = await prisma.$transaction((tx) =>
      dedup.shouldProcessEvent(tx, eventId, 'payment.failed', 'OrderWorker'),
    );
    expect(dup).toBe(false);
    await prisma.processedEvent.deleteMany({ where: { eventId } });
  });
});
