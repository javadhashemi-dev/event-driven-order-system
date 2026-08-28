import { Module } from '@nestjs/common';
import { InventoryProcessor } from './inventory.processor.js';
import { makeHistogramProvider } from '@willsoto/nestjs-prometheus';

@Module({
  imports: [],
  controllers: [],
  providers: [
    InventoryProcessor,
    makeHistogramProvider({
      name: 'inventory_reserve_duration_seconds',
      help: 'Time spent reserving inventory stock',
      labelNames: ['result'],
      buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2, 5],
    }),
  ],
  exports: [],
})
export class InventoryModule {}
