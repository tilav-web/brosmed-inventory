# Brosmed Sklad — Inventory Backend

Brosmed kompaniyasining ombor (sklad) boshqaruvi tizimi backendi. Mahsulotlar, qoldiqlar, kirim/chiqimlar va hisobotlarni boshqarish uchun REST API. Telegram bot integratsiyasi orqali tezkor bildirishnomalar va boshqaruv ham mavjud.

## Texnologiyalar

- **Framework:** NestJS 11 (Node.js, TypeScript)
- **Ma'lumotlar bazasi:** PostgreSQL + TypeORM (migratsiyalar bilan)
- **Cache / Queue:** Redis (ioredis) + BullMQ
- **Autentifikatsiya:** JWT (access + refresh) + Passport
- **Hujjatlar:** PDFKit (PDF), ExcelJS (xlsx hisobotlar)
- **Telegram Bot:** Grammy (polling yoki webhook)
- **API hujjati:** Swagger (`/api`)

## Loyihani ishga tushirish

```bash
# 1. Bog'liqliklarni o'rnatish
npm install

# 2. .env faylini sozlash (DB, JWT, Redis, Telegram bot tokeni)

# 3. Migratsiyalarni ishga tushirish (production'da)
npm run migration:run

# 4. Development rejimda
npm run start:dev

# 5. Production
npm run build
npm run start:prod
```

## Telegram Bot

Bot uchun zarur env'lar:

```bash
TELEGRAM_BOT_TOKEN=your-telegram-bot-token-here
BOT_MODE=polling                # yoki webhook
BOT_WEBHOOK_URL=https://example.com/bot/webhook
BOT_WEBHOOK_SECRET=random-secret-token
```

- `BOT_MODE=polling` — bot server ichida polling bilan ishlaydi
- `BOT_MODE=webhook` — Telegram `POST /bot/webhook` endpointiga yuboradi

## Auth

Token muddati `JWT_ACCESS_EXPIRES_IN` (yoki fallback `JWT_EXPIRES_IN`) bilan boshqariladi.

Frontend va API turli originlarda bo'lsa, refresh cookie uchun:

```bash
AUTH_REFRESH_COOKIE_SAME_SITE=none
```

## Migratsiyalar

```bash
DB_RUN_MIGRATIONS=true     # production
DB_SYNCHRONIZE=false       # production
```

Development'da odatda `DB_SYNCHRONIZE=true` va `DB_RUN_MIGRATIONS=false`.

## Foydali skriptlar

```bash
npm run lint                  # ESLint tekshiruvi
npm run migration:generate    # Auto migratsiya yaratish
npm run migration:create      # Bo'sh migratsiya yaratish
npm run migration:revert      # Oxirgi migratsiyani bekor qilish
```

---

**Tilovov Shavqiddin**
