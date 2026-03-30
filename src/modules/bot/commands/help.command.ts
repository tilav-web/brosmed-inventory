import { Bot, Context } from 'grammy';
import { Injectable } from '@nestjs/common';
import { BotUserService } from 'src/modules/bot-user/services/bot-user.service';
import {
  ACCOUNTANT_MAIN_BUTTONS,
  getMainButtons,
} from '../keyboards/main.keyboard';
import { Role } from 'src/modules/user/enums/role.enum';

@Injectable()
export class HelpCommand {
  constructor(private readonly botUserService: BotUserService) {}

  register(bot: Bot) {
    bot.command('help', async (ctx: Context) => {
      const telegramId = ctx.from?.id;
      const user = telegramId
        ? await this.botUserService.findByTelegramId(telegramId)
        : null;
      const text = this.buildHelpText(user?.role ?? null, {
        isApproved: user?.is_approved ?? false,
        hasLinkedUser: Boolean(user?.linked_user_id),
        isStarted: Boolean(user),
      });

      await ctx.reply(text, { parse_mode: 'HTML' });
    });
  }

  private buildHelpText(
    role: Role | null,
    state: {
      isApproved: boolean;
      hasLinkedUser: boolean;
      isStarted: boolean;
    },
  ) {
    if (!state.isStarted) {
      return (
        `📖 <b>Yordam</b>\n\n` +
        `/start - Botga ulanish uchun so'rov yuborish\n` +
        `/help - Yordam\n\n` +
        `Botdan foydalanish uchun avval /start buyrug'ini bosing.`
      );
    }

    if (!state.isApproved) {
      return (
        `📖 <b>Yordam</b>\n\n` +
        `/start - Holatni tekshirish\n` +
        `/help - Yordam\n\n` +
        `⏳ So'rovingiz hali tasdiqlanmagan. Admin tasdiqlagach, qolgan buyruqlar ishlaydi.`
      );
    }

    if (!role) {
      return (
        `📖 <b>Yordam</b>\n\n` +
        `/start - Holatni tekshirish\n` +
        `/help - Yordam\n\n` +
        `Admin sizga bot role biriktirishi kerak.`
      );
    }

    if (role === Role.WAREHOUSE && !state.hasLinkedUser) {
      return (
        `📖 <b>Yordam</b>\n\n` +
        `/start - Holatni tekshirish\n` +
        `/help - Yordam\n\n` +
        `Warehouse roli berilgan, lekin tizimdagi warehouse user hali bog'lanmagan.`
      );
    }

    if (role === Role.ACCOUNTANT && !state.hasLinkedUser) {
      return (
        `📖 <b>Yordam</b>\n\n` +
        `/start - Holatni tekshirish\n` +
        `/help - Yordam\n\n` +
        `Hisobchi roli berilgan, lekin tizimdagi accountant user hali bog'lanmagan.`
      );
    }

    const buttons = getMainButtons(role);
    const descriptions =
      role === Role.ADMIN
        ? {
            stats: "Umumiy statistika",
            products: 'Mahsulotlar holati',
            expenses: "So'nggi chiqimlar",
            warehouses: "Barcha omborlar ro'yxati",
            alerts: 'Umumiy ogohlantirishlar',
          }
        : role === Role.ACCOUNTANT
          ? {
              stats: 'Xarid statistikasi',
              orders: 'Mening xaridlarim ro`yxati',
            }
        : {
            stats: "Menga biriktirilgan omborlar statistikasi",
            products: "Mening omborlarimdagi mahsulotlar",
            expenses: "Mening omborlarim bo'yicha chiqimlar",
            warehouses: "Menga biriktirilgan omborlar ro'yxati",
            alerts: "Mening omborlarimdagi ogohlantirishlar",
          };

    if (role === Role.ACCOUNTANT) {
      return (
        `📖 <b>Buyruqlar ro'yxati</b>\n\n` +
        `/start - Botni ishga tushirish\n` +
        `/help - Yordam\n` +
        `/orders - ${descriptions.orders}\n` +
        `/stats - ${descriptions.stats}\n` +
        `/settings - Profil va sozlamalar\n\n` +
        `💡 Tugmalar: ${ACCOUNTANT_MAIN_BUTTONS.orders}, ${ACCOUNTANT_MAIN_BUTTONS.stats}, ${ACCOUNTANT_MAIN_BUTTONS.settings}`
      );
    }

    return (
      `📖 <b>Buyruqlar ro'yxati</b>\n\n` +
      `/start - Botni ishga tushirish\n` +
      `/help - Yordam\n` +
      `/stats - ${descriptions.stats}\n` +
      `/products - ${descriptions.products}\n` +
      `/expenses - ${descriptions.expenses}\n` +
      `/settings - Profil va sozlamalar\n` +
      `/warehouses - ${descriptions.warehouses}\n` +
      `/alerts - ${descriptions.alerts}\n\n` +
      `💡 Tugmalar: ${'warehouses' in buttons ? buttons.warehouses : ''}${'stats' in buttons ? `, ${buttons.stats}` : ''}${'products' in buttons ? `, ${buttons.products}` : ''}${'expenses' in buttons ? `, ${buttons.expenses}` : ''}${'alerts' in buttons ? `, ${buttons.alerts}` : ''}${'settings' in buttons ? `, ${buttons.settings}` : ''}`
    );
  }
}
