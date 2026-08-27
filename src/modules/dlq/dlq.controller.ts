import { InjectQueue } from '@nestjs/bullmq';
import {
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
} from '@nestjs/common';
import { Queue } from 'bullmq';
import { QUEUES } from '../../common/events/saga.events.js';
import { DeadLetterJobData, DlqService } from './dlq.service.js';

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
    // const jobs = await this.dlq.getJobs();
    // const job = jobs.find((job) => {
    //   return job.data.originalJobId === jobId;
    // });
    // console.log(job);
    // if (!job) {
    //   throw new NotFoundException(`DLQ Job ${jobId} not found`);
    // }

    // const { originalQueue, jobName } = job.data as DeadLetterJobData;

    // // Remove from DLQ and re-enqueue to the original queue
    // await job.remove();
    // return { replayed: true, originalQueue, jobName };
  }
}
