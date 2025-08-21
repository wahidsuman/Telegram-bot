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

interface AdminState {
  mode: 'normal' | 'viewing_questions' | 'deleting_question' | 'editing_question' | 'sending_to_group';
  page?: number;
  questionIndex?: number;
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
  photo?: Array<{
    file_id: string;
    file_unique_id: string;
    width: number;
    height: number;
    file_size?: number;
  }>;
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
  const recentKey = `recent:${chatId}`;
  const currentIndex = await getJSON<number>(kv, indexKey, 0);
  const recentQuestions = await getJSON<number[]>(kv, recentKey, []);
  
  // Ensure we don't go out of bounds if questions were removed
  let safeIndex = currentIndex % questions.length;
  
  // If we have more than 5 questions, avoid recently sent ones
  if (questions.length > 5) {
    let attempts = 0;
    while (recentQuestions.includes(safeIndex) && attempts < questions.length) {
      safeIndex = (safeIndex + 1) % questions.length;
      attempts++;
    }
  }
  
  const question = questions[safeIndex];
  const nextIndex = (safeIndex + 1) % questions.length;
  
  // Update recent questions list (keep last 5)
  const updatedRecent = [safeIndex, ...recentQuestions.filter(idx => idx !== safeIndex)].slice(0, Math.min(5, Math.floor(questions.length / 2)));
  
  await putJSON(kv, indexKey, nextIndex);
  await putJSON(kv, recentKey, updatedRecent);
  
  // Add timestamp and question ID to make each question unique
  const timestamp = new Date().toISOString();
  const questionId = `${safeIndex}_${Date.now()}`;
  
  const text = `🧠 Hourly MCQ #${safeIndex + 1}\n\n${esc(question.question)}\n\nA) ${esc(question.options.A)}\nB) ${esc(question.options.B)}\nC) ${esc(question.options.C)}\nD) ${esc(question.options.D)}\n\n⏰ Posted: ${timestamp.split('T')[1].split('.')[0]} UTC`;
  
  const keyboard = {
    inline_keyboard: [[
      { text: 'A', callback_data: `ans:${questionId}:A` },
      { text: 'B', callback_data: `ans:${questionId}:B` },
      { text: 'C', callback_data: `ans:${questionId}:C` },
      { text: 'D', callback_data: `ans:${questionId}:D` }
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

async function uploadQuestionsFromText(kv: KVNamespace, content: string, targetGroupId: string): Promise<{ uploaded: number; total: number; sent: number; unsent: number }> {
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

async function uploadQuestionsFromFile(kv: KVNamespace, token: string, fileId: string, targetGroupId: string): Promise<{ uploaded: number; total: number; sent: number; unsent: number }> {
  const fileInfo = await getFile(token, fileId);
  
  if (!fileInfo.ok) {
    throw new Error('Failed to get file info');
  }
  
  const content = await downloadFile(token, fileInfo.result.file_path);
  return await uploadQuestionsFromText(kv, content, targetGroupId);
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

async function formatQuestionsList(kv: KVNamespace, page: number = 0, pageSize: number = 5): Promise<{ text: string; hasMore: boolean; totalPages: number }> {
  const questions = await getJSON<Question[]>(kv, 'questions', []);
  
  if (questions.length === 0) {
    return { text: '📝 No questions in database yet.', hasMore: false, totalPages: 0 };
  }
  
  const totalPages = Math.ceil(questions.length / pageSize);
  const startIdx = page * pageSize;
  const endIdx = Math.min(startIdx + pageSize, questions.length);
  const pageQuestions = questions.slice(startIdx, endIdx);
  
  let text = `📚 Questions Database (Page ${page + 1}/${totalPages})\n`;
  text += `Total: ${questions.length} questions\n\n`;
  
  for (let i = 0; i < pageQuestions.length; i++) {
    const globalIdx = startIdx + i;
    const q = pageQuestions[i];
    const shortQuestion = q.question.length > 60 ? q.question.substring(0, 60) + '...' : q.question;
    text += `${globalIdx + 1}. ${shortQuestion}\n`;
    text += `   Answer: ${q.answer}) ${q.options[q.answer]}\n\n`;
  }
  
  return {
    text,
    hasMore: endIdx < questions.length,
    totalPages
  };
}

async function deleteQuestion(kv: KVNamespace, questionIndex: number, targetGroupId: string): Promise<{ success: boolean; message: string }> {
  const questions = await getJSON<Question[]>(kv, 'questions', []);
  
  if (questionIndex < 0 || questionIndex >= questions.length) {
    return { success: false, message: 'Invalid question index' };
  }
  
  const deletedQuestion = questions[questionIndex];
  questions.splice(questionIndex, 1);
  await putJSON(kv, 'questions', questions);
  
  // Adjust the current index if needed
  const indexKey = `idx:${targetGroupId}`;
  const currentIndex = await getJSON<number>(kv, indexKey, 0);
  if (currentIndex > questions.length) {
    await putJSON(kv, indexKey, questions.length > 0 ? 0 : 0);
  }
  
  // Clear recent questions cache to avoid stale indices
  const recentKey = `recent:${targetGroupId}`;
  await putJSON(kv, recentKey, []);
  
  const shortQuestion = deletedQuestion.question.length > 50 ? 
    deletedQuestion.question.substring(0, 50) + '...' : deletedQuestion.question;
  
  return { 
    success: true, 
    message: `✅ Deleted question #${questionIndex + 1}: "${shortQuestion}"\n\n📊 ${questions.length} questions remaining in database.` 
  };
}

async function sendToGroup(token: string, groupId: string, message: TelegramMessage): Promise<void> {
  if (message.text) {
    // Send text message
    await sendMessage(token, groupId, `📢 Admin Message:\n\n${message.text}`);
  } else if (message.photo && message.photo.length > 0) {
    // Send photo (use the largest size)
    const photo = message.photo[message.photo.length - 1];
    const url = `https://api.telegram.org/bot${token}/sendPhoto`;
    const body = {
      chat_id: groupId,
      photo: photo.file_id,
      caption: message.text ? `📢 Admin: ${message.text}` : '📢 Photo from admin'
    };
    
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
  } else if (message.document) {
    // Send document
    const url = `https://api.telegram.org/bot${token}/sendDocument`;
    const body = {
      chat_id: groupId,
      document: message.document.file_id,
      caption: message.text ? `📢 Admin: ${message.text}` : '📢 Document from admin'
    };
    
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
  }
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
              // Reset admin state
              await putJSON(env.STATE, `admin_state:${chatId}`, { mode: 'normal' });
              
              const keyboard = {
                inline_keyboard: [
                  [{ text: '📤 Upload Questions', callback_data: 'admin:upload' }],
                  [{ text: '📚 Manage Questions', callback_data: 'admin:manage' }],
                  [{ text: '📢 Send to Group', callback_data: 'admin:send' }],
                  [{ text: '📊 Daily Report', callback_data: 'admin:daily' }],
                  [{ text: '📈 Monthly Report', callback_data: 'admin:monthly' }]
                ]
              };
              
              await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, '🤖 Admin Panel\n\nChoose an action:', { reply_markup: keyboard });
            } else if (message.document) {
              // Check admin state to determine how to handle the document
              const adminState = await getJSON<AdminState>(env.STATE, `admin_state:${chatId}`, { mode: 'normal' });
              
              if (adminState.mode === 'sending_to_group') {
                // Admin is sending a document to the group
                try {
                  await sendToGroup(env.TELEGRAM_BOT_TOKEN, env.TARGET_GROUP_ID, message);
                  await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, '✅ Document sent to group successfully!');
                  await putJSON(env.STATE, `admin_state:${chatId}`, { mode: 'normal' });
                } catch (error) {
                  await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, `❌ Error sending document to group: ${error instanceof Error ? error.message : 'Unknown error'}`);
                }
              } else {
                // Normal mode - handle as question upload
                try {
                  console.log('Processing file upload from admin:', chatId);
                  const result = await uploadQuestionsFromFile(env.STATE, env.TELEGRAM_BOT_TOKEN, message.document.file_id, env.TARGET_GROUP_ID);
                  
                  const responseMessage = `✅ Successfully uploaded ${result.uploaded} questions!\n\n📊 Database Status:\n• Total questions in database: ${result.total}\n• Questions already sent: ${result.sent}\n• Questions remaining unsent: ${result.unsent}\n\n💡 Tip: You can also send JSON text directly (no file needed)!`;
                  
                  console.log('Sending response to admin:', responseMessage);
                  await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, responseMessage);
                  
                } catch (error) {
                  console.error('File upload error:', error);
                  const errorMessage = `❌ Error uploading questions: ${error instanceof Error ? error.message : 'Unknown error'}`;
                  await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, errorMessage);
                }
              }
            } else if (message.text && message.text !== '/start') {
              // Check admin state to determine how to handle the message
              const adminState = await getJSON<AdminState>(env.STATE, `admin_state:${chatId}`, { mode: 'normal' });
              
              if (adminState.mode === 'sending_to_group') {
                // Admin is sending a message to the group
                try {
                  await sendToGroup(env.TELEGRAM_BOT_TOKEN, env.TARGET_GROUP_ID, message);
                  await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, '✅ Message sent to group successfully!');
                  await putJSON(env.STATE, `admin_state:${chatId}`, { mode: 'normal' });
                } catch (error) {
                  await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, `❌ Error sending to group: ${error instanceof Error ? error.message : 'Unknown error'}`);
                }
              } else if (adminState.mode === 'deleting_question') {
                // Admin is entering question number to delete
                const questionNum = parseInt(message.text.trim());
                if (isNaN(questionNum) || questionNum < 1) {
                  await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, '❌ Please enter a valid question number (e.g., 1, 2, 3...)');
                  return new Response('OK');
                }
                
                const result = await deleteQuestion(env.STATE, questionNum - 1, env.TARGET_GROUP_ID);
                await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, result.message);
                await putJSON(env.STATE, `admin_state:${chatId}`, { mode: 'normal' });
              } else {
                // Normal mode - try to upload as JSON
                try {
                  console.log('Processing JSON text from admin:', chatId);
                  const result = await uploadQuestionsFromText(env.STATE, message.text, env.TARGET_GROUP_ID);
                  
                  const responseMessage = `✅ Successfully uploaded ${result.uploaded} questions from text!\n\n📊 Database Status:\n• Total questions in database: ${result.total}\n• Questions already sent: ${result.sent}\n• Questions remaining unsent: ${result.unsent}\n\n🔄 Next question will be #${result.sent + 1}`;
                  
                  console.log('Sending response to admin:', responseMessage);
                  await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, responseMessage);
                  
                } catch (error) {
                  console.error('JSON text upload error:', error);
                  const errorMessage = `❌ Error uploading questions from text: ${error instanceof Error ? error.message : 'Unknown error'}\n\n💡 Make sure to send valid JSON format:\n[{"question":"...", "options":{"A":"...", "B":"...", "C":"...", "D":"..."}, "answer":"A", "explanation":"..."}]`;
                  await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, errorMessage);
                }
              }
            } else if (message.photo) {
              // Handle photo upload for sending to group
              const adminState = await getJSON<AdminState>(env.STATE, `admin_state:${chatId}`, { mode: 'normal' });
              
              if (adminState.mode === 'sending_to_group') {
                try {
                  await sendToGroup(env.TELEGRAM_BOT_TOKEN, env.TARGET_GROUP_ID, message);
                  await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, '✅ Photo sent to group successfully!');
                  await putJSON(env.STATE, `admin_state:${chatId}`, { mode: 'normal' });
                } catch (error) {
                  await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, `❌ Error sending photo to group: ${error instanceof Error ? error.message : 'Unknown error'}`);
                }
              } else {
                await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, '📷 To send photos to the group, use the "Send to Group" feature from the admin panel.');
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
            // MCQ answer - handle both old format (qid) and new format (qid_timestamp)
            const [, qidStr, answer] = data.split(':');
            const qid = parseInt(qidStr.split('_')[0]); // Extract question index from questionId
            
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
              '📤 Upload Questions\n\nYou can upload questions in two ways:\n\n1️⃣ **JSON File**: Send a .json file\n2️⃣ **JSON Text**: Send JSON directly as a message\n\nFormat: Array of objects or JSONL (one object per line)\n\nExample:\n[{"question":"What is 2+2?", "options":{"A":"3", "B":"4", "C":"5", "D":"6"}, "answer":"B", "explanation":"2+2=4"}]');
              
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
            
          } else if (data === 'admin:manage') {
            await answerCallbackQuery(env.TELEGRAM_BOT_TOKEN, query.id);
            const questionsList = await formatQuestionsList(env.STATE, 0);
            
            const keyboard = {
              inline_keyboard: [
                [{ text: '👀 View Questions', callback_data: 'admin:view:0' }],
                [{ text: '🗑️ Delete Question', callback_data: 'admin:delete_mode' }],
                [{ text: '🔙 Back to Main', callback_data: 'admin:main' }]
              ]
            };
            
            await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId!, `📚 Question Management\n\n${questionsList.text}`, { reply_markup: keyboard });
            
          } else if (data === 'admin:send') {
            await answerCallbackQuery(env.TELEGRAM_BOT_TOKEN, query.id);
            await putJSON(env.STATE, `admin_state:${chatId}`, { mode: 'sending_to_group' });
            
            const keyboard = {
              inline_keyboard: [
                [{ text: '❌ Cancel', callback_data: 'admin:main' }]
              ]
            };
            
            await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId!, 
              '📢 Send to Group Mode\n\nSend any message (text, photo, or document) and it will be forwarded to the group.\n\nWhat would you like to send?', 
              { reply_markup: keyboard });
              
          } else if (data.startsWith('admin:view:')) {
            const page = parseInt(data.split(':')[2]) || 0;
            await answerCallbackQuery(env.TELEGRAM_BOT_TOKEN, query.id);
            
            const questionsList = await formatQuestionsList(env.STATE, page);
            const keyboard: { inline_keyboard: Array<Array<{ text: string; callback_data: string }>> } = {
              inline_keyboard: []
            };
            
            // Navigation buttons
            const navRow: Array<{ text: string; callback_data: string }> = [];
            if (page > 0) {
              navRow.push({ text: '⬅️ Previous', callback_data: `admin:view:${page - 1}` });
            }
            if (questionsList.hasMore) {
              navRow.push({ text: 'Next ➡️', callback_data: `admin:view:${page + 1}` });
            }
            if (navRow.length > 0) {
              keyboard.inline_keyboard.push(navRow);
            }
            
            keyboard.inline_keyboard.push([{ text: '🔙 Back to Management', callback_data: 'admin:manage' }]);
            
            await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId!, questionsList.text, { reply_markup: keyboard });
            
          } else if (data === 'admin:delete_mode') {
            await answerCallbackQuery(env.TELEGRAM_BOT_TOKEN, query.id);
            await putJSON(env.STATE, `admin_state:${chatId}`, { mode: 'deleting_question' });
            
            const keyboard = {
              inline_keyboard: [
                [{ text: '❌ Cancel', callback_data: 'admin:manage' }]
              ]
            };
            
            await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId!, 
              '🗑️ Delete Question\n\nEnter the question number you want to delete (e.g., 1, 2, 3...)\n\n⚠️ This action cannot be undone!', 
              { reply_markup: keyboard });
              
          } else if (data === 'admin:main') {
            await answerCallbackQuery(env.TELEGRAM_BOT_TOKEN, query.id);
            await putJSON(env.STATE, `admin_state:${chatId}`, { mode: 'normal' });
            
            const keyboard = {
              inline_keyboard: [
                [{ text: '📤 Upload Questions', callback_data: 'admin:upload' }],
                [{ text: '📚 Manage Questions', callback_data: 'admin:manage' }],
                [{ text: '📢 Send to Group', callback_data: 'admin:send' }],
                [{ text: '📊 Daily Report', callback_data: 'admin:daily' }],
                [{ text: '📈 Monthly Report', callback_data: 'admin:monthly' }]
              ]
            };
            
            await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId!, '🤖 Admin Panel\n\nChoose an action:', { reply_markup: keyboard });
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
