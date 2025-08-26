/// <reference types="@cloudflare/workers-types" />

interface Env {
  STATE: KVNamespace;
  TELEGRAM_BOT_TOKEN: string;
  TARGET_GROUP_ID: string;
  TARGET_CHANNEL_ID?: string;
  TARGET_DISCUSSION_GROUP_ID?: string;
  BOT_USERNAME?: string;
  ADMIN_CHAT_ID: string;
  ADMIN_USERNAME?: string;
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

interface DiscountButton {
  id: string;
  name: string;
  message1: string;
  message2: string;
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

// Discount button management
async function getDiscountButtons(kv: KVNamespace): Promise<DiscountButton[]> {
  return await getJSON<DiscountButton[]>(kv, 'discount_buttons', [
    {
      id: 'prepladder',
      name: 'Prepladder',
      message1: 'P650',
      message2: '⬆️ Copy This Code P650 To Get Best Prepladder Discounts For All The Prepladder Plans.If You Need Extra Discount You Can Click On The Contact Admin Button 🔘'
    }
  ]);
}

async function saveDiscountButtons(kv: KVNamespace, buttons: DiscountButton[]): Promise<void> {
  await putJSON(kv, 'discount_buttons', buttons);
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
  try {
    console.log('sendMessage called:', { chatId, text: text.substring(0, 100) });
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
    
    const result = await response.json();
    console.log('sendMessage result:', { ok: result.ok, status: response.status });
    return result;
  } catch (error) {
    console.error('sendMessage error:', error);
    throw error;
  }
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

async function initializeBotIfNeeded(kv: KVNamespace, token: string, targetGroupId: string, extraChannelId?: string, discussionGroupId?: string): Promise<void> {
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
  const chatsToInit = [targetGroupId, ...(extraChannelId ? [extraChannelId] : []), ...(discussionGroupId ? [discussionGroupId] : [])];
  for (const chatId of chatsToInit) {
    const indexKey = `idx:${chatId}`;
    const currentIndex = await getJSON<number>(kv, indexKey, -1);
    if (currentIndex === -1) {
      await putJSON(kv, indexKey, 0);
      // Post the first question immediately to start the cycle
      try {
        await postNext(kv, token, chatId);
      } catch (error) {
        console.log('Error posting initial question to', chatId, error);
      }
    }
  }
}

async function incrementStatsFirstAttemptOnly(kv: KVNamespace, userId: number, qid: number, isCorrect: boolean, tz: string): Promise<void> {
  const userIdStr = userId.toString();
  const qidStr = String(qid);
  const today = getCurrentDate(tz);
  const month = getCurrentMonth(tz);

  // Track seen attempts per period per user
  const seenDailyKey = `seen:daily:${today}:${userIdStr}`;
  const seenMonthlyKey = `seen:monthly:${month}:${userIdStr}`;
  const seenDaily = await getJSON<Record<string, boolean>>(kv, seenDailyKey, {});
  const seenMonthly = await getJSON<Record<string, boolean>>(kv, seenMonthlyKey, {});

  // If already attempted this question for both periods, skip counting
  const alreadyDaily = !!seenDaily[qidStr];
  const alreadyMonthly = !!seenMonthly[qidStr];

  // Load stats records
  const dailyKey = `stats:daily:${today}`;
  const monthlyKey = `stats:monthly:${month}`;
  const dailyStats = await getJSON<DayStats>(kv, dailyKey, { total: 0, users: {} });
  const monthlyStats = await getJSON<DayStats>(kv, monthlyKey, { total: 0, users: {} });

  if (!alreadyDaily) {
    dailyStats.total += 1;
    if (!dailyStats.users[userIdStr]) dailyStats.users[userIdStr] = { cnt: 0, correct: 0 };
    dailyStats.users[userIdStr].cnt += 1;
    if (isCorrect) dailyStats.users[userIdStr].correct += 1;
    seenDaily[qidStr] = true;
    await putJSON(kv, seenDailyKey, seenDaily);
    await putJSON(kv, dailyKey, dailyStats);
  }

  if (!alreadyMonthly) {
    monthlyStats.total += 1;
    if (!monthlyStats.users[userIdStr]) monthlyStats.users[userIdStr] = { cnt: 0, correct: 0 };
    monthlyStats.users[userIdStr].cnt += 1;
    if (isCorrect) monthlyStats.users[userIdStr].correct += 1;
    seenMonthly[qidStr] = true;
    await putJSON(kv, seenMonthlyKey, seenMonthly);
    await putJSON(kv, monthlyKey, monthlyStats);
  }
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
  
  const text = `<b>🧠 Hourly MCQ #${currentIndex + 1}</b>\n\n<b>${esc(question.question)}</b>\n\nA) ${esc(question.options.A)}\nB) ${esc(question.options.B)}\nC) ${esc(question.options.C)}\nD) ${esc(question.options.D)}`;
  
  const keyboard = {
    inline_keyboard: [
      [
        { text: 'A', callback_data: `ans:${currentIndex}:A` },
        { text: 'B', callback_data: `ans:${currentIndex}:B` },
        { text: 'C', callback_data: `ans:${currentIndex}:C` },
        { text: 'D', callback_data: `ans:${currentIndex}:D` }
      ],
      [
        { text: '💬 Join Discussion', url: 'https://t.me/+u0P8X-ZWHU1jMDQ1' },
        { text: '📊 Your Stats', callback_data: 'user:stats' }
      ]
    ]
  };
  
  await sendMessage(token, chatId, text, { reply_markup: keyboard, parse_mode: 'HTML' });
}

async function postNextToAll(kv: KVNamespace, token: string, groupId: string, extraChannelId?: string, discussionGroupId?: string): Promise<void> {
  const questions = await getJSON<Question[]>(kv, 'questions', []);
  
  if (questions.length === 0) {
    console.log('No questions available');
    return;
  }
  
  const indexKey = `idx:${groupId}`;
  const currentIndex = await getJSON<number>(kv, indexKey, 0);
  
  const question = questions[currentIndex];
  const nextIndex = (currentIndex + 1) % questions.length;
  
  await putJSON(kv, indexKey, nextIndex);
  
  // Post to main group and channel (without answers)
  const text = `<b>🧠 Hourly MCQ #${currentIndex + 1}</b>\n\n<b>${esc(question.question)}</b>\n\nA) ${esc(question.options.A)}\nB) ${esc(question.options.B)}\nC) ${esc(question.options.C)}\nD) ${esc(question.options.D)}`;
  
  const keyboard = {
    inline_keyboard: [
      [
        { text: 'A', callback_data: `ans:${currentIndex}:A` },
        { text: 'B', callback_data: `ans:${currentIndex}:B` },
        { text: 'C', callback_data: `ans:${currentIndex}:C` },
        { text: 'D', callback_data: `ans:${currentIndex}:D` }
      ],
      [
        { text: '💬 Join Discussion', url: 'https://t.me/+u0P8X-ZWHU1jMDQ1' },
        { text: '📊 Your Stats', callback_data: 'user:stats' }
      ]
    ]
  };
  
  await sendMessage(token, groupId, text, { reply_markup: keyboard, parse_mode: 'HTML' });
  
  if (extraChannelId) {
    await sendMessage(token, extraChannelId, text, { reply_markup: keyboard, parse_mode: 'HTML' });
  }
  
  // Post to discussion group with answer included
  if (discussionGroupId) {
    const discussionText = `<b>🧠 Hourly MCQ #${currentIndex + 1}</b>\n\n<b>${esc(question.question)}</b>\n\nA) ${esc(question.options.A)}\nB) ${esc(question.options.B)}\nC) ${esc(question.options.C)}\nD) ${esc(question.options.D)}\n\n<b>✅ Answer: ${question.answer}</b>\n\n<b>📝 Explanation:</b>\n${esc(question.explanation)}`;
    
    const discussionKeyboard = {
      inline_keyboard: [
        [
          { text: '📊 Your Stats', callback_data: 'user:stats' }
        ]
      ]
    };
    
    await sendMessage(token, discussionGroupId, discussionText, { reply_markup: discussionKeyboard, parse_mode: 'HTML' });
  }
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

function validateQuestion(q: any): boolean {
  // Check if all required fields exist
  if (!q.question || !q.options || !q.answer || !q.explanation) {
    return false;
  }
  
  // Check if answer is valid
  if (!['A', 'B', 'C', 'D'].includes(q.answer)) {
    return false;
  }
  
  // Check if all options exist
  if (!q.options.A || !q.options.B || !q.options.C || !q.options.D) {
    return false;
  }
  
  // Check if answer text matches the selected option
  const answerText = q.options[q.answer];
  if (!answerText || answerText.trim() === '') {
    return false;
  }
  
  return true;
}

function formatQuestionPreview(q: Question, index: number): string {
  return `#${index + 1}\n\n${esc(q.question)}\n\nA) ${esc(q.options.A)}\nB) ${esc(q.options.B)}\nC) ${esc(q.options.C)}\nD) ${esc(q.options.D)}\n\nAnswer: ${q.answer}`;
}

async function showQuestionsPage(kv: KVNamespace, token: string, chatId: number, questions: Question[], page: number): Promise<void> {
  console.log('showQuestionsPage called:', { page, totalQuestions: questions.length });
  const questionsPerPage = 10;
  const startIndex = page * questionsPerPage;
  const endIndex = Math.min(startIndex + questionsPerPage, questions.length);
  const pageQuestions = questions.slice(startIndex, endIndex);
  console.log('Page calculation:', { startIndex, endIndex, pageQuestionsLength: pageQuestions.length });
  
  let message = `📚 All Questions (Page ${page + 1}/${Math.ceil(questions.length / questionsPerPage)})\n\n`;
  message += `Showing questions ${startIndex + 1}-${endIndex} of ${questions.length}\n\n`;
  
  for (let i = 0; i < pageQuestions.length; i++) {
    const q = pageQuestions[i];
    const questionIndex = startIndex + i;
    message += `#${questionIndex + 1} ${truncate(q.question.replace(/\n/g, ' '), 60)} [Ans: ${q.answer}]\n\n`;
  }
  
  // Create navigation buttons
  const keyboard: any[] = [];
  
  // Add edit/delete buttons for each question (2 rows of 5 buttons each)
  const editDeleteRow1: any[] = [];
  const editDeleteRow2: any[] = [];
  
  for (let i = 0; i < Math.min(5, pageQuestions.length); i++) {
    const questionIndex = startIndex + i;
    editDeleteRow1.push({ text: `📝${questionIndex + 1}`, callback_data: `admin:edit:${questionIndex}` });
  }
  
  for (let i = 5; i < pageQuestions.length; i++) {
    const questionIndex = startIndex + i;
    editDeleteRow2.push({ text: `📝${questionIndex + 1}`, callback_data: `admin:edit:${questionIndex}` });
  }
  
  if (editDeleteRow1.length > 0) keyboard.push(editDeleteRow1);
  if (editDeleteRow2.length > 0) keyboard.push(editDeleteRow2);
  
  // Add delete buttons row
  const deleteRow1: any[] = [];
  const deleteRow2: any[] = [];
  
  for (let i = 0; i < Math.min(5, pageQuestions.length); i++) {
    const questionIndex = startIndex + i;
    deleteRow1.push({ text: `🗑️${questionIndex + 1}`, callback_data: `admin:del:${questionIndex}` });
  }
  
  for (let i = 5; i < pageQuestions.length; i++) {
    const questionIndex = startIndex + i;
    deleteRow2.push({ text: `🗑️${questionIndex + 1}`, callback_data: `admin:del:${questionIndex}` });
  }
  
  if (deleteRow1.length > 0) keyboard.push(deleteRow1);
  if (deleteRow2.length > 0) keyboard.push(deleteRow2);
  
  // Add navigation buttons
  const navRow: any[] = [];
  if (page > 0) {
    navRow.push({ text: '⬅️ Prev', callback_data: 'admin:listAll:prev' });
  }
  if (endIndex < questions.length) {
    navRow.push({ text: 'Next ➡️', callback_data: 'admin:listAll:next' });
  }
  if (navRow.length > 0) {
    keyboard.push(navRow);
  }
  
  // Add close button
  keyboard.push([{ text: '✖️ Close', callback_data: 'admin:listAll:close' }]);
  
  await sendMessage(token, chatId, message, { reply_markup: { inline_keyboard: keyboard } });
}

async function handleDiscountButtonCreation(kv: KVNamespace, token: string, chatId: number, text: string, step: string): Promise<void> {
  const keyboard = {
    inline_keyboard: [[{ text: '✖️ Cancel', callback_data: 'admin:discountCancel' }]]
  };
  
  if (step === 'name') {
    await kv.put('admin:addDiscount:name', text);
    await kv.put('admin:addDiscount:pending', 'code');
    await sendMessage(token, chatId, `✅ Button name: **${text}**\n\nStep 2/4: Send the **discount code** (e.g., "M650", "P500")`, { reply_markup: keyboard, parse_mode: 'Markdown' });
  } else if (step === 'code') {
    await kv.put('admin:addDiscount:code', text);
    await kv.put('admin:addDiscount:pending', 'message');
    await sendMessage(token, chatId, `✅ Discount code: \`${text}\`\n\nStep 3/4: Send the **follow-up message** (what users see after clicking the button)`, { reply_markup: keyboard, parse_mode: 'Markdown' });
  } else if (step === 'message') {
    await kv.put('admin:addDiscount:message', text);
    await kv.put('admin:addDiscount:pending', 'confirm');
    
    const name = await kv.get('admin:addDiscount:name') || '';
    const code = await kv.get('admin:addDiscount:code') || '';
    
    const confirmKeyboard = {
      inline_keyboard: [
        [{ text: '✅ Confirm & Save', callback_data: 'admin:confirmDiscount' }],
        [{ text: '✖️ Cancel', callback_data: 'admin:discountCancel' }]
      ]
    };
    
    await sendMessage(token, chatId, `📋 **New Discount Button Preview:**\n\n**Name:** ${name}\n**Code:** \`${code}\`\n**Message:** ${text}\n\n✅ Confirm to save this discount button?`, { reply_markup: confirmKeyboard, parse_mode: 'Markdown' });
  }
}

async function handleDiscountButtonEditing(kv: KVNamespace, token: string, chatId: number, text: string, step: string): Promise<void> {
  const keyboard = {
    inline_keyboard: [[{ text: '✖️ Cancel', callback_data: 'admin:discountCancel' }]]
  };
  
  if (step === 'name') {
    await kv.put('admin:editDiscount:name', text);
    await kv.put('admin:editDiscount:pending', 'code');
    const currentCode = await kv.get('admin:editDiscount:code') || '';
    await sendMessage(token, chatId, `✅ New button name: **${text}**\n\nStep 2/4: Send the **new discount code** (current: \`${currentCode}\`)`, { reply_markup: keyboard, parse_mode: 'Markdown' });
  } else if (step === 'code') {
    await kv.put('admin:editDiscount:code', text);
    await kv.put('admin:editDiscount:pending', 'message');
    const currentMessage = await kv.get('admin:editDiscount:message') || '';
    await sendMessage(token, chatId, `✅ New discount code: \`${text}\`\n\nStep 3/4: Send the **new follow-up message** (current: ${currentMessage.substring(0, 50)}${currentMessage.length > 50 ? '...' : ''})`, { reply_markup: keyboard, parse_mode: 'Markdown' });
  } else if (step === 'message') {
    await kv.put('admin:editDiscount:message', text);
    await kv.put('admin:editDiscount:pending', 'confirm');
    
    const name = await kv.get('admin:editDiscount:name') || '';
    const code = await kv.get('admin:editDiscount:code') || '';
    const targetId = await kv.get('admin:editDiscount:target') || '';
    
    const confirmKeyboard = {
      inline_keyboard: [
        [{ text: '✅ Confirm & Update', callback_data: `admin:confirmEditDiscount:${targetId}` }],
        [{ text: '✖️ Cancel', callback_data: 'admin:discountCancel' }]
      ]
    };
    
    await sendMessage(token, chatId, `📋 **Updated Discount Button Preview:**\n\n**Name:** ${name}\n**Code:** \`${code}\`\n**Message:** ${text}\n\n✅ Confirm to update this discount button?`, { reply_markup: confirmKeyboard, parse_mode: 'Markdown' });
  }
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

function buildQuestionKey(q: Question): string {
  return (
    `${q.question}\u0001${q.options.A}\u0001${q.options.B}\u0001${q.options.C}\u0001${q.options.D}\u0001${q.answer}`
  ).toLowerCase();
}

function isSimilarQuestion(q1: Question, q2: Question): boolean {
  // Normalize questions for comparison
  const normalizeText = (text: string) => text.toLowerCase().replace(/[^\w\s]/g, '').replace(/\s+/g, ' ').trim();
  
  const q1Normalized = normalizeText(q1.question);
  const q2Normalized = normalizeText(q2.question);
  
  // Check if questions are very similar (allowing for minor variations)
  const similarityThreshold = 0.8; // 80% similarity
  
  // Simple similarity check - count common words
  const q1Words = new Set(q1Normalized.split(' ').filter(w => w.length > 3));
  const q2Words = new Set(q2Normalized.split(' ').filter(w => w.length > 3));
  
  const intersection = new Set([...q1Words].filter(x => q2Words.has(x)));
  const union = new Set([...q1Words, ...q2Words]);
  
  const similarity = intersection.size / union.size;
  
  // Also check if answers are the same (strong indicator of duplicate)
  const sameAnswer = q1.answer === q2.answer;
  
  // Check if options are similar (allowing for reordering)
  const q1Options = Object.values(q1.options).map(normalizeText).sort();
  const q2Options = Object.values(q2.options).map(normalizeText).sort();
  const optionsSimilar = JSON.stringify(q1Options) === JSON.stringify(q2Options);
  
  // Consider similar if:
  // 1. Questions are 80% similar AND have same answer, OR
  // 2. Questions are 90% similar, OR
  // 3. Questions are 70% similar AND have same answer AND same options
  return (similarity >= 0.8 && sameAnswer) || 
         similarity >= 0.9 || 
         (similarity >= 0.7 && sameAnswer && optionsSimilar);
}

function parseAdminTemplate(text: string): { question: string; options: { A: string; B: string; C: string; D: string }; explanation: string; answer?: 'A' | 'B' | 'C' | 'D' } | null {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const data: Record<string, string> = {};
  
  // Handle both formats:
  // 1. Question=, A=, B=, C=, D=, Answer=, Explanation=
  // 2. Question 1, A =, B =, C =, D =, Answer =, Explanation =
  
  for (const line of lines) {
    // Try format 1: key=value (including Question=, Answer=, Explanation=)
    let m = line.match(/^([A-Za-z]+)\s*=\s*(.*)$/);
    if (m) {
      const key = m[1].toLowerCase();
      const value = m[2].trim();
      data[key] = (data[key] ? data[key] + '\n' : '') + value;
      continue;
    }
    
    // Try format 2: key = value (with spaces around =)
    m = line.match(/^([A-Za-z]+)\s*=\s*(.*)$/);
    if (m) {
      const key = m[1].toLowerCase();
      const value = m[2].trim();
      data[key] = (data[key] ? data[key] + '\n' : '') + value;
      continue;
    }
    
    // Try format 3: Question 1, Question 2, etc. (numbered questions)
    m = line.match(/^Question\s+\d+\s*(.*)$/i);
    if (m) {
      const value = m[1].trim();
      if (value) {
        data['question'] = (data['question'] ? data['question'] + '\n' : '') + value;
      }
      continue;
    }
    
    // Try format 4: Just "Question" without number
    m = line.match(/^Question\s*(.*)$/i);
    if (m) {
      const value = m[1].trim();
      if (value) {
        data['question'] = (data['question'] ? data['question'] + '\n' : '') + value;
      }
      continue;
    }
  }
  
  // Check if we have all required fields
  if (!data['question'] || !data['a'] || !data['b'] || !data['c'] || !data['d'] || !data['explanation']) {
    return null;
  }
  
  const candidate: any = {
    question: data['question'],
    options: { A: data['a'], B: data['b'], C: data['c'], D: data['d'] },
    explanation: data['explanation']
  };
  
  if (data['answer']) {
    const ans = (data['answer'].trim().toUpperCase());
    if (['A','B','C','D'].includes(ans)) {
      candidate.answer = ans;
    }
  }
  
  return candidate;
}

function parseMultipleQuestions(text: string): Array<{ question: string; options: { A: string; B: string; C: string; D: string }; explanation: string; answer?: 'A' | 'B' | 'C' | 'D' }> {
  const questions: Array<{ question: string; options: { A: string; B: string; C: string; D: string }; explanation: string; answer?: 'A' | 'B' | 'C' | 'D' }> = [];
  
  // Split by "Question=" to separate multiple questions
  const questionBlocks = text.split(/(?=Question=)/).filter(block => block.trim());
  
  for (let i = 0; i < questionBlocks.length; i++) {
    const block = questionBlocks[i];
    const parsed = parseAdminTemplate(block);
    if (parsed) {
      questions.push(parsed);
    }
  }
  
  return questions;
}

async function uploadQuestionsFromFile(kv: KVNamespace, token: string, fileId: string, targetGroupId: string): Promise<{ uploaded: number; total: number; sent: number; unsent: number; skippedThisTime: number; skippedTotal: number }> {
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
  const skippedThisTime = Math.max(0, validQuestions.length - uniqueNew.length);
  const dupTotalKey = 'stats:duplicates_skipped_total';
  const prevDupTotal = await getJSON<number>(kv, dupTotalKey, 0 as unknown as number);
  const skippedTotal = (typeof prevDupTotal === 'number' ? prevDupTotal : 0) + skippedThisTime;
  await putJSON(kv, dupTotalKey, skippedTotal);
  
  // Get current index to calculate sent vs unsent
  const indexKey = `idx:${targetGroupId}`;
  const currentIndex = await getJSON<number>(kv, indexKey, 0);
  
  return {
    uploaded: uniqueNew.length,
    total: allQuestions.length,
    sent: currentIndex,
    unsent: Math.max(0, allQuestions.length - currentIndex),
    skippedThisTime,
    skippedTotal
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

const SHARD_SIZE = 1000;

async function getShardCount(kv: KVNamespace): Promise<number> {
  return await getJSON<number>(kv, 'q:shards', 0);
}

async function getTotalCount(kv: KVNamespace): Promise<number> {
  return await getJSON<number>(kv, 'q:count', 0);
}

async function setShardCount(kv: KVNamespace, n: number): Promise<void> {
  await putJSON(kv, 'q:shards', n);
}

async function setTotalCount(kv: KVNamespace, n: number): Promise<void> {
  await putJSON(kv, 'q:count', n);
}

async function readShard(kv: KVNamespace, shardIndex: number): Promise<Question[]> {
  return await getJSON<Question[]>(kv, `q:${shardIndex}`, []);
}

async function writeShard(kv: KVNamespace, shardIndex: number, items: Question[]): Promise<void> {
  await putJSON(kv, `q:${shardIndex}`, items);
}

function computeShardLocation(globalIndex: number): { shard: number; offset: number } {
  const shard = Math.floor(globalIndex / SHARD_SIZE);
  const offset = globalIndex % SHARD_SIZE;
  return { shard, offset };
}

async function readQuestionByGlobalIndex(kv: KVNamespace, globalIndex: number): Promise<Question | null> {
  const total = await getTotalCount(kv);
  if (total === 0) return null;
  const normIndex = ((globalIndex % total) + total) % total;
  const { shard, offset } = computeShardLocation(normIndex);
  const items = await readShard(kv, shard);
  if (offset < 0 || offset >= items.length) return null;
  return items[offset] || null;
}

async function appendQuestionsSharded(kv: KVNamespace, items: Question[]): Promise<void> {
  if (items.length === 0) return;
  let total = await getTotalCount(kv);
  let shards = await getShardCount(kv);
  let currentShardIndex = shards === 0 ? 0 : shards - 1;
  let currentShard = await readShard(kv, currentShardIndex);
  if (currentShard.length >= SHARD_SIZE) {
    // start a new shard
    currentShardIndex = shards;
    currentShard = [];
    shards += 1;
  }
  for (const q of items) {
    if (currentShard.length >= SHARD_SIZE) {
      await writeShard(kv, currentShardIndex, currentShard);
      currentShardIndex += 1;
      currentShard = [];
      shards = Math.max(shards, currentShardIndex + 1);
    }
    currentShard.push(q);
    total += 1;
  }
  await writeShard(kv, currentShardIndex, currentShard);
  await setShardCount(kv, Math.max(shards, currentShardIndex + 1));
  await setTotalCount(kv, total);
}

async function ensureShardedInitialized(kv: KVNamespace): Promise<void> {
  const shards = await getShardCount(kv);
  const total = await getTotalCount(kv);
  if (shards === 0 && total === 0) {
    // If legacy 'questions' exists, do a lazy migration of counts only
    const legacy = await getJSON<Question[]>(kv, 'questions', []);
    if (legacy.length > 0) {
      // Write legacy into shards in batches
      const batches: Question[][] = [];
      for (let i = 0; i < legacy.length; i += SHARD_SIZE) {
        batches.push(legacy.slice(i, i + SHARD_SIZE));
      }
      for (let si = 0; si < batches.length; si++) {
        await writeShard(kv, si, batches[si]);
      }
      await setShardCount(kv, batches.length);
      await setTotalCount(kv, legacy.length);
    } else {
      await setShardCount(kv, 0);
      await setTotalCount(kv, 0);
    }
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    
    try {
      if (url.pathname === '/webhook' && request.method === 'POST') {
        const secretHeader = request.headers.get('X-Telegram-Bot-Api-Secret-Token');
        console.log('Webhook auth check:', { secretHeader, envSecret: env.WEBHOOK_SECRET });
        // Temporarily disabled for debugging
        // if (secretHeader !== env.WEBHOOK_SECRET) {
        //   return new Response('Unauthorized', { status: 401 });
        // }
        
        const update: TelegramUpdate = await request.json();
        
        await ensureKeys(env.STATE);
        await ensureShardedInitialized(env.STATE);
        
        if (update.message) {
          const message = update.message;
          const chatId = message.chat.id;
          const userId = message.from?.id;
          
          console.log('Message received:', { text: message.text, chatId, userId });
          console.log('Processing message, about to check /start');
          
          // Handle /start command first, before any other logic
          if (message.text === '/start' || message.text === '/admin') {
            const isAdmin = chatId.toString() === env.ADMIN_CHAT_ID || (env.ADMIN_USERNAME && message.from?.username && (`@${message.from.username}`.toLowerCase() === `@${env.ADMIN_USERNAME}`.toLowerCase()));
            console.log('Start command received:', { chatId, adminChatId: env.ADMIN_CHAT_ID, isAdmin, text: message.text });
            
            if (isAdmin) {
              // Check if posts are stopped
              const isStopped = await env.STATE.get('admin:postsStopped');
              const stopButtonText = isStopped === '1' ? '🟢 Start Hourly Posts' : '⏸️ Stop Hourly Posts';
              
              // Show admin panel
              const keyboard = {
                inline_keyboard: [
                  [{ text: '📤 Upload Questions', callback_data: 'admin:upload' }],
                  [{ text: '📊 Daily Report', callback_data: 'admin:daily' }],
                  [{ text: '📈 Monthly Report', callback_data: 'admin:monthly' }],
                  [{ text: '⏭️ Post Next Now', callback_data: 'admin:postNow' }],
                  [{ text: '🗄️ DB Status', callback_data: 'admin:dbstatus' }],
                  [{ text: '📣 Broadcast to All Targets', callback_data: 'admin:broadcast' }],
                  [{ text: '🛠️ Manage Questions (Upcoming)', callback_data: 'admin:manage' }],
                  [{ text: '📚 View All Questions', callback_data: 'admin:listAll' }],
                  [{ text: stopButtonText, callback_data: 'admin:stopPosts' }],
                  [{ text: '🔍 Check Data Integrity', callback_data: 'admin:checkDataIntegrity' }],
                  [{ text: '🔍 Check Specific Question', callback_data: 'admin:checkQuestion' }],
                  [{ text: '🗑️ DELETE ALL DATA', callback_data: 'admin:deleteAllData' }],
                  [{ text: '🎯 Manage Discount Buttons', callback_data: 'admin:manageDiscounts' }]
                ]
              };
              console.log('About to send admin panel - CLEAN VERSION');
              await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, 'Admin Panel - CLEAN', { reply_markup: keyboard });
              console.log('Admin panel sent, returning OK');
              return new Response('OK');
            } else {
              // Show regular user buttons
              const keyboard = {
                inline_keyboard: [
                  [{ text: '🎟️ Get Code', callback_data: 'coupon:copy' }],
                  [{ text: '📞 Contact Admin', callback_data: 'coupon:bargain' }],
                  [{ text: '🏆 Daily Rank', callback_data: 'user:rank:daily' }],
                  [{ text: '🏅 Monthly Rank', callback_data: 'user:rank:monthly' }],
                  [{ text: '📊 Your Stats', callback_data: 'user:stats' }]
                ]
              };
              console.log('About to send user buttons');
              await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, 
                'Here for discount coupons? Click on "Get Code" button below and select Prepladder, Marrow, Cerebellum or any other discount coupons available in the market.You will get guaranteed discount,For any Help Click on "Contact Admin" button 🔘', 
                { reply_markup: keyboard });
              console.log('User buttons sent, returning OK');
              return new Response('OK');
            }
          }

          const isAdmin = chatId.toString() === env.ADMIN_CHAT_ID || (env.ADMIN_USERNAME && message.from?.username && (`@${message.from.username}`.toLowerCase() === `@${env.ADMIN_USERNAME}`.toLowerCase()));
          console.log('Admin check:', { chatId, adminChatId: env.ADMIN_CHAT_ID, username: message.from?.username, adminUsername: env.ADMIN_USERNAME, isAdmin });
          if (isAdmin) {
            // Admin commands
            const broadcastPending = await env.STATE.get('admin:broadcast:pending');
            const editIdxStr = await env.STATE.get('admin:edit:idx');
            const replyPendingUser = await env.STATE.get('admin:reply:pending');
            if (replyPendingUser) {
              try {
                await copyMessage(env.TELEGRAM_BOT_TOKEN, chatId, message.message_id, replyPendingUser);
                await env.STATE.delete('admin:reply:pending');
                await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, `✅ Replied to user ${replyPendingUser}`);
                return new Response('OK');
              } catch (e) {
                await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, '❌ Failed to forward reply.');
              }
            }
            if (broadcastPending === '1') {
              try {
                let successCount = 0;
                let errorCount = 0;
                
                // Broadcast to main group
                try {
                  await copyMessage(env.TELEGRAM_BOT_TOKEN, chatId, message.message_id, env.TARGET_GROUP_ID);
                  successCount++;
                } catch (error) {
                  errorCount++;
                  console.error('Broadcast to main group failed:', error);
                }
                
                // Broadcast to channel if configured
                if (env.TARGET_CHANNEL_ID) {
                  try {
                    await copyMessage(env.TELEGRAM_BOT_TOKEN, chatId, message.message_id, env.TARGET_CHANNEL_ID);
                    successCount++;
                  } catch (error) {
                    errorCount++;
                    console.error('Broadcast to channel failed:', error);
                  }
                }
                
                // Broadcast to discussion group if configured
                if (env.TARGET_DISCUSSION_GROUP_ID) {
                  try {
                    await copyMessage(env.TELEGRAM_BOT_TOKEN, chatId, message.message_id, env.TARGET_DISCUSSION_GROUP_ID);
                    successCount++;
                  } catch (error) {
                    errorCount++;
                    console.error('Broadcast to discussion group failed:', error);
                  }
                }
                
                await env.STATE.delete('admin:broadcast:pending');
                
                if (errorCount === 0) {
                  await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, `✅ Broadcasted to all ${successCount} targets successfully`);
                } else {
                  await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, `⚠️ Broadcast completed with errors\n✅ Success: ${successCount} targets\n❌ Failed: ${errorCount} targets`);
                }
              } catch (error) {
                await env.STATE.delete('admin:broadcast:pending');
                await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, `❌ Broadcast failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
              }
            } else if (editIdxStr) {
              try {
                if (!message.text) {
                  await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, '❌ Please send the updated question as JSON text or /cancel to exit edit mode.');
                } else if (message.text.trim() === '/cancel') {
                  // Cancel edit mode
                  await env.STATE.delete('admin:edit:idx');
                  await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, '✅ Edit mode cancelled. You can now upload questions normally.');
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
                if (error instanceof Error && error.message.includes('Unexpected token')) {
                  await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, 
                    `❌ Edit failed: Invalid JSON format.\n\n` +
                    `Send /cancel to exit edit mode and upload questions normally.\n\n` +
                    `Or send valid JSON like:\n` +
                    `{"question":"Your question","options":{"A":"Option A","B":"Option B","C":"Option C","D":"Option D"},"answer":"A","explanation":"Your explanation"}`);
                } else {
                  await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, `❌ Edit failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
                }
              }
            } else {
              // Check for discount button creation/editing flow
              const addDiscountPending = await env.STATE.get('admin:addDiscount:pending');
              const editDiscountPending = await env.STATE.get('admin:editDiscount:pending');
              
              if (addDiscountPending && message.text) {
                await handleDiscountButtonCreation(env.STATE, env.TELEGRAM_BOT_TOKEN, chatId, message.text, addDiscountPending);
                return new Response('OK');
              } else if (editDiscountPending && message.text) {
                await handleDiscountButtonEditing(env.STATE, env.TELEGRAM_BOT_TOKEN, chatId, message.text, editDiscountPending);
                return new Response('OK');
              } else if (message.text && (message.text.trim() === '/start' || message.text.trim() === '/admin' || message.text.trim() === '/cancel')) {
              // Clear all pending states for cancel command
              if (message.text.trim() === '/cancel') {
                await env.STATE.delete('admin:edit:idx');
                await env.STATE.delete('admin:broadcast:pending');
                await env.STATE.delete('admin:reply:pending');
                await env.STATE.delete('admin:addDiscount:pending');
                await env.STATE.delete('admin:editDiscount:pending');
                await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, '✅ All pending operations cancelled. You can now upload questions normally.');
                return new Response('OK');
              }
              console.log('Admin panel requested by:', chatId, 'User:', message.from?.username, 'Text:', JSON.stringify(message.text));
              
              // Check if posts are stopped
              const isStopped = await env.STATE.get('admin:postsStopped');
              const stopButtonText = isStopped === '1' ? '🟢 Start Hourly Posts' : '⏸️ Stop Hourly Posts';
              
              const keyboard = {
                inline_keyboard: [
                  [{ text: '📤 Upload Questions', callback_data: 'admin:upload' }],
                  [{ text: '📊 Daily Report', callback_data: 'admin:daily' }],
                  [{ text: '📈 Monthly Report', callback_data: 'admin:monthly' }],
                  [{ text: '⏭️ Post Next Now', callback_data: 'admin:postNow' }],
                  [{ text: '🗄️ DB Status', callback_data: 'admin:dbstatus' }],
                  [{ text: '📣 Broadcast to All Targets', callback_data: 'admin:broadcast' }],
                  [{ text: '🛠️ Manage Questions (Upcoming)', callback_data: 'admin:manage' }],
                  [{ text: '📚 View All Questions', callback_data: 'admin:listAll' }],
                  [{ text: stopButtonText, callback_data: 'admin:stopPosts' }],
                  [{ text: '🔍 Check Data Integrity', callback_data: 'admin:checkDataIntegrity' }],
                  [{ text: '🔍 Check Specific Question', callback_data: 'admin:checkQuestion' }],
                  [{ text: '🗑️ DELETE ALL DATA', callback_data: 'admin:deleteAllData' }],
                  [{ text: '🎯 Manage Discount Buttons', callback_data: 'admin:manageDiscounts' }]
                ]
              };
              
              await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, 'Admin Panel - CLEAN', { reply_markup: keyboard });
            } else if (message.text === '/whoami') {
              await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, `You are: id=${message.from?.id}, username=@${message.from?.username || ''}\n\nAdmin Chat ID: ${env.ADMIN_CHAT_ID}\nIs Admin: ${isAdmin}\nChat ID: ${chatId}`);
            } else if (message.text === '/addbutton') {
              const parts = message.text.split(' ');
              if (parts.length >= 4) {
                const name = parts[1];
                const message1 = parts[2];
                const message2 = parts.slice(3).join(' ');
                const id = name.toLowerCase().replace(/[^a-z0-9]/g, '');
                
                const buttons = await getDiscountButtons(env.STATE);
                const newButton: DiscountButton = { id, name, message1, message2 };
                buttons.push(newButton);
                await saveDiscountButtons(env.STATE, buttons);
                
                await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, `✅ Added discount button: ${name}`);
              } else {
                await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, 'Usage: /addbutton <name> <code> <message>\nExample: /addbutton Marrow M650 "Thank you for choosing Marrow"');
              }
            } else if (message.text === '/listbuttons') {
              const buttons = await getDiscountButtons(env.STATE);
              if (buttons.length === 0) {
                await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, 'No discount buttons configured.');
              } else {
                const list = buttons.map((btn, i) => `${i + 1}. ${btn.name} (${btn.id})\n   Code: ${btn.message1}\n   Message: ${btn.message2}`).join('\n\n');
                await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, `📋 Discount Buttons:\n\n${list}`);
              }
            } else if (message.text && message.text.startsWith('/editbutton ')) {
              const parts = message.text.split(' ');
              if (parts.length >= 5) {
                const id = parts[1];
                const name = parts[2];
                const message1 = parts[3];
                const message2 = parts.slice(4).join(' ');
                
                const buttons = await getDiscountButtons(env.STATE);
                const index = buttons.findIndex(btn => btn.id === id);
                if (index >= 0) {
                  buttons[index] = { id, name, message1, message2 };
                  await saveDiscountButtons(env.STATE, buttons);
                  await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, `✅ Updated discount button: ${name}`);
                } else {
                  await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, `❌ Button with ID '${id}' not found. Use /listbuttons to see available buttons.`);
                }
              } else {
                await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, 'Usage: /editbutton <id> <name> <code> <message>\nExample: /editbutton prepladder Prepladder P650 "Thank you for choosing Prepladder"');
              }
            } else if (message.text && message.text.startsWith('/deletebutton ')) {
              const id = message.text.split(' ')[1];
              const buttons = await getDiscountButtons(env.STATE);
              const index = buttons.findIndex(btn => btn.id === id);
              if (index >= 0) {
                const name = buttons[index].name;
                buttons.splice(index, 1);
                await saveDiscountButtons(env.STATE, buttons);
                await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, `✅ Deleted discount button: ${name}`);
              } else {
                await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, `❌ Button with ID '${id}' not found. Use /listbuttons to see available buttons.`);
              }

            } else if (message.text) {
              // Clear any pending edit states first
              await env.STATE.delete('admin:edit:idx');
              
              // Admin free-text template upload - try multiple questions first
              const multipleQuestions = parseMultipleQuestions(message.text);
              
              if (multipleQuestions.length > 0) {
                // Process multiple questions
                const list = await getJSON<Question[]>(env.STATE, 'questions', []);
                const seen = new Set(list.map(buildQuestionKey));
                let added = 0;
                let skipped = 0;
                
                for (const parsed of multipleQuestions) {
                  if (parsed.answer) {
                    const candidate: Question = trimQuestion(parsed as Question);
                    
                    // Validate question before adding
                    if (!validateQuestion(candidate)) {
                      console.log(`Skipping invalid question: ${candidate.question?.substring(0, 30)}...`);
                      skipped++;
                      continue; // Skip invalid questions
                    }
                    
                    // Debug log for successful validation
                    console.log(`Valid question added: ${candidate.question.substring(0, 30)}... | Answer: ${candidate.answer} | Explanation: ${candidate.explanation.substring(0, 30)}...`);
                    
                    if (seen.has(buildQuestionKey(candidate))) {
                      skipped++;
                    } else {
                      list.push(candidate);
                      added++;
                    }
                  }
                }
                
                if (added > 0) {
                  await putJSON(env.STATE, 'questions', list);
                }
                
                await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, 
                  `✅ Multiple questions processed!\n\n• Added: ${added} questions\n• Skipped duplicates: ${skipped} questions\n• Total in database: ${list.length} questions`);
              } else {
                // Try single question parsing
                const parsed = parseAdminTemplate(message.text);
                if (parsed) {
                  // If answer missing, ask for it and stash pending
                  if (!parsed.answer) {
                    await env.STATE.put('admin:pending:q', JSON.stringify(parsed));
                    const kb = { inline_keyboard: [[
                      { text: 'A', callback_data: 'admin:pendans:A' },
                      { text: 'B', callback_data: 'admin:pendans:B' },
                      { text: 'C', callback_data: 'admin:pendans:C' },
                      { text: 'D', callback_data: 'admin:pendans:D' }
                    ]] };
                    await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, 'Select the correct answer for the submitted question:', { reply_markup: kb });
                  } else {
                    const candidate: Question = trimQuestion(parsed as Question);
                    
                    // Validate question before adding
                    if (!validateQuestion(candidate)) {
                      console.log(`Single question validation failed: ${candidate.question?.substring(0, 30)}...`);
                      await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, '❌ Invalid question format. Please check all fields are complete.');
                      return new Response('OK');
                    }
                    
                    console.log(`Single question validated: ${candidate.question.substring(0, 30)}... | Answer: ${candidate.answer} | Explanation: ${candidate.explanation.substring(0, 30)}...`);
                    
                    const list = await getJSON<Question[]>(env.STATE, 'questions', []);
                    const seen = new Set(list.map(buildQuestionKey));
                    if (seen.has(buildQuestionKey(candidate))) {
                      await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, '⚠️ Duplicate detected. Skipped adding to database.');
                    } else {
                      await putJSON(env.STATE, 'questions', [...list, candidate]);
                      await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, '✅ Question added to database.');
                    }
                  }
                } else {
                  // Send helpful message when parsing fails
                  await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, 
                    '❌ Could not parse question format.\n\n' +
                    'Please use one of these formats:\n\n' +
                    'Format 1 (Single Question):\n' +
                    'Question=Your question here\n' +
                    'A=Option A\n' +
                    'B=Option B\n' +
                    'C=Option C\n' +
                    'D=Option D\n' +
                    'Answer=A\n' +
                    'Explanation=Your explanation\n\n' +
                    'Format 2 (Multiple Questions):\n' +
                    'Question=First question\n' +
                    'A=Option A\n' +
                    'B=Option B\n' +
                    'C=Option C\n' +
                    'D=Option D\n' +
                    'Answer=A\n' +
                    'Explanation=First explanation\n\n' +
                    'Question=Second question\n' +
                    'A=Option A\n' +
                    'B=Option B\n' +
                    'C=Option C\n' +
                    'D=Option D\n' +
                    'Answer=B\n' +
                    'Explanation=Second explanation');
                }
              }
            } else if (message.document) {
              // Handle file upload - ensure we respond to admin
              try {
                console.log('Processing file upload from admin:', chatId);
                
                // Check if it's a PDF
                if (message.document.file_name?.toLowerCase().endsWith('.pdf')) {
                  await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, 
                    '📄 PDF detected!\n\nI cannot directly process PDFs, but here\'s how to extract questions:\n\n' +
                    '1️⃣ **Use online PDF to text converter**\n' +
                    '2️⃣ **Copy the extracted text**\n' +
                    '3️⃣ **Format questions** like this:\n\n' +
                    'Question=Your question here\n' +
                    'A=Option A\n' +
                    'B=Option B\n' +
                    'C=Option C\n' +
                    'D=Option D\n' +
                    'Answer=A\n' +
                    'Explanation=Your explanation\n\n' +
                    '4️⃣ **Send the formatted text** to me\n' +
                    '5️⃣ **I\'ll process and remove duplicates** automatically!');
                  
                  // Also notify admin about PDF upload
                  if (chatId.toString() !== env.ADMIN_CHAT_ID) {
                    await sendMessage(env.TELEGRAM_BOT_TOKEN, env.ADMIN_CHAT_ID, 
                      `📄 PDF uploaded by user ${message.from?.first_name || 'Unknown'} in chat ${chatId}\n\nFile: ${message.document.file_name || 'Unknown'}`);
                  }
                } else {
                  // Process other file types (JSON, CSV, etc.)
                  const result = await uploadQuestionsFromFile(env.STATE, env.TELEGRAM_BOT_TOKEN, message.document.file_id, env.TARGET_GROUP_ID);
                  
                  const responseMessage = `✅ Upload Summary\n\n• Uploaded this time: ${result.uploaded}\n• Skipped duplicates (this time): ${result.skippedThisTime}\n• Skipped duplicates (total): ${result.skippedTotal}\n• Remaining to post: ${result.unsent}\n• Posted till now: ${result.sent}\n• Total in database: ${result.total}`;
                  
                  console.log('Sending response to admin:', responseMessage);
                  await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, responseMessage);
                }
                
              } catch (error) {
                console.error('File upload error:', error);
                const errorMessage = `❌ Error uploading questions: ${error instanceof Error ? error.message : 'Unknown error'}`;
                await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, errorMessage);
              }
            }
          }
          } else if (message.chat.type === 'private') {
            // Check if user is waiting to provide WhatsApp number FIRST
            const bargainPending = await env.STATE.get(`bargain:${userId}`);
            if (bargainPending === 'pending' && message.text) {
              // Validate WhatsApp number format (any valid phone number)
              const phoneRegex = /^[\+]?[1-9]\d{1,14}$/;
              if (phoneRegex.test(message.text.replace(/\s/g, ''))) {
                // Store the WhatsApp number and notify admin
                await env.STATE.put(`whatsapp:${userId}`, message.text);
                await env.STATE.delete(`bargain:${userId}`);
                
                const userName = `${message.from?.first_name}${message.from?.last_name ? ' ' + message.from.last_name : ''}`;
                const username = message.from?.username ? `@${message.from.username}` : '—';
                
                await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, 
                  '✅ Thank you! Your WhatsApp number has been saved successfully.\n\n🛑 Stay still! Admin will reply you soon for bargaining.\n\n⏰ Please wait patiently while we process your request. 🕐');
                
                // Notify admin
                await sendMessage(env.TELEGRAM_BOT_TOKEN, env.ADMIN_CHAT_ID, 
                  `📱 WhatsApp Number Received\n\nUser: ${userName}\nUsername: ${username}\nUser ID: ${userId}\nWhatsApp: ${message.text}\n\nReady for bargaining!`);
              } else {
                await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, 
                  '❌ Please send a valid WhatsApp number.\n\nFormat: Any valid phone number\n\nExamples: 9876543210, +919876543210, 919876543210');
              }
            } else if (message.text) {
              const keyboard = {
                inline_keyboard: [
                  [{ text: 'Get Code', callback_data: 'coupon:copy' }],
                  [{ text: 'Contact Admin', callback_data: 'coupon:bargain' }],
                  [{ text: '🏆 Daily Rank', callback_data: 'user:rank:daily' }],
                  [{ text: '🏅 Monthly Rank', callback_data: 'user:rank:monthly' }],
                  [{ text: '📊 Your Stats', callback_data: 'user:stats' }]
                ]
              };
              
              await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, 
                'Here for discount coupons? Click on "Get Code" button below and select Prepladder, Marrow, Cerebellum or any other discount coupons available in the market.You will get guaranteed discount,For any Help Click on "Contact Admin" button', 
                { reply_markup: keyboard });
            } else {
              // Check if user is waiting to provide WhatsApp number
              const bargainPending = await env.STATE.get(`bargain:${userId}`);
              if (bargainPending === 'pending' && message.text) {
              // Validate WhatsApp number format (any valid phone number)
              const phoneRegex = /^[\+]?[1-9]\d{1,14}$/;
              if (phoneRegex.test(message.text.replace(/\s/g, ''))) {
                // Store the WhatsApp number and notify admin
                await env.STATE.put(`whatsapp:${userId}`, message.text);
                await env.STATE.delete(`bargain:${userId}`);
                
                const userName = `${message.from?.first_name}${message.from?.last_name ? ' ' + message.from.last_name : ''}`;
                const username = message.from?.username ? `@${message.from.username}` : '—';
                
                await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, 
                  '✅ Thank you! Your WhatsApp number has been saved successfully.\n\n🛑 Stay still! Admin will reply you soon for bargaining.\n\n⏰ Please wait patiently while we process your request. 🕐');
                
                // Notify admin
                await sendMessage(env.TELEGRAM_BOT_TOKEN, env.ADMIN_CHAT_ID, 
                  `📱 WhatsApp Number Received\n\nUser: ${userName}\nUsername: ${username}\nUser ID: ${userId}\nWhatsApp: ${message.text}\n\nReady for bargaining!`);
                return new Response('OK');
              } else {
                await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, 
                  '❌ Please send a valid WhatsApp number.\n\nFormat: Any valid phone number\n\nExamples: 9876543210, +919876543210, 919876543210');
                return new Response('OK');
              }
            } else {
              // Check if user is asking for bargain via text
              const text = message.text?.toLowerCase().trim();
              if (text && (text.includes('bargain') || text.includes('discount') || text.includes('offer') || text.includes('deal'))) {
                // User is asking for bargain via text
                const userName = `${message.from?.first_name}${message.from?.last_name ? ' ' + message.from.last_name : ''}`;
                const username = message.from?.username ? `@${message.from.username}` : '—';
                
                await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, 
                  '💬 Got it! Admin will contact you soon for bargaining. You can also click the "Contact Admin" button below to provide your WhatsApp number for faster response. 🕐');
                
                // Notify admin about text-based bargain request
                await sendMessage(env.TELEGRAM_BOT_TOKEN, env.ADMIN_CHAT_ID, 
                  `💬 Text Bargain Request\n\nUser: ${userName}\nUsername: ${username}\nUser ID: ${userId}\nMessage: "${message.text}"\n\nUser asked for bargain via text!`);
              } else {
                // Regular non-admin private message
                              const keyboard = {
                inline_keyboard: [
                  [{ text: 'Get Code', callback_data: 'coupon:copy' }],
                  [{ text: 'Contact Admin', callback_data: 'coupon:bargain' }],
                  [{ text: '🏆 Daily Rank', callback_data: 'user:rank:daily' }],
                  [{ text: '🏅 Monthly Rank', callback_data: 'user:rank:monthly' }],
                  [{ text: '📊 Your Stats', callback_data: 'user:stats' }]
                ]
              };
                
                await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, 
                  'Here for discount coupons? Click on "Get Code" button below and select Prepladder, Marrow, Cerebellum or any other discount coupons available in the market.You will get guaranteed discount,For any Help Click on "Contact Admin" button 🔘', 
                  { reply_markup: keyboard });
              }
            }
          }
        }
        
        // Admin command: /msg <userId> <text>
        if (isAdmin && message.text && message.text.startsWith('/msg ')) {
          const rest = message.text.slice(5).trim();
          const sp = rest.indexOf(' ');
          if (sp > 0) {
            const uid = rest.slice(0, sp);
            const text = rest.slice(sp + 1);
            await sendMessage(env.TELEGRAM_BOT_TOKEN, uid, text);
            await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, '✅ Message sent');
          } else {
            await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, 'Usage: /msg <userId> <text>');
          }
        }
        } else if (update.callback_query) {
          const query = update.callback_query;
          const data = query.data || '';
          const userId = query.from.id;
          const chatId = query.message?.chat.id;
          
                                           if (data === 'user:stats') {
              await answerCallbackQuery(env.TELEGRAM_BOT_TOKEN, query.id);
              if (chatId && chatId < 0) {
                const uname = env.BOT_USERNAME ? `@${env.BOT_USERNAME}` : 'our bot';
                                 try {
                   const today = getCurrentDate(env.TZ || 'Asia/Kolkata');
                   const month = getCurrentMonth(env.TZ || 'Asia/Kolkata');
                   const daily = await getJSON<DayStats>(env.STATE, `stats:daily:${today}`, { total: 0, users: {} });
                   const monthly = await getJSON<DayStats>(env.STATE, `stats:monthly:${month}`, { total: 0, users: {} });
                   const meD = daily.users[String(userId)] || { cnt: 0, correct: 0 };
                   const meM = monthly.users[String(userId)] || { cnt: 0, correct: 0 };
                   const statsMsg = `📊 Your Stats\n\nToday (${today}): ${meD.cnt} attempted, ${meD.correct} correct\nThis Month (${month}): ${meM.cnt} attempted, ${meM.correct} correct`;
                   const welcomeMsg = 'Here for discount coupons? Click on "Get Code" button below and select Prepladder, Marrow, Cerebellum or any other discount coupons available in the market.You will get guaranteed discount,For any Help Click on "Contact Admin" button 🔘';
                   const fullMsg = `${statsMsg}\n\n${welcomeMsg}`;
                   const kb = { inline_keyboard: [
                     [{ text: '🎟️ Get Code', callback_data: 'coupon:copy' }],
                     [{ text: '📞 Contact Admin', callback_data: 'coupon:bargain' }],
                     [{ text: '🏆 Daily Rank', callback_data: 'user:rank:daily' }],
                     [{ text: '🏅 Monthly Rank', callback_data: 'user:rank:monthly' }],
                     [{ text: '📊 Your Stats', callback_data: 'user:stats' }]
                   ] };
                   await sendMessage(env.TELEGRAM_BOT_TOKEN, userId, fullMsg, { reply_markup: kb });
                   await answerCallbackQuery(env.TELEGRAM_BOT_TOKEN, query.id, '📩 Sent to your DM', true);
                 } catch (e) {
                   const uname = env.BOT_USERNAME ? `@${env.BOT_USERNAME}` : 'our bot';
                   await answerCallbackQuery(env.TELEGRAM_BOT_TOKEN, query.id, `Please start ${uname} and try again.`, true);
                 }
              } else {
                const today = getCurrentDate(env.TZ || 'Asia/Kolkata');
                const month = getCurrentMonth(env.TZ || 'Asia/Kolkata');
                const daily = await getJSON<DayStats>(env.STATE, `stats:daily:${today}`, { total: 0, users: {} });
                const monthly = await getJSON<DayStats>(env.STATE, `stats:monthly:${month}`, { total: 0, users: {} });
                const meD = daily.users[String(userId)] || { cnt: 0, correct: 0 };
                const meM = monthly.users[String(userId)] || { cnt: 0, correct: 0 };
                const msg = `📊 Your Stats\n\nToday (${today}): ${meD.cnt} attempted, ${meD.correct} correct\nThis Month (${month}): ${meM.cnt} attempted, ${meM.correct} correct`;
                await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId!, msg);
              }
                       } else if (data === 'user:rank:daily') {
             await answerCallbackQuery(env.TELEGRAM_BOT_TOKEN, query.id);
             if (chatId && chatId < 0) {
               try {
                 const today = getCurrentDate(env.TZ || 'Asia/Kolkata');
                 const stats = await getJSON<DayStats>(env.STATE, `stats:daily:${today}`, { total: 0, users: {} });
                 const entries = Object.entries(stats.users).map(([uid, s]) => ({ uid, cnt: s.cnt, correct: s.correct }));
                 entries.sort((a, b) => b.cnt - a.cnt || b.correct - a.correct);
                 const userIndex = entries.findIndex(e => e.uid === String(userId));
                 const rank = userIndex >= 0 ? userIndex + 1 : '—';
                 const me = stats.users[String(userId)] || { cnt: 0, correct: 0 };
                 const top = entries.slice(0, 10).map((e, i) => `${i + 1}. ${e.uid === String(userId) ? 'You' : e.uid}: ${e.cnt} (${e.correct}✓)`);
                 const header = `🏆 Daily Rank (${today})\nYour Rank: ${rank}\nYour Stats: ${me.cnt} attempted, ${me.correct} correct\n\nTop 10:`;
                 const body = top.length ? top.join('\n') : 'No activity yet.';
                 const welcomeMsg = 'Here for discount coupons? Click on "Get Code" button below and select Prepladder, Marrow, Cerebellum or any other discount coupons available in the market.You will get guaranteed discount,For any Help Click on "Contact Admin" button 🔘';
                 const fullMsg = `${header}\n${body}\n\n${welcomeMsg}`;
                const kb = { inline_keyboard: [
                  [{ text: '🎟️ Get Code', callback_data: 'coupon:copy' }],
                  [{ text: '📞 Contact Admin', callback_data: 'coupon:bargain' }],
                  [{ text: '🏆 Daily Rank', callback_data: 'user:rank:daily' }],
                  [{ text: '🏅 Monthly Rank', callback_data: 'user:rank:monthly' }],
                  [{ text: '📊 Your Stats', callback_data: 'user:stats' }]
                ] };
                 await sendMessage(env.TELEGRAM_BOT_TOKEN, userId, fullMsg, { reply_markup: kb });
                 await answerCallbackQuery(env.TELEGRAM_BOT_TOKEN, query.id, '📩 Sent to your DM', true);
               } catch (e) {
                 const uname = env.BOT_USERNAME ? `@${env.BOT_USERNAME}` : 'our bot';
                 await answerCallbackQuery(env.TELEGRAM_BOT_TOKEN, query.id, `Please start ${uname} and try again.`, true);
               }
             } else {
               const today = getCurrentDate(env.TZ || 'Asia/Kolkata');
               const stats = await getJSON<DayStats>(env.STATE, `stats:daily:${today}`, { total: 0, users: {} });
               const entries = Object.entries(stats.users).map(([uid, s]) => ({ uid, cnt: s.cnt, correct: s.correct }));
               entries.sort((a, b) => b.cnt - a.cnt || b.correct - a.correct);
               const userIndex = entries.findIndex(e => e.uid === String(userId));
               const rank = userIndex >= 0 ? userIndex + 1 : '—';
               const me = stats.users[String(userId)] || { cnt: 0, correct: 0 };
               const top = entries.slice(0, 10).map((e, i) => `${i + 1}. ${e.uid === String(userId) ? 'You' : e.uid}: ${e.cnt} (${e.correct}✓)`);
               const header = `🏆 Daily Rank (${today})\nYour Rank: ${rank}\nYour Stats: ${me.cnt} attempted, ${me.correct} correct\n\nTop 10:`;
               const body = top.length ? top.join('\n') : 'No activity yet.';
              const kb = { inline_keyboard: [
                [{ text: 'Get Code', callback_data: 'coupon:copy' }],
                [{ text: 'Contact Admin', callback_data: 'coupon:bargain' }],
                [{ text: '🏆 Daily Rank', callback_data: 'user:rank:daily' }],
                [{ text: '🏅 Monthly Rank', callback_data: 'user:rank:monthly' }],
                [{ text: '📊 Your Stats', callback_data: 'user:stats' }]
              ] };
               await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId!, `${header}\n${body}`, { reply_markup: kb });
             }
           } else if (data === 'user:rank:monthly') {
             await answerCallbackQuery(env.TELEGRAM_BOT_TOKEN, query.id);
             if (chatId && chatId < 0) {
               try {
                 const month = getCurrentMonth(env.TZ || 'Asia/Kolkata');
                 const stats = await getJSON<DayStats>(env.STATE, `stats:monthly:${month}`, { total: 0, users: {} });
                 const entries = Object.entries(stats.users).map(([uid, s]) => ({ uid, cnt: s.cnt, correct: s.correct }));
                 entries.sort((a, b) => b.cnt - a.cnt || b.correct - a.correct);
                 const userIndex = entries.findIndex(e => e.uid === String(userId));
                 const rank = userIndex >= 0 ? userIndex + 1 : '—';
                 const me = stats.users[String(userId)] || { cnt: 0, correct: 0 };
                 const top = entries.slice(0, 10).map((e, i) => `${i + 1}. ${e.uid === String(userId) ? 'You' : e.uid}: ${e.cnt} (${e.correct}✓)`);
                 const header = `🏅 Monthly Rank (${month})\nYour Rank: ${rank}\nYour Stats: ${me.cnt} attempted, ${me.correct} correct\n\nTop 10:`;
                 const body = top.length ? top.join('\n') : 'No activity yet.';
                 const welcomeMsg = 'Here for discount coupons? Click on "Get Code" button below and select Prepladder, Marrow, Cerebellum or any other discount coupons available in the market.You will get guaranteed discount,For any Help Click on "Contact Admin" button 🔘';
                 const fullMsg = `${header}\n${body}\n\n${welcomeMsg}`;
                const kb = { inline_keyboard: [
                  [{ text: '🎟️ Get Code', callback_data: 'coupon:copy' }],
                  [{ text: '📞 Contact Admin', callback_data: 'coupon:bargain' }],
                  [{ text: '🏆 Daily Rank', callback_data: 'user:rank:daily' }],
                  [{ text: '🏅 Monthly Rank', callback_data: 'user:rank:monthly' }],
                  [{ text: '📊 Your Stats', callback_data: 'user:stats' }]
                ] };
                 await sendMessage(env.TELEGRAM_BOT_TOKEN, userId, fullMsg, { reply_markup: kb });
                 await answerCallbackQuery(env.TELEGRAM_BOT_TOKEN, query.id, '📩 Sent to your DM', true);
               } catch (e) {
                 const uname = env.BOT_USERNAME ? `@${env.BOT_USERNAME}` : 'our bot';
                 await answerCallbackQuery(env.TELEGRAM_BOT_TOKEN, query.id, `Please start ${uname} and try again.`, true);
               }
             } else {
               const month = getCurrentMonth(env.TZ || 'Asia/Kolkata');
               const stats = await getJSON<DayStats>(env.STATE, `stats:monthly:${month}`, { total: 0, users: {} });
               const entries = Object.entries(stats.users).map(([uid, s]) => ({ uid, cnt: s.cnt, correct: s.correct }));
               entries.sort((a, b) => b.cnt - a.cnt || b.correct - a.correct);
               const userIndex = entries.findIndex(e => e.uid === String(userId));
               const rank = userIndex >= 0 ? userIndex + 1 : '—';
               const me = stats.users[String(userId)] || { cnt: 0, correct: 0 };
               const top = entries.slice(0, 10).map((e, i) => `${i + 1}. ${e.uid === String(userId) ? 'You' : e.uid}: ${e.cnt} (${e.correct}✓)`);
               const header = `🏅 Monthly Rank (${month})\nYour Rank: ${rank}\nYour Stats: ${me.cnt} attempted, ${me.correct} correct\n\nTop 10:`;
               const body = top.length ? top.join('\n') : 'No activity yet.';
              const kb = { inline_keyboard: [
                [{ text: 'Get Code', callback_data: 'coupon:copy' }],
                [{ text: 'Contact Admin', callback_data: 'coupon:bargain' }],
                [{ text: '🏆 Daily Rank', callback_data: 'user:rank:daily' }],
                [{ text: '🏅 Monthly Rank', callback_data: 'user:rank:monthly' }],
                [{ text: '📊 Your Stats', callback_data: 'user:stats' }]
              ] };
               await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId!, `${header}\n${body}`, { reply_markup: kb });
             }
           } else if (data.startsWith('ans:')) {
            // MCQ answer - Clean implementation with enhanced debugging
            const [, qidStr, answer] = data.split(':');
            const qid = parseInt(qidStr);
            
            console.log(`=== ANSWER CALLBACK DEBUG ===`);
            console.log(`Raw data: ${data}`);
            console.log(`Parsed QID: ${qid}, Answer: ${answer}`);
            
            // Get questions directly from main array (no sharded reading for now)
            const questions = await getJSON<Question[]>(env.STATE, 'questions', []);
            console.log(`Total questions in database: ${questions.length}`);
            
            if (qid >= 0 && qid < questions.length) {
              const question = questions[qid];
              console.log(`Question at index ${qid}:`, {
                question: question.question?.substring(0, 50) + '...',
                answer: question.answer,
                explanation: question.explanation?.substring(0, 50) + '...',
                options: question.options
              });
              
              // Validate question data integrity
              if (!question.question || !question.options || !question.answer || !question.explanation) {
                console.log(`❌ Question data corrupted at index ${qid}`);
                await answerCallbackQuery(env.TELEGRAM_BOT_TOKEN, query.id, '❌ Question data corrupted', true);
                return new Response('OK');
              }
              
              // Validate answer is A, B, C, or D
              if (!['A', 'B', 'C', 'D'].includes(question.answer)) {
                console.log(`❌ Invalid answer format: ${question.answer}`);
                await answerCallbackQuery(env.TELEGRAM_BOT_TOKEN, query.id, '❌ Invalid answer format', true);
                return new Response('OK');
              }
              
              // Validate options exist
              if (!question.options.A || !question.options.B || !question.options.C || !question.options.D) {
                console.log(`❌ Missing options for question ${qid}`);
                await answerCallbackQuery(env.TELEGRAM_BOT_TOKEN, query.id, '❌ Missing options', true);
                return new Response('OK');
              }
              
              const isCorrect = answer === question.answer;
              
              await incrementStatsFirstAttemptOnly(env.STATE, userId, qid, isCorrect, env.TZ || 'Asia/Kolkata');
              
              // Create popup with full explanation (no truncation)
              const verdict = isCorrect ? '✅ correct' : '❌ wrong';
              const answerLine = `Answer: ${question.answer}`;
              const popup = `${verdict}\n\n${answerLine}\n\nExplanation: ${question.explanation}`;
              
              console.log(`=== POPUP CONTENT ===`);
              console.log(`Verdict: ${verdict}`);
              console.log(`Answer Line: ${answerLine}`);
              console.log(`Full Popup: ${popup}`);
              console.log(`=== END DEBUG ===`);
              
              await answerCallbackQuery(env.TELEGRAM_BOT_TOKEN, query.id, popup, true);
            } else {
              console.log(`❌ Question not found: QID ${qid}, Total questions: ${questions.length}`);
              await answerCallbackQuery(env.TELEGRAM_BOT_TOKEN, query.id, '❌ Question not found', true);
            }
          } else if (data === 'coupon:copy') {
            await answerCallbackQuery(env.TELEGRAM_BOT_TOKEN, query.id);
            
            // Show discount options menu
            const buttons = await getDiscountButtons(env.STATE);
            const keyboard = {
              inline_keyboard: buttons.map(btn => [{
                text: btn.name,
                callback_data: `discount:${btn.id}`
              }])
            };
            
            await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId!, 
              '🎯 Choose your discount provider:', { reply_markup: keyboard });
              
          } else if (data.startsWith('discount:')) {
            const buttonId = data.split(':')[1];
            const buttons = await getDiscountButtons(env.STATE);
            const button = buttons.find(btn => btn.id === buttonId);
            
            if (button) {
              await answerCallbackQuery(env.TELEGRAM_BOT_TOKEN, query.id, `${button.name} code copied`);
              
              // Send the coupon code
              await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId!, button.message1);
              
              // Send follow-up message
              await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId!, button.message2);
              
              // Notify admin with username
              const userName = `${query.from.first_name}${query.from.last_name ? ' ' + query.from.last_name : ''}`;
              const usernameLink = query.from.username ? `<a href="https://t.me/${query.from.username}">@${query.from.username}</a>` : '—';
              const uidLink = `<a href="tg://user?id=${userId}">${userId}</a>`;
              await sendMessage(env.TELEGRAM_BOT_TOKEN, env.ADMIN_CHAT_ID, 
                `💰 Code Used: ${button.message1} (${button.name})\n\nUser: ${userName}\nUsername: ${usernameLink}\nUser ID: ${uidLink}\n\nUser has copied the discount code!`,
                { reply_markup: { inline_keyboard: [[{ text: '↩️ Reply to user', callback_data: `admin:reply:${userId}` }]] } }
              );
            } else {
              await answerCallbackQuery(env.TELEGRAM_BOT_TOKEN, query.id, '❌ Discount option not found', true);
            }
              
                          } else if (data === 'coupon:bargain') {
          // Set state to wait for WhatsApp number
          await env.STATE.put(`bargain:${query.from.id}`, 'pending');
          
          await sendMessage(env.TELEGRAM_BOT_TOKEN, query.from.id, 
            'Send your WhatsApp number below , admin will contact you soon');
            
          } else if (data === 'admin:upload') {
            await answerCallbackQuery(env.TELEGRAM_BOT_TOKEN, query.id);
                          await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId!, 
                '📤 **Upload Questions**\n\n' +
                '**Option 1: Text Format**\n' +
                'Send questions in this format:\n\n' +
                'Question=Your question here\n' +
                'A=Option A\n' +
                'B=Option B\n' +
                'C=Option C\n' +
                'D=Option D\n' +
                'Answer=A\n' +
                'Explanation=Your explanation\n\n' +
                '**Option 2: JSON File**\n' +
                'Send a JSON file with questions array or JSONL format.\n\n' +
                '**Option 3: CSV File**\n' +
                'Send a CSV file with columns: question, A, B, C, D, answer, explanation');
              
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
            await postNextToAll(env.STATE, env.TELEGRAM_BOT_TOKEN, env.TARGET_GROUP_ID, env.TARGET_CHANNEL_ID, env.TARGET_DISCUSSION_GROUP_ID);
            await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId!, '✅ Posted next MCQ to all targets');
          } else if (data === 'admin:dbstatus') {
            await answerCallbackQuery(env.TELEGRAM_BOT_TOKEN, query.id);
            const questions = await getJSON<Question[]>(env.STATE, 'questions', []);
            const indexKey = `idx:${env.TARGET_GROUP_ID}`;
            const currentIndex = await getJSON<number>(env.STATE, indexKey, 0);
            const sent = currentIndex;
            const total = questions.length;
            const unsent = Math.max(0, total - sent);
            const extraIdx = env.TARGET_CHANNEL_ID ? await getJSON<number>(env.STATE, `idx:${env.TARGET_CHANNEL_ID}`, 0) : undefined;
            const msg = `🗄️ DB Status\n\n• Total questions: ${total}\n• Sent (Group): ${sent}\n${env.TARGET_CHANNEL_ID ? `• Sent (Channel): ${extraIdx}\n` : ''}• Unsent: ${unsent}`;
            await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId!, msg);
          } else if (data === 'admin:broadcast') {
            await answerCallbackQuery(env.TELEGRAM_BOT_TOKEN, query.id);
            await env.STATE.put('admin:broadcast:pending', '1');
            const kb = { inline_keyboard: [[{ text: '✖️ Cancel', callback_data: 'admin:broadcastCancel' }]] };
            await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId!, 'Send the message or media to broadcast to all targets (group, channel, discussion group).', { reply_markup: kb });
          } else if (data.startsWith('admin:reply:')) {
            await answerCallbackQuery(env.TELEGRAM_BOT_TOKEN, query.id);
            const targetUserId = data.split(':')[2];
            await env.STATE.put('admin:reply:pending', targetUserId);
            const kb = { inline_keyboard: [[{ text: '✖️ Cancel', callback_data: 'admin:replyCancel' }]] };
            await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId!, `Reply mode enabled for user ${targetUserId}. Send your message or media.`, { reply_markup: kb });
          } else if (data === 'admin:replyCancel') {
            await answerCallbackQuery(env.TELEGRAM_BOT_TOKEN, query.id, 'Cancelled');
            await env.STATE.delete('admin:reply:pending');
            await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId!, '❎ Reply cancelled');
          } else if (data === 'admin:broadcastCancel') {
            await answerCallbackQuery(env.TELEGRAM_BOT_TOKEN, query.id, 'Cancelled');
            await env.STATE.delete('admin:broadcast:pending');
            await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId!, '❎ Broadcast cancelled');

                      } else if (data === 'admin:stopPosts') {
              await answerCallbackQuery(env.TELEGRAM_BOT_TOKEN, query.id, 'Stopping hourly posts...');
              
              const isStopped = await env.STATE.get('admin:postsStopped');
              
              if (isStopped === '1') {
                // Start posts
                await env.STATE.delete('admin:postsStopped');
                await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId!, 
                  `✅ **Hourly posts STARTED!**\n\n` +
                  `🟢 Bot will now post questions every hour automatically.\n` +
                  `⏰ Next post will be at the top of the next hour.\n\n` +
                  `📊 You can still use "Post Next Now" for manual posts.`
                );
              } else {
                // Stop posts
                await env.STATE.put('admin:postsStopped', '1');
                await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId!, 
                  `⏸️ **Hourly posts STOPPED!**\n\n` +
                  `🔴 Bot will NOT post questions automatically.\n` +
                  `📤 You can still use "Post Next Now" for manual posts.\n\n` +
                  `🟢 Click "Stop Hourly Posts" again to restart automatic posting.`
                );
              }
            } else if (data === 'admin:deleteAllData') {
              await answerCallbackQuery(env.TELEGRAM_BOT_TOKEN, query.id, '⚠️ COMPLETELY WIPING ALL DATA...');
              
              // Get all keys first
              const keys = await env.STATE.list();
              let deletedCount = 0;
              let backupCount = 0;
              
              // Delete EVERYTHING except essential config
              for (const key of keys.keys) {
                // Keep only essential bot configuration
                if (!key.name.startsWith('bot:') && 
                    key.name !== 'discount_buttons' && 
                    key.name !== 'admin:postsStopped') {
                  
                  // Count what we're deleting
                  if (key.name.startsWith('questions_backup_')) {
                    backupCount++;
                  } else if (key.name === 'questions') {
                    deletedCount++;
                  }
                  
                  // Delete the key
                  await env.STATE.delete(key.name);
                }
              }
              
              // Also delete essential keys that might have old data
              await env.STATE.delete('questions');
              await env.STATE.delete(`idx:${env.TARGET_GROUP_ID}`);
              await env.STATE.delete(`idx:${env.TARGET_CHANNEL_ID}`);
              await env.STATE.delete(`idx:${env.TARGET_DISCUSSION_GROUP_ID}`);
              
              await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId!, 
                `🗑️ **COMPLETE DATA WIPE SUCCESSFUL!**\n\n` +
                `💥 **EVERYTHING DELETED:**\n` +
                `• All questions (${deletedCount})\n` +
                `• All backups (${backupCount})\n` +
                `• All sharded data (q: keys)\n` +
                `• All user statistics\n` +
                `• All posting indexes\n` +
                `• All admin states\n` +
                `• All daily/monthly reports\n` +
                `• All seen attempts\n\n` +
                `🧹 **Database is now COMPLETELY EMPTY:**\n` +
                `• ✅ No old questions\n` +
                `• ✅ No old backups\n` +
                `• ✅ No corrupted data\n` +
                `• ✅ No sharded storage\n` +
                `• ✅ Fresh start guaranteed\n\n` +
                `📤 **Next step:** Upload your fresh questions!`
              );
            } else if (data === 'admin:checkDataIntegrity') {
              await answerCallbackQuery(env.TELEGRAM_BOT_TOKEN, query.id, '🔍 Checking data integrity...');
              
              // First show what's in the database
              const keys = await env.STATE.list();
              const questionKeys = keys.keys.filter(k => k.name.startsWith('questions') || k.name.startsWith('q:'));
              const backupKeys = keys.keys.filter(k => k.name.startsWith('questions_backup_'));
              
              let databaseReport = `🔍 **Database Contents Report**\n\n`;
              databaseReport += `📊 **Total Keys:** ${keys.keys.length}\n`;
              databaseReport += `📝 **Question Keys:** ${questionKeys.length}\n`;
              databaseReport += `💾 **Backup Keys:** ${backupKeys.length}\n\n`;
              
              if (questionKeys.length > 0) {
                databaseReport += `📝 **Question Keys Found:**\n`;
                questionKeys.forEach(k => databaseReport += `• ${k.name}\n`);
                databaseReport += `\n`;
              }
              
              if (backupKeys.length > 0) {
                databaseReport += `💾 **Backup Keys Found:**\n`;
                backupKeys.forEach(k => databaseReport += `• ${k.name}\n`);
                databaseReport += `\n`;
              }
              
              // Now check main questions
              const questions = await getJSON<Question[]>(env.STATE, 'questions', []);
              const totalQuestions = questions.length;
              
              if (totalQuestions === 0) {
                await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId!, databaseReport + `❌ No questions in main database to check.`);
                return new Response('OK');
              }
              
              let validQuestions = 0;
              let corruptedQuestions = 0;
              const corruptedSamples: string[] = [];
              
              for (let i = 0; i < questions.length; i++) {
                const q = questions[i];
                if (validateQuestion(q)) {
                  validQuestions++;
                } else {
                  corruptedQuestions++;
                  if (corruptedSamples.length < 3) {
                    corruptedSamples.push(`${i + 1}. ${q.question?.substring(0, 50) || 'NO QUESTION'}... | Answer: ${q.answer || 'NO ANSWER'} | Explanation: ${q.explanation?.substring(0, 30) || 'NO EXPLANATION'}...`);
                  }
                }
              }
              
              const integrityReport = `📊 **Main Questions Integrity:**\n` +
                `• Total questions: ${totalQuestions}\n` +
                `• Valid questions: ${validQuestions}\n` +
                `• Corrupted questions: ${corruptedQuestions}\n` +
                `• Integrity rate: ${((validQuestions / totalQuestions) * 100).toFixed(1)}%\n\n`;
              
              if (corruptedQuestions > 0) {
                const sampleText = `📝 **Sample corrupted questions:**\n${corruptedSamples.join('\n')}\n\n`;
                await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId!, databaseReport + integrityReport + sampleText + `⚠️ **Recommendation:** Use "Delete All Data" to completely wipe everything.`);
              } else {
                await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId!, databaseReport + integrityReport + `✅ **All questions are valid!** Database integrity is perfect.`);
              }


          } else if (data === 'admin:checkQuestion') {
            await answerCallbackQuery(env.TELEGRAM_BOT_TOKEN, query.id);
            
            const questions = await getJSON<Question[]>(env.STATE, 'questions', []);
            const totalQuestions = questions.length;
            
            if (totalQuestions === 0) {
              await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId!, '❌ No questions in database to check.');
              return new Response('OK');
            }
            
            // Show first 5 questions for manual verification
            const sampleQuestions = questions.slice(0, 5).map((q, i) => 
              `**Question ${i + 1}:**\n` +
              `📝 **Q:** ${q.question}\n\n` +
              `A) ${q.options.A}\n` +
              `B) ${q.options.B}\n` +
              `C) ${q.options.C}\n` +
              `D) ${q.options.D}\n\n` +
              `✅ **Answer:** ${q.answer}\n` +
              `📖 **Explanation:** ${q.explanation}\n\n` +
              `🔍 **Verification:** Does answer "${q.answer}" match the explanation?\n` +
              `---`
            ).join('\n\n');
            
            await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId!, 
              `🔍 **MANUAL VERIFICATION - First 5 Questions**\n\n` +
              `📊 Total questions in database: ${totalQuestions}\n\n` +
              `${sampleQuestions}\n\n` +
              `⚠️ **Check if:**\n` +
              `• Answer matches the explanation\n` +
              `• Answer text makes sense with the question\n` +
              `• Explanation refers to the correct answer\n\n` +
              `🔄 If these look wrong, run "Fix Data Integrity" again.`
            );



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
                { text: '📝 Edit', callback_data: `admin:edit:${currentIndex + 0}` },
                { text: '🗑️ Delete', callback_data: `admin:del:${currentIndex + 0}` }
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
          } else if (data.startsWith('admin:pendans:')) {
            await answerCallbackQuery(env.TELEGRAM_BOT_TOKEN, query.id);
            const ans = data.split(':')[2] as 'A'|'B'|'C'|'D';
            const raw = await env.STATE.get('admin:pending:q');
            if (!raw) {
              await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId!, 'No pending question found.');
            } else {
              const base = JSON.parse(raw);
              const candidate: Question = trimQuestion({ ...base, answer: ans });
              const list = await getJSON<Question[]>(env.STATE, 'questions', []);
              const seen = new Set(list.map(buildQuestionKey));
              if (seen.has(buildQuestionKey(candidate))) {
                await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId!, '⚠️ Duplicate detected. Skipped adding to database.');
              } else {
                await putJSON(env.STATE, 'questions', [...list, candidate]);
                await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId!, '✅ Question added to database.');
              }
              await env.STATE.delete('admin:pending:q');
            }

          } else if (data === 'admin:listAll') {
            await answerCallbackQuery(env.TELEGRAM_BOT_TOKEN, query.id);
            const questions = await getJSON<Question[]>(env.STATE, 'questions', []);
            if (questions.length === 0) {
              await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId!, 'No questions in database.');
            } else {
              // Start with first 10 questions - use admin-specific key
              const adminKey = `admin:listAll:page:${chatId}`;
              await env.STATE.put(adminKey, '0');
              await showQuestionsPage(env.STATE, env.TELEGRAM_BOT_TOKEN, chatId!, questions, 0);
            }
          } else if (data.startsWith('admin:listAll:')) {
            await answerCallbackQuery(env.TELEGRAM_BOT_TOKEN, query.id);
            const questions = await getJSON<Question[]>(env.STATE, 'questions', []);
            if (questions.length === 0) {
              await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId!, 'No questions in database.');
            } else {
              const action = data.split(':')[2]; // admin:listAll:next -> get 'next'
              const adminKey = `admin:listAll:page:${chatId}`;
              const currentPageStr = await env.STATE.get(adminKey) || '0';
              let currentPage = parseInt(currentPageStr, 10);
              
              console.log('Pagination debug:', { action, currentPageStr, currentPage, totalQuestions: questions.length, adminKey, maxPage: Math.ceil(questions.length / 10) - 1 });
              
              if (action === 'next') {
                const maxPage = Math.ceil(questions.length / 10) - 1;
                currentPage = Math.min(currentPage + 1, maxPage);
                console.log('Next clicked, new page:', currentPage, 'maxPage:', maxPage);
              } else if (action === 'prev') {
                currentPage = Math.max(currentPage - 1, 0);
                console.log('Prev clicked, new page:', currentPage);
              } else if (action === 'close') {
                await env.STATE.delete(adminKey);
                await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId!, '✅ Closed question list');
                return new Response('OK');
              }
              
              console.log('Saving page state:', currentPage, 'to key:', adminKey);
              await env.STATE.put(adminKey, String(currentPage));
              await showQuestionsPage(env.STATE, env.TELEGRAM_BOT_TOKEN, chatId!, questions, currentPage);
            }
          } else if (data.startsWith('admin:del:')) {
            await answerCallbackQuery(env.TELEGRAM_BOT_TOKEN, query.id);
            const idx = parseInt(data.split(':')[2], 10);
            const list = await getJSON<Question[]>(env.STATE, 'questions', []);
            if (idx >= 0 && idx < list.length) {
              const deleted = list.splice(idx, 1)[0];
              await putJSON(env.STATE, 'questions', list);
              await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId!, `🗑️ Deleted question #${idx + 1}:\n\n${truncate(deleted.question, 100)}...\n\nRemaining: ${list.length} questions`);
            } else {
              await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId!, '❌ Invalid question index');
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
              const kb = { inline_keyboard: [[{ text: '✖️ Cancel Edit', callback_data: 'admin:editCancel' }]] };
              await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId!, `📝 Editing Question #${idx + 1}\n\nSend updated question as JSON:\n\n<pre>${esc(example)}</pre>`, { reply_markup: kb });
            } else {
              await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId!, '❌ Invalid question index');
            }
          } else if (data === 'admin:editCancel') {
            await answerCallbackQuery(env.TELEGRAM_BOT_TOKEN, query.id, 'Cancelled');
            await env.STATE.delete('admin:edit:idx');
            await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId!, '❎ Edit cancelled');

          } else if (data === 'admin:manageDiscounts') {
            await answerCallbackQuery(env.TELEGRAM_BOT_TOKEN, query.id);
            const buttons = await getDiscountButtons(env.STATE);
            
            if (buttons.length === 0) {
              const keyboard = {
                inline_keyboard: [
                  [{ text: '➕ Add New Button', callback_data: 'admin:addDiscount' }],
                  [{ text: '✖️ Close', callback_data: 'admin:discountClose' }]
                ]
              };
              await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId!, '🎯 No discount buttons configured.\n\nClick "Add New Button" to create your first discount provider.', { reply_markup: keyboard });
            } else {
              let message = '🎯 Current Discount Buttons:\n\n';
              buttons.forEach((btn, index) => {
                message += `${index + 1}. **${btn.name}** (${btn.id})\n`;
                message += `   Code: \`${btn.message1}\`\n`;
                message += `   Message: ${btn.message2.substring(0, 50)}${btn.message2.length > 50 ? '...' : ''}\n\n`;
              });
              
              const keyboard = {
                inline_keyboard: [
                  [{ text: '➕ Add New Button', callback_data: 'admin:addDiscount' }],
                  ...buttons.map((btn, index) => [
                    { text: `📝 Edit ${btn.name}`, callback_data: `admin:editDiscount:${btn.id}` },
                    { text: `🗑️ Delete ${btn.name}`, callback_data: `admin:deleteDiscount:${btn.id}` }
                  ]),
                  [{ text: '✖️ Close', callback_data: 'admin:discountClose' }]
                ]
              };
              
              await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId!, message, { reply_markup: keyboard, parse_mode: 'Markdown' });
            }
          } else if (data === 'admin:addDiscount') {
            await answerCallbackQuery(env.TELEGRAM_BOT_TOKEN, query.id);
            await env.STATE.put('admin:addDiscount:pending', 'name');
            const keyboard = {
              inline_keyboard: [[{ text: '✖️ Cancel', callback_data: 'admin:discountCancel' }]]
            };
            await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId!, '🎯 Adding New Discount Button\n\nStep 1/4: Send the **button name** (e.g., "Marrow", "Cerebellum")', { reply_markup: keyboard });
          } else if (data === 'admin:discountCancel') {
            await answerCallbackQuery(env.TELEGRAM_BOT_TOKEN, query.id, 'Cancelled');
            await env.STATE.delete('admin:addDiscount:pending');
            await env.STATE.delete('admin:addDiscount:name');
            await env.STATE.delete('admin:addDiscount:code');
            await env.STATE.delete('admin:addDiscount:message');
            await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId!, '❎ Discount button creation cancelled');
          } else if (data === 'admin:discountClose') {
            await answerCallbackQuery(env.TELEGRAM_BOT_TOKEN, query.id, 'Closed');
            await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId!, '✅ Discount management closed');
          } else if (data.startsWith('admin:editDiscount:')) {
            await answerCallbackQuery(env.TELEGRAM_BOT_TOKEN, query.id);
            const buttonId = data.split(':')[1];
            const buttons = await getDiscountButtons(env.STATE);
            const button = buttons.find(b => b.id === buttonId);
            
            if (button) {
              await env.STATE.put('admin:editDiscount:target', buttonId);
              await env.STATE.put('admin:editDiscount:pending', 'name');
              await env.STATE.put('admin:editDiscount:name', button.name);
              await env.STATE.put('admin:editDiscount:code', button.message1);
              await env.STATE.put('admin:editDiscount:message', button.message2);
              
              const keyboard = {
                inline_keyboard: [[{ text: '✖️ Cancel', callback_data: 'admin:discountCancel' }]]
              };
              await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId!, `📝 Editing: **${button.name}**\n\nStep 1/4: Send the **new button name** (current: ${button.name})`, { reply_markup: keyboard, parse_mode: 'Markdown' });
            } else {
              await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId!, '❌ Button not found');
            }
          } else if (data.startsWith('admin:deleteDiscount:')) {
            await answerCallbackQuery(env.TELEGRAM_BOT_TOKEN, query.id);
            const buttonId = data.split(':')[1];
            const buttons = await getDiscountButtons(env.STATE);
            const button = buttons.find(b => b.id === buttonId);
            
            if (button) {
              const filteredButtons = buttons.filter(b => b.id !== buttonId);
              await saveDiscountButtons(env.STATE, filteredButtons);
              
              const keyboard = {
                inline_keyboard: [[{ text: '✅ Back to List', callback_data: 'admin:manageDiscounts' }]]
              };
              await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId!, `🗑️ Deleted discount button: **${button.name}**\n\nCode: \`${button.message1}\``, { reply_markup: keyboard, parse_mode: 'Markdown' });
            } else {
              await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId!, '❌ Button not found');
            }
          } else if (data === 'admin:confirmDiscount') {
            await answerCallbackQuery(env.TELEGRAM_BOT_TOKEN, query.id, 'Saving...');
            
            const name = await env.STATE.get('admin:addDiscount:name') || '';
            const code = await env.STATE.get('admin:addDiscount:code') || '';
            const message = await env.STATE.get('admin:addDiscount:message') || '';
            
            if (name && code && message) {
              const id = name.toLowerCase().replace(/[^a-z0-9]/g, '');
              const buttons = await getDiscountButtons(env.STATE);
              const newButton: DiscountButton = { id, name, message1: code, message2: message };
              buttons.push(newButton);
              await saveDiscountButtons(env.STATE, buttons);
              
              // Clean up
              await env.STATE.delete('admin:addDiscount:pending');
              await env.STATE.delete('admin:addDiscount:name');
              await env.STATE.delete('admin:addDiscount:code');
              await env.STATE.delete('admin:addDiscount:message');
              
              const keyboard = {
                inline_keyboard: [[{ text: '✅ Back to List', callback_data: 'admin:manageDiscounts' }]]
              };
              await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId!, `✅ **Discount button created successfully!**\n\n**Name:** ${name}\n**Code:** \`${code}\`\n**Message:** ${message}`, { reply_markup: keyboard, parse_mode: 'Markdown' });
            } else {
              await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId!, '❌ Error: Missing required information');
            }
          } else if (data.startsWith('admin:confirmEditDiscount:')) {
            await answerCallbackQuery(env.TELEGRAM_BOT_TOKEN, query.id, 'Updating...');
            
            const targetId = data.split(':')[1];
            const name = await env.STATE.get('admin:editDiscount:name') || '';
            const code = await env.STATE.get('admin:editDiscount:code') || '';
            const message = await env.STATE.get('admin:editDiscount:message') || '';
            
            if (name && code && message) {
              const buttons = await getDiscountButtons(env.STATE);
              const buttonIndex = buttons.findIndex(b => b.id === targetId);
              
              if (buttonIndex !== -1) {
                buttons[buttonIndex] = { id: targetId, name, message1: code, message2: message };
                await saveDiscountButtons(env.STATE, buttons);
                
                // Clean up
                await env.STATE.delete('admin:editDiscount:pending');
                await env.STATE.delete('admin:editDiscount:target');
                await env.STATE.delete('admin:editDiscount:name');
                await env.STATE.delete('admin:editDiscount:code');
                await env.STATE.delete('admin:editDiscount:message');
                
                const keyboard = {
                  inline_keyboard: [[{ text: '✅ Back to List', callback_data: 'admin:manageDiscounts' }]]
                };
                await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId!, `✅ **Discount button updated successfully!**\n\n**Name:** ${name}\n**Code:** \`${code}\`\n**Message:** ${message}`, { reply_markup: keyboard, parse_mode: 'Markdown' });
              } else {
                await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId!, '❌ Error: Button not found');
              }
            } else {
              await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId!, '❌ Error: Missing required information');
            }
          }
        }
        
        return new Response('OK');
      } else if (url.pathname === '/tick' && request.method === 'GET') {
        await ensureKeys(env.STATE);
        await initializeBotIfNeeded(env.STATE, env.TELEGRAM_BOT_TOKEN, env.TARGET_GROUP_ID, env.TARGET_CHANNEL_ID, env.TARGET_DISCUSSION_GROUP_ID);
        const count = Number(new URL(request.url).searchParams.get('count') || '1');
        for (let i = 0; i < Math.max(1, Math.min(20, count)); i++) {
          await postNextToAll(env.STATE, env.TELEGRAM_BOT_TOKEN, env.TARGET_GROUP_ID, env.TARGET_CHANNEL_ID, env.TARGET_DISCUSSION_GROUP_ID);
        }
        return new Response(`MCQ posted x${Math.max(1, Math.min(20, count))}`);
      } else if (url.pathname === '/start-posting' && request.method === 'GET') {
        await ensureKeys(env.STATE);
        await initializeBotIfNeeded(env.STATE, env.TELEGRAM_BOT_TOKEN, env.TARGET_GROUP_ID, env.TARGET_CHANNEL_ID, env.TARGET_DISCUSSION_GROUP_ID);
        return new Response('Bot initialized and first MCQ posted');
      } else if (url.pathname === '/health' && request.method === 'GET') {
        return new Response('ok');
      } else if (url.pathname === '/test' && request.method === 'GET') {
        return new Response(JSON.stringify({
          message: 'Worker is running',
          timestamp: new Date().toISOString(),
          webhookUrl: 'https://telegram-mcq-bot.telegram-mcq-bot-wahid.workers.dev/webhook'
        }, null, 2), {
          headers: { 'Content-Type': 'application/json' }
        });
      } else if (url.pathname === '/setup-webhook' && request.method === 'GET') {
        try {
          const webhookUrl = 'https://telegram-mcq-bot.telegram-mcq-bot-wahid.workers.dev/webhook';
          const secretToken = env.WEBHOOK_SECRET;
          const response = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/setWebhook`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              url: webhookUrl,
              secret_token: secretToken
            })
          });
          const result = await response.json();
          return new Response(JSON.stringify({
            success: result.ok,
            result: result,
            webhookUrl: webhookUrl
          }, null, 2), {
            headers: { 'Content-Type': 'application/json' }
          });
        } catch (error) {
          return new Response(JSON.stringify({
            error: error instanceof Error ? error.message : 'Unknown error',
            webhookUrl: 'https://telegram-mcq-bot.telegram-mcq-bot-wahid.workers.dev/webhook'
          }, null, 2), {
            headers: { 'Content-Type': 'application/json' }
          });
        }
      } else if (url.pathname === '/admin-check' && request.method === 'GET') {
        return new Response(JSON.stringify({
          adminChatId: env.ADMIN_CHAT_ID,
          adminUsername: env.ADMIN_USERNAME,
          hasAdminChatId: !!env.ADMIN_CHAT_ID,
          hasAdminUsername: !!env.ADMIN_USERNAME
        }, null, 2), {
          headers: { 'Content-Type': 'application/json' }
        });
      } else if (url.pathname === '/sync-targets' && request.method === 'GET') {
        // Reset all targets to start from question 0
        await putJSON(env.STATE, `idx:${env.TARGET_GROUP_ID}`, 0);
        if (env.TARGET_CHANNEL_ID) {
          await putJSON(env.STATE, `idx:${env.TARGET_CHANNEL_ID}`, 0);
        }
        if (env.TARGET_DISCUSSION_GROUP_ID) {
          await putJSON(env.STATE, `idx:${env.TARGET_DISCUSSION_GROUP_ID}`, 0);
        }
        return new Response('All targets reset to question index 0 - they will now post the same questions');
      } else if (url.pathname === '/dedupe' && request.method === 'GET') {
        // Dedupe questions in KV
        const list = await getJSON<Question[]>(env.STATE, 'questions', []);
        const seen = new Set<string>();
        const unique: Question[] = [];
        let removed = 0;
        for (const q of list) {
          const key = buildQuestionKey(q);
          if (seen.has(key)) {
            removed++;
          } else {
            seen.add(key);
            unique.push(q);
          }
        }
        if (removed > 0) {
          await putJSON(env.STATE, 'questions', unique);
        }
        return new Response(`Dedupe complete. Removed ${removed} duplicate(s). Total now: ${unique.length}`);
      } else if (url.pathname === '/smart-dedupe' && request.method === 'GET') {
        // Advanced dedupe that detects similar questions (like shuffled ones from ChatGPT)
        const list = await getJSON<Question[]>(env.STATE, 'questions', []);
        const unique: Question[] = [];
        const removed: Question[] = [];
        let removedCount = 0;
        
        for (let i = 0; i < list.length; i++) {
          const current = list[i];
          let isDuplicate = false;
          
          // Check against all previously accepted questions
          for (const accepted of unique) {
            if (isSimilarQuestion(current, accepted)) {
              isDuplicate = true;
              removed.push(current);
              removedCount++;
              break;
            }
          }
          
          if (!isDuplicate) {
            unique.push(current);
          }
        }
        
        if (removedCount > 0) {
          await putJSON(env.STATE, 'questions', unique);
        }
        
        return new Response(`Smart dedupe complete.\n\nRemoved ${removedCount} similar questions.\nTotal now: ${unique.length}\n\nRemoved questions:\n${removed.slice(0, 10).map((q, i) => `${i + 1}. ${q.question.substring(0, 100)}...`).join('\n')}${removed.length > 10 ? '\n... and ' + (removed.length - 10) + ' more' : ''}`);
      }
      
      return new Response('Not Found', { status: 404 });
    } catch (error) {
      console.error('Error:', error);
      return new Response('Internal Server Error', { status: 500 });
    }
  },
  
  async scheduled(event: ScheduledEvent, env: Env): Promise<void> {
    try {
      // Check if posts are stopped
      const isStopped = await env.STATE.get('admin:postsStopped');
      if (isStopped === '1') {
        console.log('Hourly posts are stopped. Skipping scheduled post.');
        return;
      }
      
      await ensureKeys(env.STATE);
      await initializeBotIfNeeded(env.STATE, env.TELEGRAM_BOT_TOKEN, env.TARGET_GROUP_ID, env.TARGET_CHANNEL_ID, env.TARGET_DISCUSSION_GROUP_ID);
      // Send 1 question per schedule tick
      for (let i = 0; i < 1; i++) {
        await postNextToAll(env.STATE, env.TELEGRAM_BOT_TOKEN, env.TARGET_GROUP_ID, env.TARGET_CHANNEL_ID, env.TARGET_DISCUSSION_GROUP_ID);
      }
    } catch (error) {
      console.error('Scheduled error:', error);
    }
  }
};
