#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

JSON_PATH="${JSON_PATH:-${1:-$ROOT_DIR/data/brosmed-products.json}}"

if [[ ! -f "$ROOT_DIR/.env" ]]; then
  echo ".env fayl topilmadi. Avval loyiha .env faylini tayyorlang." >&2
  exit 1
fi

if [[ ! -f "$JSON_PATH" ]]; then
  echo "JSON fayl topilmadi: $JSON_PATH" >&2
  exit 1
fi

echo "[1/4] Postgres va Redis konteynerlari ishga tushirilmoqda..."
docker compose up -d db redis

echo "[2/4] App image build qilinmoqda..."
docker compose build app

echo "[3/4] PostgreSQL tayyor bo'lishi kutilmoqda..."
docker compose exec -T db sh -lc 'until pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB" >/dev/null 2>&1; do sleep 2; done'

echo "[4/4] JSON ma'lumotlar bazaga yozilmoqda..."
docker compose run --rm -T \
  -v "$JSON_PATH":/tmp/brosmed-products.json:ro \
  app \
  node dist/scripts/import-brosmed-json.js \
    --input /tmp/brosmed-products.json

echo "Import yakunlandi."
