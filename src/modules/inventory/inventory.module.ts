import { Module } from '@nestjs/common';
import { InventoryProcessor } from './inventory.processor.js';

@Module({
  imports: [],
  controllers: [],
  providers: [InventoryProcessor],
  exports: [],
})
export class InventoryModule {}
