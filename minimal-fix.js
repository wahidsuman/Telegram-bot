#!/usr/bin/env node

/**
 * Minimal fix - just make the popup work
 */

const fs = require('fs');
const path = require('path');

const workerPath = path.join(__dirname, 'src', 'worker.ts');
let content = fs.readFileSync(workerPath, 'utf8');

console.log('🔧 Applying minimal popup fix...\n');

// Just add simple caching for questions
const cacheCode = `
// Simple cache for questions
const questionsCache = { data: null, timestamp: 0 };
`;

// Add cache after interfaces
const insertPoint = content.indexOf('// Utility functions');
content = content.slice(0, insertPoint) + cacheCode + content.slice(insertPoint);
console.log('✅ Added questions cache');

// Modify getJSON to cache questions
content = content.replace(
  'async function getJSON<T>(kv: KVNamespace, key: string, defaultValue: T): Promise<T> {',
  `async function getJSON<T>(kv: KVNamespace, key: string, defaultValue: T): Promise<T> {
  // Cache questions for 5 minutes
  if (key === 'questions' && questionsCache.data && Date.now() - questionsCache.timestamp < 300000) {
    return questionsCache.data as T;
  }`
);

// Add caching when returning questions
content = content.replace(
  'return value ? JSON.parse(value) : defaultValue;',
  `const result = value ? JSON.parse(value) : defaultValue;
    if (key === 'questions') {
      questionsCache.data = result;
      questionsCache.timestamp = Date.now();
    }
    return result;`
);
console.log('✅ Added questions caching in getJSON');

// Clear cache on putJSON
content = content.replace(
  'async function putJSON(kv: KVNamespace, key: string, obj: any): Promise<void> {',
  `async function putJSON(kv: KVNamespace, key: string, obj: any): Promise<void> {
  if (key === 'questions') {
    questionsCache.data = null;
    questionsCache.timestamp = 0;
  }`
);
console.log('✅ Added cache clearing in putJSON');

// Write the fixed content
fs.writeFileSync(workerPath, content);

console.log('\n✅ Minimal fix applied!');
console.log('  • Questions cached for 5 minutes');
console.log('  • Cache cleared on updates');
console.log('  • Original answer handler preserved');
console.log('\n📦 Ready to deploy');