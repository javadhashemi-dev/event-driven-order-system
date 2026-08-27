import { OrderModule } from './modules/order/order.module.js';
import { HealthModule } from './modules/health/health.module.js';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { appConfig } from './modules/config/app.config.js';
import { PrismaModule } from './core/database/prisma.module.js';
import { redisConfig } from './modules/config/redis.config.js';
import { BullModule } from '@nestjs/bullmq';
import { InventoryModule } from './modules/inventory/inventory.module.js';
import { PaymentModule } from './modules/payment/payment.module.js';
import { NotificationModule } from './modules/notification/notification.module.js';
import { OutboxModule } from './modules/outbox/outbox.module.js';
import { ScheduleModule } from '@nestjs/schedule';
import { ConsumerDeduplicationModule } from './common/deduplication/consumer-deduplication.module.js';
import { AdminBullBoardModule } from './modules/admin/bull-board.module.js';
import { DlqModule } from './modules/dlq/dlq.module.js';

@Module({
  imports: [
    DlqModule,
    AdminBullBoardModule,
    ConsumerDeduplicationModule,
    OutboxModule,
    InventoryModule,
    PaymentModule,
    NotificationModule,
    OrderModule,
    PrismaModule,
    HealthModule,
    ScheduleModule.forRoot(),
    ConfigModule.forRoot({
      isGlobal: true,
      load: [appConfig, redisConfig],
      envFilePath: ['.env'],
    }),
    BullModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        defaultJobOptions: {
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 3000,
            jitter: 0.5,
          },
        },
        connection: {
          host: configService.get<string>('redis.host'),
          port: configService.get<number>('redis.port'),
          password: configService.get<string>('redis.password'),
        },
      }),
      inject: [ConfigService],
    }),
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
