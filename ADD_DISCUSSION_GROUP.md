# Add Discussion Group Configuration

## Steps to Add TARGET_DISCUSSION_GROUP_ID

1. **Go to your GitHub repository**
   - https://github.com/wahidsuman/Telegram-bot

2. **Navigate to Settings**
   - Click on "Settings" tab in your repository

3. **Go to Secrets and Variables**
   - In the left sidebar, click on "Secrets and variables"
   - Then click on "Actions"

4. **Add New Repository Secret**
   - Click on "New repository secret" button
   - **Name:** `TARGET_DISCUSSION_GROUP_ID`
   - **Value:** `-1002904085857`
   - Click "Add secret"

5. **Re-run the Latest Workflow**
   - Go to "Actions" tab
   - Click on the latest workflow run
   - Click "Re-run all jobs"
   - OR push any small change to trigger a new deployment

## What This Does

- When someone clicks an MCQ option in the discussion group (-1002904085857):
  - NO popup appears
  - Bot posts: "📚 Question [number]" followed by the explanation
  
- When someone clicks in other groups/channels:
  - Private popup appears with answer and truncated explanation
  - No message posted to the group

## Testing

After deployment:
1. Click an MCQ option in the discussion group
2. You should see the explanation posted as a message
3. Click an MCQ option in another group
4. You should see a popup with the answer# Trigger deployment with new secret Thu Aug 28 09:26:29 PM UTC 2025
