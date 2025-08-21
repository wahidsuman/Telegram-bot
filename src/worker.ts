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

async function uploadQuestionsFromFile(kv: KVNamespace, token: string, fileId: string, targetGroupId: string): Promise<{ uploaded: number; total: number; sent: number; unsent: number }> {
  const fileInfo = await getFile(token, fileId);
  
  if (!fileInfo.ok) {
    throw new Error('Failed to get file info');
  }
  
  const content = await downloadFile(token, fileInfo.result.file_path);
  
  let newQuestions: Question[] = [];
  
  try {
    // Try parsing as JSON array first
    const parsed = JSON.parse(content);
    if (Array.isArray(parsed)) {
      newQuestions = parsed;
    } else {
      newQuestions = [parsed];
    }
  } catch {
    // Try parsing as JSONL
    const lines = content.split('\n').filter(line => line.trim());
    for (const line of lines) {
      try {
        const q = JSON.parse(line);
        newQuestions.push(q);
      } catch {
        throw new Error('Invalid JSON format');
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
  const allQuestions = [...existingQuestions, ...validQuestions];
  
  await putJSON(kv, 'questions', allQuestions);
  
  // Get current index to calculate sent vs unsent
  const indexKey = `idx:${targetGroupId}`;
  const currentIndex = await getJSON<number>(kv, indexKey, 0);
  
  return {
    uploaded: validQuestions.length,
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
            if (message.text === '/start') {
              const keyboard = {
                inline_keyboard: [
                  [{ text: '📤 Upload Questions', callback_data: 'admin:upload' }],
                  [{ text: '📊 Daily Report', callback_data: 'admin:daily' }],
                  [{ text: '📈 Monthly Report', callback_data: 'admin:monthly' }]
                ]
              };
              
              await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, 'Admin Panel', { reply_markup: keyboard });
            } else if (message.document) {
              // Handle file upload - ensure we respond to admin
              try {
                console.log('Processing file upload from admin:', chatId);
                const result = await uploadQuestionsFromFile(env.STATE, env.TELEGRAM_BOT_TOKEN, message.document.file_id, env.TARGET_GROUP_ID);
                
                const responseMessage = `✅ Successfully uploaded ${result.uploaded} questions!\n\n📊 Database Status:\n• Total questions in database: ${result.total}\n• Questions already sent: ${result.sent}\n• Questions remaining unsent: ${result.unsent}`;
                
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
              
              // Create popup with correct/wrong, explanation, and discount message
              let explanation = question.explanation;
              if (explanation.length > 120) {
                explanation = explanation.substring(0, 120) + '...';
              }
              
              const resultText = isCorrect ? '✅ Correct!' : '❌ Wrong!';
              const popup = `${resultText}\n\n${explanation}\n\n(to know more prepladder Discounts text me)`;
              
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
              'Thank you for Purchasing With Our Code P650. If You want more discount, you can always click on the bargain button');
            
            // Notify admin with username
            const userName = `${query.from.first_name}${query.from.last_name ? ' ' + query.from.last_name : ''}`;
            const username = query.from.username ? `@${query.from.username}` : '—';
            await sendMessage(env.TELEGRAM_BOT_TOKEN, env.ADMIN_CHAT_ID, 
              `💰 Code Used: P650\n\nUser: ${userName}\nUsername: ${username}\nUser ID: ${userId}\n\nUser has copied the discount code!`);
              
          } else if (data === 'coupon:bargain') {
            await answerCallbackQuery(env.TELEGRAM_BOT_TOKEN, query.id, 
              'Stay Still Admin Will reply shortly, be ready with your bargaining skills…😆😆😆', true);
            
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
