import { EventEnvelopeFactory } from '../../src/common/events/event-envelope.interface.js';

describe('EventEnvelopeFactory', () => {
  it('should construct a valid immutable event envelope', () => {
    const payload = { orderId: '123', total: 99.99 };
    const envelope = EventEnvelopeFactory.create(
      'Order',
      '123',
      'order.created',
      payload,
      'order-service',
    );

    expect(envelope.id).toBeDefined();
    expect(envelope.aggregateType).toBe('Order');
    expect(envelope.aggregateId).toBe('123');
    expect(envelope.eventType).toBe('order.created');
    expect(envelope.payload).toEqual(payload);
    expect(envelope.metadata.source).toBe('order-service');
    expect(envelope.metadata.version).toBe(1);
    expect(typeof envelope.metadata.timestamp).toBe('string');
  });

  it('should generate a unique id for every envelope', () => {
    const a = EventEnvelopeFactory.create(
      'Order',
      '1',
      'order.created',
      {},
      's',
    );
    const b = EventEnvelopeFactory.create(
      'Order',
      '1',
      'order.created',
      {},
      's',
    );
    expect(a.id).not.toBe(b.id);
  });

  it('should merge caller-provided metadata (correlationId / causationId)', () => {
    const envelope = EventEnvelopeFactory.create(
      'Inventory',
      'ord-1',
      'inventory.reserved',
      { orderId: 'ord-1' },
      'inventory-service',
      { correlationId: 'corr-xyz', causationId: 'order.created' },
    );

    expect(envelope.metadata.correlationId).toBe('corr-xyz');
    expect(envelope.metadata.causationId).toBe('order.created');
    // defaults still applied
    expect(envelope.metadata.source).toBe('inventory-service');
  });
});
