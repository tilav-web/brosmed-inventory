import { Keyboard } from 'grammy';
import { Role } from 'src/modules/user/enums/role.enum';

export type MainAction =
  | 'warehouses'
  | 'stats'
  | 'products'
  | 'expenses'
  | 'alerts'
  | 'settings'
  | 'orders';

export const ADMIN_MAIN_BUTTONS = {
  warehouses: '📦 Omborlar',
  stats: '📊 Statistika',
  products: '💊 Mahsulotlar',
  expenses: '📋 Chiqimlar',
  alerts: '🔔 Ogohlantirishlar',
  settings: '⚙️ Sozlamalar',
} as const;

export const WAREHOUSE_MAIN_BUTTONS = {
  warehouses: '📦 Mening omborlarim',
  stats: '📊 Mening statistikam',
  products: '💊 Mening mahsulotlarim',
  expenses: '📋 Mening chiqimlarim',
  alerts: '🔔 Mening ogohlantirishlarim',
  settings: '⚙️ Sozlamalar',
} as const;

export const ACCOUNTANT_MAIN_BUTTONS = {
  orders: '🛒 Xaridlar',
  stats: '📊 Xarid statistikasi',
  settings: '⚙️ Sozlamalar',
} as const;

export function getMainButtons(role: Role) {
  switch (role) {
    case Role.ADMIN:
      return ADMIN_MAIN_BUTTONS;
    case Role.WAREHOUSE:
      return WAREHOUSE_MAIN_BUTTONS;
    case Role.ACCOUNTANT:
      return ACCOUNTANT_MAIN_BUTTONS;
  }
}

export function resolveMainAction(text: string): MainAction | null {
  const buttonGroups = [
    ADMIN_MAIN_BUTTONS,
    WAREHOUSE_MAIN_BUTTONS,
    ACCOUNTANT_MAIN_BUTTONS,
  ];

  for (const group of buttonGroups) {
    const action = (
      Object.entries(group) as Array<[MainAction, string]>
    ).find(([, label]) => label === text)?.[0];

    if (action) {
      return action;
    }
  }

  return null;
}

export function mainKeyboard(role: Role) {
  const keyboard = new Keyboard();

  switch (role) {
    case Role.ADMIN: {
      const buttons = ADMIN_MAIN_BUTTONS;
      return keyboard
        .text(buttons.warehouses)
        .text(buttons.stats)
        .row()
        .text(buttons.products)
        .text(buttons.expenses)
        .row()
        .text(buttons.alerts)
        .text(buttons.settings)
        .resized()
        .persistent();
    }

    case Role.WAREHOUSE: {
      const buttons = WAREHOUSE_MAIN_BUTTONS;
      return keyboard
        .text(buttons.warehouses)
        .text(buttons.stats)
        .row()
        .text(buttons.products)
        .text(buttons.expenses)
        .row()
        .text(buttons.alerts)
        .text(buttons.settings)
        .resized()
        .persistent();
    }

    case Role.ACCOUNTANT: {
      const buttons = ACCOUNTANT_MAIN_BUTTONS;
      return keyboard
        .text(buttons.orders)
        .text(buttons.stats)
        .row()
        .text(buttons.settings)
        .resized()
        .persistent();
    }
  }
}
