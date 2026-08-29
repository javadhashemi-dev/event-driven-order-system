import { Injectable } from '@nestjs/common';
import { IEventEnvelope } from '../../common/events/event-envelope.interface.js';
import { OutboxStatus, Prisma } from '../../generated/prisma/client.js';

@Injectable()
export class OutboxService {
  async appendInTransaction(
    tx: Prisma.TransactionClient,
    envelope: IEventEnvelope,
  ) {
    return tx.outboxEvent.create({
      data: {
        id: envelope.id,
        aggregateType: envelope.aggregateType,
        aggregateId: envelope.aggregateId,
        eventType: envelope.eventType,
        payload: envelope.payload,
        metadata: envelope.metadata as any,
        status: OutboxStatus.PENDING,
      },
    });
  }
}
