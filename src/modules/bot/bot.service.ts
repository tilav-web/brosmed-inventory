import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Bot } from 'grammy';
import { StartCommand } from './commands/start.command';
import { HelpCommand } from './commands/help.command';
import { WarehousesCommand } from './commands/warehouses.command';
import { AlertsCommand } from './commands/alerts.command';
import { MessageEvent } from './events/message.event';

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

    this.bot.catch((err) => {
      this.logger.error('Bot xatosi:', err);
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
}
