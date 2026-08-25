import { OrderModule } from './modules/order/order.module.js';
import { HealthModule } from './modules/health/health.module.js';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { appConfig } from './modules/config/app.config.js';
import { PrismaModule } from './core/database/prisma.module.js';
import { redisConfig } from './modules/config/redis.config.js';
import { BullModule } from '@nestjs/bullmq';

@Module({
  imports: [
    OrderModule,
    PrismaModule,
    HealthModule,
    ConfigModule.forRoot({
      isGlobal: true,
      load: [appConfig, redisConfig],
      envFilePath: ['.env'],
    }),
    BullModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
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
