import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Bot, GrammyError, HttpError } from 'grammy';
import { StartCommand } from './commands/start.command';
import { HelpCommand } from './commands/help.command';
import { WarehousesCommand } from './commands/warehouses.command';
import { AlertsCommand } from './commands/alerts.command';
import { MessageEvent } from './events/message.event';
import { BotUserService } from 'src/modules/bot-user/services/bot-user.service';

@Injectable()
export class BotService implements OnModuleInit {
  private readonly logger = new Logger(BotService.name);
  private bot: Bot;

  constructor(
    private readonly configService: ConfigService,
    private readonly startCommand: StartCommand,
    private readonly helpCommand: HelpCommand,
    private readonly warehousesCommand: WarehousesCommand,
    private readonly alertsCommand: AlertsCommand,
    private readonly messageEvent: MessageEvent,
    private readonly botUserService: BotUserService,
  ) {}

  async onModuleInit() {
    const token = this.configService.get<string>('TELEGRAM_BOT_TOKEN');

    if (!token) {
      this.logger.warn('TELEGRAM_BOT_TOKEN topilmadi. Bot ishga tushmaydi.');
      return;
    }

    this.bot = new Bot(token);

    this.registerCommands();
    this.registerEvents();

    this.bot.catch(async (err) => {
      const ctx = err.ctx;
      const error = err.error;

      if (error instanceof GrammyError) {
        if (error.error_code === 403) {
          const telegramId = ctx.from?.id;
          if (telegramId) {
            await this.botUserService.markAsBlocked(telegramId);
            this.logger.warn(
              `User ${telegramId} botni blokladi. Status: blocked`,
            );
          }
          return;
        }
      }

      if (error instanceof HttpError) {
        this.logger.error('Telegram API xatosi:', error.message);
        return;
      }

      this.logger.error('Bot xatosi:', error);
    });

    this.bot.start({
      onStart: () => this.logger.log('🤖 Telegram bot ishga tushdi!'),
    });
  }

  private registerCommands() {
    this.bot.command('start', (ctx) => this.startCommand.handle(ctx));
    this.bot.command('help', (ctx) => this.helpCommand.handle(ctx));
    this.bot.command('warehouses', (ctx) => this.warehousesCommand.handle(ctx));
    this.bot.command('alerts', (ctx) => this.alertsCommand.handle(ctx));
  }

  private registerEvents() {
    this.bot.on('message:text', (ctx) => this.messageEvent.handle(ctx));
  }

  getBot(): Bot {
    return this.bot;
  }

  async sendMessage(telegramId: number, text: string): Promise<boolean> {
    try {
      await this.bot.api.sendMessage(telegramId, text, {
        parse_mode: 'HTML',
      });
      return true;
    } catch (error) {
      if (error instanceof GrammyError && error.error_code === 403) {
        await this.botUserService.markAsBlocked(telegramId);
      }
      return false;
    }
  }

  async sendToApprovedUsers(text: string): Promise<number> {
    const users = await this.botUserService.getApprovedUsers();
    let sent = 0;

    for (const user of users) {
      const success = await this.sendMessage(user.telegram_id, text);
      if (success) sent++;
    }

    return sent;
  }
}
