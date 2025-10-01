# Edit Answer Percentage Feature

## Overview

This Telegram MCQ bot has a **live answer percentage tracking feature** that dynamically updates the question messages in the group as users submit their answers. This creates an engaging, real-time experience similar to live polls.

## How It Works

### 1. **Answer Tracking** (`updateQuestionStats`)
Located at **lines 1151-1187** in `src/worker.ts`

When a user selects an answer (A, B, C, or D):
- The system checks if the user has already answered this question
- If it's their first attempt, the answer is recorded
- Statistics are updated: `stats.A++`, `stats.B++`, etc.
- Total count is incremented: `stats.total++`
- A timestamp is recorded: `stats.lastUpdated = Date.now()`

**Key Storage:**
- `qstats:{questionId}` - Stores answer counts: `{ A: 15, B: 23, C: 8, D: 12, total: 58 }`
- `qanswers:{questionId}` - Tracks which users have answered: `{ "123456": "A", "789012": "B" }`

### 2. **Percentage Calculation** (`calculatePercentages`)
Located at **lines 1195-1206**

```typescript
function calculatePercentages(stats: QuestionStats) {
  if (stats.total === 0) {
    return { A: 0, B: 0, C: 0, D: 0 };
  }
  
  return {
    A: Math.round((stats.A / stats.total) * 100),
    B: Math.round((stats.B / stats.total) * 100),
    C: Math.round((stats.C / stats.total) * 100),
    D: Math.round((stats.D / stats.total) * 100)
  };
}
```

**Example:**
- If 100 people have answered: A=25, B=45, C=15, D=15
- Percentages: A: 25% | B: 45% | C: 15% | D: 15%

### 3. **Smart Update Strategy** (`shouldUpdateMessage`)
Located at **lines 1208-1222**

The bot doesn't update on EVERY answer - that would be inefficient. Instead, it uses a **progressive update strategy**:

| Answer Count | Update Frequency |
|-------------|------------------|
| 1-10 answers | Every answer (immediate feedback) |
| 10-50 answers | Every 2 seconds |
| 50-200 answers | Every 5 seconds |
| 200-1000 answers | Every 10 seconds |
| 1000-10000 answers | Every 30 seconds |
| 10000+ answers | Every minute |

This ensures:
- ✅ Fast updates when few people have answered
- ✅ Reduced API calls as the poll grows
- ✅ No rate limiting issues
- ✅ Better performance

### 4. **Message Editing** (`updateQuestionMessages`)
Located at **lines 1224-1284**

When an update is triggered, the bot:

**Builds the updated message:**
```
🧠 Hourly MCQ #42

What is the capital of France?

A) London
B) Paris
C) Berlin
D) Madrid

📊 127 answers
A: 5% | B: 78% | C: 12% | D: 5%

⬅️ Text Here For Any Query
```

**Edits all posted messages:**
- Uses Telegram's `editMessageText` API
- Updates the question in the main group
- Updates in the discussion group (if configured)
- Updates in the channel (if configured)
- All updates happen in parallel for speed

### 5. **User Popup Experience**
Located at **lines 2545-2577**

When a user clicks an answer button, they see a popup (callback query) showing:

```
✅ Correct!

Answer: B

📊 127 answers
A: 5% | B: 78%
C: 12% | D: 5%

Paris is the capital and largest city of France...

𝐉𝐨𝐢𝐧 𝐝𝐢𝐬𝐜𝐮𝐬𝐬𝐢𝐨𝐧 𝐠𝐫𝐨𝐮𝐩 𝐟𝐨𝐫 𝐟𝐮𝐥𝐥 𝐞𝐱𝐩𝐥𝐚𝐧𝐚𝐭𝐢𝐨𝐧
```

**Features:**
- ✅/❌ indicator (correct/wrong)
- Correct answer shown
- Current answer distribution percentages
- Truncated explanation (fits in popup limit)
- Link to discussion group

## Visual Flow

```
User clicks answer
       ↓
Stats updated (A: 24 → 25)
       ↓
Check if should update message
       ↓
Calculate percentages
       ↓
Edit message text with new stats
       ↓
Users see updated percentages in real-time
```

## Technical Implementation Details

### Message ID Tracking
- When a question is posted, message IDs are stored: `qmsg:{questionId}`
- Format: `{ "chatId1": messageId1, "chatId2": messageId2 }`
- This allows updating all instances of the same question

### Preventing Double Voting
- Each user can only answer once per question
- Tracked in KV: `qanswers:{questionId}`
- Format: `{ "userId": "selectedAnswer" }`
- Subsequent clicks show popup but don't update stats

### Efficient Batch Updates
Located at **lines 2596-2611**

```typescript
const updatedStats = await updateQuestionStats(env.STATE, qid, userId, answer);

if (updatedStats) {
  // Check if we should update the message
  if (shouldUpdateMessage(updatedStats)) {
    // Get message IDs for this question
    const messageIdsKey = `qmsg:${qid}`;
    const messageIds = await getJSON(env.STATE, messageIdsKey, {});
    
    if (Object.keys(messageIds).length > 0) {
      // Update messages with new statistics
      await updateQuestionMessages(token, env.STATE, qid, question, updatedStats, messageIds);
    }
  }
}
```

### Performance Optimizations

1. **Parallel Updates**: All message edits happen simultaneously using `Promise.all()`
2. **Progressive Intervals**: Less frequent updates as answer count grows
3. **Timestamp Tracking**: `lastUpdated` prevents rapid consecutive updates
4. **Compact Display**: Large numbers shown as "1K", "2K" etc.

## User Experience Benefits

1. **Engagement**: Users can see live results, making it more interactive
2. **Transparency**: Everyone sees how others are answering
3. **Social Proof**: Popular answers become visible
4. **Learning**: Users can gauge difficulty by seeing answer distribution
5. **Curiosity**: Live updates encourage users to check back

## Example Scenario

1. **0 answers**: Question posted without percentages
   ```
   🧠 Hourly MCQ #42
   
   What is the capital of France?
   
   A) London
   B) Paris
   C) Berlin
   D) Madrid
   
   ⬅️ Text Here For Any Query
   ```

2. **After 5 answers**: Message updates immediately
   ```
   🧠 Hourly MCQ #42
   
   What is the capital of France?
   
   A) London
   B) Paris
   C) Berlin
   D) Madrid
   
   📊 5 answers
   A: 20% | B: 60% | C: 20% | D: 0%
   
   ⬅️ Text Here For Any Query
   ```

3. **After 127 answers**: Message shows clear trend
   ```
   🧠 Hourly MCQ #42
   
   What is the capital of France?
   
   A) London
   B) Paris
   C) Berlin
   D) Madrid
   
   📊 127 answers
   A: 5% | B: 78% | C: 12% | D: 5%
   
   ⬅️ Text Here For Any Query
   ```

4. **After 1,500 answers**: Compact display
   ```
   📊 1K answers
   A: 4% | B: 82% | C: 10% | D: 4%
   ```

## Code References

| Feature | File Location | Lines |
|---------|--------------|-------|
| Update Question Stats | `src/worker.ts` | 1151-1187 |
| Calculate Percentages | `src/worker.ts` | 1195-1206 |
| Should Update Message | `src/worker.ts` | 1208-1222 |
| Update Question Messages | `src/worker.ts` | 1224-1284 |
| Edit Message Text API | `src/worker.ts` | 208-232 |
| Answer Callback Handler | `src/worker.ts` | 2545-2634 |
| User Popup with Stats | `src/worker.ts` | 2549-2577 |

## Data Structures

### QuestionStats Interface
```typescript
interface QuestionStats {
  A: number;           // Count of A answers
  B: number;           // Count of B answers
  C: number;           // Count of C answers
  D: number;           // Count of D answers
  total: number;       // Total answer count
  lastUpdated?: number; // Timestamp for batch updates
  messageIds?: {       // Track message IDs for updates
    [chatId: string]: number;
  };
}
```

### Storage Keys
- `qstats:{questionId}` - Question statistics
- `qanswers:{questionId}` - User answer tracking
- `qmsg:{questionId}` - Message IDs for editing

## Summary

The **Edit Answer Percentage Feature** transforms a static MCQ bot into an engaging, interactive polling system. By intelligently updating message text with answer distribution percentages, it creates a live, transparent, and social learning experience while maintaining excellent performance through smart update throttling.
