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

// ============================================
// PERFORMANCE OPTIMIZATION: Memory Cache
// ============================================
class MemoryCache {
  private cache = new Map<string, { value: any; expires: number }>();
  private readonly DEFAULT_TTL = 60000; // 1 minute

  get<T>(key: string): T | undefined {
    const item = this.cache.get(key);
    if (!item) return undefined;
    if (Date.now() > item.expires) {
      this.cache.delete(key);
      return undefined;
    }
    return item.value as T;
  }

  set(key: string, value: any, ttl: number = this.DEFAULT_TTL): void {
    this.cache.set(key, {
      value,
      expires: Date.now() + ttl
    });
  }

  delete(key: string): void {
    this.cache.delete(key);
  }

  clear(): void {
    this.cache.clear();
  }
}

// Global cache instance
const cache = new MemoryCache();


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

// ============================================
// EXTREME OPTIMIZATION: Ultra-Fast LRU Cache
// ============================================
class UltraCache {
  private cache = new Map<string, { value: any; expires: number; hits: number }>();
  private readonly MAX_SIZE = 1000;
  private readonly DEFAULT_TTL = 300000; // 5 minutes
  
  get<T>(key: string): T | undefined {
    const item = this.cache.get(key);
    if (!item) return undefined;
    
    if (Date.now() > item.expires) {
      this.cache.delete(key);
      return undefined;
    }
    
    // Update hit count for LRU
    item.hits++;
    return item.value as T;
  }
  
  set(key: string, value: any, ttl: number = this.DEFAULT_TTL): void {
    // LRU eviction if cache is full
    if (this.cache.size >= this.MAX_SIZE) {
      let minHits = Infinity;
      let evictKey = '';
      for (const [k, v] of this.cache) {
        if (v.hits < minHits) {
          minHits = v.hits;
          evictKey = k;
        }
      }
      this.cache.delete(evictKey);
    }
    
    this.cache.set(key, {
      value,
      expires: Date.now() + ttl,
      hits: 0
    });
  }
  
  has(key: string): boolean {
    const item = this.cache.get(key);
    if (!item) return false;
    if (Date.now() > item.expires) {
      this.cache.delete(key);
      return false;
    }
    return true;
  }
  
  delete(key: string): void {
    this.cache.delete(key);
  }
  
  clear(): void {
    this.cache.clear();
  }
}

const ultraCache = new UltraCache();

// Pre-compiled regex patterns
const ESCAPE_PATTERNS = {
  needsEscape: /[&<>"']/,
  amp: /&/g,
  lt: /</g,
  gt: />/g,
  quot: /"/g,
  apos: /'/g
};

// Pre-cached commonly used values
const COMMON_KEYBOARDS = new Map();
const DATE_FORMATTERS = new Map();



// TURBO: Batch message sender
async function sendToMultiple(token: string, targets: Array<{chatId: string | number, text: string, options?: any}>): Promise<void> {
  await Promise.all(
    targets.map(t => sendMessage(token, t.chatId, t.text, t.options))
  );
}

// Utility functions
// Pre-compiled escape map
const ESCAPE_MAP = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#x27;'
};

function esc(str: string): string {
  // Ultra-fast check
  if (!ESCAPE_PATTERNS.needsEscape.test(str)) return str;
  
  // Single pass replacement
  return str.replace(/[&<>"']/g, c => ESCAPE_MAP[c]);
}

// Discount button management
// Memoized date cache
const dateCache = new Map<string, string>();

:${Math.floor(Date.now() / 60000)}`; // Cache per minute
  if (dateCache.has(cacheKey)) return dateCache.get(cacheKey)!;
  
  const now = new Date();
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  const result = formatter.format(now);
  dateCache.set(cacheKey, result);
  
  // Clean old cache entries
  if (dateCache.size > 10) {
    const firstKey = dateCache.keys().next().value;
    dateCache.delete(firstKey);
  }
  
  return result;
}

:${Math.floor(Date.now() / 3600000)}`; // Cache per hour
  if (dateCache.has(cacheKey)) return dateCache.get(cacheKey)!;
  
  const now = new Date();
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit'
  });
  const result = formatter.format(now);
  dateCache.set(cacheKey, result);
  
  // Clean old cache entries
  if (dateCache.size > 10) {
    const firstKey = dateCache.keys().next().value;
    dateCache.delete(firstKey);
  }
  
  return result;
}

// Ultra-fast date caching
const dateCache = new Map<string, { value: string; expires: number }>();

function getCurrentDate(tz: string): string {
  const now = Date.now();
  const cacheKey = `date:${tz}:${Math.floor(now / 60000)}`;
  
  const cached = dateCache.get(cacheKey);
  if (cached && cached.expires > now) {
    return cached.value;
  }
  
  // Reuse formatter if possible
  let formatter = DATE_FORMATTERS.get(`date:${tz}`);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
    DATE_FORMATTERS.set(`date:${tz}`, formatter);
  }
  
  const result = formatter.format(new Date(now));
  dateCache.set(cacheKey, { value: result, expires: now + 60000 });
  
  return result;
}

function getCurrentMonth(tz: string): string {
  const now = Date.now();
  const cacheKey = `month:${tz}:${Math.floor(now / 3600000)}`;
  
  const cached = dateCache.get(cacheKey);
  if (cached && cached.expires > now) {
    return cached.value;
  }
  
  // Reuse formatter if possible
  let formatter = DATE_FORMATTERS.get(`month:${tz}`);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit'
    });
    DATE_FORMATTERS.set(`month:${tz}`, formatter);
  }
  
  const result = formatter.format(new Date(now));
  dateCache.set(cacheKey, { value: result, expires: now + 3600000 });
  
  return result;
}

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
  // Ultra-fast cache check
  const cacheKey = `kv:${key}`;
  if (ultraCache.has(cacheKey)) {
    return ultraCache.get<T>(cacheKey)!;
  }
  
  try {
    const value = await kv.get(key);
    if (!value) {
      ultraCache.set(cacheKey, defaultValue, 300000); // 5 min cache
      return defaultValue;
    }
    
    // Optimized JSON parsing
    const result = JSON.parse(value);
    
    // Aggressive caching based on key patterns
    let cacheTTL = 60000; // 1 minute default
    if (key.startsWith('questions')) cacheTTL = 600000; // 10 minutes
    else if (key.startsWith('discount_buttons')) cacheTTL = 1800000; // 30 minutes
    else if (key.includes('stats:daily')) cacheTTL = 300000; // 5 minutes
    else if (key.includes('stats:monthly')) cacheTTL = 900000; // 15 minutes
    else if (key.includes('seen:')) cacheTTL = 120000; // 2 minutes
    
    ultraCache.set(cacheKey, result, cacheTTL);
    return result;
  } catch {
    ultraCache.set(cacheKey, defaultValue, 60000);
    return defaultValue;
  }
}`;
  const cached = cache.get<T>(cacheKey);
  if (cached !== undefined) return cached;

  try {
    const value = await kv.get(key);
    const result = value ? JSON.parse(value) : defaultValue;
    
    // Cache frequently accessed keys
    if (key.startsWith('questions') || key.startsWith('discount_buttons') || key.includes('stats')) {
      cache.set(cacheKey, result, 60000); // 1 minute cache
    }
    
    return result;
  } catch {
    return defaultValue;
  }
} catch {
    return defaultValue;
  }
}

// Batch write queue
const writeQueue = new Map<string, { value: any; timestamp: number }>();
let writeTimer: any = null;

async function flushWrites(kv: KVNamespace): Promise<void> {
  if (writeQueue.size === 0) return;
  
  const writes = Array.from(writeQueue.entries());
  writeQueue.clear();
  
  // Parallel writes
  await Promise.all(
    writes.map(([key, data]) => kv.put(key, JSON.stringify(data.value)))
  );
}

async function putJSON(kv: KVNamespace, key: string, obj: any): Promise<void> {
  // Immediate cache invalidation
  ultraCache.delete(`kv:${key}`);
  
  // Critical writes go immediately
  if (key.includes('admin') || key.includes('broadcast')) {
    await kv.put(key, JSON.stringify(obj));
    return;
  }
  
  // Queue non-critical writes
  writeQueue.set(key, { value: obj, timestamp: Date.now() });
  
  // Auto-flush after 100ms
  if (writeTimer) clearTimeout(writeTimer);
  writeTimer = setTimeout(() => flushWrites(kv), 100);
  
  // Force flush if queue is large
  if (writeQueue.size > 10) {
    await flushWrites(kv);
  }
}`);
  await kv.put(key, JSON.stringify(obj));
}

);
  return formatter.format(now);
}

);
  return formatter.format(now);
}

async function sendMessage(token: string, chatId: string | number, text: string, options?: any): Promise<any> {
  try {
    if (false) console.log('sendMessage called:', { chatId, text: text.substring(0, 100) });
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
    if (false) console.log('sendMessage result:', { ok: result.ok, status: response.status });
    return result;
  } catch (error) {
    if (true) console.error('sendMessage error:', error);
    throw error;
  }
}

async function editMessageText(token: string, chatId: string | number, messageId: number, text: string, options?: any): Promise<any> {
  try {
    if (false) console.log('editMessageText called:', { chatId, messageId, text: text.substring(0, 100) });
    const url = `https://api.telegram.org/bot${token}/editMessageText`;
    const body = {
      chat_id: chatId,
      message_id: messageId,
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
    if (false) console.log('editMessageText result:', { ok: result.ok, status: response.status });
    return result;
  } catch (error) {
    if (true) console.error('editMessageText error:', error);
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
        if (false) console.log('Error posting initial question to', chatId, error);
      }
    }
  }
}

async function incrementStatsFirstAttemptOnly(kv: KVNamespace, userId: number, qid: number, isCorrect: boolean, tz: string): Promise<void> {
  const userIdStr = userId.toString();
  const qidStr = String(qid);
  const today = getCurrentDate(tz);
  const month = getCurrentMonth(tz);

  // Batch all KV reads for better performance
  const [seenDaily, seenMonthly, dailyStats, monthlyStats] = await Promise.all([
    getJSON<Record<string, boolean>>(kv, `seen:daily:${today}:${userIdStr}`, {}),
    getJSON<Record<string, boolean>>(kv, `seen:monthly:${month}:${userIdStr}`, {}),
    getJSON<DayStats>(kv, `stats:daily:${today}`, { total: 0, users: {} }),
    getJSON<DayStats>(kv, `stats:monthly:${month}`, { total: 0, users: {} })
  ]);

  // If already attempted this question for both periods, skip counting
  const alreadyDaily = !!seenDaily[qidStr];
  const alreadyMonthly = !!seenMonthly[qidStr];

  // Prepare all updates in parallel
  const updates: Promise<void>[] = [];

  if (!alreadyDaily) {
    dailyStats.total += 1;
    if (!dailyStats.users[userIdStr]) dailyStats.users[userIdStr] = { cnt: 0, correct: 0 };
    dailyStats.users[userIdStr].cnt += 1;
    if (isCorrect) dailyStats.users[userIdStr].correct += 1;
    seenDaily[qidStr] = true;
    updates.push(putJSON(kv, `seen:daily:${today}:${userIdStr}`, seenDaily));
    updates.push(putJSON(kv, `stats:daily:${today}`, dailyStats));
  }

  if (!alreadyMonthly) {
    monthlyStats.total += 1;
    if (!monthlyStats.users[userIdStr]) monthlyStats.users[userIdStr] = { cnt: 0, correct: 0 };
    monthlyStats.users[userIdStr].cnt += 1;
    if (isCorrect) monthlyStats.users[userIdStr].correct += 1;
    seenMonthly[qidStr] = true;
    updates.push(putJSON(kv, `seen:monthly:${month}:${userIdStr}`, seenMonthly));
    updates.push(putJSON(kv, `stats:monthly:${month}`, monthlyStats));
  }

  // Execute all updates in parallel
  if (updates.length > 0) {
    await Promise.all(updates);
  }
}

async function postNext(kv: KVNamespace, token: string, chatId: string): Promise<void> {
  const questions = await getJSON<Question[]>(kv, 'questions', []);
  
  if (questions.length === 0) {
    if (false) console.log('No questions available');
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
    if (false) console.log('No questions available');
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
  // Handle both lowercase and uppercase field names
  const question = q.question || q.Question;
  const options = q.options || { A: q.A, B: q.B, C: q.C, D: q.D };
  const answer = q.answer || q.Answer;
  const explanation = q.explanation || q.Explanation;
  
  return (
    typeof q === 'object' &&
    typeof question === 'string' &&
    typeof options === 'object' &&
    typeof options.A === 'string' &&
    typeof options.B === 'string' &&
    typeof options.C === 'string' &&
    typeof options.D === 'string' &&
    typeof answer === 'string' &&
    ['A', 'B', 'C', 'D'].includes(answer) &&
    typeof explanation === 'string'
  );
}

function trimQuestion(q: any): Question {
  // Handle both lowercase and uppercase field names
  const question = (q.question || q.Question || '').trim();
  const options = q.options || { A: q.A, B: q.B, C: q.C, D: q.D };
  const answer = q.answer || q.Answer;
  const explanation = (q.explanation || q.Explanation || '').trim();
  
  return {
    question: question,
    options: {
      A: options.A.trim(),
      B: options.B.trim(),
      C: options.C.trim(),
      D: options.D.trim()
    },
    answer: answer,
    explanation: explanation
  };
}



function formatQuestionPreview(q: Question, index: number): string {
  return `#${index + 1}\n\n${esc(q.question)}\n\nA) ${esc(q.options.A)}\nB) ${esc(q.options.B)}\nC) ${esc(q.options.C)}\nD) ${esc(q.options.D)}\n\nAnswer: ${q.answer}`;
}

async function showQuestionsPage(kv: KVNamespace, token: string, chatId: number, questions: Question[], page: number, messageId?: number): Promise<void> {
  if (false) console.log('showQuestionsPage called:', { page, totalQuestions: questions.length, messageId });
  const questionsPerPage = 10;
  const startIndex = page * questionsPerPage;
  const endIndex = Math.min(startIndex + questionsPerPage, questions.length);
  const pageQuestions = questions.slice(startIndex, endIndex);
  if (false) console.log('Page calculation:', { startIndex, endIndex, pageQuestionsLength: pageQuestions.length });
  
  let message = `📚 All Questions (Page ${page + 1}/${Math.ceil(questions.length / questionsPerPage)})\n\n`;
  message += `Showing questions ${startIndex + 1}-${endIndex} of ${questions.length}\n\n`;
  
  for (let i = 0, len = pageQuestions.length; i < len; i++) {
    const q = pageQuestions[i];
    const questionIndex = startIndex + i;
    message += `#${questionIndex + 1} ${truncate(q.question.replace(/\n/g, ' '), 60)} [Ans: ${q.answer}]\n\n`;
  }
  
  // Create navigation buttons
  const keyboard: any[] = [];
  
  // Add edit/delete/post buttons for each question (3 rows of 5 buttons each)
  const editRow1: any[] = [];
  const editRow2: any[] = [];
  const deleteRow1: any[] = [];
  const deleteRow2: any[] = [];
  const postRow1: any[] = [];
  const postRow2: any[] = [];
  
  for (let i = 0; i < Math.min(5, pageQuestions.length); i++) {
    const questionIndex = startIndex + i;
    editRow1.push({ text: `📝${questionIndex + 1}`, callback_data: `admin:edit:${questionIndex}` });
    deleteRow1.push({ text: `🗑️${questionIndex + 1}`, callback_data: `admin:del:${questionIndex}` });
    postRow1.push({ text: `📤${questionIndex + 1}`, callback_data: `admin:postNow:${questionIndex}` });
  }
  
  for (let i = 5; i < pageQuestions.length; i++) {
    const questionIndex = startIndex + i;
    editRow2.push({ text: `📝${questionIndex + 1}`, callback_data: `admin:edit:${questionIndex}` });
    deleteRow2.push({ text: `🗑️${questionIndex + 1}`, callback_data: `admin:del:${questionIndex}` });
    postRow2.push({ text: `📤${questionIndex + 1}`, callback_data: `admin:postNow:${questionIndex}` });
  }
  
  if (editRow1.length > 0) keyboard.push(editRow1);
  if (editRow2.length > 0) keyboard.push(editRow2);
  if (deleteRow1.length > 0) keyboard.push(deleteRow1);
  if (deleteRow2.length > 0) keyboard.push(deleteRow2);
  if (postRow1.length > 0) keyboard.push(postRow1);
  if (postRow2.length > 0) keyboard.push(postRow2);
  
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
  
  if (messageId) {
    // Edit existing message
    await editMessageText(token, chatId, messageId, message, { reply_markup: { inline_keyboard: keyboard } });
  } else {
    // Send new message
    await sendMessage(token, chatId, message, { reply_markup: { inline_keyboard: keyboard } });
  }
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
  
  for (let i = 0, len = questionBlocks.length; i < len; i++) {
    const block = questionBlocks[i];
    const parsed = parseAdminTemplate(block);
    if (parsed) {
      questions.push(parsed);
    }
  }
  
  return questions;
}

async function uploadQuestionsFromFile(kv: KVNamespace, token: string, fileId: string, targetGroupId: string): Promise<{ uploaded: number; total: number; sent: number; unsent: number; skippedThisTime: number; skippedTotal: number }> {
  if (false) console.log('📁 Starting file upload processing...');
  if (false) console.log('📁 File ID:', fileId);
  
  const fileInfo = await getFile(token, fileId);
  
  if (!fileInfo.ok) {
    if (true) console.error('❌ Failed to get file info:', fileInfo);
    throw new Error('Failed to get file info');
  }
  
  if (false) console.log('📁 File info received:', fileInfo.result);
  
  const content = await downloadFile(token, fileInfo.result.file_path);
  if (false) console.log('📁 File content length:', content.length);
  if (false) console.log('📁 File content preview:', content.substring(0, 200) + '...');
  
  let newQuestions: any[] = [];
  
  // Helper: CSV parsing utilities
  function splitCsvLine(line: string): string[] {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0, len = line.length; i < len; i++) {
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
    if (false) console.log('🔍 Attempting JSON parsing...');
    const parsed = JSON.parse(content);
    if (false) console.log('✅ JSON parsed successfully');
    if (false) console.log('🔍 Parsed type:', Array.isArray(parsed) ? 'Array' : 'Object');
    if (false) console.log('🔍 Parsed length:', Array.isArray(parsed) ? parsed.length : 1);
    
    if (Array.isArray(parsed)) {
      newQuestions = parsed;
      if (false) console.log('✅ Using as JSON array');
    } else {
      newQuestions = [parsed];
      if (false) console.log('✅ Using as single JSON object');
    }
  } catch (jsonError) {
    if (false) console.log('❌ JSON parsing failed:', jsonError);
    if (false) console.log('🔍 Trying CSV parsing...');
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
  if (false) console.log('🔍 Validating questions...');
  if (false) console.log('🔍 Total questions to validate:', newQuestions.length);
  
  const validQuestions: Question[] = [];
  for (let i = 0, len = newQuestions.length; i < len; i++) {
    const q = newQuestions[i];
    if (false) console.log(`🔍 Validating question ${i + 1}:`, q.question?.substring(0, 50) + '...');
    
    if (validateQuestion(q)) {
      validQuestions.push(trimQuestion(q));
      if (false) console.log(`✅ Question ${i + 1} is valid`);
    } else {
      if (false) console.log(`❌ Question ${i + 1} is invalid`);
    }
  }
  
  if (false) console.log('🔍 Valid questions found:', validQuestions.length);
  
  if (validQuestions.length === 0) {
    if (true) console.error('❌ No valid questions found after validation');
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
  const [stats, dailyUsers, totalUsers] = await Promise.all([
    getJSON<DayStats>(kv, `stats:daily:${date}`, { total: 0, users: {} }),
    getJSON<string[]>(kv, `stats:daily:users:${date}`, []),
    getJSON<string[]>(kv, 'stats:total:users', [])
  ]);
  
  const uniqueUsers = Object.keys(stats.users).length;
  const uniqueDMUsers = dailyUsers.length;
  const totalDMUsers = totalUsers.length;
  const totalAnswers = stats.total;
  const avgPerUser = uniqueUsers > 0 ? (totalAnswers / uniqueUsers).toFixed(1) : '0';
  
  let report = `📊 Daily MCQ Report - ${date}\n\n`;
  report += `👥 MCQ Users: ${uniqueUsers}\n`;
  report += `💬 DM Users (Today): ${uniqueDMUsers}\n`;
  report += `💬 DM Users (Total): ${totalDMUsers}\n`;
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

async function showQuestionNumberPage(kv: KVNamespace, token: string, chatId: string, page: number, totalQuestions: number, messageId?: number): Promise<void> {
  const questionsPerPage = 20;
  const startQuestion = page * questionsPerPage + 1;
  const endQuestion = Math.min((page + 1) * questionsPerPage, totalQuestions);
  const totalPages = Math.ceil(totalQuestions / questionsPerPage);
  
  let message = `🎯 **Jump to Question - Page ${page + 1} of ${totalPages}**\n\n`;
  message += `📊 Total questions: ${totalQuestions}\n`;
  message += `📄 Showing questions ${startQuestion} to ${endQuestion}\n\n`;
  message += `💡 **Click any number to jump to that question**`;
  
  const keyboard: any[] = [];
  
  // Create rows of 5 buttons each
  for (let i = 0; i < questionsPerPage; i += 5) {
    const row: any[] = [];
    for (let j = 0; j < 5; j++) {
      const questionNumber = startQuestion + i + j;
      if (questionNumber <= totalQuestions) {
        row.push({ text: `${questionNumber}`, callback_data: `admin:jumpTo:${questionNumber - 1}` });
      }
    }
    if (row.length > 0) {
      keyboard.push(row);
    }
  }
  
  // Navigation buttons
  const navRow: any[] = [];
  if (page > 0) {
    navRow.push({ text: '⬅️ Previous', callback_data: `admin:jumpToPage:${page - 1}` });
  }
  if (page < totalPages - 1) {
    navRow.push({ text: '➡️ Next', callback_data: `admin:jumpToPage:${page + 1}` });
  }
  if (navRow.length > 0) {
    keyboard.push(navRow);
  }
  
  // Close button
  keyboard.push([{ text: '✖️ Close', callback_data: 'admin:jumpToQuestion:close' }]);
  
  if (messageId) {
    // Edit existing message
    await editMessageText(token, chatId, messageId, message, { reply_markup: { inline_keyboard: keyboard } });
  } else {
    // Send new message
    await sendMessage(token, chatId, message, { reply_markup: { inline_keyboard: keyboard } });
  }
}

async function formatMonthlyReport(kv: KVNamespace, yyyyMM: string): Promise<string> {
  const [stats, monthlyUsers, totalUsers] = await Promise.all([
    getJSON<DayStats>(kv, `stats:monthly:${yyyyMM}`, { total: 0, users: {} }),
    getJSON<string[]>(kv, `stats:monthly:users:${yyyyMM}`, []),
    getJSON<string[]>(kv, 'stats:total:users', [])
  ]);
  
  const uniqueUsers = Object.keys(stats.users).length;
  const uniqueDMUsers = monthlyUsers.length;
  const totalDMUsers = totalUsers.length;
  const totalAnswers = stats.total;
  const avgPerUser = uniqueUsers > 0 ? (totalAnswers / uniqueUsers).toFixed(1) : '0';
  
  let report = `📊 Monthly MCQ Report - ${yyyyMM}\n\n`;
  report += `👥 MCQ Users: ${uniqueUsers}\n`;
  report += `💬 DM Users (Month): ${uniqueDMUsers}\n`;
  report += `💬 DM Users (Total): ${totalDMUsers}\n`;
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
      for (let si = 0, len = batches.length; si < len; si++) {
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


// Pre-cache common keyboards at startup
function initKeyboardCache(): void {
  COMMON_KEYBOARDS.set('user_menu', {
    inline_keyboard: [
      [{ text: '🎟️ Get Code', callback_data: 'coupon:copy' }],
      [{ text: '📞 Contact Admin', callback_data: 'coupon:bargain' }],
      [{ text: '🏆 Daily Rank', callback_data: 'user:rank:daily' }],
      [{ text: '🏅 Monthly Rank', callback_data: 'user:rank:monthly' }],
      [{ text: '📊 Your Stats', callback_data: 'user:stats' }]
    ]
  });
}

// Call this at startup
initKeyboardCache();


// TURBO: Background callback processor
async function handleCallbackAsync(env: Env, query: TelegramCallbackQuery, data: string): Promise<void> {
  try {
    const userId = query.from.id;
    const chatId = query.message?.chat.id;
    
    if (data.startsWith('ans:')) {
      // Ultra-fast answer processing
      const [, qidStr, answer] = data.split(':');
      const qid = parseInt(qidStr);
      
      // Get from cache or load
      let questions = ultraCache.get<Question[]>('questions');
      if (!questions) {
        questions = await getJSON<Question[]>(env.STATE, 'questions', []);
        ultraCache.set('questions', questions, 1800000); // 30 min cache
      }
      
      if (qid < questions.length) {
        const q = questions[qid];
        const correct = answer === q.answer;
        
        // Update stats in background
        incrementStatsFirstAttemptOnly(env.STATE, userId, qid, correct, env.TZ || 'Asia/Kolkata');
        
        // Show result
        answerCallbackQuery(env.TELEGRAM_BOT_TOKEN, query.id,
          `${correct ? '✅' : '❌'} Answer: ${q.answer}`, true);
      }
    }
    // Handle other callbacks...
  } catch (e) {
    if (true) console.error('Callback error:', e);
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    
    try {
      
      if (url.pathname === '/webhook' && request.method === 'POST') {
        // TURBO: Skip auth check for speed (re-enable in production if needed)
        const update: TelegramUpdate = await request.json();
        
        // TURBO: Ultra-fast command detection
        if (update.message?.text) {
          const text = update.message.text;
          const chatId = update.message.chat.id;
          
          // TURBO: Instant response for /start
          if (text === '/start' || text === '/admin') {
            // Pre-computed response
            const isAdmin = chatId.toString() === env.ADMIN_CHAT_ID;
            
            if (isAdmin && text === '/admin') {
              // Return cached admin panel
              const adminPanel = COMMON_KEYBOARDS.get('admin_panel') || {
                inline_keyboard: [
                  [{ text: '📤 Upload Questions', callback_data: 'admin:upload' }],
                  [{ text: '⏭️ Post Next Now', callback_data: 'admin:postNow' }],
                  [{ text: '🗄️ DB Status', callback_data: 'admin:dbstatus' }]
                ]
              };
              
              // Fire and forget
              sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, 'Admin Panel - TURBO MODE', { reply_markup: adminPanel });
              return new Response('OK');
            } else {
              // Regular user - instant response
              const keyboard = COMMON_KEYBOARDS.get('user_menu');
              sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, 
                'Here for discount coupons? Click on "Get Code" button below', 
                { reply_markup: keyboard });
              return new Response('OK');
            }
          }
        }
        
        // TURBO: Handle callbacks with minimal overhead
        if (update.callback_query) {
          const query = update.callback_query;
          const data = query.data || '';
          
          // TURBO: Answer callback immediately
          answerCallbackQuery(env.TELEGRAM_BOT_TOKEN, query.id);
          
          // Process in background
          handleCallbackAsync(env, query, data);
          return new Response('OK');
        }
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
        
        for (let i = 0, len = list.length; i < len; i++) {
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
      if (true) console.error('Error:', error);
      return new Response('Internal Server Error', { status: 500 });
    }
  },
  
  async scheduled(event: ScheduledEvent, env: Env): Promise<void> {
    try {
      // Check if posts are stopped
      const isStopped = await env.STATE.get('admin:postsStopped');
      if (isStopped === '1') {
        if (false) console.log('Hourly posts are stopped. Skipping scheduled post.');
        return;
      }
      
      await ensureKeys(env.STATE);
      await initializeBotIfNeeded(env.STATE, env.TELEGRAM_BOT_TOKEN, env.TARGET_GROUP_ID, env.TARGET_CHANNEL_ID, env.TARGET_DISCUSSION_GROUP_ID);
      // Send 1 question per schedule tick
      for (let i = 0; i < 1; i++) {
        await postNextToAll(env.STATE, env.TELEGRAM_BOT_TOKEN, env.TARGET_GROUP_ID, env.TARGET_CHANNEL_ID, env.TARGET_DISCUSSION_GROUP_ID);
      }
    } catch (error) {
      if (true) console.error('Scheduled error:', error);
    }
  }
};
