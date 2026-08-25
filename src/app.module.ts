import { OrderModule } from './modules/order/order.module.js';
import { HealthModule } from './modules/health/health.module.js';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { appConfig } from './modules/config/app.config.js';
import { PrismaModule } from './core/database/prisma.module.js';

@Module({
  imports: [
    OrderModule,
    PrismaModule,
    HealthModule,
    ConfigModule.forRoot({
      isGlobal: true,
      load: [appConfig],
      envFilePath: ['.env'],
    }),
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
