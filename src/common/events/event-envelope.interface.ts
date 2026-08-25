export interface EventMetadata {
  correlationId?: string;
  causationId?: string;
  source: string;
  timestamp: string;
  version: number;
}

export interface IEventEnvelope<T = any> {
  id: string; // Deterministic event UUID
  aggregateType: string; // e.g. "Order", "Inventory"
  aggregateId: string; // e.g. orderId
  eventType: string; // e.g. "order.created"
  payload: T;
  metadata: EventMetadata;
}

export class EventEnvelopeFactory {
  static create<T>(
    aggregateType: string,
    aggregateId: string,
    eventType: string,
    payload: T,
    source: string,
    metadata?: Partial<EventMetadata>,
  ): IEventEnvelope<T> {
    return {
      id: crypto.randomUUID(),
      aggregateType,
      aggregateId,
      eventType,
      payload,
      metadata: {
        source,
        timestamp: new Date().toISOString(),
        version: 1,
        ...metadata,
      },
    };
  }
}
