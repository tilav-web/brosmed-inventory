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
    bot.callbackQuery(/^expense:(cancel):([0-9a-f-]+)$/, async (ctx) => {
      if (!ctx.from) {
        return;
      }

      const botUser = await this.botUserService.findByTelegramId(ctx.from.id);
      if (!botUser || !botUser.is_approved || botUser.role !== Role.ADMIN) {
        await ctx.answerCallbackQuery({
          text: 'Faqat admin bu chiqimni bekor qilishi mumkin',
          show_alert: true,
        });
        return;
      }

      const expenseId = ctx.match[2];

      try {
        const linkedUserId = botUser.linked_user_id;
        if (!linkedUserId) {
          await ctx.answerCallbackQuery({
            text: "Foydalanuvchi bog'lanmagan",
            show_alert: true,
          });
          return;
        }

        const result = await this.expenseService.cancelExpense(expenseId, {
          id: linkedUserId,
          role: Role.ADMIN,
        } as any);

        await ctx.answerCallbackQuery({
          text: 'Chiqim bekor qilindi',
        });

        await ctx.editMessageText(
          `❌ <b>Chiqim bekor qilindi</b>\n\n` +
            `📄 Hujjat: <b>${result.expense.expense_number}</b>\n` +
            `📌 Status: <b>${result.expense.status}</b>`,
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
    });
  }
}
