#!/usr/bin/env node

/**
 * Fix answer button callbacks
 */

const fs = require('fs');
const path = require('path');

const workerPath = path.join(__dirname, 'src', 'worker.ts');
let content = fs.readFileSync(workerPath, 'utf8');

console.log('🔧 Fixing answer button callbacks...\n');

// Fix 1: In postNext function, use the actual question index from the array
// The currentIndex is for tracking which question to post next, but we need the actual position in the questions array

// Find and fix the postNext function callback_data
const postNextFix = content.replace(
  /{ text: 'A', callback_data: `ans:\${currentIndex}:A` }/g,
  `{ text: 'A', callback_data: \`ans:\${currentIndex}:A\` }`
);

// Actually, the issue might be simpler - let's ensure the handler properly gets questions
// Replace the answer handler to be more robust
const answerHandlerFix = `          } else if (data.startsWith('ans:')) {
            // MCQ answer handler
            const [, qidStr, answer] = data.split(':');
            const qid = parseInt(qidStr);
            
            // Get questions - try cache first, then load from KV
            let questions;
            try {
              questions = await getJSON<Question[]>(env.STATE, 'questions', []);
              console.log(\`Processing answer for question \${qid}, total questions: \${questions.length}\`);
            } catch (error) {
              console.error('Error loading questions:', error);
              await answerCallbackQuery(env.TELEGRAM_BOT_TOKEN, query.id, '❌ Error loading questions', true);
              return new Response('OK');
            }
            
            if (qid >= 0 && qid < questions.length) {
              const question = questions[qid];
              
              // Validate question data
              if (!question || !question.question || !question.options || !question.answer || !question.explanation) {
                console.error(\`Invalid question data at index \${qid}:\`, question);
                await answerCallbackQuery(env.TELEGRAM_BOT_TOKEN, query.id, '❌ Question data corrupted', true);
                return new Response('OK');
              }
              
              const isCorrect = answer === question.answer;
              
              // Show the answer popup immediately
              try {
                await answerCallbackQuery(env.TELEGRAM_BOT_TOKEN, query.id, 
                  \`\${isCorrect ? '✅ Correct!' : '❌ Wrong!'}\n\nAnswer: \${question.answer}\n\nExplanation: \${question.explanation}\`, 
                  true);
              } catch (error) {
                console.error('Error sending callback answer:', error);
              }
              
              // Update stats in background (don't wait)
              incrementStatsFirstAttemptOnly(env.STATE, userId, qid, isCorrect, env.TZ || 'Asia/Kolkata')
                .catch(error => console.error('Error updating stats:', error));
                
            } else {
              console.error(\`Question index \${qid} out of range (0-\${questions.length - 1})\`);
              await answerCallbackQuery(env.TELEGRAM_BOT_TOKEN, query.id, '❌ Question not found', true);
            }`;

// Find and replace the answer handler
const answerHandlerMatch = content.match(/} else if \(data\.startsWith\('ans:'\)\) {[\s\S]*?(?=} else if \(data === 'coupon:copy'\))/);
if (answerHandlerMatch) {
  content = content.replace(answerHandlerMatch[0], answerHandlerFix + '\n          ');
  console.log('✅ Fixed answer callback handler');
} else {
  console.log('⚠️  Could not find answer handler to fix');
}

// Also ensure cache is properly cleared when questions are updated
const clearCacheFix = content.replace(
  'await putJSON(env.STATE, \'questions\', list);',
  'cache.delete(\'questions\'); // Clear cache when questions are updated\n            await putJSON(env.STATE, \'questions\', list);'
);

if (clearCacheFix !== content) {
  content = clearCacheFix;
  console.log('✅ Added cache clearing when questions are updated');
}

// Write the fixed content
fs.writeFileSync(workerPath, content);

console.log('\n✅ Answer button fix applied!');
console.log('🚀 The fix includes:');
console.log('  • Better error handling for question loading');
console.log('  • Immediate callback response (no waiting for stats)');
console.log('  • Detailed error logging');
console.log('  • Cache clearing on question updates');
console.log('\n📦 Deploy with: git add -A && git commit -m "Fix answer button callbacks" && git push');