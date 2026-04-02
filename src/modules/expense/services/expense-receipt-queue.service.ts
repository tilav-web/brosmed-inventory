import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import { Queue, QueueEvents, Worker } from 'bullmq';

interface ExpenseReceiptCleanupJobData {
  fileKey: string;
}

@Injectable()
export class ExpenseReceiptQueueService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(ExpenseReceiptQueueService.name);
  private queue!: Queue<ExpenseReceiptCleanupJobData>;
  private worker?: Worker<ExpenseReceiptCleanupJobData>;
  private queueEvents?: QueueEvents;

  constructor(private readonly configService: ConfigService) {}

  onModuleInit() {
    const connection = this.getRedisConnection();
    this.queue = new Queue<ExpenseReceiptCleanupJobData>(
      'expense-receipt-cleanup',
      {
        connection,
      },
    );

    this.queueEvents = new QueueEvents('expense-receipt-cleanup', {
      connection,
    });

    this.worker = new Worker<ExpenseReceiptCleanupJobData>(
      'expense-receipt-cleanup',
      async (job) => {
        const absolutePath = join(process.cwd(), 'uploads', job.data.fileKey);
        await rm(absolutePath, { force: true });
        this.logger.log(`Receipt file deleted: ${job.data.fileKey}`);
      },
      { connection },
    );

    this.worker.on('failed', (job, err) => {
      this.logger.error(
        `Receipt cleanup job ${job?.id} xato: ${err?.message}`,
        err?.stack,
      );
    });
  }

  async onModuleDestroy() {
    await Promise.all([
      this.worker?.close(),
      this.queueEvents?.close(),
      this.queue?.close(),
    ]);
  }

  async scheduleCleanup(fileKey: string, delayMs = 60_000) {
    const jobId = this.buildJobId(fileKey);
    const existingJob = await this.queue.getJob(jobId);

    if (existingJob) {
      await existingJob.remove();
    }

    return this.queue.add(
      'delete',
      { fileKey },
      {
        jobId,
        delay: delayMs,
        attempts: 2,
        backoff: { type: 'exponential', delay: 1_000 },
        removeOnComplete: true,
        removeOnFail: 100,
      },
    );
  }

  private buildJobId(fileKey: string) {
    return `cleanup:${fileKey}`;
  }

  private getRedisConnection() {
    const host = this.configService.get<string>('REDIS_HOST', 'redis');
    const port = this.configService.get<number>('REDIS_PORT', 6379);
    const password = this.configService.get<string>('REDIS_PASSWORD');

    return password ? { host, port, password } : { host, port };
  }
}
