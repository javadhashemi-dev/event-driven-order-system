import { Controller, Get, Param, Post } from '@nestjs/common';
import { DlqService } from './dlq.service.js';

@Controller('admin/dlq')
export class DlqController {
  constructor(private readonly dlqService: DlqService) {}
  @Get('jobs')
  listFailedJobs() {
    return this.dlqService.listFailedJobs();
  }

  @Post('replay/:jobId')
  replayJob(@Param('jobId') jobId: string) {
    return this.dlqService.replay(jobId);
  }
}
