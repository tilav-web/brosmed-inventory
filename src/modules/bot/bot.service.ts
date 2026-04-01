import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  Bot,
  GrammyError,
  HttpError,
  InlineKeyboard,
  InputFile,
  webhookCallback,
} from 'grammy';
import { Request, Response } from 'express';
import { StartCommand } from './commands/start.command';
import { HelpCommand } from './commands/help.command';
import { WarehousesCommand } from './commands/warehouses.command';
import { AlertsCommand } from './commands/alerts.command';
import { StatsCommand } from './commands/stats.command';
import { ProductsCommand } from './commands/products.command';
import { ExpensesCommand } from './commands/expenses.command';
import { SettingsCommand } from './commands/settings.command';
import { OrdersCommand } from './commands/orders.command';
import { MessageEvent } from './events/message.event';
import { ChatMemberEvent } from './events/chat-member.event';
import { ExpenseCallbackEvent } from './events/expense-callback.event';
import { PurchaseOrderCallbackEvent } from './events/purchase-order-callback.event';
import { AuthMiddleware } from './middleware/auth.middleware';
import { BotUserService } from 'src/modules/bot-user/services/bot-user.service';
import { Role } from 'src/modules/user/enums/role.enum';

@Injectable()
export class BotService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(BotService.name);
  private readonly bot?: Bot;
  private readonly isEnabled: boolean;
  public webhookCallback?: (req: Request, res: Response) => Promise<void>;

  constructor(
    private readonly configService: ConfigService,
    private readonly startCommand: StartCommand,
    private readonly helpCommand: HelpCommand,
    private readonly warehousesCommand: WarehousesCommand,
    private readonly alertsCommand: AlertsCommand,
    private readonly statsCommand: StatsCommand,
    private readonly productsCommand: ProductsCommand,
    private readonly expensesCommand: ExpensesCommand,
    private readonly settingsCommand: SettingsCommand,
    private readonly ordersCommand: OrdersCommand,
    private readonly messageEvent: MessageEvent,
    private readonly chatMemberEvent: ChatMemberEvent,
    private readonly expenseCallbackEvent: ExpenseCallbackEvent,
    private readonly purchaseOrderCallbackEvent: PurchaseOrderCallbackEvent,
    private readonly authMiddleware: AuthMiddleware,
    private readonly botUserService: BotUserService,
  ) {
    const token = this.configService.get<string>('TELEGRAM_BOT_TOKEN');
    if (!token) {
      this.isEnabled = false;
      this.logger.warn(
        'TELEGRAM_BOT_TOKEN topilmadi. Bot funksiyalari o‘chirildi, backend ishlashda davom etadi.',
      );
      return;
    }

    this.isEnabled = true;
    this.bot = new Bot(token);
    this.setupHandlers();
  }

  async onModuleInit() {
    if (!this.isEnabled || !this.bot) {
      return;
    }

    const botMode = this.configService.get<string>('BOT_MODE', 'polling');

    if (botMode === 'polling') {
      this.logger.log('Bot polling mode da ishga tushmoqda...');

      try {
        await this.bot.api.deleteWebhook({ drop_pending_updates: true });
        const me = await this.bot.api.getMe();
        this.logger.log(`🤖 Bot: @${me.username}`);
        void this.bot.start({
          onStart: () => this.logger.log('✅ Polling boshlandi!'),
          allowed_updates: ['message', 'callback_query', 'my_chat_member'],
        });
      } catch (error) {
        this.logger.error('Bot polling mode da ishga tushmadi:', error);
      }
    } else if (botMode === 'webhook') {
      this.logger.log('Bot webhook mode da ishga tushmoqda...');

      this.webhookCallback = webhookCallback(this.bot, 'express');

      const webhookUrl = this.configService.get<string>('BOT_WEBHOOK_URL');
      if (!webhookUrl) {
        throw new Error('BOT_WEBHOOK_URL is not defined!');
      }

      try {
        const webhookSecret =
          this.configService.get<string>('BOT_WEBHOOK_SECRET')?.trim() ||
          undefined;
        await this.bot.api.setWebhook(webhookUrl, {
          drop_pending_updates: true,
          secret_token: webhookSecret,
        });
        this.logger.log(`Webhook o'rnatildi: ${webhookUrl}`);
      } catch (error) {
        this.logger.error("Webhook o'rnatishda xatolik:", error);
      }
    } else {
      this.logger.warn(
        `Noto'g'ri BOT_MODE: ${botMode}. "polling" yoki "webhook" bo'lishi kerak.`,
      );
    }
  }

  private setupHandlers() {
    if (!this.bot) {
      return;
    }

    // 1. Start command - auth talab qilmaydi
    this.startCommand.register(this.bot);
    this.helpCommand.register(this.bot);

    // 2. Chat member event - bloklash/blokdan chiqarish
    this.chatMemberEvent.register(this.bot);

    // 3. Auth middleware - keyingi barcha handlerlar uchun
    this.authMiddleware.register(this.bot);

    // 4. Qolgan command va event lar - auth kerak
    this.warehousesCommand.register(this.bot);
    this.alertsCommand.register(this.bot);
    this.statsCommand.register(this.bot);
    this.productsCommand.register(this.bot);
    this.expensesCommand.register(this.bot);
    this.settingsCommand.register(this.bot);
    this.ordersCommand.register(this.bot);
    this.messageEvent.register(this.bot);
    this.expenseCallbackEvent.register(this.bot);
    this.purchaseOrderCallbackEvent.register(this.bot);

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
        this.logger.error(`Grammy xato [${error.error_code}]:`, error.message);
        return;
      }

      if (error instanceof HttpError) {
        this.logger.error('Telegram API xatosi:', error.message);
        return;
      }

      this.logger.error('Bot xatosi:', error);
    });
  }

  getBot(): Bot | null {
    return this.bot ?? null;
  }

  isWebhookSecretValid(req: Request): boolean {
    const webhookSecret =
      this.configService.get<string>('BOT_WEBHOOK_SECRET')?.trim() || null;

    if (!webhookSecret) {
      return true;
    }

    return req.header('x-telegram-bot-api-secret-token') === webhookSecret;
  }

  async sendMessage(
    telegramId: number,
    text: string,
    options?: { reply_markup?: InlineKeyboard },
  ): Promise<boolean> {
    if (!this.bot) {
      return false;
    }

    try {
      await this.bot.api.sendMessage(telegramId, text, {
        parse_mode: 'HTML',
        ...options,
      });
      return true;
    } catch (error) {
      if (error instanceof GrammyError && error.error_code === 403) {
        await this.botUserService.markAsBlocked(telegramId);
      }
      return false;
    }
  }

  async sendToApprovedUsers(
    text: string,
    role?: Role,
    options?: { reply_markup?: InlineKeyboard },
  ): Promise<number> {
    if (!this.bot) {
      return 0;
    }

    const users = await this.botUserService.getApprovedUsers(role);
    let sent = 0;

    for (const user of users) {
      const success = await this.sendMessage(user.telegram_id, text, options);
      if (success) sent++;
    }

    return sent;
  }

  async sendDocument(
    telegramId: number,
    buffer: Buffer,
    filename: string,
    caption?: string,
  ): Promise<boolean> {
    if (!this.bot) {
      return false;
    }

    try {
      await this.bot.api.sendDocument(
        telegramId,
        new InputFile(buffer, filename),
        {
          caption,
          parse_mode: 'HTML',
        },
      );
      return true;
    } catch (error) {
      if (error instanceof GrammyError && error.error_code === 403) {
        await this.botUserService.markAsBlocked(telegramId);
      }
      return false;
    }
  }

  async sendDocumentToApprovedUsers(
    buffer: Buffer,
    filename: string,
    caption?: string,
    role: Role = Role.ADMIN,
  ): Promise<number> {
    if (!this.bot) {
      return 0;
    }

    const users = await this.botUserService.getApprovedUsers(role);
    let sent = 0;

    for (const user of users) {
      const success = await this.sendDocument(
        user.telegram_id,
        buffer,
        filename,
        caption,
      );
      if (success) sent++;
    }

    return sent;
  }

  async onModuleDestroy() {
    if (!this.isEnabled || !this.bot) {
      return;
    }

    const botMode = this.configService.get<string>('BOT_MODE', 'polling');

    if (botMode === 'polling') {
      try {
        await this.bot.stop();
        this.logger.log("Bot to'xtatildi.");
      } catch (error) {
        this.logger.error("Botni to'xtatishda xatolik:", error);
      }
    }
  }
}
