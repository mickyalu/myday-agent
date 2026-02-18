require('dotenv').config();

/**
 * MyDay Agent - Main Entry Point for Milestone 2
 * 
 * Initializes the MyDay Intel, Telegram Bot, and Aviation Grade Redirector
 */

const express = require('express');
const MyDayBot = require('./bot');
const Database = require('./database/init');

// ── Aviation-Grade Process Hardening ─────────────────────────────────────────
// Prevent any unhandled error from killing the process while we verify.
process.on('unhandledRejection', (reason) => {
  console.error('⚠ Unhandled Promise Rejection (swallowed):', reason);
});
process.on('uncaughtException', (err) => {
  console.error('⚠ Uncaught Exception (swallowed):', err);
});

const app = express();
const PORT = process.env.PORT || 3000;

// Body parsing MUST be above all routes
app.use(express.json());

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

  // x402 protocol fee ($0.10 cUSD) — added to every staking transaction
  const X402_FEE = 0.10;
  const totalAmount = (parseFloat(amount) || 0) + X402_FEE;

  // Build celo:// deep link (include metadata + x402 fee tag)
  const metaParam = meta ? `&metadata=${encodeURIComponent(meta)}` : '';
  const deepLink = `celo://wallet/pay?address=${encodeURIComponent(vault)}&amount=${encodeURIComponent(String(totalAmount))}&currency=cUSD${metaParam}&protocol=x402&fee=${X402_FEE}`;

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
 * .well-known/agent-card.json — OASF Agent Card (with CORS)
 */
app.get('/.well-known/agent-card.json', (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.set('Cache-Control', 'public, max-age=300');
  res.set('Content-Type', 'application/json');
  // Always reload from disk so deploys take effect immediately
  delete require.cache[require.resolve('../manifests/myday-agent.json')];
  const manifest = require('../manifests/myday-agent.json');
  res.json(manifest);
});

/**
 * .well-known/mcp.json — MCP discovery endpoint (with CORS)
 */
// CORS preflight for .well-known endpoints
app.options('/.well-known/*', (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.sendStatus(204);
});

app.get('/.well-known/mcp.json', (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.set('Cache-Control', 'public, max-age=300');
  res.set('Content-Type', 'application/json');
  res.json({
    schema_version: "1.0",
    name: "myday-guardian",
    type: "https://eips.ethereum.org/EIPS/eip-8004#registration-v1",
    description: "Autonomous Behavioral Finance Agent — discipline staking, mood-grit correlation, and yield harvesting on Celo L2.",
    url: "https://myday-guardian-production.up.railway.app",
    agentId: 7,
    chains: [42220],
    provider: { name: "MyDay Finance" },
    supportsX402: true,
    registrations: [{
      agentId: "7",
      agentRegistry: "eip155:42220:0x8004A169FB4a3325136EB29fA0ceB6D2e539a432",
      supportedTrust: ["reputation", "validation"]
    }],
    supportedTrust: ["reputation", "validation"],
    skills: [
      { id: "discipline-score", name: "Discipline Score", description: "Returns grit score, streak, emotional stability index." },
      { id: "behavioral-oracle", name: "Behavioral Oracle", description: "Mood-energy correlation engine with weekly trend analysis." },
      { id: "sunset-reflection", name: "Sunset Reflection", description: "Evening self-audit capturing wins and mood delta." },
      { id: "habit-staking", name: "Habit Staking", description: "Generates celo:// deep links for staking cUSD with x402 fee." },
      { id: "humanity-attestation", name: "Humanity Attestation", description: "SelfClaw passport-NFC verification via Self.xyz." }
    ],
    services: [
      { name: "evm-wallet", version: "v1", endpoint: "eip155:42220:0x2C7CE8dc27283beFD939adC894798A52c03A9AEB" },
      { name: "web", endpoint: "https://myday-guardian-production.up.railway.app" },
      { name: "oasf", version: "v1", endpoint: "https://myday-guardian-production.up.railway.app/api/v1/discipline-score", discovery: "https://myday-guardian-production.up.railway.app/.well-known/agent-card.json" },
      { name: "telegram", endpoint: "https://t.me/MyDayWinBot" }
    ],
    tools: [
      {
        name: "get_discipline_score",
        description: "Returns the user's grit score (0-100), streak, emotional stability index, and staking data.",
        input_schema: {
          type: "object",
          properties: {
            telegram_id: { type: "integer", description: "Telegram user ID" }
          },
          required: ["telegram_id"]
        },
        endpoint: "/api/v1/discipline-score/{telegram_id}",
        method: "GET"
      },
      {
        name: "stake_habit",
        description: "Generates a celo:// deep link for the user to stake cUSD into the MyDay vault. Includes $0.10 x402 protocol fee.",
        input_schema: {
          type: "object",
          properties: {
            amount: { type: "string", description: "cUSD amount to stake (x402 fee of 0.10 cUSD added automatically)" },
            user: { type: "string", description: "Telegram user ID for follow-up notification" }
          },
          required: ["amount"]
        },
        endpoint: "/pay",
        method: "GET",
        x402: { fee: "0.10", currency: "cUSD" }
      },
      {
        name: "verify_humanity",
        description: "Triggers a SelfClaw humanity attestation handshake.",
        input_schema: {
          type: "object",
          properties: {
            telegramId: { type: "integer", description: "Telegram user ID to verify" }
          },
          required: ["telegramId"]
        },
        endpoint: "/api/verify",
        method: "POST"
      },
      {
        name: "get_agent_metadata",
        description: "Returns MyDay Guardian agent metadata, capabilities, and available endpoints.",
        input_schema: { type: "object", properties: {} },
        endpoint: "/api/v1/agent",
        method: "GET"
      }
    ]
  });
});

/**
 * API verify endpoint (OASF compatibility) — GET for metadata
 */
app.get('/api/verify', (req, res) => {
  res.json({
    verified: true,
    agent: 'myday-guardian',
    agentId: 7,
    chain: 'celo',
    chainId: 42220,
    services: ['discipline-score', 'behavioral-oracle', 'sunset-reflection'],
    version: '1.0.0'
  });
});

/**
 * SelfClaw Verification Webhook — POST
 * Receives a callback from SelfClaw once the humanity handshake is complete.
 * Expected payload: { telegramId: number, verified: true, signature?: string }
 */
app.post('/api/verify', async (req, res) => {
  try {
    const { telegramId, verified, signature } = req.body || {};

    if (!telegramId || verified !== true) {
      return res.status(400).json({ error: 'Missing or invalid payload. Expected { telegramId, verified: true }' });
    }

    console.log(`🛡️ SelfClaw webhook received for telegramId=${telegramId}`);

    // Update user record in Supabase (guard missing env vars)
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
      console.error('SUPABASE env vars missing — cannot update verification');
      return res.status(503).json({ error: 'Database not configured' });
    }
    const { createClient } = require('@supabase/supabase-js');
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

    const { error: updateError } = await supabase
      .from('users')
      .update({ verified_human: true, updated_at: new Date().toISOString() })
      .eq('telegram_id', Number(telegramId));

    if (updateError) {
      console.error('Supabase update error:', updateError);
      return res.status(500).json({ error: 'Database update failed' });
    }

    console.log(`✓ User ${telegramId} marked as verified human`);

    // Optionally notify the user via Telegram
    if (process.env.TELEGRAM_BOT_TOKEN) {
      try {
        const TelegramBot = require('node-telegram-bot-api');
        const tbot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN);
        tbot.sendMessage(
          Number(telegramId),
          '✅ *Humanity Verified!* Your identity is now linked to Agent #7 via SelfClaw. Welcome to the inner circle, Guardian.',
          { parse_mode: 'Markdown' }
        ).catch(err => console.error('Verification notification failed:', err));
      } catch (err) {
        console.error('Error sending verification notification:', err);
      }
    }

    return res.json({ success: true, telegramId: Number(telegramId), verified_human: true });
  } catch (err) {
    console.error('SelfClaw webhook error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * Agent metadata endpoint for inter-agent discovery (Infra Track)
 * Other agents can call this to understand what data MyDay Guardian exposes
 */
app.get('/api/v1/agent', (req, res) => {
  res.json({
    name: 'MyDay Guardian',
    agentId: 7,
    chain: 'Celo L2 (42220)',
    description: 'Autonomous Behavioral Finance Agent — discipline staking, mood-grit correlation, and yield harvesting.',
    endpoints: {
      discipline_score: '/api/v1/discipline-score/:telegram_id',
      verify: '/api/verify',
      health: '/health'
    },
    data_provided: [
      'grit_score (0-100)',
      'emotional_stability_index (0-100)',
      'streak (consecutive win days)',
      'avg_morning_energy',
      'avg_sunset_mood',
      'total_staked_cUSD'
    ],
    protocols: ['x402', 'OASF'],
    supportsX402: true,
    x402: { fee: '0.10', currency: 'cUSD' },
    humanity_verification: 'SelfClaw (selfclaw.ai)'
  });
});

// ── Express starts UNCONDITIONALLY before any async init ─────────────────────
// This ensures /health, /.well-known/* are ALWAYS reachable on Railway,
// even if Supabase, Telegram, or Gemini fail to initialize.
app.listen(PORT, () => {
  console.log(`🌐 Express server running on port ${PORT}`);
  console.log(`   /health - Health check`);
  console.log(`   /.well-known/agent-card.json - OASF Agent Card`);
  console.log(`   /.well-known/mcp.json - MCP Discovery`);
  console.log(`   /api/v1/agent - Agent metadata`);
  console.log(`   /api/v1/discipline-score/:id - Behavioral Oracle`);
  console.log(`   /api/verify - OASF endpoint`);
  console.log(`   /pay - Aviation Grade Redirector`);
});

async function main() {
  // Validate required environment variables (Aviation Grade)
  const requiredKeys = [
    'TELEGRAM_BOT_TOKEN',
    'GEMINI_API_KEY',
    'SUPABASE_URL',
    'SUPABASE_SERVICE_KEY',
  ];
  const missing = requiredKeys.filter(key => !process.env[key]);

  if (missing.length > 0) {
    for (const key of missing) {
      console.warn(`WARNING: ${key} is undefined`);
    }
    // Do not exit, allow degraded startup
  }

  let apiDb = null;
  try {
    // Initialize a Supabase-backed Database instance for API use
    if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY) {
      apiDb = new Database({ url: process.env.SUPABASE_URL, key: process.env.SUPABASE_SERVICE_KEY });
      try {
        await apiDb.waitReady();
        console.log('✓ Supabase API DB ready');
      } catch (e) {
        console.error('Supabase API DB failed to initialize (degraded mode):', e);
        apiDb = null;
      }
    } else {
      console.warn('⚠ SUPABASE_URL / SUPABASE_SERVICE_KEY not set — DB features disabled (degraded mode)');
    }

    // Discipline Score API endpoint (Behavioral Oracle) — shared handler
    const disciplineScoreHandler = async (req, res) => {
      try {
        if (!apiDb) return res.status(503).json({ error: 'Database unavailable — degraded mode' });
        const telegramId = Number(req.params.telegram_id);
        if (!telegramId) return res.status(400).json({ error: 'invalid telegram id' });

        // Weekly energy and missions
        const weekly = await apiDb.getWeeklyMoodEnergyData(telegramId);
        const totalStaked = await apiDb.getTotalStaked(telegramId);

        // Average morning energy (fallback 3)
        const energies = (weekly || []).map(w => Number(w.morning_energy || 0)).filter(n => !isNaN(n));
        const avgEnergy = energies.length ? energies.reduce((a,b)=>a+b,0)/energies.length : 3;

        // Average sunset mood for emotional stability index
        const sunsetMoods = (weekly || []).map(w => Number(w.sunset_mood || 0)).filter(n => !isNaN(n) && n > 0);
        const avgSunsetMood = sunsetMoods.length ? sunsetMoods.reduce((a,b)=>a+b,0)/sunsetMoods.length : 3;
        // Emotional stability = low variance in mood (inverse of std deviation, normalized 0-100)
        let emotionalStability = 50; // default
        if (sunsetMoods.length >= 3) {
          const variance = sunsetMoods.reduce((sum, m) => sum + Math.pow(m - avgSunsetMood, 2), 0) / sunsetMoods.length;
          const stdDev = Math.sqrt(variance);
          // Max std dev for 1-5 scale is ~2, map to 0-100 inversely
          emotionalStability = Math.round(Math.max(0, Math.min(100, (1 - stdDev / 2) * 100)));
        }

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

        // Grit scoring algorithm (0-100)
        // - Energy contribution: avgEnergy/5 * 40
        // - Staked contribution: min(40, totalStakedNormalized)
        // - Streak contribution: min(20, streak*5)
        const energyScore = (Math.max(1, Math.min(5, avgEnergy)) / 5) * 40;
        const stakeScore = Math.min(40, Number(totalStaked) * 2);
        const streakScore = Math.min(20, streak * 5);
        let grit_score = Math.round(Math.max(0, Math.min(100, energyScore + stakeScore + streakScore)));

        const status = grit_score >= 80 ? 'Elite' : (grit_score >= 50 ? 'Stable' : 'Warning');

        return res.json({
          agent: 'MyDay Guardian (#7)',
          chain: 'Celo L2 (42220)',
          telegram_id: telegramId,
          grit_score,
          streak,
          emotional_stability_index: emotionalStability,
          status,
          avg_morning_energy: Math.round(avgEnergy * 10) / 10,
          avg_sunset_mood: Math.round(avgSunsetMood * 10) / 10,
          total_staked_cUSD: Number(totalStaked) || 0
        });
      } catch (err) {
        console.error('Discipline score error:', err);
        return res.status(500).json({ error: 'internal error' });
      }
    };

    // Mount on both legacy and versioned paths
    app.get('/api/discipline-score/:telegram_id', disciplineScoreHandler);
    app.get('/api/v1/discipline-score/:telegram_id', disciplineScoreHandler);

    // Database configuration (Supabase by default in production)
    const dbConfig = {
      type: process.env.DB_TYPE || 'supabase',
      url: process.env.SUPABASE_URL,
      key: process.env.SUPABASE_SERVICE_KEY
    };

    // Initialize bot (wrapped in try/catch — never crashes Express)
    let bot = null;
    try {
      const bot = new MyDayBot(
        process.env.TELEGRAM_BOT_TOKEN,
        process.env.GEMINI_API_KEY,
        dbConfig
      );

      await bot.start();
      console.log('✓ MyDay Agent (Milestone 2) is running');
      console.log('  - Morning Nudge: Active');
      console.log('  - MyDay Intel: Connected');
      console.log('  - Database: Supabase (production)');
      console.log('  - Chain: Celo L2 Mainnet (42220)');
      console.log('  - Telegram: Connected');

      // Initialize scheduler (automated nudges)
      try {
        const initScheduler = require('./services/scheduler');
        initScheduler({ db: bot.db, bot });
        console.log('✓ Scheduler initialized');
      } catch (e) {
        console.error('Scheduler initialization failed:', e);
      }
    } catch (botErr) {
      console.error('⚠ Bot failed to initialize (Express stays up):', botErr.message || botErr);
    }

  } catch (error) {
    console.error('❌ Failed to start bot:', error);
    // Express is already listening — /health still works in degraded mode
  }
}

main();
