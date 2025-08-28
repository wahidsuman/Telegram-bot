#!/usr/bin/env node

/**
 * Fix the callback chain issue - the real problem!
 */

const fs = require('fs');
const path = require('path');

const workerPath = path.join(__dirname, 'src', 'worker.ts');
let content = fs.readFileSync(workerPath, 'utf8');

console.log('🔧 Fixing callback chain issue...\n');

// The REAL issue: Line 1770 has just "if" instead of "} else if"
// This breaks the callback chain and prevents ans: from being reached

// Fix the broken if statement
content = content.replace(
  /(\s+)if \(data === 'user:stats'\) \{/,
  '$1} else if (data === \'user:stats\') {'
);

console.log('✅ Fixed callback chain - ans: callbacks will now work!');

// Also add some debugging to help
const debugCode = `
          // DEBUG: Log callback data
          console.log('Callback received:', data.substring(0, 20));
`;

// Add debugging at the beginning of callback query handler
content = content.replace(
  'const data = query.data || \'\';',
  'const data = query.data || \'\';\n' + debugCode
);

console.log('✅ Added callback debugging');

// Write the fixed content
fs.writeFileSync(workerPath, content);

console.log('\n✅ THE REAL FIX APPLIED!');
console.log('\n🎯 What was wrong:');
console.log('  • The "user:stats" handler wasn\'t part of the if-else chain');
console.log('  • This caused the code to skip checking for "ans:" callbacks');
console.log('  • Now all callbacks are properly chained');
console.log('\n📦 This should fix the popup issue!');