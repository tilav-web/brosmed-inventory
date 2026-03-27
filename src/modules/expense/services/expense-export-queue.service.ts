import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Job, Queue, QueueEvents, Worker } from 'bullmq';
import { BotService } from 'src/modules/bot/bot.service';
import { ExpenseExportService } from './expense-export.service';
import { ListExpenseItemsQueryDto } from '../dto/list-expense-items-query.dto';

export interface ExpenseExportJobData {
  query: ListExpenseItemsQueryDto;
  filename?: string;
  caption?: string;
}

@Injectable()
export class ExpenseExportQueueService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(ExpenseExportQueueService.name);
  private queue!: Queue<ExpenseExportJobData>;
  private worker?: Worker<ExpenseExportJobData>;
  private queueEvents?: QueueEvents;

  constructor(
    private readonly configService: ConfigService,
    private readonly exportService: ExpenseExportService,
    private readonly botService: BotService,
  ) {}

  onModuleInit() {
    const connection = this.getRedisConnection();
    this.queue = new Queue<ExpenseExportJobData>('expense-export', {
      connection,
    });

    this.queueEvents = new QueueEvents('expense-export', { connection });

    this.worker = new Worker<ExpenseExportJobData>(
      'expense-export',
      async (job: Job<ExpenseExportJobData>) => {
        const buffer = await this.exportService.buildExcelBuffer(
          job.data.query,
        );
        const filename =
          job.data.filename ?? this.buildDefaultFilename('expenses');
        const caption = job.data.caption ?? 'Expense export tayyor bo`ldi';

        const sent = await this.botService.sendDocumentToApprovedUsers(
          buffer,
          filename,
          caption,
        );

        this.logger.log(
          `Export job ${job.id} yakunlandi. Yuborildi: ${sent} user.`,
        );
      },
      { connection },
    );

    this.worker.on('failed', (job, err) => {
      this.logger.error(
        `Export job ${job?.id} xato: ${err?.message}`,
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

  async enqueueExportJob(data: ExpenseExportJobData) {
    return this.queue.add('create', data, {
      attempts: 2,
      backoff: { type: 'exponential', delay: 2_000 },
      removeOnComplete: true,
      removeOnFail: 100,
    });
  }

  private getRedisConnection() {
    const host = this.configService.get<string>('REDIS_HOST', 'redis');
    const port = this.configService.get<number>('REDIS_PORT', 6379);
    const password = this.configService.get<string>('REDIS_PASSWORD');

    return password ? { host, port, password } : { host, port };
  }

  private buildDefaultFilename(prefix: string) {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    return `${prefix}_${year}${month}${day}_${hours}${minutes}${seconds}.xlsx`;
  }
}
