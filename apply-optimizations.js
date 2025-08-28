#!/usr/bin/env node

/**
 * Script to apply performance optimizations to the existing worker.ts file
 * Run with: node apply-optimizations.js
 */

const fs = require('fs');
const path = require('path');

// Read the original worker file
const workerPath = path.join(__dirname, 'src', 'worker.ts');
const backupPath = path.join(__dirname, 'src', 'worker-backup.ts');
const optimizedPath = path.join(__dirname, 'src', 'worker-optimized.ts');

console.log('🚀 Applying performance optimizations to worker.ts...\n');

// Create backup
if (!fs.existsSync(backupPath)) {
  fs.copyFileSync(workerPath, backupPath);
  console.log('✅ Created backup at src/worker-backup.ts');
} else {
  console.log('⚠️  Backup already exists at src/worker-backup.ts');
}

// Read the original content
let content = fs.readFileSync(workerPath, 'utf8');

// ============================================
// OPTIMIZATION 1: Add Memory Cache Class
// ============================================
const cacheClassCode = `
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
`;

// Insert cache class after interfaces
const interfaceEndMatch = content.match(/interface DayStats {[^}]*}/s);
if (interfaceEndMatch) {
  const insertPos = content.indexOf(interfaceEndMatch[0]) + interfaceEndMatch[0].length;
  content = content.slice(0, insertPos) + '\n' + cacheClassCode + content.slice(insertPos);
  console.log('✅ Added Memory Cache class');
}

// ============================================
// OPTIMIZATION 2: Optimize getJSON with caching
// ============================================
const optimizedGetJSON = `async function getJSON<T>(kv: KVNamespace, key: string, defaultValue: T): Promise<T> {
  // Check memory cache first for frequently accessed keys
  const cacheKey = \`kv:\${key}\`;
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
}`;

// Replace getJSON function
const getJSONMatch = content.match(/async function getJSON[^}]*}/s);
if (getJSONMatch) {
  content = content.replace(getJSONMatch[0], optimizedGetJSON);
  console.log('✅ Optimized getJSON with caching');
}

// ============================================
// OPTIMIZATION 3: Optimize putJSON to invalidate cache
// ============================================
const optimizedPutJSON = `async function putJSON(kv: KVNamespace, key: string, obj: any): Promise<void> {
  // Invalidate cache
  cache.delete(\`kv:\${key}\`);
  await kv.put(key, JSON.stringify(obj));
}`;

// Replace putJSON function
const putJSONMatch = content.match(/async function putJSON[^}]*}/s);
if (putJSONMatch) {
  content = content.replace(putJSONMatch[0], optimizedPutJSON);
  console.log('✅ Optimized putJSON with cache invalidation');
}

// ============================================
// OPTIMIZATION 4: Batch parallel KV operations in incrementStatsFirstAttemptOnly
// ============================================
// This is already optimized in the original code with Promise.all

// ============================================
// OPTIMIZATION 5: Add request deduplication for sendMessage
// ============================================
const optimizedSendMessage = `// Request deduplication map
const pendingRequests = new Map<string, Promise<any>>();

async function sendMessage(token: string, chatId: string | number, text: string, options?: any): Promise<any> {
  try {
    // Create deduplication key
    const dedupKey = \`send:\${chatId}:\${text.substring(0, 50)}\`;
    
    // Check if identical request is already pending
    if (pendingRequests.has(dedupKey)) {
      console.log('Deduplicating request:', dedupKey);
      return pendingRequests.get(dedupKey);
    }
    
    console.log('sendMessage called:', { chatId, text: text.substring(0, 100) });
    const url = \`https://api.telegram.org/bot\${token}/sendMessage\`;
    const body = {
      chat_id: chatId,
      text: text,
      parse_mode: 'HTML',
      ...options
    };
    
    const promise = fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    }).then(async response => {
      const result = await response.json();
      console.log('sendMessage result:', { ok: result.ok, status: response.status });
      return result;
    }).finally(() => {
      pendingRequests.delete(dedupKey);
    });
    
    pendingRequests.set(dedupKey, promise);
    return promise;
  } catch (error) {
    console.error('sendMessage error:', error);
    throw error;
  }
}`;

// Replace sendMessage function
const sendMessageMatch = content.match(/async function sendMessage[^}]*}[\s]*}/s);
if (sendMessageMatch) {
  content = content.replace(sendMessageMatch[0], optimizedSendMessage);
  console.log('✅ Added request deduplication to sendMessage');
}

// ============================================
// OPTIMIZATION 6: Memoize date functions
// ============================================
const memoizedDateFunctions = `// Memoized date cache
const dateCache = new Map<string, string>();

function getCurrentDate(tz: string): string {
  const cacheKey = \`date:\${tz}:\${Math.floor(Date.now() / 60000)}\`; // Cache per minute
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

function getCurrentMonth(tz: string): string {
  const cacheKey = \`month:\${tz}:\${Math.floor(Date.now() / 3600000)}\`; // Cache per hour
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
}`;

// Replace date functions
const dateMatch1 = content.match(/function getCurrentDate[^}]*}/s);
const dateMatch2 = content.match(/function getCurrentMonth[^}]*}/s);
if (dateMatch1 && dateMatch2) {
  // Remove old functions
  content = content.replace(dateMatch1[0], '');
  content = content.replace(dateMatch2[0], '');
  
  // Add memoized versions before the first async function
  const firstAsyncMatch = content.match(/async function/);
  if (firstAsyncMatch) {
    const insertPos = content.indexOf(firstAsyncMatch[0]);
    content = content.slice(0, insertPos) + memoizedDateFunctions + '\n\n' + content.slice(insertPos);
    console.log('✅ Added memoized date functions');
  }
}

// ============================================
// OPTIMIZATION 7: Optimize esc function
// ============================================
const optimizedEsc = `function esc(str: string): string {
  // Optimize by checking if escaping is needed first
  if (!/[&<>"']/.test(str)) return str;
  
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}`;

// Replace esc function
const escMatch = content.match(/function esc[^}]*}/s);
if (escMatch) {
  content = content.replace(escMatch[0], optimizedEsc);
  console.log('✅ Optimized esc function with early return');
}

// Write the optimized content
fs.writeFileSync(workerPath, content);
console.log('\n✅ Successfully applied all optimizations!');
console.log('📦 Deploy with: npm run deploy');
console.log('🔄 Rollback with: cp src/worker-backup.ts src/worker.ts');