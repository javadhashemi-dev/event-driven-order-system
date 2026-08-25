import { Module } from '@nestjs/common';
import { HealthController } from './health.controller.js';
import { HealthService } from './health.service.js';

@Module({
  imports: [],
  controllers: [HealthController],
  providers: [HealthService],
  exports: [],
})
export class HealthModule {}
