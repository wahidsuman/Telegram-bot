# NEET-PG MCQ Telegram Bot Setup Guide

## Vercel Deployment Setup

### 1. Create Your Telegram Bot

1. Message [@BotFather](https://t.me/BotFather) on Telegram
2. Use `/newbot` command and follow instructions
3. Save your **Bot Token** (looks like: `123456789:ABCdefGHIjklMNOpqrsTUVwxyz`)

### 2. Get Your Chat ID

1. Add your bot to the Telegram group where you want MCQs posted
2. Make the bot an admin with permission to send messages
3. Send a test message to the group with the bot present
4. Visit: `https://api.telegram.org/bot<YOUR_BOT_TOKEN>/getUpdates`
5. Look for the `"chat":{"id":` value (negative number for groups)

### 3. Deploy to Vercel

1. Fork or copy this repository to your GitHub
2. Connect your GitHub to Vercel
3. Import the project to Vercel
4. Set up environment variables in Vercel dashboard:
   - `TELEGRAM_BOT_TOKEN` = Your bot token from step 1
   - `TELEGRAM_CHAT_ID` = Your group chat ID from step 2
   - `ADMIN_CHAT_ID` = Your personal chat ID (for adding new MCQs)
   - `CRON_SECRET` = Any random string for security (e.g., `my-secret-123`)

### Getting Your Personal Chat ID
To get your personal chat ID for adding new MCQs:
1. Send a message to your bot privately
2. Visit: `https://api.telegram.org/bot<YOUR_BOT_TOKEN>/getUpdates`
3. Look for your personal chat ID (positive number for private chats)

### 4. Set Up Webhook

After deployment, set your webhook URL:

Replace `YOUR_BOT_TOKEN` and `YOUR_VERCEL_URL` in this URL:
```
https://api.telegram.org/bot<YOUR_BOT_TOKEN>/setWebhook?url=https://<YOUR_VERCEL_URL>/api/webhook
```

Visit this URL in your browser to activate the webhook.

### 5. Test Your Bot

1. Send `/start` to your bot
2. The bot should respond with a welcome message
3. MCQs will be posted automatically every hour
4. Users can click answer buttons to see if they're correct

## How It Works

- **Hourly MCQs**: Vercel cron job automatically sends one random MCQ every hour
- **Interactive Answers**: Users click A/B/C/D buttons to answer
- **Instant Feedback**: Bot shows if answer is correct/wrong with explanation
- **Random Selection**: Questions are selected randomly from 246 NEET-PG questions
- **Admin Features**: Add new MCQs via personal chat with CSV format

## File Structure

- `api/webhook.py` - Handles Telegram bot interactions
- `api/send-mcq.py` - Sends hourly MCQs (cron job)
- `utils/mcq_manager.py` - MCQ data management utilities
- `neet-pg-mcqs.csv` - Database of 246 NEET-PG questions
- `vercel.json` - Vercel configuration with cron settings

## Admin Features

### Adding New MCQs via Personal Chat

Once deployed, you can add new MCQ data by messaging your bot privately:

1. **Send admin commands:**
   - `/add_mcq` - Shows format for adding new questions
   - `/stats` - Shows database statistics

2. **Send CSV data directly:**
   ```
   2023,100,Anatomy,Heart,Which valve prevents backflow from aorta?,Tricuspid,Pulmonary,Mitral,Aortic,D,Aortic valve prevents backflow from aorta to left ventricle,cardiology.pdf
   ```

3. **Format requirements:**
   - Year,Question Number,Subject,Topic,Question,Option 1,Option 2,Option 3,Option 4,Answer,Explanation,Source
   - Answer must be A, B, C, or D
   - All fields are required
   - You can send multiple questions at once (one per line)

## Troubleshooting

- **Bot not responding**: Check webhook URL is set correctly
- **No hourly MCQs**: Verify cron job is enabled in Vercel
- **Environment errors**: Ensure all 3 environment variables are set
- **Permission errors**: Make sure bot is admin in the group

## Data Format

Each MCQ includes:
- Subject (Anatomy, Physiology, etc.)
- Topic (specific area)
- Question with 4 options
- Correct answer
- Detailed explanation
- Source reference