import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client.js';

@Injectable()
export class ConsumerDeduplicationService {
  private readonly logger = new Logger(ConsumerDeduplicationService.name);

  async shouldProcessEvent(
    tx: Prisma.TransactionClient,
    eventId: string,
    eventType: string,
    consumer: string,
  ): Promise<boolean> {
    try {
      await tx.processedEvent.create({
        data: {
          eventId,
          eventType,
          consumer,
        },
      });
      return true;
    } catch (error: unknown) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        this.logger.warn(
          `Duplicate event ${eventId} received by ${consumer}. Safely skipping.`,
        );
        return false;
      }
      throw error;
    }
  }
}
