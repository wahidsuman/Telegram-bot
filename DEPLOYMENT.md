# Deployment Guide

## 🚀 Ready to Deploy!

Your Telegram MCQ Bot is fully configured and ready for deployment. Follow these steps:

## Step 1: Authenticate with Cloudflare

Choose one of these authentication methods:

### Option A: OAuth Login (Recommended)
```bash
npx wrangler login
```
This will open a browser window for authentication.

### Option B: API Token
If you prefer using an API token:
1. Go to [Cloudflare Dashboard](https://dash.cloudflare.com/profile/api-tokens)
2. Create a token with these permissions:
   - Account: Cloudflare Workers:Edit
   - Zone: Zone:Read (if using custom domains)
3. Set the token:
```bash
export CLOUDFLARE_API_TOKEN=your_token_here
```

## Step 2: Deploy the Worker

```bash
npx wrangler deploy
```

## Step 3: Set Required Secrets

After deployment, set these environment variables:

```bash
npx wrangler secret put TELEGRAM_BOT_TOKEN
npx wrangler secret put TARGET_GROUP_ID  
npx wrangler secret put ADMIN_CHAT_ID
npx wrangler secret put WEBHOOK_SECRET
```

**Required Values:**
- `TELEGRAM_BOT_TOKEN`: Get from [@BotFather](https://t.me/BotFather)
- `TARGET_GROUP_ID`: Your group chat ID (negative number, e.g., -1001234567890)
- `ADMIN_CHAT_ID`: Your personal user ID (positive number)
- `WEBHOOK_SECRET`: Random secure string (e.g., use `openssl rand -hex 32`)

## Step 4: Set Telegram Webhook

Replace `<your-worker>` with your actual worker subdomain:

```bash
curl -X POST "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/setWebhook" \
  -H "Content-Type: application/json" \
  -d "{\"url\":\"https://<your-worker>.workers.dev/webhook\",\"secret_token\":\"$WEBHOOK_SECRET\"}"
```

## Step 5: Test the Bot

1. **Health Check:**
```bash
curl https://<your-worker>.workers.dev/health
```

2. **Force MCQ Post:**
```bash
curl https://<your-worker>.workers.dev/tick
```

3. **Test Admin Panel:**
   - Send `/start` to your bot privately
   - You should see the new admin panel with all features

## ✨ New Features Available After Deployment

### 📚 Question Management
- View all questions with pagination
- Delete specific questions by number
- Enhanced upload with detailed statistics

### 📢 Send to Group
- Send text messages instantly to the group
- Share photos with captions
- Send documents and files

### 🔄 Smart Question Cycling
- No more repeated questions
- Intelligent cycling algorithm
- Better user experience

## Troubleshooting

If you encounter issues:

1. **Check logs:**
```bash
npx wrangler tail
```

2. **Verify KV namespace:**
```bash
npx wrangler kv namespace list
```

3. **Test locally:**
```bash
npm run dev
```

## Security Notes

- The KV namespace ID is already configured in `wrangler.toml`
- All admin features are restricted to the `ADMIN_CHAT_ID`
- Webhook validation prevents unauthorized access
- State management ensures secure admin operations

Your bot is now ready with professional-grade admin features! 🎉