import { Injectable } from '@nestjs/common';
import { Bot } from 'grammy';
import { PurchaseOrderService } from 'src/modules/purchase-order/services/purchase-order.service';
import { BotUserService } from 'src/modules/bot-user/services/bot-user.service';
import { Role } from 'src/modules/user/enums/role.enum';

@Injectable()
export class PurchaseOrderCallbackEvent {
  constructor(
    private readonly purchaseOrderService: PurchaseOrderService,
    private readonly botUserService: BotUserService,
  ) {}

  register(bot: Bot) {
    bot.callbackQuery(
      /^purchase_order:(approve|cancel):([0-9a-f-]+)$/,
      async (ctx) => {
        if (!ctx.from) {
          return;
        }

        const botUser = await this.botUserService.findByTelegramId(ctx.from.id);
        if (!botUser || !botUser.is_approved || botUser.role !== Role.ADMIN) {
          await ctx.answerCallbackQuery({
            text: 'Faqat admin tasdiqlashi yoki bekor qilishi mumkin',
            show_alert: true,
          });
          return;
        }

        const action = ctx.match[1] as 'approve' | 'cancel';
        const orderId = ctx.match[2];

        try {
          const order = await this.purchaseOrderService.handleAdminDecisionFromBot(
            orderId,
            action,
            botUser.linked_user_id ?? null,
          );

          await ctx.answerCallbackQuery({
            text:
              action === 'approve'
                ? 'Xarid tasdiqlandi'
                : 'Xarid bekor qilindi',
          });

          await ctx.editMessageText(
            `🛒 <b>Xarid so'rovi yakunlandi</b>\n\n` +
              `📄 Buyurtma: <b>${order.order_number}</b>\n` +
              `📌 Status: <b>${order.status}</b>`,
            { parse_mode: 'HTML' },
          );
        } catch (error) {
          const message =
            error instanceof Error ? error.message : 'Xatolik yuz berdi';
          await ctx.answerCallbackQuery({
            text: message,
            show_alert: true,
          });
        }
      },
    );
  }
}
