/// <reference types="@cloudflare/workers-types" />

interface Env {
  STATE: KVNamespace;
  TELEGRAM_BOT_TOKEN: string;
  TARGET_GROUP_ID: string;
  ADMIN_CHAT_ID: string;
  WEBHOOK_SECRET: string;
  TZ: string;
}

interface Question {
  question: string;
  options: {
    A: string;
    B: string;
    C: string;
    D: string;
  };
  answer: 'A' | 'B' | 'C' | 'D';
  explanation: string;
}

interface UserStats {
  cnt: number;
  correct: number;
}

interface DayStats {
  total: number;
  users: Record<string, UserStats>;
}

interface TelegramMessage {
  message_id: number;
  from?: {
    id: number;
    first_name: string;
    last_name?: string;
    username?: string;
  };
  chat: {
    id: number;
    type: string;
  };
  text?: string;
  document?: {
    file_id: string;
    file_name?: string;
  };
}

interface TelegramCallbackQuery {
  id: string;
  from: {
    id: number;
    first_name: string;
    last_name?: string;
    username?: string;
  };
  message?: {
    message_id: number;
    chat: {
      id: number;
    };
  };
  data?: string;
}

interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
  callback_query?: TelegramCallbackQuery;
}

// Utility functions
function esc(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

async function getJSON<T>(kv: KVNamespace, key: string, defaultValue: T): Promise<T> {
  try {
    const value = await kv.get(key);
    return value ? JSON.parse(value) : defaultValue;
  } catch {
    return defaultValue;
  }
}

async function putJSON(kv: KVNamespace, key: string, obj: any): Promise<void> {
  await kv.put(key, JSON.stringify(obj));
}

function getCurrentDate(tz: string): string {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  return formatter.format(now);
}

function getCurrentMonth(tz: string): string {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit'
  });
  return formatter.format(now);
}

async function sendMessage(token: string, chatId: string | number, text: string, options?: any): Promise<any> {
  const url = `https://api.telegram.org/bot${token}/sendMessage`;
  const body = {
    chat_id: chatId,
    text: text,
    parse_mode: 'HTML',
    ...options
  };
  
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  
  return response.json();
}

async function copyMessage(token: string, fromChatId: string | number, messageId: number, targetChatId: string | number, options?: any): Promise<any> {
  const url = `https://api.telegram.org/bot${token}/copyMessage`;
  const body = {
    from_chat_id: fromChatId,
    chat_id: targetChatId,
    message_id: messageId,
    ...options
  };
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  return response.json();
}

async function answerCallbackQuery(token: string, queryId: string, text?: string, showAlert?: boolean): Promise<any> {
  const url = `https://api.telegram.org/bot${token}/answerCallbackQuery`;
  const body = {
    callback_query_id: queryId,
    text: text,
    show_alert: showAlert || false
  };
  
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  
  return response.json();
}

async function getFile(token: string, fileId: string): Promise<any> {
  const url = `https://api.telegram.org/bot${token}/getFile`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ file_id: fileId })
  });
  
  return response.json();
}

async function downloadFile(token: string, filePath: string): Promise<string> {
  const url = `https://api.telegram.org/file/bot${token}/${filePath}`;
  const response = await fetch(url);
  return response.text();
}

async function ensureKeys(kv: KVNamespace): Promise<void> {
  const questions = await getJSON<Question[]>(kv, 'questions', []);
  if (questions.length === 0) {
    await putJSON(kv, 'questions', []);
  }
}

async function initializeBotIfNeeded(kv: KVNamespace, token: string, targetGroupId: string): Promise<void> {
  const questions = await getJSON<Question[]>(kv, 'questions', []);
  if (questions.length === 0) {
    // Add sample question to bootstrap the system
    const sampleQuestion: Question = {
      question: "Welcome to Prepladder MCQ Bot! Which programming paradigm focuses on functions as first-class citizens?",
      options: {
        A: "Object-Oriented Programming",
        B: "Functional Programming",
        C: "Procedural Programming",
        D: "Declarative Programming"
      },
      answer: "B",
      explanation: "Functional programming treats functions as first-class citizens, allowing them to be assigned to variables, passed as arguments, and returned from other functions."
    };
    
    await putJSON(kv, 'questions', [sampleQuestion]);
  }
  
  // Check if we need to initialize the index
  const indexKey = `idx:${targetGroupId}`;
  const currentIndex = await getJSON<number>(kv, indexKey, -1);
  if (currentIndex === -1) {
    await putJSON(kv, indexKey, 0);
    // Post the first question immediately to start the cycle
    try {
      await postNext(kv, token, targetGroupId);
    } catch (error) {
      console.log('Error posting initial question:', error);
    }
  }
}

async function incrementStats(kv: KVNamespace, userId: number, isCorrect: boolean, tz: string): Promise<void> {
  const userIdStr = userId.toString();
  const today = getCurrentDate(tz);
  const month = getCurrentMonth(tz);
  
  // Update daily stats
  const dailyKey = `stats:daily:${today}`;
  const dailyStats = await getJSON<DayStats>(kv, dailyKey, { total: 0, users: {} });
  
  dailyStats.total += 1;
  if (!dailyStats.users[userIdStr]) {
    dailyStats.users[userIdStr] = { cnt: 0, correct: 0 };
  }
  dailyStats.users[userIdStr].cnt += 1;
  if (isCorrect) {
    dailyStats.users[userIdStr].correct += 1;
  }
  
  await putJSON(kv, dailyKey, dailyStats);
  
  // Update monthly stats
  const monthlyKey = `stats:monthly:${month}`;
  const monthlyStats = await getJSON<DayStats>(kv, monthlyKey, { total: 0, users: {} });
  
  monthlyStats.total += 1;
  if (!monthlyStats.users[userIdStr]) {
    monthlyStats.users[userIdStr] = { cnt: 0, correct: 0 };
  }
  monthlyStats.users[userIdStr].cnt += 1;
  if (isCorrect) {
    monthlyStats.users[userIdStr].correct += 1;
  }
  
  await putJSON(kv, monthlyKey, monthlyStats);
}

async function postNext(kv: KVNamespace, token: string, chatId: string): Promise<void> {
  const questions = await getJSON<Question[]>(kv, 'questions', []);
  
  if (questions.length === 0) {
    console.log('No questions available');
    return;
  }
  
  const indexKey = `idx:${chatId}`;
  const currentIndex = await getJSON<number>(kv, indexKey, 0);
  
  const question = questions[currentIndex];
  const nextIndex = (currentIndex + 1) % questions.length;
  
  await putJSON(kv, indexKey, nextIndex);
  
  const text = `🧠 Hourly MCQ #${currentIndex + 1}\n\n${esc(question.question)}\n\nA) ${esc(question.options.A)}\nB) ${esc(question.options.B)}\nC) ${esc(question.options.C)}\nD) ${esc(question.options.D)}`;
  
  const keyboard = {
    inline_keyboard: [[
      { text: 'A', callback_data: `ans:${currentIndex}:A` },
      { text: 'B', callback_data: `ans:${currentIndex}:B` },
      { text: 'C', callback_data: `ans:${currentIndex}:C` },
      { text: 'D', callback_data: `ans:${currentIndex}:D` }
    ]]
  };
  
  await sendMessage(token, chatId, text, { reply_markup: keyboard });
}

function validateQuestion(q: any): q is Question {
  return (
    typeof q === 'object' &&
    typeof q.question === 'string' &&
    typeof q.options === 'object' &&
    typeof q.options.A === 'string' &&
    typeof q.options.B === 'string' &&
    typeof q.options.C === 'string' &&
    typeof q.options.D === 'string' &&
    typeof q.answer === 'string' &&
    ['A', 'B', 'C', 'D'].includes(q.answer) &&
    typeof q.explanation === 'string'
  );
}

function trimQuestion(q: any): Question {
  return {
    question: q.question.trim(),
    options: {
      A: q.options.A.trim(),
      B: q.options.B.trim(),
      C: q.options.C.trim(),
      D: q.options.D.trim()
    },
    answer: q.answer,
    explanation: q.explanation.trim()
  };
}

function formatQuestionPreview(q: Question, index: number): string {
  return `#${index + 1}\n\n${esc(q.question)}\n\nA) ${esc(q.options.A)}\nB) ${esc(q.options.B)}\nC) ${esc(q.options.C)}\nD) ${esc(q.options.D)}\n\nAnswer: ${q.answer}`;
}

function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, Math.max(0, maxLen - 1)) + '…';
}

function chunkLines(lines: string[], maxChars: number): string[] {
  const chunks: string[] = [];
  let current = '';
  for (const line of lines) {
    if ((current + (current ? '\n' : '') + line).length > maxChars) {
      if (current) chunks.push(current);
      current = line;
    } else {
      current = current ? current + '\n' + line : line;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

async function uploadQuestionsFromFile(kv: KVNamespace, token: string, fileId: string, targetGroupId: string): Promise<{ uploaded: number; total: number; sent: number; unsent: number }> {
  const fileInfo = await getFile(token, fileId);
  
  if (!fileInfo.ok) {
    throw new Error('Failed to get file info');
  }
  
  const content = await downloadFile(token, fileInfo.result.file_path);
  
  let newQuestions: any[] = [];
  
  // Helper: CSV parsing utilities
  function splitCsvLine(line: string): string[] {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inQuotes) {
        if (ch === '"') {
          if (i + 1 < line.length && line[i + 1] === '"') {
            current += '"';
            i++;
          } else {
            inQuotes = false;
          }
        } else {
          current += ch;
        }
      } else {
        if (ch === ',') {
          result.push(current);
          current = '';
        } else if (ch === '"') {
          inQuotes = true;
        } else {
          current += ch;
        }
      }
    }
    result.push(current);
    return result.map(s => s.trim());
  }
  function parseCsvQuestions(csvText: string): any[] {
    const lines = csvText.split('\n').map(l => l.trim()).filter(Boolean);
    if (lines.length === 0) return [];
    const header = splitCsvLine(lines[0]).map(h => h.toLowerCase());
    const required = ['question', 'a', 'b', 'c', 'd', 'answer', 'explanation'];
    const hasAll = required.every(k => header.includes(k));
    if (!hasAll) return [];
    const idx = (name: string) => header.indexOf(name);
    const rows = lines.slice(1);
    const items: any[] = [];
    for (const row of rows) {
      const cols = splitCsvLine(row);
      if (cols.length < header.length) continue;
      const obj = {
        question: cols[idx('question')] || '',
        options: {
          A: cols[idx('a')] || '',
          B: cols[idx('b')] || '',
          C: cols[idx('c')] || '',
          D: cols[idx('d')] || ''
        },
        answer: (cols[idx('answer')] || '').toUpperCase(),
        explanation: cols[idx('explanation')] || ''
      };
      items.push(obj);
    }
    return items;
  }
  
  try {
    // Try parsing as JSON array or object first
    const parsed = JSON.parse(content);
    if (Array.isArray(parsed)) {
      newQuestions = parsed;
    } else {
      newQuestions = [parsed];
    }
  } catch {
    // Try CSV
    const csvParsed = parseCsvQuestions(content);
    if (csvParsed.length > 0) {
      newQuestions = csvParsed;
    } else {
      // Try parsing as JSONL
      const lines = content.split('\n').filter(line => line.trim());
      for (const line of lines) {
        try {
          const q = JSON.parse(line);
          newQuestions.push(q);
        } catch {
          throw new Error('Invalid JSON/CSV format');
        }
      }
    }
  }
  
  // Validate and trim questions
  const validQuestions: Question[] = [];
  for (const q of newQuestions) {
    if (validateQuestion(q)) {
      validQuestions.push(trimQuestion(q));
    }
  }
  
  if (validQuestions.length === 0) {
    throw new Error('No valid questions found');
  }
  
  const existingQuestions = await getJSON<Question[]>(kv, 'questions', []);
  // Build key set for duplicates (normalize by question + options + answer)
  const buildKey = (q: Question) =>
    `${q.question}\u0001${q.options.A}\u0001${q.options.B}\u0001${q.options.C}\u0001${q.options.D}\u0001${q.answer}`.toLowerCase();
  const seen = new Set<string>(existingQuestions.map(buildKey));
  // Deduplicate within new batch
  const batchSeen = new Set<string>();
  const uniqueNew: Question[] = [];
  for (const q of validQuestions) {
    const k = buildKey(q);
    if (seen.has(k) || batchSeen.has(k)) continue;
    batchSeen.add(k);
    uniqueNew.push(q);
  }
  const allQuestions = [...existingQuestions, ...uniqueNew];
  await putJSON(kv, 'questions', allQuestions);
  
  // Get current index to calculate sent vs unsent
  const indexKey = `idx:${targetGroupId}`;
  const currentIndex = await getJSON<number>(kv, indexKey, 0);
  
  return {
    uploaded: uniqueNew.length,
    total: allQuestions.length,
    sent: currentIndex,
    unsent: Math.max(0, allQuestions.length - currentIndex)
  };
}

async function formatDailyReport(kv: KVNamespace, date: string): Promise<string> {
  const stats = await getJSON<DayStats>(kv, `stats:daily:${date}`, { total: 0, users: {} });
  
  const uniqueUsers = Object.keys(stats.users).length;
  const totalAnswers = stats.total;
  const avgPerUser = uniqueUsers > 0 ? (totalAnswers / uniqueUsers).toFixed(1) : '0';
  
  let report = `📊 Daily MCQ Report - ${date}\n\n`;
  report += `👥 Unique Users: ${uniqueUsers}\n`;
  report += `📝 Total Answers: ${totalAnswers}\n`;
  report += `📈 Average per User: ${avgPerUser}\n\n`;
  
  if (uniqueUsers > 0) {
    const topUsers = Object.entries(stats.users)
      .sort(([,a], [,b]) => b.cnt - a.cnt)
      .slice(0, 5);
    
    report += `Top Users Today:\n`;
    for (const [userId, userStats] of topUsers) {
      const accuracy = userStats.cnt > 0 ? ((userStats.correct / userStats.cnt) * 100).toFixed(0) : '0';
      report += `• User ${userId}: ${userStats.cnt} questions, ${accuracy}% accuracy\n`;
    }
  }
  
  return report;
}

async function formatMonthlyReport(kv: KVNamespace, yyyyMM: string): Promise<string> {
  const stats = await getJSON<DayStats>(kv, `stats:monthly:${yyyyMM}`, { total: 0, users: {} });
  
  const uniqueUsers = Object.keys(stats.users).length;
  const totalAnswers = stats.total;
  const avgPerUser = uniqueUsers > 0 ? (totalAnswers / uniqueUsers).toFixed(1) : '0';
  
  let report = `📊 Monthly MCQ Report - ${yyyyMM}\n\n`;
  report += `👥 Unique Users: ${uniqueUsers}\n`;
  report += `📝 Total Answers: ${totalAnswers}\n`;
  report += `📈 Average per User: ${avgPerUser}\n\n`;
  
  if (uniqueUsers > 0) {
    const topUsers = Object.entries(stats.users)
      .sort(([,a], [,b]) => b.cnt - a.cnt)
      .slice(0, 5);
    
    report += `Top Users This Month:\n`;
    for (const [userId, userStats] of topUsers) {
      const accuracy = userStats.cnt > 0 ? ((userStats.correct / userStats.cnt) * 100).toFixed(0) : '0';
      report += `• User ${userId}: ${userStats.cnt} questions, ${accuracy}% accuracy\n`;
    }
  }
  
  return report;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    
    try {
      if (url.pathname === '/webhook' && request.method === 'POST') {
        const secretHeader = request.headers.get('X-Telegram-Bot-Api-Secret-Token');
        if (secretHeader !== env.WEBHOOK_SECRET) {
          return new Response('Unauthorized', { status: 401 });
        }
        
        const update: TelegramUpdate = await request.json();
        
        await ensureKeys(env.STATE);
        await initializeBotIfNeeded(env.STATE, env.TELEGRAM_BOT_TOKEN, env.TARGET_GROUP_ID);
        
        if (update.message) {
          const message = update.message;
          const chatId = message.chat.id;
          const userId = message.from?.id;
          
          if (chatId.toString() === env.ADMIN_CHAT_ID) {
            // Admin commands
            const broadcastPending = await env.STATE.get('admin:broadcast:pending');
            const editIdxStr = await env.STATE.get('admin:edit:idx');
            if (broadcastPending === '1') {
              try {
                await copyMessage(env.TELEGRAM_BOT_TOKEN, chatId, message.message_id, env.TARGET_GROUP_ID);
                await env.STATE.delete('admin:broadcast:pending');
                await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, '✅ Broadcasted to group');
              } catch (error) {
                await env.STATE.delete('admin:broadcast:pending');
                await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, `❌ Broadcast failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
              }
            } else if (editIdxStr) {
              try {
                if (!message.text) {
                  await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, '❌ Please send the updated question as JSON text.');
                } else {
                  const idx = parseInt(editIdxStr, 10);
                  const q = JSON.parse(message.text);
                  if (!validateQuestion(q)) {
                    throw new Error('Invalid question format. Expecting {question, options{A,B,C,D}, answer, explanation}');
                  }
                  const trimmed = trimQuestion(q);
                  const list = await getJSON<Question[]>(env.STATE, 'questions', []);
                  if (idx < 0 || idx >= list.length) {
                    throw new Error('Index out of range');
                  }
                  list[idx] = trimmed;
                  await putJSON(env.STATE, 'questions', list);
                  await env.STATE.delete('admin:edit:idx');
                  await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, `✅ Question #${idx + 1} updated.`);
                }
              } catch (error) {
                await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, `❌ Edit failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
              }
            } else if (message.text === '/start') {
              const keyboard = {
                inline_keyboard: [
                  [{ text: '📤 Upload Questions', callback_data: 'admin:upload' }],
                  [{ text: '📊 Daily Report', callback_data: 'admin:daily' }],
                  [{ text: '📈 Monthly Report', callback_data: 'admin:monthly' }],
                  [{ text: '⏭️ Post Next Now', callback_data: 'admin:postNow' }],
                  [{ text: '🗄️ DB Status', callback_data: 'admin:dbstatus' }],
                  [{ text: '📣 Broadcast to Group', callback_data: 'admin:broadcast' }],
                  [{ text: '🛠️ Manage Questions (Upcoming)', callback_data: 'admin:manage' }],
                  [{ text: '📚 View All Questions', callback_data: 'admin:listAll' }]
                ]
              };
              
              await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, 'Admin Panel', { reply_markup: keyboard });
            } else if (message.document) {
              // Handle file upload - ensure we respond to admin
              try {
                console.log('Processing file upload from admin:', chatId);
                const result = await uploadQuestionsFromFile(env.STATE, env.TELEGRAM_BOT_TOKEN, message.document.file_id, env.TARGET_GROUP_ID);
                
                const responseMessage = `✅ Upload Summary\n\n• Uploaded this time: ${result.uploaded}\n• Remaining to post: ${result.unsent}\n• Posted till now: ${result.sent}\n• Total in database: ${result.total}\n\n(duplicates are automatically skipped)`;
                
                console.log('Sending response to admin:', responseMessage);
                await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, responseMessage);
                
              } catch (error) {
                console.error('File upload error:', error);
                const errorMessage = `❌ Error uploading questions: ${error instanceof Error ? error.message : 'Unknown error'}`;
                await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, errorMessage);
              }
            }
          } else if (message.chat.type === 'private') {
            // Non-admin private message
            const keyboard = {
              inline_keyboard: [
                [{ text: 'Get Code', callback_data: 'coupon:copy' }],
                [{ text: 'Bargain', callback_data: 'coupon:bargain' }]
              ]
            };
            
            await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, 
              'Here For Best Prepladder Discount Coupon? Click Below -', 
              { reply_markup: keyboard });
          }
        } else if (update.callback_query) {
          const query = update.callback_query;
          const data = query.data || '';
          const userId = query.from.id;
          const chatId = query.message?.chat.id;
          
          if (data.startsWith('ans:')) {
            // MCQ answer
            const [, qidStr, answer] = data.split(':');
            const qid = parseInt(qidStr);
            
            const questions = await getJSON<Question[]>(env.STATE, 'questions', []);
            if (qid >= 0 && qid < questions.length) {
              const question = questions[qid];
              const isCorrect = answer === question.answer;
              
              await incrementStats(env.STATE, userId, isCorrect, env.TZ || 'Asia/Kolkata');
              
              // Create popup in requested format
              let explanation = question.explanation;
              if (explanation.length > 120) {
                explanation = explanation.substring(0, 120) + '...';
              }
              const verdict = isCorrect ? '✅ correct' : '❌ wrong';
              const answerLine = `Answer: ${question.answer}`;
              const popup = `${verdict}\n\n${answerLine}\n\nExplanation: ${explanation}\n\n(to get Prepladder Discounts text me)`;
              await answerCallbackQuery(env.TELEGRAM_BOT_TOKEN, query.id, popup, true);
            } else {
              await answerCallbackQuery(env.TELEGRAM_BOT_TOKEN, query.id, '❌ Question not found', true);
            }
          } else if (data === 'coupon:copy') {
            await answerCallbackQuery(env.TELEGRAM_BOT_TOKEN, query.id, 'P650 coupon code copied');
            
            // Send the coupon code
            await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId!, 'P650');
            
            // Send follow-up message
            await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId!, 
              '⬆️ Copy This  Code P650 To Get Best Prepladder Discounts For All The Prepladder Plans.If You Need Extra Discount You Can Click On The Bargain Button 🔘');
            
            // Notify admin with username
            const userName = `${query.from.first_name}${query.from.last_name ? ' ' + query.from.last_name : ''}`;
            const username = query.from.username ? `@${query.from.username}` : '—';
            await sendMessage(env.TELEGRAM_BOT_TOKEN, env.ADMIN_CHAT_ID, 
              `💰 Code Used: P650\n\nUser: ${userName}\nUsername: ${username}\nUser ID: ${userId}\n\nUser has copied the discount code!`);
              
          } else if (data === 'coupon:bargain') {
            // Show full styled text as popup; trim to keep within Telegram popup limits
            let popupText = 'Wait a sec… Admin is loading 🤖💭\nPrepare your ultimate bargaining attack 💣😂\nDiscount battle begins soon!';
            if (popupText.length > 190) {
              popupText = popupText.slice(0, 187) + '...';
            }
            await answerCallbackQuery(env.TELEGRAM_BOT_TOKEN, query.id, popupText, true);
            
            // Notify admin
            const userName = `${query.from.first_name}${query.from.last_name ? ' ' + query.from.last_name : ''}`;
            const username = query.from.username ? `@${query.from.username}` : '—';
            
            const bargainMsg = `🤝 Bargain Request\n\nUser: ${userName}\nUsername: ${username}\nUser ID: ${userId}\n\nReady to negotiate discount!`;
            await sendMessage(env.TELEGRAM_BOT_TOKEN, env.ADMIN_CHAT_ID, bargainMsg);
            
          } else if (data === 'admin:upload') {
            await answerCallbackQuery(env.TELEGRAM_BOT_TOKEN, query.id);
            await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId!, 
              'Please send a JSON file with questions. Format should be an array of objects or JSONL (one object per line).');
              
          } else if (data === 'admin:daily') {
            await answerCallbackQuery(env.TELEGRAM_BOT_TOKEN, query.id);
            const today = getCurrentDate(env.TZ || 'Asia/Kolkata');
            const report = await formatDailyReport(env.STATE, today);
            await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId!, report);
            
          } else if (data === 'admin:monthly') {
            await answerCallbackQuery(env.TELEGRAM_BOT_TOKEN, query.id);
            const month = getCurrentMonth(env.TZ || 'Asia/Kolkata');
            const report = await formatMonthlyReport(env.STATE, month);
            await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId!, report);
          } else if (data === 'admin:postNow') {
            await answerCallbackQuery(env.TELEGRAM_BOT_TOKEN, query.id, 'Posting next MCQ…');
            await postNext(env.STATE, env.TELEGRAM_BOT_TOKEN, env.TARGET_GROUP_ID);
            await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId!, '✅ Posted next MCQ to the group');
          } else if (data === 'admin:dbstatus') {
            await answerCallbackQuery(env.TELEGRAM_BOT_TOKEN, query.id);
            const questions = await getJSON<Question[]>(env.STATE, 'questions', []);
            const indexKey = `idx:${env.TARGET_GROUP_ID}`;
            const currentIndex = await getJSON<number>(env.STATE, indexKey, 0);
            const sent = currentIndex;
            const total = questions.length;
            const unsent = Math.max(0, total - sent);
            const msg = `🗄️ DB Status\n\n• Total questions: ${total}\n• Sent: ${sent}\n• Unsent: ${unsent}`;
            await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId!, msg);
          } else if (data === 'admin:broadcast') {
            await answerCallbackQuery(env.TELEGRAM_BOT_TOKEN, query.id);
            await env.STATE.put('admin:broadcast:pending', '1');
            const kb = { inline_keyboard: [[{ text: '✖️ Cancel', callback_data: 'admin:broadcastCancel' }]] };
            await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId!, 'Send the message or media to broadcast to the group.', { reply_markup: kb });
          } else if (data === 'admin:broadcastCancel') {
            await answerCallbackQuery(env.TELEGRAM_BOT_TOKEN, query.id, 'Cancelled');
            await env.STATE.delete('admin:broadcast:pending');
            await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId!, '❎ Broadcast cancelled');
          } else if (data === 'admin:manage') {
            await answerCallbackQuery(env.TELEGRAM_BOT_TOKEN, query.id);
            const questions = await getJSON<Question[]>(env.STATE, 'questions', []);
            const indexKey = `idx:${env.TARGET_GROUP_ID}`;
            const currentIndex = await getJSON<number>(env.STATE, indexKey, 0);
            const upcoming = questions.slice(currentIndex);
            if (upcoming.length === 0) {
              await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId!, 'No questions in database.');
            } else {
              await env.STATE.put('admin:manage:index', '0');
              const txt = formatQuestionPreview(upcoming[0], currentIndex + 0);
              const kb = { inline_keyboard: [[
                { text: '⬅️ Prev', callback_data: 'admin:mg:prev' },
                { text: '➡️ Next', callback_data: 'admin:mg:next' }
              ], [
                { text: '📝 Edit', callback_data: 'admin:edit:0' },
                { text: '🗑️ Delete', callback_data: 'admin:del:0' }
              ], [
                { text: '✖️ Close', callback_data: 'admin:mg:close' }
              ]] };
              await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId!, txt, { reply_markup: kb });
            }
          } else if (data === 'admin:mg:close') {
            await answerCallbackQuery(env.TELEGRAM_BOT_TOKEN, query.id, 'Closed');
            await env.STATE.delete('admin:manage:index');
          } else if (data === 'admin:mg:prev' || data === 'admin:mg:next') {
            await answerCallbackQuery(env.TELEGRAM_BOT_TOKEN, query.id);
            const questions = await getJSON<Question[]>(env.STATE, 'questions', []);
            const indexKey = `idx:${env.TARGET_GROUP_ID}`;
            const currentIndex = await getJSON<number>(env.STATE, indexKey, 0);
            const upcoming = questions.slice(currentIndex);
            if (upcoming.length === 0) {
              await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId!, 'No questions in database.');
            } else {
              const idxStr = (await env.STATE.get('admin:manage:index')) || '0';
              let idx = parseInt(idxStr, 10) || 0;
              if (data === 'admin:mg:next') idx = (idx + 1) % upcoming.length;
              if (data === 'admin:mg:prev') idx = (idx - 1 + upcoming.length) % upcoming.length;
              await env.STATE.put('admin:manage:index', String(idx));
              const txt = formatQuestionPreview(upcoming[idx], currentIndex + idx);
              const kb = { inline_keyboard: [[
                { text: '⬅️ Prev', callback_data: 'admin:mg:prev' },
                { text: '➡️ Next', callback_data: 'admin:mg:next' }
              ], [
                { text: '📝 Edit', callback_data: `admin:edit:${currentIndex + idx}` },
                { text: '🗑️ Delete', callback_data: `admin:del:${currentIndex + idx}` }
              ], [
                { text: '✖️ Close', callback_data: 'admin:mg:close' }
              ]] };
              await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId!, txt, { reply_markup: kb });
            }
          } else if (data.startsWith('admin:del:')) {
            await answerCallbackQuery(env.TELEGRAM_BOT_TOKEN, query.id);
            const parts = data.split(':');
            const idx = parseInt(parts[2], 10);
            const list = await getJSON<Question[]>(env.STATE, 'questions', []);
            if (idx >= 0 && idx < list.length) {
              list.splice(idx, 1);
              await putJSON(env.STATE, 'questions', list);
              await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId!, `🗑️ Deleted question #${idx + 1}. Remaining: ${list.length}`);
            } else {
              await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId!, '❌ Invalid index');
            }
          } else if (data === 'admin:listAll') {
            await answerCallbackQuery(env.TELEGRAM_BOT_TOKEN, query.id);
            const questions = await getJSON<Question[]>(env.STATE, 'questions', []);
            if (questions.length === 0) {
              await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId!, 'No questions in database.');
            } else {
              // Build a concise list with truncation to respect Telegram's message limits
              const lines: string[] = [];
              for (let i = 0; i < questions.length; i++) {
                const q = questions[i];
                const line = `#${i + 1} ${truncate(q.question.replace(/\n/g, ' '), 80)} [Ans: ${q.answer}]`;
                lines.push(line);
              }
              const chunks = chunkLines(lines, 3500);
              for (const chunk of chunks) {
                await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId!, `<pre>${esc(chunk)}</pre>`);
              }
              await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId!, `Total: ${questions.length} questions.`);
            }
          } else if (data.startsWith('admin:edit:')) {
            await answerCallbackQuery(env.TELEGRAM_BOT_TOKEN, query.id);
            const parts = data.split(':');
            const idx = parseInt(parts[2], 10);
            await env.STATE.put('admin:edit:idx', String(idx));
            const list = await getJSON<Question[]>(env.STATE, 'questions', []);
            if (idx >= 0 && idx < list.length) {
              const current = list[idx];
              const example = JSON.stringify(current, null, 2);
              await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId!, `Send updated question as JSON for #${idx + 1} like:\n\n<pre>${esc(example)}</pre>`);
            } else {
              await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId!, '❌ Invalid index');
            }
          }
        }
        
        return new Response('OK');
      } else if (url.pathname === '/tick' && request.method === 'GET') {
        await ensureKeys(env.STATE);
        await initializeBotIfNeeded(env.STATE, env.TELEGRAM_BOT_TOKEN, env.TARGET_GROUP_ID);
        await postNext(env.STATE, env.TELEGRAM_BOT_TOKEN, env.TARGET_GROUP_ID);
        return new Response('MCQ posted');
      } else if (url.pathname === '/start-posting' && request.method === 'GET') {
        await ensureKeys(env.STATE);
        await initializeBotIfNeeded(env.STATE, env.TELEGRAM_BOT_TOKEN, env.TARGET_GROUP_ID);
        return new Response('Bot initialized and first MCQ posted');
      } else if (url.pathname === '/health' && request.method === 'GET') {
        return new Response('ok');
      }
      
      return new Response('Not Found', { status: 404 });
    } catch (error) {
      console.error('Error:', error);
      return new Response('Internal Server Error', { status: 500 });
    }
  },
  
  async scheduled(event: ScheduledEvent, env: Env): Promise<void> {
    try {
      await ensureKeys(env.STATE);
      await initializeBotIfNeeded(env.STATE, env.TELEGRAM_BOT_TOKEN, env.TARGET_GROUP_ID);
      await postNext(env.STATE, env.TELEGRAM_BOT_TOKEN, env.TARGET_GROUP_ID);
    } catch (error) {
      console.error('Scheduled error:', error);
    }
  }
};
