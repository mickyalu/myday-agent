require('dotenv').config();

/**
 * MyDay Agent - Main Entry Point for Milestone 2
 * 
 * Initializes the MyDay Intel, Telegram Bot, and Aviation Grade Redirector
 */

const express = require('express');
const MyDayBot = require('./bot');

const app = express();
const PORT = process.env.PORT || 3000;

/**
 * Aviation Grade Redirector: /pay endpoint
 * Converts HTTP -> celo:// deep link for mobile wallet compatibility
 */
app.get('/pay', async (req, res) => {
  const amount = req.query.amount || '0';
  const user = req.query.user || null;
  const meta = req.query.meta || '';
  const vault = process.env.VAULT_ADDRESS || '';

  if (!vault) {
    return res.status(400).send('❌ VAULT_ADDRESS not configured');
  }

  // Build celo:// deep link (include metadata if present)
  const metaParam = meta ? `&metadata=${encodeURIComponent(meta)}` : '';
  const deepLink = `celo://wallet/pay?address=${encodeURIComponent(vault)}&amount=${encodeURIComponent(amount)}&currency=cUSD${metaParam}`;

  // Ensure browser connection is closed quickly so mobile OS can open the wallet
  res.set('Connection', 'close');

  // Perform the redirect to the deep link
  res.redirect(deepLink);

  // Send a follow-up Telegram message (async) if we have a user id
  if (user && process.env.TELEGRAM_BOT_TOKEN) {
    try {
      const TelegramBot = require('node-telegram-bot-api');
      const tbot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN);
      const followUp = 'Guardian is monitoring the Celo L2 for your transaction. I will notify you the moment your Reservoir is updated.';
      // fire-and-forget
      tbot.sendMessage(Number(user), followUp).catch(err => console.error('Follow-up message failed:', err));
    } catch (err) {
      console.error('Error sending follow-up message:', err);
    }
  }
});

/**
 * Health check endpoint
 */
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'MyDay Guardian' });
});

/**
 * API verify endpoint (stub for OASF compatibility)
 */
app.get('/api/verify', (req, res) => {
  res.json({ verified: true, agent: 'myday-guardian' });
});

async function main() {
  // Validate required environment variables
  const requiredKeys = ['TELEGRAM_BOT_TOKEN', 'GEMINI_API_KEY'];
  const missing = requiredKeys.filter(key => !process.env[key]);

  if (missing.length > 0) {
    console.error(`\n⚠️ Missing environment variables: ${missing.join(', ')}\n`);
    console.error('Please add them to your .env file:');
    console.error(`  TELEGRAM_BOT_TOKEN=your_token_here`);
    console.error(`  GEMINI_API_KEY=your_key_here\n`);
    process.exit(1);
  }

  try {
    // Start Express server
    app.listen(PORT, () => {
      console.log(`🌐 Express server running on port ${PORT}`);
      console.log(`   /pay - Aviation Grade Redirector`);
      console.log(`   /api/verify - OASF endpoint`);
      console.log(`   /health - Health check`);
    });

    // Database configuration (SQLite by default)
    const dbConfig = {
      type: process.env.DB_TYPE || 'sqlite',
      dbPath: process.env.DB_PATH || './data/myday.db'
    };

    // Initialize bot
    const bot = new MyDayBot(
      process.env.TELEGRAM_BOT_TOKEN,
      process.env.GEMINI_API_KEY,
      dbConfig
    );

    await bot.start();
    console.log('✓ MyDay Agent (Milestone 2) is running');
    console.log('  - Morning Nudge: Active');
    console.log('  - MyDay Intel: Connected');
    console.log('  - Database: SQLite (data/myday.db)');
    console.log('  - Telegram: Connected');

    // Initialize scheduler (automated nudges)
    try {
      const initScheduler = require('./services/scheduler');
      initScheduler({ db: bot.db, bot });
      console.log('✓ Scheduler initialized');
    } catch (e) {
      console.error('Scheduler initialization failed:', e);
    }

  } catch (error) {
    console.error('❌ Failed to start bot:', error);
    process.exit(1);
  }
}

main();
