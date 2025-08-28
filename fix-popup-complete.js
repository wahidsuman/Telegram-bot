#!/usr/bin/env node

/**
 * Complete fix for answer popup not showing
 */

const fs = require('fs');
const path = require('path');

const workerPath = path.join(__dirname, 'src', 'worker.ts');
let content = fs.readFileSync(workerPath, 'utf8');

console.log('🔧 Applying complete popup fix...\n');

// First, let's add debugging at the very beginning of callback query processing
const debugCallbackQuery = `        } else if (update.callback_query) {
          const query = update.callback_query;
          const data = query.data || '';
          const userId = query.from.id;
          const chatId = query.message?.chat.id;
          
          // DEBUG: Log all callback queries
          console.log('Callback query received:', { data, userId, chatId });
          
          // IMMEDIATELY answer the callback to prevent timeout
          // This must be done within 3 seconds or Telegram shows an error
          if (data.startsWith('ans:')) {
            // For answer callbacks, we'll send the full response later
            answerCallbackQuery(env.TELEGRAM_BOT_TOKEN, query.id).catch(console.error);
          }`;

// Replace the callback query handler start
const callbackMatch = content.match(/} else if \(update\.callback_query\) {[\s\S]*?const chatId = query\.message\?\.chat\.id;/);
if (callbackMatch) {
  content = content.replace(callbackMatch[0], debugCallbackQuery);
  console.log('✅ Added debugging and immediate callback acknowledgment');
}

// Now fix the answer handler to be simpler and more reliable
const simpleAnswerHandler = `          if (data.startsWith('ans:')) {
            console.log('Processing answer callback:', data);
            
            // Parse the callback data
            const parts = data.split(':');
            if (parts.length !== 3) {
              console.error('Invalid callback data format:', data);
              await answerCallbackQuery(env.TELEGRAM_BOT_TOKEN, query.id, '❌ Invalid data format', true);
              return new Response('OK');
            }
            
            const [, qidStr, answer] = parts;
            const qid = parseInt(qidStr, 10);
            
            if (isNaN(qid)) {
              console.error('Invalid question ID:', qidStr);
              await answerCallbackQuery(env.TELEGRAM_BOT_TOKEN, query.id, '❌ Invalid question ID', true);
              return new Response('OK');
            }
            
            // Load questions without cache to ensure fresh data
            let questions;
            try {
              const questionsData = await env.STATE.get('questions');
              questions = questionsData ? JSON.parse(questionsData) : [];
              console.log(\`Loaded \${questions.length} questions for answer check\`);
            } catch (error) {
              console.error('Failed to load questions:', error);
              await answerCallbackQuery(env.TELEGRAM_BOT_TOKEN, query.id, '❌ Failed to load questions', true);
              return new Response('OK');
            }
            
            if (!questions || questions.length === 0) {
              console.error('No questions available');
              await answerCallbackQuery(env.TELEGRAM_BOT_TOKEN, query.id, '❌ No questions available', true);
              return new Response('OK');
            }
            
            if (qid < 0 || qid >= questions.length) {
              console.error(\`Question ID \${qid} out of range (0-\${questions.length - 1})\`);
              await answerCallbackQuery(env.TELEGRAM_BOT_TOKEN, query.id, '❌ Question not found', true);
              return new Response('OK');
            }
            
            const question = questions[qid];
            if (!question) {
              console.error(\`Question at index \${qid} is null/undefined\`);
              await answerCallbackQuery(env.TELEGRAM_BOT_TOKEN, query.id, '❌ Question data missing', true);
              return new Response('OK');
            }
            
            // Check if question has required fields
            if (!question.answer || !question.explanation) {
              console.error('Question missing answer or explanation:', question);
              await answerCallbackQuery(env.TELEGRAM_BOT_TOKEN, query.id, '❌ Incomplete question data', true);
              return new Response('OK');
            }
            
            const isCorrect = answer === question.answer;
            const resultText = isCorrect ? '✅ Correct!' : '❌ Wrong!';
            const fullMessage = \`\${resultText}\\n\\nAnswer: \${question.answer}\\n\\nExplanation: \${question.explanation}\`;
            
            console.log('Sending answer popup:', { isCorrect, answer: question.answer });
            
            // Send the answer popup
            try {
              await answerCallbackQuery(env.TELEGRAM_BOT_TOKEN, query.id, fullMessage, true);
              console.log('Answer popup sent successfully');
            } catch (error) {
              console.error('Failed to send answer popup:', error);
              // Try a simpler message if the full one fails
              try {
                await answerCallbackQuery(env.TELEGRAM_BOT_TOKEN, query.id, \`\${resultText} Answer: \${question.answer}\`, true);
              } catch (error2) {
                console.error('Failed to send even simple popup:', error2);
              }
            }
            
            // Update stats asynchronously (don't wait)
            incrementStatsFirstAttemptOnly(env.STATE, userId, qid, isCorrect, env.TZ || 'Asia/Kolkata')
              .catch(error => console.error('Stats update error:', error));
              
            return new Response('OK');
          }`;

// Find and replace the answer handler
const answerHandlerRegex = /if \(data\.startsWith\('ans:'\)\) {[\s\S]*?return new Response\('OK'\);\s*}/;
const answerMatch = content.match(answerHandlerRegex);

if (!answerMatch) {
  // Try alternative pattern
  const altMatch = content.match(/} else if \(data\.startsWith\('ans:'\)\) {[\s\S]*?}\s*} else if \(data === 'coupon:copy'\)/);
  if (altMatch) {
    content = content.replace(altMatch[0], simpleAnswerHandler + '\n          } else if (data === \'coupon:copy\'');
    console.log('✅ Replaced answer handler with robust version');
  } else {
    console.log('⚠️  Could not find answer handler pattern');
  }
} else {
  content = content.replace(answerMatch[0], simpleAnswerHandler.replace('          if', 'if'));
  console.log('✅ Replaced answer handler with robust version');
}

// Write the fixed content
fs.writeFileSync(workerPath, content);

console.log('\n✅ Complete popup fix applied!');
console.log('\n🔍 The fix includes:');
console.log('  • Immediate callback acknowledgment (prevents timeout)');
console.log('  • Direct KV read (bypasses cache issues)');
console.log('  • Extensive error logging');
console.log('  • Multiple fallback mechanisms');
console.log('  • Simplified answer checking logic');
console.log('\n📦 Deploy: git add -A && git commit -m "Complete fix for answer popup" && git push');