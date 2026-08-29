import { context, propagation } from '@opentelemetry/api';

export type EventMetadata = {
  correlationId?: string;
  causationId?: string;
  /** W3C trace context of the span producing this event (set automatically). */
  traceparent?: string;
  tracestate?: string;
  source: string;
  timestamp: string;
  version: number;
};

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
    const envelopeMetadata: EventMetadata = {
      source,
      timestamp: new Date().toISOString(),
      version: 1,
      ...metadata,
    };

    // Carry the producing span's trace context so consumers can continue it.
    propagation.inject(context.active(), envelopeMetadata);

    return {
      id: crypto.randomUUID(),
      aggregateType,
      aggregateId,
      eventType,
      payload,
      metadata: envelopeMetadata,
    };
  }
}
