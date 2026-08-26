import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../core/database/prisma.service.js';
import { ConfigService } from '@nestjs/config';
import { Redis } from 'ioredis';

@Injectable()
export class HealthService {
  private readonly logger = new Logger(HealthService.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}
  async check() {
    const [postgres, redis] = await Promise.all([
      this.checkPostgres(),
      this.checkRedis(),
    ]);
    return {
      status:
        postgres.status === 'up' && redis.status === 'up' ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      postgres,
      redis,
    };
  }

  private async checkPostgres() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { status: 'up' as const };
    } catch (error) {
      this.logger.error('PostgreSQL health check failed', error);
      return { status: 'down' as const, error: (error as Error).message };
    }
  }

  private async checkRedis() {
    const redis = new Redis({
      host: this.config.get<string>('redis.host'),
      port: this.config.get<number>('redis.port'),
      password: this.config.get<string>('redis.password'),
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      retryStrategy: () => null,
    });
    try {
      const pong = await redis.ping();
      return { status: 'up' as const, ping: pong };
    } catch (error) {
      this.logger.error('Redis health check failed', error);
      return { status: 'down' as const, error: (error as Error).message };
    } finally {
      redis.disconnect();
    }
  }
}
