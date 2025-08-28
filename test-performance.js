#!/usr/bin/env node

/**
 * Performance test script for the Telegram MCQ Bot
 * This simulates multiple concurrent webhook requests to measure response times
 */

const https = require('https');

// Configuration
const WEBHOOK_URL = 'https://telegram-mcq-bot.telegram-mcq-bot-wahid.workers.dev/webhook';
const CONCURRENT_REQUESTS = 10;
const TOTAL_REQUESTS = 50;

// Sample webhook payloads
const samplePayloads = [
  // Start command
  {
    update_id: Date.now(),
    message: {
      message_id: 1,
      from: { id: 123456, first_name: "Test", username: "testuser" },
      chat: { id: 123456, type: "private" },
      text: "/start"
    }
  },
  // Answer callback
  {
    update_id: Date.now() + 1,
    callback_query: {
      id: "query_" + Date.now(),
      from: { id: 123456, first_name: "Test", username: "testuser" },
      message: { message_id: 2, chat: { id: 123456 } },
      data: "ans:0:A"
    }
  },
  // User stats
  {
    update_id: Date.now() + 2,
    callback_query: {
      id: "query_" + Date.now(),
      from: { id: 123456, first_name: "Test", username: "testuser" },
      message: { message_id: 3, chat: { id: 123456 } },
      data: "user:stats"
    }
  },
  // Daily rank
  {
    update_id: Date.now() + 3,
    callback_query: {
      id: "query_" + Date.now(),
      from: { id: 123456, first_name: "Test", username: "testuser" },
      message: { message_id: 4, chat: { id: 123456 } },
      data: "user:rank:daily"
    }
  }
];

// Performance metrics
const metrics = {
  totalRequests: 0,
  successfulRequests: 0,
  failedRequests: 0,
  responseTimes: [],
  startTime: null,
  endTime: null
};

// Make a single request
function makeRequest(payload) {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();
    const data = JSON.stringify(payload);
    
    const options = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': data.length
      }
    };
    
    const req = https.request(WEBHOOK_URL, options, (res) => {
      let responseData = '';
      
      res.on('data', (chunk) => {
        responseData += chunk;
      });
      
      res.on('end', () => {
        const responseTime = Date.now() - startTime;
        metrics.responseTimes.push(responseTime);
        
        if (res.statusCode === 200) {
          metrics.successfulRequests++;
          resolve({ success: true, responseTime, status: res.statusCode });
        } else {
          metrics.failedRequests++;
          resolve({ success: false, responseTime, status: res.statusCode, error: responseData });
        }
      });
    });
    
    req.on('error', (error) => {
      const responseTime = Date.now() - startTime;
      metrics.failedRequests++;
      resolve({ success: false, responseTime, error: error.message });
    });
    
    req.write(data);
    req.end();
  });
}

// Run concurrent requests
async function runConcurrentBatch(batchSize) {
  const promises = [];
  for (let i = 0; i < batchSize; i++) {
    // Randomly select a payload type
    const payload = { ...samplePayloads[Math.floor(Math.random() * samplePayloads.length)] };
    // Make update_id unique
    payload.update_id = Date.now() + Math.random() * 1000000;
    if (payload.callback_query) {
      payload.callback_query.id = "query_" + Date.now() + "_" + i;
    }
    
    promises.push(makeRequest(payload));
    metrics.totalRequests++;
  }
  
  return Promise.all(promises);
}

// Calculate statistics
function calculateStats() {
  const sorted = [...metrics.responseTimes].sort((a, b) => a - b);
  const sum = sorted.reduce((a, b) => a + b, 0);
  const avg = sum / sorted.length;
  const median = sorted[Math.floor(sorted.length / 2)];
  const p95 = sorted[Math.floor(sorted.length * 0.95)];
  const p99 = sorted[Math.floor(sorted.length * 0.99)];
  const min = sorted[0];
  const max = sorted[sorted.length - 1];
  
  return { avg, median, p95, p99, min, max };
}

// Main test function
async function runPerformanceTest() {
  console.log('🚀 Starting Performance Test');
  console.log(`📊 Testing: ${WEBHOOK_URL}`);
  console.log(`🔄 Concurrent Requests: ${CONCURRENT_REQUESTS}`);
  console.log(`📈 Total Requests: ${TOTAL_REQUESTS}\n`);
  
  metrics.startTime = Date.now();
  
  // Run batches
  const batches = Math.ceil(TOTAL_REQUESTS / CONCURRENT_REQUESTS);
  for (let i = 0; i < batches; i++) {
    const batchSize = Math.min(CONCURRENT_REQUESTS, TOTAL_REQUESTS - (i * CONCURRENT_REQUESTS));
    console.log(`Running batch ${i + 1}/${batches} (${batchSize} requests)...`);
    
    const results = await runConcurrentBatch(batchSize);
    
    // Log any errors
    results.forEach((result, index) => {
      if (!result.success) {
        console.log(`  ❌ Request ${index + 1} failed:`, result.error || `Status ${result.status}`);
      }
    });
  }
  
  metrics.endTime = Date.now();
  
  // Calculate and display results
  console.log('\n' + '='.repeat(50));
  console.log('📊 PERFORMANCE TEST RESULTS');
  console.log('='.repeat(50));
  
  const totalTime = (metrics.endTime - metrics.startTime) / 1000;
  const stats = calculateStats();
  
  console.log(`\n✅ Successful Requests: ${metrics.successfulRequests}/${metrics.totalRequests}`);
  console.log(`❌ Failed Requests: ${metrics.failedRequests}/${metrics.totalRequests}`);
  console.log(`⏱️  Total Test Duration: ${totalTime.toFixed(2)}s`);
  console.log(`📈 Requests per Second: ${(metrics.totalRequests / totalTime).toFixed(2)}`);
  
  console.log('\n📊 Response Time Statistics (ms):');
  console.log(`  • Average: ${stats.avg.toFixed(2)}ms`);
  console.log(`  • Median: ${stats.median.toFixed(2)}ms`);
  console.log(`  • Min: ${stats.min.toFixed(2)}ms`);
  console.log(`  • Max: ${stats.max.toFixed(2)}ms`);
  console.log(`  • 95th Percentile: ${stats.p95.toFixed(2)}ms`);
  console.log(`  • 99th Percentile: ${stats.p99.toFixed(2)}ms`);
  
  // Performance rating
  console.log('\n🎯 Performance Rating:');
  if (stats.avg < 200) {
    console.log('  ⚡ EXCELLENT - Bot is very fast!');
  } else if (stats.avg < 500) {
    console.log('  ✅ GOOD - Bot performance is acceptable');
  } else if (stats.avg < 1000) {
    console.log('  ⚠️  MODERATE - Bot could be faster');
  } else {
    console.log('  ❌ SLOW - Bot needs optimization');
  }
  
  // Recommendations
  if (stats.max > stats.avg * 3) {
    console.log('\n⚠️  High variance detected - some requests are much slower than average');
  }
  
  if (metrics.failedRequests > 0) {
    console.log(`\n⚠️  ${metrics.failedRequests} requests failed - check error logs`);
  }
}

// Run the test
console.log('🔧 Telegram MCQ Bot - Performance Test Tool\n');

// Check if we're testing locally or production
if (process.argv[2] === '--help') {
  console.log('Usage: node test-performance.js');
  console.log('\nThis tool tests the performance of your deployed Telegram bot webhook.');
  console.log('Make sure your bot is deployed before running this test.\n');
  process.exit(0);
}

runPerformanceTest().catch(error => {
  console.error('❌ Test failed:', error);
  process.exit(1);
});