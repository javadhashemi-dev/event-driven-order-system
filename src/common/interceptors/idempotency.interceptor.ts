import {
  CallHandler,
  ConflictException,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { Redis } from 'ioredis';
import { Observable, of } from 'rxjs';
import { tap } from 'rxjs/operators';
import { PrismaService } from '../../core/database/prisma.service.js';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  private readonly logger = new Logger(IdempotencyInterceptor.name);
  private readonly redisClient: Redis;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {
    this.redisClient = new Redis({
      host: this.configService.get<string>('redis.host', 'localhost'),
      port: this.configService.get<number>('redis.port', 6379),
      password: this.configService.get<string>('redis.password'),
    });
  }

  async intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Promise<Observable<any>> {
    const request = context.switchToHttp().getRequest();
    const response = context.switchToHttp().getResponse();
    const idempotencyKey = request.headers['idempotency-key'] as string;

    // If no header is supplied, bypass idempotency check
    if (!idempotencyKey) {
      return next.handle();
    }

    // 1. Check if we already completed this request in PostgreSQL
    const cachedRecord = await this.prisma.idempotencyRecord.findUnique({
      where: { key: idempotencyKey },
    });

    if (cachedRecord) {
      this.logger.log(`Idempotency cache hit for key: ${idempotencyKey}`);
      response.status(cachedRecord.statusCode);
      return of(cachedRecord.responsePayload);
    }
    // 2. Fast Lock in Redis to prevent concurrent in-flight requests
    const lockKey = `lock:idempotency:${idempotencyKey}`;
    const acquired = await this.redisClient.set(
      lockKey,
      'locked',
      'EX',
      15,
      'NX',
    );

    if (!acquired) {
      throw new ConflictException(
        'A request with this Idempotency-Key is currently in progress',
      );
    }

    return next.handle().pipe(
      tap(async (responseData) => {
        try {
          // 3. Cache successful response in PostgreSQL
          await this.prisma.idempotencyRecord.create({
            data: {
              key: idempotencyKey,
              statusCode: response.statusCode || 201,
              responsePayload: responseData,
            },
          });
        } catch (err: any) {
          this.logger.error(
            `Failed to save idempotency record: ${err.message}`,
          );
        } finally {
          await this.redisClient.del(lockKey);
        }
      }),
    );
  }
}
