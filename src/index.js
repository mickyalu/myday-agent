require('dotenv').config();

/**
 * MyDay Agent - Main Entry Point for Milestone 2
 * 
 * Initializes the MyDay Intel and Telegram Bot
 */

const MyDayBot = require('./bot');

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

  } catch (error) {
    console.error('❌ Failed to start bot:', error);
    process.exit(1);
  }
}

main();
