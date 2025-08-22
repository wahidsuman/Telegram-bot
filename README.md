# Telegram MCQ Bot - Cloudflare Workers

A Telegram bot built on Cloudflare Workers that posts hourly MCQs, handles coupon distribution, and provides admin analytics using KV storage.

## Features

- 🧠 **Hourly MCQ Posting**: Automatically posts multiple choice questions to a Telegram group
- 📊 **Analytics**: Daily and monthly reports with user statistics and accuracy metrics
- 🎫 **Coupon System**: Distributes discount coupons and handles bargain requests
- 👨‍💼 **Admin Panel**: Upload questions, view reports, and manage the bot
- 🔒 **Secure**: Webhook validation and admin-only access controls

## Setup Instructions

### 1. Create KV Namespace

```bash
npx wrangler kv namespace create STATE
```

Copy the ID from the output and paste it in `wrangler.toml` under the `id` field for the STATE binding.

### 2. Set Environment Variables (Secrets)

```bash
npx wrangler secret put TELEGRAM_BOT_TOKEN
npx wrangler secret put TARGET_GROUP_ID
npx wrangler secret put ADMIN_CHAT_ID
npx wrangler secret put WEBHOOK_SECRET
```

**Required Values:**
- `TELEGRAM_BOT_TOKEN`: Your bot token from @BotFather
- `TARGET_GROUP_ID`: Group chat ID where MCQs will be posted (negative number)
- `ADMIN_CHAT_ID`: Your user ID for admin access
- `WEBHOOK_SECRET`: Random string for webhook security

### 3. Deploy the Worker

```bash
npx wrangler deploy
```

### 4. Set Telegram Webhook

Replace `<your-worker>` with your worker subdomain:

```bash
curl -X POST "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/setWebhook" \
  -H "Content-Type: application/json" \
  -d "{\"url\":\"https://<your-worker>.workers.dev/webhook\",\"secret_token\":\"$WEBHOOK_SECRET\"}"
```

### 5. Add Bot to Group

1. Add your bot as an admin to the target Telegram group
2. Get the group chat ID (negative number) and use it as `TARGET_GROUP_ID`

### 6. Test the Setup

Force an immediate MCQ post for testing:

```bash
curl https://<your-worker>.workers.dev/tick
```

## Bot Usage

### For Group Members
- MCQs are posted hourly with A/B/C/D buttons
- Tap an option to see if you're correct with explanation
- Each answer shows: "to get extra discount on prepladder text me"

### For Private Messages (Non-Admin)
- Bot responds with coupon options: "Get Code" and "Bargain"
- **Get Code**: Sends coupon "P650" and notifies admin
- **Bargain**: Shows waiting message and notifies admin with user details

### For Admin
- Send `/start` to access admin panel
- **Upload Questions**: Send JSON file with question array or JSONL format
- **Daily Report**: Get today's stats with top users
- **Monthly Report**: Get current month's stats

## Question Format

Upload questions as JSON array or JSONL:

```json
{
  "question": "Causative organism of typhoid fever is?",
  "options": {
    "A": "Salmonella typhi",
    "B": "Shigella", 
    "C": "E. coli",
    "D": "Vibrio cholerae"
  },
  "answer": "A",
  "explanation": "Typhoid fever is caused by Salmonella enterica serotype Typhi."
}
```

## API Endpoints

- `POST /webhook` - Telegram webhook handler
- `GET /tick` - Force immediate MCQ post (for testing)
- `GET /health` - Health check

## Data Storage (KV Keys)

- `questions` - Array of all questions
- `idx:{chat_id}` - Next question index
- `stats:daily:{YYYY-MM-DD}` - Daily statistics
- `stats:monthly:{YYYY-MM}` - Monthly statistics

## Security Features

- ✅ Webhook secret validation
- ✅ Admin-only access controls
- ✅ Input validation and sanitization
- ✅ Error handling without crashes

## Technical Stack

- **Runtime**: Cloudflare Workers (V8 JavaScript)
- **Language**: TypeScript
- **Storage**: Cloudflare KV (Key-Value)
- **Scheduling**: Cloudflare Cron Triggers
- **API**: Telegram Bot API
