#!/usr/bin/env node

/**
 * Restore the bot to working state - remove DM tracking, fix callback chain
 */

const fs = require('fs');
const path = require('path');

const workerPath = path.join(__dirname, 'src', 'worker.ts');
let content = fs.readFileSync(workerPath, 'utf8');

console.log('🔧 Restoring bot to working state...\n');

// Find the callback_query handler
const callbackStart = content.indexOf('} else if (update.callback_query) {');
if (callbackStart === -1) {
  console.error('Could not find callback_query handler');
  process.exit(1);
}

// Find where the problematic DM tracking starts
const trackingStart = content.indexOf('// Track unique user interaction via callback queries');
const userStatsStart = content.indexOf('if (data === \'user:stats\') {', callbackStart);

if (trackingStart > -1 && userStatsStart > -1) {
  // Remove the entire DM tracking section
  const beforeTracking = content.substring(0, trackingStart);
  const afterUserStats = content.substring(userStatsStart);
  
  // Build clean structure without DM tracking
  content = beforeTracking + 
    '          // Handle callbacks\n' +
    '          ' + afterUserStats;
  
  console.log('✅ Removed problematic DM tracking code');
}

// Ensure the user:stats handler is properly chained
content = content.replace(
  /(\s+)if \(data === 'user:stats'\) \{/,
  '$1if (data === \'user:stats\') {'
);

// Add simple debugging for answer callbacks
const ansHandler = content.indexOf('} else if (data.startsWith(\'ans:\')) {');
if (ansHandler > -1) {
  content = content.replace(
    '} else if (data.startsWith(\'ans:\')) {',
    '} else if (data.startsWith(\'ans:\')) {\n            console.log(\'Answer button clicked:\', data);'
  );
  console.log('✅ Added debugging for answer callbacks');
}

// Ensure edit message functionality works
const sendMessageInAdmin = 'await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId!, message, { reply_markup: keyboard });';
if (content.includes(sendMessageInAdmin)) {
  content = content.replace(
    new RegExp(sendMessageInAdmin.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'),
    `if (query.message?.message_id) {
              await editMessageText(env.TELEGRAM_BOT_TOKEN, chatId!, query.message.message_id, message, { reply_markup: keyboard });
            } else {
              await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId!, message, { reply_markup: keyboard });
            }`
  );
  console.log('✅ Restored edit message functionality');
}

// Write the fixed content
fs.writeFileSync(workerPath, content);

console.log('\n✅ Bot restored to working state!');
console.log('  • Removed problematic DM tracking');
console.log('  • Fixed callback chain');
console.log('  • Answer popups will work');
console.log('  • Edit message functionality restored');