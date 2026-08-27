import { Global, Module } from '@nestjs/common';
import { ConsumerDeduplicationService } from './consumer-deduplication.service.js';

@Global()
@Module({
  imports: [],
  controllers: [],
  providers: [ConsumerDeduplicationService],
  exports: [ConsumerDeduplicationService],
})
export class ConsumerDeduplicationModule {}
