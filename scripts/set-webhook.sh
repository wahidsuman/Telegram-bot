#!/usr/bin/env bash
set -euo pipefail

# Usage:
# TELEGRAM_BOT_TOKEN=xxx \
# WEBHOOK_URL=https://<worker>.workers.dev/webhook \
# WEBHOOK_SECRET=xyz \
# ./scripts/set-webhook.sh

if [[ -z "${TELEGRAM_BOT_TOKEN:-}" ]]; then
  echo "TELEGRAM_BOT_TOKEN is required" >&2
  exit 1
fi

if [[ -z "${WEBHOOK_URL:-}" ]]; then
  echo "WEBHOOK_URL is required" >&2
  exit 1
fi

if [[ -z "${WEBHOOK_SECRET:-}" ]]; then
  echo "WEBHOOK_SECRET is required" >&2
  exit 1
fi

curl -sS -X POST \
  "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/setWebhook" \
  -H 'Content-Type: application/json' \
  -d "{\"url\":\"${WEBHOOK_URL}\",\"secret_token\":\"${WEBHOOK_SECRET}\"}"

echo "Webhook set to ${WEBHOOK_URL} with secret token."

#!/usr/bin/env bash
set -euo pipefail

# Usage:
# TELEGRAM_BOT_TOKEN=xxx \
# WEBHOOK_URL=https://<worker>.workers.dev/webhook \
# WEBHOOK_SECRET=xyz \
# ./scripts/set-webhook.sh

if [[ -z "${TELEGRAM_BOT_TOKEN:-}" ]]; then
  echo "TELEGRAM_BOT_TOKEN is required" >&2
  exit 1
fi

if [[ -z "${WEBHOOK_URL:-}" ]]; then
  echo "WEBHOOK_URL is required" >&2
  exit 1
fi

if [[ -z "${WEBHOOK_SECRET:-}" ]]; then
  echo "WEBHOOK_SECRET is required" >&2
  exit 1
fi

curl -sS -X POST \
  "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/setWebhook" \
  -H 'Content-Type: application/json' \
  -d "{\"url\":\"${WEBHOOK_URL}\",\"secret_token\":\"${WEBHOOK_SECRET}\"}"

echo "Webhook set to ${WEBHOOK_URL} with secret token."

