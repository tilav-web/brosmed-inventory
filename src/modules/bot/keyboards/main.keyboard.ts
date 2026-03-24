import { Keyboard } from 'grammy';

export function mainKeyboard() {
  return new Keyboard()
    .text('📦 Omborlar')
    .text('📊 Statistika')
    .row()
    .text('💊 Mahsulotlar')
    .text('📋 Chiqimlar')
    .row()
    .text('🔔 Ogohlantirishlar')
    .text('⚙️ Sozlamalar')
    .resized()
    .persistent();
}
