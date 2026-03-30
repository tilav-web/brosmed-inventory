import { Injectable } from '@nestjs/common';
import { Bot } from 'grammy';
import { ExpenseService } from 'src/modules/expense/services/expense.service';
import { BotUserService } from 'src/modules/bot-user/services/bot-user.service';
import { Role } from 'src/modules/user/enums/role.enum';

@Injectable()
export class ExpenseCallbackEvent {
  constructor(
    private readonly expenseService: ExpenseService,
    private readonly botUserService: BotUserService,
  ) {}

  register(bot: Bot) {
    bot.callbackQuery(
      /^expense_request:(approve|cancel):([0-9a-f-]+)$/,
      async (ctx) => {
        if (!ctx.from) {
          return;
        }

        const botUser = await this.botUserService.findByTelegramId(ctx.from.id);
        if (!botUser || !botUser.is_approved || botUser.role !== Role.ADMIN) {
          await ctx.answerCallbackQuery({
            text: 'Faqat admin bu chiqimni tasdiqlashi yoki bekor qilishi mumkin',
            show_alert: true,
          });
          return;
        }

        const action = ctx.match[1] as 'approve' | 'cancel';
        const expenseId = ctx.match[2];

        try {
          const expense =
            await this.expenseService.handleAdminRequestDecisionFromBot(
              expenseId,
              action,
              botUser.linked_user_id ?? null,
            );

          await ctx.answerCallbackQuery({
            text:
              action === 'approve'
                ? 'Chiqim so‘rovi tasdiqlandi'
                : 'Chiqim so‘rovi bekor qilindi',
          });

          await ctx.editMessageText(
            `📋 <b>Chiqim so'rovi yakunlandi</b>\n\n` +
              `📄 Hujjat: <b>${expense.expense_number}</b>\n` +
              `📌 Status: <b>${expense.status}</b>`,
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

    bot.callbackQuery(
      /^expense_final:(confirm|revision):([0-9a-f-]+)$/,
      async (ctx) => {
        if (!ctx.from) {
          return;
        }

        const botUser = await this.botUserService.findByTelegramId(ctx.from.id);
        if (!botUser || !botUser.is_approved || botUser.role !== Role.ADMIN) {
          await ctx.answerCallbackQuery({
            text: 'Faqat admin yakuniy tasdiqlashni amalga oshira oladi',
            show_alert: true,
          });
          return;
        }

        const action = ctx.match[1] as 'confirm' | 'revision';
        const expenseId = ctx.match[2];

        try {
          const expense =
            action === 'confirm'
              ? await this.expenseService.handleFinalConfirmationFromBot(
                  expenseId,
                  botUser.linked_user_id ?? null,
                )
              : await this.expenseService.handleRevisionRequestFromBot(
                  expenseId,
                  botUser.linked_user_id ?? null,
                );

          await ctx.answerCallbackQuery({
            text:
              action === 'confirm'
                ? 'Chiqim yakuniy tasdiqlandi'
                : "Chiqim qayta ko'rib chiqishga yuborildi",
          });

          await ctx.editMessageText(
            `📷 <b>${
              action === 'confirm'
                ? 'Chiqim yakuniy tasdiqlandi'
                : "Chiqim qayta ko'rib chiqishga yuborildi"
            }</b>\n\n` +
              `📄 Hujjat: <b>${expense.expense_number}</b>\n` +
              `📌 Status: <b>${expense.status}</b>${
                expense.revision_reason
                  ? `\n📝 Sabab: <b>${this.escapeHtml(expense.revision_reason)}</b>`
                  : ''
              }`,
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

  private escapeHtml(value: string) {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
}
