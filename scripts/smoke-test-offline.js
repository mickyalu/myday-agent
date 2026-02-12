#!/usr/bin/env node
/**
 * Offline Smoke Test
 * Tests imports, database initialization, and basic functionality
 * without requiring network connectivity
 */

async function runTests() {
  console.log('\n🧪 MyDay Agent Smoke Test (Offline)\n');

  let passed = 0;
  let failed = 0;

  // Test 1: Import ethers and verify v6 compatibility
  try {
    console.log('Test 1: Ethers v6 imports...');
    const { ethers } = require('ethers');
    const { verifyMessage, id, getAddress, JsonRpcProvider, Wallet, Contract } = ethers;
    
    // Verify key v6 functions exist
    if (typeof JsonRpcProvider === 'function' && 
        typeof Wallet === 'function' && 
        typeof verifyMessage === 'function' &&
        typeof id === 'function' &&
        typeof getAddress === 'function') {
      console.log('  ✓ Ethers v6 exports working correctly');
      passed++;
    } else {
      console.error('  ✗ Missing expected ethers v6 exports');
      failed++;
    }
  } catch (err) {
    console.error('  ✗ ethers import failed:', err.message);
    failed++;
  }

  // Test 2: Verify src/verifier/app.js loads without errors
  try {
    console.log('Test 2: Loading verifier/app.js...');
    delete require.cache[require.resolve('../src/verifier/app.js')];
    const appModule = require('../src/verifier/app.js');
    if (appModule.apiVerifyHandler && appModule.db) {
      console.log('  ✓ verifier/app.js loaded successfully');
      passed++;
    } else {
      console.error('  ✗ Missing exports from verifier/app.js');
      failed++;
    }
  } catch (err) {
    console.error('  ✗ Failed to load verifier/app.js:', err.message);
    failed++;
  }

  // Test 3: Verify src/verifier/index.js loads without errors
  try {
    console.log('Test 3: Loading verifier/index.js...');
    delete require.cache[require.resolve('../src/verifier/index.js')];
    const verifierIndex = require('../src/verifier/index.js');
    console.log('  ✓ verifier/index.js loaded successfully');
    passed++;
  } catch (err) {
    console.error('  ✗ Failed to load verifier/index.js:', err.message);
    failed++;
  }

  // Test 4: Database initialization
  try {
    console.log('Test 4: Database initialization...');
    const Database = require('../src/database/init.js');
    const db = new Database({ type: 'sqlite', dbPath: './data/test-smoke.db' });
    
    // Wait for database to be ready
    await db.waitReady();
    console.log('  ✓ Database initialized successfully');
    passed++;
  } catch (err) {
    console.error('  ✗ Database initialization failed:', err.message);
    failed++;
  }

  // Test 5: dotenv loading in bot.js
  try {
    console.log('Test 5: Loading bot.js with dotenv...');
    // Check if dotenv is loaded first in bot.js
    const fs = require('fs');
    const botContent = fs.readFileSync('./src/bot.js', 'utf-8');
    const lines = botContent.split('\n');
    
    // Find first non-comment, non-empty line
    let firstCodeLine = '';
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('//') && !trimmed.startsWith('/*')) {
        firstCodeLine = trimmed;
        break;
      }
    }
    
    if (firstCodeLine.includes("require('dotenv')")) {
      console.log('  ✓ dotenv is first line in bot.js');
      passed++;
    } else {
      console.error('  ✗ dotenv not first line in bot.js. First line:', firstCodeLine);
      failed++;
    }
  } catch (err) {
    console.error('  ✗ Failed to check bot.js:', err.message);
    failed++;
  }

  // Test 6: dotenv loading in src/index.js
  try {
    console.log('Test 6: Loading index.js with dotenv...');
    const fs = require('fs');
    const indexContent = fs.readFileSync('./src/index.js', 'utf-8');
    const lines = indexContent.split('\n');
    
    // Find first non-comment, non-empty line
    let firstCodeLine = '';
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('//') && !trimmed.startsWith('/*')) {
        firstCodeLine = trimmed;
        break;
      }
    }
    
    if (firstCodeLine.includes("require('dotenv')")) {
      console.log('  ✓ dotenv is first line in index.js');
      passed++;
    } else {
      console.error('  ✗ dotenv not first line in index.js. First line:', firstCodeLine);
      failed++;
    }
  } catch (err) {
    console.error('  ✗ Failed to check index.js:', err.message);
    failed++;
  }

  // Test 7: Verify database columns exist
  try {
    console.log('Test 7: Checking database schema columns...');
    const Database = require('../src/database/init.js');
    const db = new Database({ type: 'sqlite', dbPath: './data/test-columns.db' });
    
    await db.waitReady();
    
    // Check for required columns in daily_summary
    const hasColumns = await new Promise((resolve) => {
      db.db.all('PRAGMA table_info(daily_summary)', (err, columns) => {
        if (err) {
          resolve(false);
          return;
        }
        const columnNames = columns.map(c => c.name);
        const hasTotal = columnNames.includes('total_missions');
        const hasStaked = columnNames.includes('staked_amount');
        console.log('  Found columns:', columnNames.filter(c => 
          c === 'total_missions' || c === 'staked_amount' || c === 'morning_energy'
        ));
        resolve(hasTotal && hasStaked);
      });
    });
    
    if (hasColumns) {
      console.log('  ✓ Database columns (total_missions, staked_amount) verified');
      passed++;
    } else {
      console.error('  ✗ Missing required database columns');
      failed++;
    }
  } catch (err) {
    console.error('  ✗ Failed to check database columns:', err.message);
    failed++;
  }

  // Summary
  console.log('\n' + '='.repeat(50));
  console.log(`Tests Passed: ${passed}`);
  console.log(`Tests Failed: ${failed}`);
  console.log('='.repeat(50) + '\n');

  if (failed === 0) {
    console.log('✅ All offline tests passed! Project is ready.\n');
    process.exit(0);
  } else {
    console.log('❌ Some tests failed. Please review the errors above.\n');
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Test runner error:', err);
  process.exit(1);
});
