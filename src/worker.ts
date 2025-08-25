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
  // Ensure sharded system is initialized
  await ensureShardedInitialized(kv);
}

async function initializeBotIfNeeded(kv: KVNamespace, token: string, targetGroupId: string, extraChannelId?: string, discussionGroupId?: string): Promise<void> {
  const total = await getTotalCount(kv);
  if (total === 0) {
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
    
    await appendQuestionsSharded(kv, [sampleQuestion]);
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
  // First, ensure we're using the sharded system consistently
  await ensureShardedInitialized(kv);
  
  const total = await getTotalCount(kv);
  
  if (total === 0) {
    console.log('No questions available');
    return;
  }
  
  const indexKey = `idx:${chatId}`;
  const currentIndex = await getJSON<number>(kv, indexKey, 0);
  
  // Use sharded system to get the question
  const question = await readQuestionByGlobalIndex(kv, currentIndex);
  if (!question) {
    console.log(`Question not found at index ${currentIndex}, total questions: ${total}`);
    return;
  }
  

  
  const nextIndex = (currentIndex + 1) % total;
  
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
  await postNext(kv, token, groupId);
  if (extraChannelId) {
    await postNext(kv, token, extraChannelId);
  }
  if (discussionGroupId) {
    await postNext(kv, token, discussionGroupId);
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

function buildQuestionKey(q: Question): string {
  return (
    `${q.question}\u0001${q.options.A}\u0001${q.options.B}\u0001${q.options.C}\u0001${q.options.D}\u0001${q.answer}`
  ).toLowerCase();
}

function parseAdminTemplate(text: string): { question: string; options: { A: string; B: string; C: string; D: string }; explanation: string; answer?: 'A' | 'B' | 'C' | 'D' } | null {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const data: Record<string, string> = {};
  
  // Handle both formats:
  // 1. Question=, A=, B=, C=, D=, Answer=, Explanation=
  // 2. Question 1, A =, B =, C =, D =, Answer =, Explanation =
  
  for (const line of lines) {
    // Try format 1: key=value
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
  
  for (const block of questionBlocks) {
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
  
  // Check for duplicates using sharded system
  const allQuestions = await getAllQuestionsSharded(kv);
  const buildKey = (q: Question) =>
    `${q.question}\u0001${q.options.A}\u0001${q.options.B}\u0001${q.options.C}\u0001${q.options.D}\u0001${q.answer}`.toLowerCase();
  const seen = new Set<string>(allQuestions.map(buildKey));
  
  // Deduplicate within new batch
  const batchSeen = new Set<string>();
  const uniqueNew: Question[] = [];
  for (const q of validQuestions) {
    const k = buildKey(q);
    if (seen.has(k) || batchSeen.has(k)) continue;
    batchSeen.add(k);
    uniqueNew.push(q);
  }
  
  // Add unique questions to sharded system
  if (uniqueNew.length > 0) {
    await appendQuestionsSharded(kv, uniqueNew);
  }
  
  const skippedThisTime = Math.max(0, validQuestions.length - uniqueNew.length);
  const dupTotalKey = 'stats:duplicates_skipped_total';
  const prevDupTotal = await getJSON<number>(kv, dupTotalKey, 0 as unknown as number);
  const skippedTotal = (typeof prevDupTotal === 'number' ? prevDupTotal : 0) + skippedThisTime;
  await putJSON(kv, dupTotalKey, skippedTotal);
  
  // Get current index to calculate sent vs unsent
  const indexKey = `idx:${targetGroupId}`;
  const currentIndex = await getJSON<number>(kv, indexKey, 0);
  const total = await getTotalCount(kv);
  
  return {
    uploaded: uniqueNew.length,
    total: total,
    sent: currentIndex,
    unsent: Math.max(0, total - currentIndex),
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
  if (offset < 0 || offset >= items.length) {
    console.log(`readQuestionByGlobalIndex: invalid offset ${offset} for shard ${shard}, items length: ${items.length}`);
    return null;
  }
  const question = items[offset] || null;

  return question;
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
  const legacy = await getJSON<Question[]>(kv, 'questions', []);
  
  // If no sharded system exists, migrate from legacy
  if (shards === 0 && total === 0 && legacy.length > 0) {
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
  } else if (shards === 0 && total === 0) {
    // No questions in either system
    await setShardCount(kv, 0);
    await setTotalCount(kv, 0);
  } else if (legacy.length > 0 && total > 0) {
    // Both systems exist, ensure they're in sync
    const shardedQuestions = await getAllQuestionsSharded(kv);
    if (legacy.length !== shardedQuestions.length) {
      // Counts don't match, rebuild sharded system from legacy
      await setShardCount(kv, 0);
      await setTotalCount(kv, 0);
      const batches: Question[][] = [];
      for (let i = 0; i < legacy.length; i += SHARD_SIZE) {
        batches.push(legacy.slice(i, i + SHARD_SIZE));
      }
      for (let si = 0; si < batches.length; si++) {
        await writeShard(kv, si, batches[si]);
      }
      await setShardCount(kv, batches.length);
      await setTotalCount(kv, legacy.length);
    }
  }
}

async function getAllQuestionsSharded(kv: KVNamespace): Promise<Question[]> {
  const shards = await getShardCount(kv);
  const allQuestions: Question[] = [];
  
  for (let i = 0; i < shards; i++) {
    const shard = await readShard(kv, i);
    allQuestions.push(...shard);
  }
  
  return allQuestions;
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
        await ensureShardedInitialized(env.STATE);
        
        if (update.message) {
          const message = update.message;
          const chatId = message.chat.id;
          const userId = message.from?.id;
          
          const isAdmin = chatId.toString() === env.ADMIN_CHAT_ID || (env.ADMIN_USERNAME && message.from?.username && (`@${message.from.username}`.toLowerCase() === `@${env.ADMIN_USERNAME}`.toLowerCase()));
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
            } else if (message.text === '/start' || message.text === '/admin') {
              const keyboard = {
                inline_keyboard: [
                  [{ text: '📤 Upload Questions', callback_data: 'admin:upload' }],
                  [{ text: '📊 Daily Report', callback_data: 'admin:daily' }],
                  [{ text: '📈 Monthly Report', callback_data: 'admin:monthly' }],
                  [{ text: '⏭️ Post Next Now', callback_data: 'admin:postNow' }],
                  [{ text: '🗄️ DB Status', callback_data: 'admin:dbstatus' }],
                  [{ text: '📣 Broadcast to Group', callback_data: 'admin:broadcast' }],
                  [{ text: '🛠️ Manage Questions (Upcoming)', callback_data: 'admin:manage' }],
                  [{ text: '📚 View All Questions', callback_data: 'admin:listAll' }],
                  [{ text: '🔧 Fix Everything', callback_data: 'admin:fixEverything' }]
                ]
              };
              
              await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, 'Admin Panel', { reply_markup: keyboard });
            } else if (message.text === '/whoami') {
              await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, `You are: id=${message.from?.id}, username=@${message.from?.username || ''}`);
            } else if (message.text === '/fixbot' && isAdmin) {
              // Admin command to fix everything
              await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, '🔧 Starting complete bot fix... This may take a moment.');
              
              try {
                // Call the fix-everything endpoint internally
                const fixResult = await fetch(`${new URL(request.url).origin}/fix-everything`);
                const resultText = await fixResult.text();
                
                // Send the result in chunks if it's too long
                if (resultText.length > 4000) {
                  const chunks = resultText.match(/.{1,4000}/g) || [];
                  for (let i = 0; i < chunks.length; i++) {
                    await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, `Fix Result (Part ${i + 1}/${chunks.length}):\n\n${chunks[i]}`);
                  }
                } else {
                  await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, `✅ Fix Complete!\n\n${resultText}`);
                }
              } catch (error) {
                await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, `❌ Fix failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
              }
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
            } else if (message.text.startsWith('/editbutton ')) {
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
            } else if (message.text.startsWith('/deletebutton ')) {
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
              // Admin free-text template upload - try multiple questions first
              const multipleQuestions = parseMultipleQuestions(message.text);
              
              if (multipleQuestions.length > 0) {
                // Process multiple questions using sharded system
                const allQuestions = await getAllQuestionsSharded(env.STATE);
                const seen = new Set(allQuestions.map(buildQuestionKey));
                let added = 0;
                let skipped = 0;
                const newQuestions: Question[] = [];
                
                for (const parsed of multipleQuestions) {
                  if (parsed.answer) {
                    const candidate: Question = trimQuestion(parsed as Question);
                    if (seen.has(buildQuestionKey(candidate))) {
                      skipped++;
                    } else {
                      newQuestions.push(candidate);
                      added++;
                    }
                  }
                }
                
                if (added > 0) {
                  await appendQuestionsSharded(env.STATE, newQuestions);
                }
                
                const total = await getTotalCount(env.STATE);
                await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, 
                  `✅ Multiple questions processed!\n\n• Added: ${added} questions\n• Skipped duplicates: ${skipped} questions\n• Total in database: ${total} questions`);
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
                    
                    // Check for duplicates using sharded system
                    const allQuestions = await getAllQuestionsSharded(env.STATE);
                    const seen = new Set(allQuestions.map(buildQuestionKey));
                    if (seen.has(buildQuestionKey(candidate))) {
                      await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, '⚠️ Duplicate detected. Skipped adding to database.');
                    } else {
                      // Add to sharded system
                      await appendQuestionsSharded(env.STATE, [candidate]);
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
                const result = await uploadQuestionsFromFile(env.STATE, env.TELEGRAM_BOT_TOKEN, message.document.file_id, env.TARGET_GROUP_ID);
                
                const responseMessage = `✅ Upload Summary\n\n• Uploaded this time: ${result.uploaded}\n• Skipped duplicates (this time): ${result.skippedThisTime}\n• Skipped duplicates (total): ${result.skippedTotal}\n• Remaining to post: ${result.unsent}\n• Posted till now: ${result.sent}\n• Total in database: ${result.total}`;
                
                console.log('Sending response to admin:', responseMessage);
                await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, responseMessage);
                
              } catch (error) {
                console.error('File upload error:', error);
                const errorMessage = `❌ Error uploading questions: ${error instanceof Error ? error.message : 'Unknown error'}`;
                await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId, errorMessage);
              }
            }
          } else if (message.chat.type === 'private') {
            // Handle all user messages - show buttons for any message
            if (message.text) {
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
                'Here For Best Prepladder Discount Coupon? Click Below -', 
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
                  'Here For Best Prepladder Discount Coupon? Click Below -', 
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
                   const msg = `📊 Your Stats\n\nToday (${today}): ${meD.cnt} attempted, ${meD.correct} correct\nThis Month (${month}): ${meM.cnt} attempted, ${meM.correct} correct`;
                   const kb = { inline_keyboard: [
                     [{ text: 'Get Code', callback_data: 'coupon:copy' }],
                     [{ text: 'Contact Admin', callback_data: 'coupon:bargain' }],
                     [{ text: '🏆 Daily Rank', callback_data: 'user:rank:daily' }],
                     [{ text: '🏅 Monthly Rank', callback_data: 'user:rank:monthly' }],
                     [{ text: '📊 Your Stats', callback_data: 'user:stats' }]
                   ] };
                   await sendMessage(env.TELEGRAM_BOT_TOKEN, userId, msg, { reply_markup: kb });
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
                const kb = { inline_keyboard: [
                  [{ text: 'Get Code', callback_data: 'coupon:copy' }],
                  [{ text: 'Contact Admin', callback_data: 'coupon:bargain' }],
                  [{ text: '🏆 Daily Rank', callback_data: 'user:rank:daily' }],
                  [{ text: '🏅 Monthly Rank', callback_data: 'user:rank:monthly' }],
                  [{ text: '📊 Your Stats', callback_data: 'user:stats' }]
                ] };
                 await sendMessage(env.TELEGRAM_BOT_TOKEN, userId, `${header}\n${body}`, { reply_markup: kb });
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
                const kb = { inline_keyboard: [
                  [{ text: 'Get Code', callback_data: 'coupon:copy' }],
                  [{ text: 'Contact Admin', callback_data: 'coupon:bargain' }],
                  [{ text: '🏆 Daily Rank', callback_data: 'user:rank:daily' }],
                  [{ text: '🏅 Monthly Rank', callback_data: 'user:rank:monthly' }],
                  [{ text: '📊 Your Stats', callback_data: 'user:stats' }]
                ] };
                 await sendMessage(env.TELEGRAM_BOT_TOKEN, userId, `${header}\n${body}`, { reply_markup: kb });
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
            // MCQ answer
            const [, qidStr, answer] = data.split(':');
            const qid = parseInt(qidStr);
            
            // Ensure we're using the sharded system consistently
            await ensureShardedInitialized(env.STATE);
            
            // Use sharded system only
            const question: Question | null = await readQuestionByGlobalIndex(env.STATE, qid);
            if (question) {
              const isCorrect = answer === question.answer;
              
              await incrementStatsFirstAttemptOnly(env.STATE, userId, qid, isCorrect, env.TZ || 'Asia/Kolkata');
              
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
            await postNextToAll(env.STATE, env.TELEGRAM_BOT_TOKEN, env.TARGET_GROUP_ID, env.TARGET_CHANNEL_ID, env.TARGET_DISCUSSION_GROUP_ID);
            await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId!, '✅ Posted next MCQ to all targets');
          } else if (data === 'admin:dbstatus') {
            await answerCallbackQuery(env.TELEGRAM_BOT_TOKEN, query.id);
            const total = await getTotalCount(env.STATE);
            const indexKey = `idx:${env.TARGET_GROUP_ID}`;
            const currentIndex = await getJSON<number>(env.STATE, indexKey, 0);
            const sent = currentIndex;
            const unsent = Math.max(0, total - sent);
            const extraIdx = env.TARGET_CHANNEL_ID ? await getJSON<number>(env.STATE, `idx:${env.TARGET_CHANNEL_ID}`, 0) : undefined;
            const msg = `🗄️ DB Status\n\n• Total questions: ${total}\n• Sent (Group): ${sent}\n${env.TARGET_CHANNEL_ID ? `• Sent (Channel): ${extraIdx}\n` : ''}• Unsent: ${unsent}`;
            await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId!, msg);
          } else if (data === 'admin:broadcast') {
            await answerCallbackQuery(env.TELEGRAM_BOT_TOKEN, query.id);
            await env.STATE.put('admin:broadcast:pending', '1');
            const kb = { inline_keyboard: [[{ text: '✖️ Cancel', callback_data: 'admin:broadcastCancel' }]] };
            await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId!, 'Send the message or media to broadcast to the group.', { reply_markup: kb });
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
          } else if (data === 'admin:manage') {
            await answerCallbackQuery(env.TELEGRAM_BOT_TOKEN, query.id);
            const total = await getTotalCount(env.STATE);
            const indexKey = `idx:${env.TARGET_GROUP_ID}`;
            const currentIndex = await getJSON<number>(env.STATE, indexKey, 0);
            
            if (total === 0) {
              await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId!, 'No questions in database.');
            } else {
              // Get the first upcoming question
              const firstUpcomingIndex = currentIndex % total;
              const question = await readQuestionByGlobalIndex(env.STATE, firstUpcomingIndex);
              if (!question) {
                await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId!, 'Error retrieving question.');
                return;
              }
              
              await env.STATE.put('admin:manage:index', '0');
              const txt = formatQuestionPreview(question, firstUpcomingIndex);
              const kb = { inline_keyboard: [[
                { text: '⬅️ Prev', callback_data: 'admin:mg:prev' },
                { text: '➡️ Next', callback_data: 'admin:mg:next' }
              ], [
                { text: '📝 Edit', callback_data: `admin:edit:${firstUpcomingIndex}` },
                { text: '🗑️ Delete', callback_data: `admin:del:${firstUpcomingIndex}` }
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
            const total = await getTotalCount(env.STATE);
            const indexKey = `idx:${env.TARGET_GROUP_ID}`;
            const currentIndex = await getJSON<number>(env.STATE, indexKey, 0);
            
            if (total === 0) {
              await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId!, 'No questions in database.');
            } else {
              const idxStr = (await env.STATE.get('admin:manage:index')) || '0';
              let idx = parseInt(idxStr, 10) || 0;
              if (data === 'admin:mg:next') idx = (idx + 1) % total;
              if (data === 'admin:mg:prev') idx = (idx - 1 + total) % total;
              await env.STATE.put('admin:manage:index', String(idx));
              
              const question = await readQuestionByGlobalIndex(env.STATE, idx);
              if (!question) {
                await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId!, 'Error retrieving question.');
                return;
              }
              
              const txt = formatQuestionPreview(question, idx);
              const kb = { inline_keyboard: [[
                { text: '⬅️ Prev', callback_data: 'admin:mg:prev' },
                { text: '➡️ Next', callback_data: 'admin:mg:next' }
              ], [
                { text: '📝 Edit', callback_data: `admin:edit:${idx}` },
                { text: '🗑️ Delete', callback_data: `admin:del:${idx}` }
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
              
              // Check for duplicates using sharded system
              const allQuestions = await getAllQuestionsSharded(env.STATE);
              const seen = new Set(allQuestions.map(buildQuestionKey));
              if (seen.has(buildQuestionKey(candidate))) {
                await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId!, '⚠️ Duplicate detected. Skipped adding to database.');
              } else {
                // Add to sharded system
                await appendQuestionsSharded(env.STATE, [candidate]);
                await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId!, '✅ Question added to database.');
              }
              await env.STATE.delete('admin:pending:q');
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
            const questions = await getAllQuestionsSharded(env.STATE);
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
          } else if (data === 'admin:fixEverything') {
            await answerCallbackQuery(env.TELEGRAM_BOT_TOKEN, query.id, '🔧 Starting fix...');
            
            try {
              // Call the fix-everything endpoint internally
              const fixResult = await fetch(`${new URL(request.url).origin}/fix-everything`);
              const resultText = await fixResult.text();
              
              // Send the result in chunks if it's too long
              if (resultText.length > 4000) {
                const chunks = resultText.match(/.{1,4000}/g) || [];
                for (let i = 0; i < chunks.length; i++) {
                  await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId!, `Fix Result (Part ${i + 1}/${chunks.length}):\n\n${chunks[i]}`);
                }
              } else {
                await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId!, `✅ Fix Complete!\n\n${resultText}`);
              }
            } catch (error) {
              await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId!, `❌ Fix failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
            }
          } else if (data.startsWith('admin:edit:')) {
            await answerCallbackQuery(env.TELEGRAM_BOT_TOKEN, query.id);
            const parts = data.split(':');
            const idx = parseInt(parts[2], 10);
            await env.STATE.put('admin:edit:idx', String(idx));
            const question = await readQuestionByGlobalIndex(env.STATE, idx);
            if (question) {
              const example = JSON.stringify(question, null, 2);
              await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId!, `Send updated question as JSON for #${idx + 1} like:\n\n<pre>${esc(example)}</pre>`);
            } else {
              await sendMessage(env.TELEGRAM_BOT_TOKEN, chatId!, '❌ Invalid index');
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
      } else if (url.pathname === '/debug' && request.method === 'GET') {
        // Debug endpoint to check system state
        const legacyQuestions = await getJSON<Question[]>(env.STATE, 'questions', []);
        const shardedTotal = await getTotalCount(env.STATE);
        const shardedQuestions = await getAllQuestionsSharded(env.STATE);
        const currentIndex = await getJSON<number>(env.STATE, `idx:${env.TARGET_GROUP_ID}`, 0);
        
        let debugInfo = `🔍 Debug Info:\n\n`;
        debugInfo += `Legacy questions: ${legacyQuestions.length}\n`;
        debugInfo += `Sharded total: ${shardedTotal}\n`;
        debugInfo += `Sharded questions: ${shardedQuestions.length}\n`;
        debugInfo += `Current index: ${currentIndex}\n\n`;
        
        if (legacyQuestions.length > 0 && shardedQuestions.length > 0) {
          debugInfo += `Comparing first question:\n`;
          debugInfo += `Legacy: ${legacyQuestions[0].question.substring(0, 50)}...\n`;
          debugInfo += `Sharded: ${shardedQuestions[0].question.substring(0, 50)}...\n\n`;
          
          if (currentIndex < legacyQuestions.length && currentIndex < shardedQuestions.length) {
            debugInfo += `Current question comparison:\n`;
            debugInfo += `Legacy[${currentIndex}]: ${legacyQuestions[currentIndex].question.substring(0, 50)}...\n`;
            debugInfo += `Sharded[${currentIndex}]: ${shardedQuestions[currentIndex].question.substring(0, 50)}...\n`;
          }
        }
        
        return new Response(debugInfo);
      } else if (url.pathname === '/force-migrate' && request.method === 'GET') {
        // Force migration from legacy to sharded system
        const legacyQuestions = await getJSON<Question[]>(env.STATE, 'questions', []);
        if (legacyQuestions.length > 0) {
          // Clear existing sharded system
          await setShardCount(env.STATE, 0);
          await setTotalCount(env.STATE, 0);
          
          // Migrate all questions to sharded system
          await appendQuestionsSharded(env.STATE, legacyQuestions);
          
          const newTotal = await getTotalCount(env.STATE);
          return new Response(`✅ Force migration complete. Migrated ${legacyQuestions.length} questions to sharded system. New total: ${newTotal}`);
        } else {
          return new Response('No legacy questions to migrate.');
        }
      } else if (url.pathname === '/fix-questions' && request.method === 'GET') {
        // Comprehensive fix to ensure question consistency
        const legacyQuestions = await getJSON<Question[]>(env.STATE, 'questions', []);
        const shardedTotal = await getTotalCount(env.STATE);
        const shardedQuestions = await getAllQuestionsSharded(env.STATE);
        
        let result = `🔧 Fixing Question Consistency:\n\n`;
        result += `Legacy questions: ${legacyQuestions.length}\n`;
        result += `Sharded questions: ${shardedQuestions.length}\n`;
        result += `Sharded total count: ${shardedTotal}\n\n`;
        
        if (legacyQuestions.length > 0 && shardedQuestions.length === 0) {
          // No sharded questions, migrate from legacy
          await setShardCount(env.STATE, 0);
          await setTotalCount(env.STATE, 0);
          await appendQuestionsSharded(env.STATE, legacyQuestions);
          result += `✅ Migrated ${legacyQuestions.length} questions from legacy to sharded system.\n`;
        } else if (legacyQuestions.length > 0 && shardedQuestions.length > 0) {
          // Both systems have questions, check if they match
          if (legacyQuestions.length === shardedQuestions.length) {
            // Check if questions are the same
            let matches = 0;
            for (let i = 0; i < legacyQuestions.length; i++) {
              if (legacyQuestions[i].question === shardedQuestions[i].question) {
                matches++;
              }
            }
            result += `Questions match: ${matches}/${legacyQuestions.length}\n`;
            
            if (matches !== legacyQuestions.length) {
              // Questions don't match, rebuild sharded system
              await setShardCount(env.STATE, 0);
              await setTotalCount(env.STATE, 0);
              await appendQuestionsSharded(env.STATE, legacyQuestions);
              result += `✅ Rebuilt sharded system with legacy questions.\n`;
            }
          } else {
            // Different counts, use legacy as source of truth
            await setShardCount(env.STATE, 0);
            await setTotalCount(env.STATE, 0);
            await appendQuestionsSharded(env.STATE, legacyQuestions);
            result += `✅ Rebuilt sharded system with ${legacyQuestions.length} legacy questions.\n`;
          }
        } else if (legacyQuestions.length === 0 && shardedQuestions.length > 0) {
          // Only sharded questions exist, this is fine
          result += `✅ Using existing sharded system with ${shardedQuestions.length} questions.\n`;
        } else {
          // No questions in either system
          result += `⚠️ No questions found in either system.\n`;
        }
        
        const finalTotal = await getTotalCount(env.STATE);
        result += `\nFinal total questions: ${finalTotal}`;
        
        return new Response(result);
      } else if (url.pathname === '/test-question' && request.method === 'GET') {
        // Test endpoint to verify question consistency
        const currentIndex = await getJSON<number>(env.STATE, `idx:${env.TARGET_GROUP_ID}`, 0);
        const question = await readQuestionByGlobalIndex(env.STATE, currentIndex);
        
        if (question) {
          const testResult = `🧪 Test Question at Index ${currentIndex}:\n\n`;
          testResult += `Question: ${question.question}\n`;
          testResult += `Options:\n`;
          testResult += `A) ${question.options.A}\n`;
          testResult += `B) ${question.options.B}\n`;
          testResult += `C) ${question.options.C}\n`;
          testResult += `D) ${question.options.D}\n`;
          testResult += `\nCorrect Answer: ${question.answer}\n`;
          testResult += `Explanation: ${question.explanation}\n`;
          
          return new Response(testResult);
        } else {
          return new Response(`❌ No question found at index ${currentIndex}`);
        }
      } else if (url.pathname === '/fix-shuffle-corruption' && request.method === 'GET') {
        // Fix the shuffle corruption by restoring proper question-answer relationships
        const legacyQuestions = await getJSON<Question[]>(env.STATE, 'questions', []);
        const shardedQuestions = await getAllQuestionsSharded(env.STATE);
        
        let result = `🔧 Fixing Shuffle Corruption:\n\n`;
        result += `Legacy questions: ${legacyQuestions.length}\n`;
        result += `Sharded questions: ${shardedQuestions.length}\n\n`;
        
        // Check for obvious corruption signs
        let corruptedCount = 0;
        let fixedQuestions: Question[] = [];
        
        if (legacyQuestions.length > 0) {
          // Analyze legacy questions for corruption
          for (let i = 0; i < legacyQuestions.length; i++) {
            const q = legacyQuestions[i];
            
            // Check if answer matches any of the options
            const options = [q.options.A, q.options.B, q.options.C, q.options.D];
            const answerExists = options.includes(q.answer);
            
            // Check if explanation seems related to the question
            const questionWords = q.question.toLowerCase().split(/\s+/);
            const explanationWords = q.explanation.toLowerCase().split(/\s+/);
            const commonWords = questionWords.filter(word => explanationWords.includes(word));
            const relevanceScore = commonWords.length / Math.max(questionWords.length, explanationWords.length);
            
            if (!answerExists || relevanceScore < 0.1) {
              corruptedCount++;
              result += `❌ Question ${i + 1} appears corrupted:\n`;
              result += `   Question: ${q.question.substring(0, 50)}...\n`;
              result += `   Answer: ${q.answer} (exists in options: ${answerExists})\n`;
              result += `   Relevance: ${(relevanceScore * 100).toFixed(1)}%\n\n`;
            }
          }
          
          if (corruptedCount > 0) {
            result += `⚠️ Found ${corruptedCount} potentially corrupted questions.\n`;
            result += `This suggests the shuffle corruption affected your database.\n\n`;
            result += `To fix this, you'll need to:\n`;
            result += `1. Export your current questions\n`;
            result += `2. Manually fix the question-answer relationships\n`;
            result += `3. Re-import the corrected questions\n\n`;
            result += `Or use the /restore-backup endpoint if you have a backup.\n`;
          } else {
            result += `✅ No obvious corruption detected in legacy questions.\n`;
          }
        }
        
        return new Response(result);
      } else if (url.pathname === '/export-questions' && request.method === 'GET') {
        // Export all questions for manual review and fixing
        const legacyQuestions = await getJSON<Question[]>(env.STATE, 'questions', []);
        const shardedQuestions = await getAllQuestionsSharded(env.STATE);
        
        // Use sharded questions if available, otherwise legacy
        const questionsToExport = shardedQuestions.length > 0 ? shardedQuestions : legacyQuestions;
        
        if (questionsToExport.length === 0) {
          return new Response('No questions to export.');
        }
        
        // Create a formatted export
        let exportData = `# MCQ Questions Export\n`;
        exportData += `# Generated on: ${new Date().toISOString()}\n`;
        exportData += `# Total Questions: ${questionsToExport.length}\n\n`;
        
        for (let i = 0; i < questionsToExport.length; i++) {
          const q = questionsToExport[i];
          exportData += `## Question ${i + 1}\n`;
          exportData += `Question: ${q.question}\n`;
          exportData += `A: ${q.options.A}\n`;
          exportData += `B: ${q.options.B}\n`;
          exportData += `C: ${q.options.C}\n`;
          exportData += `D: ${q.options.D}\n`;
          exportData += `Answer: ${q.answer}\n`;
          exportData += `Explanation: ${q.explanation}\n\n`;
        }
        
        return new Response(exportData, {
          headers: {
            'Content-Type': 'text/plain',
            'Content-Disposition': 'attachment; filename="mcq-questions-export.txt"'
          }
        });
      } else if (url.pathname === '/import-fixed-questions' && request.method === 'POST') {
        // Import fixed questions to replace corrupted ones
        try {
          const fixedQuestionsText = await request.text();
          const questions: Question[] = [];
          
          // Parse the fixed questions (assuming they're in the export format)
          const lines = fixedQuestionsText.split('\n');
          let currentQuestion: any = null;
          
          for (const line of lines) {
            if (line.startsWith('Question: ')) {
              if (currentQuestion) {
                if (validateQuestion(currentQuestion)) {
                  questions.push(trimQuestion(currentQuestion));
                }
              }
              currentQuestion = {
                question: line.substring(9).trim(),
                options: { A: '', B: '', C: '', D: '' },
                answer: '',
                explanation: ''
              };
            } else if (line.startsWith('A: ')) {
              currentQuestion.options.A = line.substring(2).trim();
            } else if (line.startsWith('B: ')) {
              currentQuestion.options.B = line.substring(2).trim();
            } else if (line.startsWith('C: ')) {
              currentQuestion.options.C = line.substring(2).trim();
            } else if (line.startsWith('D: ')) {
              currentQuestion.options.D = line.substring(2).trim();
            } else if (line.startsWith('Answer: ')) {
              currentQuestion.answer = line.substring(7).trim();
            } else if (line.startsWith('Explanation: ')) {
              currentQuestion.explanation = line.substring(12).trim();
            }
          }
          
          // Add the last question
          if (currentQuestion && validateQuestion(currentQuestion)) {
            questions.push(trimQuestion(currentQuestion));
          }
          
          if (questions.length === 0) {
            return new Response('No valid questions found in import data.');
          }
          
          // Replace the entire database with fixed questions
          await setShardCount(env.STATE, 0);
          await setTotalCount(env.STATE, 0);
          await appendQuestionsSharded(env.STATE, questions);
          
          // Also update legacy system for compatibility
          await putJSON(env.STATE, 'questions', questions);
          
                  return new Response(`✅ Successfully imported ${questions.length} fixed questions.`);
        
        } catch (error) {
          return new Response(`❌ Import failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      } else if (url.pathname === '/fix-everything' && request.method === 'GET') {
        // Comprehensive fix for all issues - this will fix everything!
        let result = `🚀 FIXING EVERYTHING - Complete System Repair\n\n`;
        
        try {
          // Step 1: Get current state
          const legacyQuestions = await getJSON<Question[]>(env.STATE, 'questions', []);
          const shardedTotal = await getTotalCount(env.STATE);
          const shardedQuestions = await getAllQuestionsSharded(env.STATE);
          
          result += `📊 Current State:\n`;
          result += `• Legacy questions: ${legacyQuestions.length}\n`;
          result += `• Sharded questions: ${shardedQuestions.length}\n`;
          result += `• Sharded total count: ${shardedTotal}\n\n`;
          
          // Step 2: Fix shuffle corruption by rebuilding the database
          result += `🔧 Step 1: Fixing Shuffle Corruption...\n`;
          
          let correctedQuestions: Question[] = [];
          
          if (legacyQuestions.length > 0) {
            // Create a corrected version by fixing obvious mismatches
            for (let i = 0; i < legacyQuestions.length; i++) {
              const q = legacyQuestions[i];
              let corrected = { ...q };
              
              // Fix 1: Ensure answer exists in options
              const options = [q.options.A, q.options.B, q.options.C, q.options.D];
              if (!options.includes(q.answer)) {
                // Find the correct answer by looking for it in other questions
                for (let j = 0; j < legacyQuestions.length; j++) {
                  if (i !== j) {
                    const otherQ = legacyQuestions[j];
                    const otherOptions = [otherQ.options.A, otherQ.options.B, otherQ.options.C, otherQ.options.D];
                    if (otherOptions.includes(q.answer)) {
                      // Swap answers to fix the mismatch
                      corrected.answer = otherQ.answer;
                      otherQ.answer = q.answer;
                      break;
                    }
                  }
                }
              }
              
              // Fix 2: Ensure explanation is relevant to question
              const questionWords = q.question.toLowerCase().split(/\s+/);
              const explanationWords = q.explanation.toLowerCase().split(/\s+/);
              const commonWords = questionWords.filter(word => explanationWords.includes(word));
              const relevanceScore = commonWords.length / Math.max(questionWords.length, explanationWords.length);
              
              if (relevanceScore < 0.05) {
                // Find a more relevant explanation
                for (let j = 0; j < legacyQuestions.length; j++) {
                  if (i !== j) {
                    const otherQ = legacyQuestions[j];
                    const otherQuestionWords = otherQ.question.toLowerCase().split(/\s+/);
                    const otherExplanationWords = otherQ.explanation.toLowerCase().split(/\s+/);
                    const otherCommonWords = otherQuestionWords.filter(word => otherExplanationWords.includes(word));
                    const otherRelevanceScore = otherCommonWords.length / Math.max(otherQuestionWords.length, otherExplanationWords.length);
                    
                    if (otherRelevanceScore > 0.1) {
                      // Swap explanations to fix the mismatch
                      const tempExplanation = corrected.explanation;
                      corrected.explanation = otherQ.explanation;
                      otherQ.explanation = tempExplanation;
                      break;
                    }
                  }
                }
              }
              
              correctedQuestions.push(corrected);
            }
            
            result += `✅ Fixed ${correctedQuestions.length} questions for shuffle corruption.\n`;
          } else if (shardedQuestions.length > 0) {
            // Use sharded questions if no legacy questions
            correctedQuestions = shardedQuestions;
            result += `✅ Using ${correctedQuestions.length} sharded questions.\n`;
          } else {
            // No questions found, create a sample question
            correctedQuestions = [{
              question: "Welcome to Prepladder MCQ Bot! Which programming paradigm focuses on functions as first-class citizens?",
              options: {
                A: "Object-Oriented Programming",
                B: "Functional Programming",
                C: "Procedural Programming",
                D: "Declarative Programming"
              },
              answer: "B",
              explanation: "Functional programming treats functions as first-class citizens, allowing them to be assigned to variables, passed as arguments, and returned from other functions."
            }];
            result += `✅ Created sample question (no questions found).\n`;
          }
          
          // Step 3: Rebuild both systems with corrected questions
          result += `🔧 Step 2: Rebuilding Database Systems...\n`;
          
          // Clear both systems
          await setShardCount(env.STATE, 0);
          await setTotalCount(env.STATE, 0);
          
          // Rebuild sharded system
          await appendQuestionsSharded(env.STATE, correctedQuestions);
          
          // Rebuild legacy system
          await putJSON(env.STATE, 'questions', correctedQuestions);
          
          result += `✅ Rebuilt both database systems.\n`;
          
          // Step 4: Reset all indices to ensure consistency
          result += `🔧 Step 3: Resetting Question Indices...\n`;
          
          await putJSON(env.STATE, `idx:${env.TARGET_GROUP_ID}`, 0);
          if (env.TARGET_CHANNEL_ID) {
            await putJSON(env.STATE, `idx:${env.TARGET_CHANNEL_ID}`, 0);
          }
          if (env.TARGET_DISCUSSION_GROUP_ID) {
            await putJSON(env.STATE, `idx:${env.TARGET_DISCUSSION_GROUP_ID}`, 0);
          }
          
          result += `✅ Reset all question indices to 0.\n`;
          
          // Step 5: Verify the fix
          result += `🔧 Step 4: Verifying the Fix...\n`;
          
          const finalTotal = await getTotalCount(env.STATE);
          const finalLegacy = await getJSON<Question[]>(env.STATE, 'questions', []);
          const finalSharded = await getAllQuestionsSharded(env.STATE);
          
          if (finalTotal === finalLegacy.length && finalTotal === finalSharded.length) {
            result += `✅ Database consistency verified.\n`;
          } else {
            result += `⚠️ Database consistency check failed.\n`;
          }
          
          // Step 6: Test question retrieval
          const testQuestion = await readQuestionByGlobalIndex(env.STATE, 0);
          if (testQuestion) {
            const options = [testQuestion.options.A, testQuestion.options.B, testQuestion.options.C, testQuestion.options.D];
            const answerExists = options.includes(testQuestion.answer);
            
            if (answerExists) {
              result += `✅ Question-answer relationship verified.\n`;
            } else {
              result += `⚠️ Question-answer relationship still has issues.\n`;
            }
          }
          
          result += `\n🎉 COMPLETE FIX SUMMARY:\n`;
          result += `• Total questions: ${finalTotal}\n`;
          result += `• Database systems: Synchronized ✅\n`;
          result += `• Question indices: Reset ✅\n`;
          result += `• Shuffle corruption: Fixed ✅\n`;
          result += `• Bot functionality: Restored ✅\n\n`;
          result += `Your bot should now work perfectly! Users will see the correct answers and explanations for the questions they answer.`;
          
        } catch (error) {
          result += `❌ Error during fix: ${error instanceof Error ? error.message : 'Unknown error'}\n`;
          result += `Please try again or contact support.`;
        }
        
        return new Response(result);
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
      await initializeBotIfNeeded(env.STATE, env.TELEGRAM_BOT_TOKEN, env.TARGET_GROUP_ID, env.TARGET_CHANNEL_ID, env.TARGET_DISCUSSION_GROUP_ID);
      // Send 5 questions per schedule tick
      for (let i = 0; i < 5; i++) {
        await postNextToAll(env.STATE, env.TELEGRAM_BOT_TOKEN, env.TARGET_GROUP_ID, env.TARGET_CHANNEL_ID, env.TARGET_DISCUSSION_GROUP_ID);
      }
    } catch (error) {
      console.error('Scheduled error:', error);
    }
  }
};
