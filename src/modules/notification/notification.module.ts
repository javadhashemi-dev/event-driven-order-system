import { Module } from '@nestjs/common';
import { NotificationProcessor } from './notification.processor.js';

@Module({
  imports: [],
  controllers: [],
  providers: [NotificationProcessor],
  exports: [],
})
export class NotificationModule {}
