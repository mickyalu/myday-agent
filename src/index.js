require('dotenv').config();

/**
 * MyDay Agent - Main Entry Point for Milestone 2
 * 
 * Initializes the MyDay Intel, Telegram Bot, and Aviation Grade Redirector
 */

const express = require('express');
const MyDayBot = require('./bot');
const Database = require('./database/init');

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
    // Initialize a Supabase-backed Database instance for API use
    const apiDb = new Database({ url: process.env.SUPABASE_URL, key: process.env.SUPABASE_SERVICE_KEY });
    try {
      await apiDb.waitReady();
      console.log('✓ Supabase API DB ready');
    } catch (e) {
      console.error('Supabase API DB failed to initialize:', e);
    }

    // Add Discipline Score API endpoint (Behavioral Oracle)
    app.get('/api/discipline-score/:telegram_id', async (req, res) => {
      try {
        const telegramId = Number(req.params.telegram_id);
        if (!telegramId) return res.status(400).json({ error: 'invalid telegram id' });

        // Weekly energy and missions
        const weekly = await apiDb.getWeeklyMoodEnergyData(telegramId);
        const totalStaked = await apiDb.getTotalStaked(telegramId);

        // Average morning energy (fallback 3)
        const energies = (weekly || []).map(w => Number(w.morning_energy || 0)).filter(n => !isNaN(n));
        const avgEnergy = energies.length ? energies.reduce((a,b)=>a+b,0)/energies.length : 3;

        // Compute recent wins streak from sunset_reflection entries (last 14 days)
        const { data: reflections } = await apiDb.client
          .from('daily_logs')
          .select('details,date')
          .eq('telegram_id', telegramId)
          .eq('log_type', 'sunset_reflection')
          .order('date', { ascending: false })
          .limit(14);

        let streak = 0;
        if (reflections && reflections.length) {
          for (const r of reflections) {
            try {
              const parsed = JSON.parse(r.details || '{}');
              const wins = Number(parsed.wins || 0);
              if (wins > 0) streak += 1; else break;
            } catch (e) { break; }
          }
        }

        // Simple scoring algorithm (0-100)
        // - Energy contribution: avgEnergy/5 * 40
        // - Staked contribution: min(40, totalStakedNormalized)
        // - Streak contribution: min(20, streak*5)
        const energyScore = (Math.max(1, Math.min(5, avgEnergy)) / 5) * 40;
        const stakeScore = Math.min(40, Number(totalStaked) * 2); // each cUSD ~2 points up to 40
        const streakScore = Math.min(20, streak * 5);
        let score = Math.round(Math.max(0, Math.min(100, energyScore + stakeScore + streakScore)));

        const status = score >= 80 ? 'Elite' : (score >= 50 ? 'Stable' : 'Warning');

        return res.json({ score, streak, status });
      } catch (err) {
        console.error('Discipline score error:', err);
        return res.status(500).json({ error: 'internal error' });
      }
    });

    // Start Express server
    app.listen(PORT, () => {
      console.log(`🌐 Express server running on port ${PORT}`);
      console.log(`   /pay - Aviation Grade Redirector`);
      console.log(`   /api/verify - OASF endpoint`);
      console.log(`   /health - Health check`);
    });

    // Database configuration (Supabase by default in production)
    const dbConfig = {
      type: process.env.DB_TYPE || 'supabase',
      url: process.env.SUPABASE_URL,
      key: process.env.SUPABASE_SERVICE_KEY
    };

    // Initialize bot (it will create its own Database instance using dbConfig)
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
