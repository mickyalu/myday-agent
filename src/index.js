require('dotenv').config();

/**
 * MyDay Agent - Main Entry Point for Milestone 2
 * 
 * Initializes the MyDay Intel, Telegram Bot, and Aviation Grade Redirector
 */

const express = require('express');
const MyDayBot = require('./bot');
const Database = require('./database/init');
const { x402PaymentGate, verifyPayment, buildPaymentRequirements, buildStakeUrl, CELO_CUSD_ADDRESS, CELO_CHAIN_ID } = require('./x402/middleware');
const { mountMCPRoutes } = require('./mcp/index');

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

// ── Global CORS — CRITICAL for 8004 scanner visibility ──────────────────────
// Every response must include Access-Control-Allow-Origin: * or the scanner
// cannot read .well-known/*, /api/*, or /mcp endpoints.
app.use((req, res, next) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Payment, X-Payment-Required');
  res.set('Access-Control-Expose-Headers', 'X-Payment-Required');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// Body parsing MUST be above all routes
app.use(express.json());

/**
 * x402 Protocol Staking Gateway: /x402/stake
 * 
 * Implements the real HTTP 402 Payment Required flow:
 *   - GET without X-PAYMENT header → 402 with payment requirements
 *   - GET with X-PAYMENT header (tx hash) → verifies on-chain, credits vault, returns 200
 *   - Also serves a user-friendly HTML page for Telegram/browser users
 */
app.get('/x402/stake', async (req, res) => {
  const amount = parseFloat(req.query.amount) || 0;
  const user = req.query.user || null;
  const fee = parseFloat(req.query.fee) || 0.10;
  const meta = req.query.meta || '';
  const vault = process.env.VAULT_ADDRESS || '';
  const rpc = process.env.RPC_URL || 'https://forno.celo.org';

  if (!vault) {
    return res.status(503).json({ error: 'VAULT_ADDRESS not configured' });
  }

  const paymentHeader = req.headers['x-payment'] || req.headers['X-Payment'];

  // ── Agent/programmatic flow: X-PAYMENT header present → verify tx ──────
  if (paymentHeader) {
    let txHash = paymentHeader;
    try {
      if (!paymentHeader.startsWith('0x')) {
        const decoded = Buffer.from(paymentHeader, 'base64').toString('utf8');
        const parsed = JSON.parse(decoded);
        txHash = parsed.txHash || parsed.tx_hash || parsed.hash;
      }
    } catch (err) {
      return res.status(400).json({ error: 'invalid_payment_header' });
    }

    const result = await verifyPayment(txHash, vault, fee, rpc);
    if (!result.valid) {
      return res.status(402).json({
        error: 'payment_verification_failed',
        reason: result.error,
        details: result
      });
    }

    // Credit user vault if we have a user ID
    if (user) {
      try {
        // Lazy-init DB for this request
        if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY) {
          const Database = require('./database/init');
          const db = new Database({ url: process.env.SUPABASE_URL, key: process.env.SUPABASE_SERVICE_KEY });
          await db.waitReady();
          await db.recordProcessedTransaction(txHash, user, result.amount, 'cUSD', { protocol: 'x402', verified: true });
          await db.creditUserVault(user, result.amount);
        }
      } catch (e) {
        console.error('x402 DB credit error:', e);
      }

      // Notify via Telegram
      if (process.env.TELEGRAM_BOT_TOKEN) {
        try {
          const TelegramBot = require('node-telegram-bot-api');
          const tbot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN);
          const msg = `✅ *x402 Payment Verified!*\n\n💎 ${result.amount.toFixed(2)} cUSD confirmed on Celo L2\n🔗 tx: \`${txHash.slice(0, 10)}...${txHash.slice(-6)}\`\n\nYour MyDay Vault has been credited. Let's win this day!`;
          tbot.sendMessage(Number(user), msg, { parse_mode: 'Markdown' }).catch(() => {});
        } catch (e) { /* ignore */ }
      }
    }

    return res.json({
      success: true,
      protocol: 'x402',
      verified: true,
      txHash,
      amount: result.amount,
      from: result.from,
      blockNumber: result.blockNumber,
      message: 'Payment verified on Celo L2. Stake credited.'
    });
  }

  // ── No payment: return 402 with proper x402 headers ────────────────────
  const requirements = buildPaymentRequirements({
    payTo: vault,
    amount: String(BigInt(Math.round(fee * 1e18))),
    resource: req.originalUrl,
    description: `MyDay habit stake: ${amount} cUSD (includes ${fee.toFixed(2)} cUSD x402 protocol fee)`,
    extra: {
      stakeAmount: amount,
      fee,
      userId: user || undefined
    }
  });

  // For browser/Telegram users, also build a celo:// deep link
  const totalAmount = amount || fee;
  const metaParam = meta ? `&metadata=${encodeURIComponent(meta)}` : '';
  const deepLink = `celo://wallet/pay?address=${encodeURIComponent(vault)}&amount=${encodeURIComponent(String(totalAmount))}&currency=cUSD${metaParam}`;

  // Return 402 with both machine-readable headers and human-friendly body
  res.status(402);
  res.set('X-PAYMENT-REQUIRED', JSON.stringify(requirements));
  res.set('Access-Control-Expose-Headers', 'X-PAYMENT-REQUIRED');
  res.set('Content-Type', 'application/json');

  return res.json({
    error: 'payment_required',
    protocol: 'x402',
    message: `Stake requires ${totalAmount.toFixed(2)} cUSD payment to MyDay Vault on Celo L2.`,
    how_to_pay: {
      step1: `Send ${totalAmount.toFixed(2)} cUSD to ${vault} on Celo L2 (chain 42220)`,
      step2: 'Retry this URL with header: X-PAYMENT: <your_tx_hash>',
      deep_link: deepLink,
      supported_wallets: ['MiniPay', 'Valora', 'MetaMask (Celo network)']
    },
    paymentRequirements: requirements
  });
});

/**
 * x402 Verify endpoint — standalone payment verification
 * POST /x402/verify { txHash, expectedAmount? }
 */
app.post('/x402/verify', async (req, res) => {
  const { txHash, tx_hash, expectedAmount = 0.10 } = req.body || {};
  const hash = txHash || tx_hash;
  const vault = process.env.VAULT_ADDRESS || '';
  const rpc = process.env.RPC_URL || 'https://forno.celo.org';

  if (!hash) return res.status(400).json({ error: 'missing txHash' });
  if (!vault) return res.status(503).json({ error: 'VAULT_ADDRESS not configured' });

  const result = await verifyPayment(hash, vault, expectedAmount, rpc);
  return res.json({ protocol: 'x402', ...result });
});

/**
 * x402 Payment Requirements — returns what's needed without gating
 * GET /x402/requirements?amount=1.00
 */
app.get('/x402/requirements', (req, res) => {
  const amount = parseFloat(req.query.amount) || 0.10;
  const vault = process.env.VAULT_ADDRESS || '';

  if (!vault) return res.status(503).json({ error: 'VAULT_ADDRESS not configured' });

  const requirements = buildPaymentRequirements({
    payTo: vault,
    amount: String(BigInt(Math.round(amount * 1e18))),
    resource: '/x402/stake',
    description: `MyDay staking: ${amount.toFixed(2)} cUSD on Celo L2`
  });

  res.json({ protocol: 'x402', paymentRequirements: requirements });
});

/**
 * Aviation Grade Redirector: /pay endpoint (legacy — preserved for backward compat)
 * Now also returns x402 headers alongside the redirect for agent discovery
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

  // ── If agent sends X-PAYMENT header, handle as x402 flow ──────────────
  const paymentHeader = req.headers['x-payment'] || req.headers['X-Payment'];
  if (paymentHeader) {
    // Redirect to the proper x402 endpoint with the payment header forwarded
    const redirectUrl = `/x402/stake?amount=${encodeURIComponent(String(totalAmount))}&user=${encodeURIComponent(String(user || ''))}&fee=${X402_FEE}`;
    // Forward the X-PAYMENT header via internal redirect
    req.url = redirectUrl;
    return res.redirect(307, redirectUrl);
  }

  // Build celo:// deep link (include metadata + x402 fee tag)
  const metaParam = meta ? `&metadata=${encodeURIComponent(meta)}` : '';
  const deepLink = `celo://wallet/pay?address=${encodeURIComponent(vault)}&amount=${encodeURIComponent(String(totalAmount))}&currency=cUSD${metaParam}`;

  // Set x402 payment requirements header (agents can discover pricing even on redirect)
  const requirements = buildPaymentRequirements({
    payTo: vault,
    amount: String(BigInt(Math.round(X402_FEE * 1e18))),
    resource: '/pay',
    description: `MyDay stake of ${totalAmount.toFixed(2)} cUSD (includes ${X402_FEE} cUSD protocol fee)`
  });
  res.set('X-PAYMENT-REQUIRED', JSON.stringify(requirements));
  res.set('Access-Control-Expose-Headers', 'X-PAYMENT-REQUIRED');

  // Ensure browser connection is closed quickly so mobile OS can open the wallet
  res.set('Connection', 'close');

  // Perform the redirect to the deep link
  res.redirect(deepLink);

  // Send a follow-up Telegram message (async) if we have a user id
  if (user && process.env.TELEGRAM_BOT_TOKEN) {
    try {
      const TelegramBot = require('node-telegram-bot-api');
      const tbot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN);
      const followUp = '🔐 x402 protocol active. Guardian is monitoring Celo L2 for your transaction. I will notify you the moment your Vault is updated.';
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
 * MCP Server — mount JSON-RPC endpoint at /mcp
 * Allows Claude, Cursor, and other MCP clients to use MyDay tools
 */
mountMCPRoutes(app, { db: null }); // db injected later after init

/**
 * .well-known/agent.json — ERC-8004 Agent Registration File (canonical)
 */
app.get('/.well-known/agent.json', (req, res) => {
  res.set('Cache-Control', 'public, max-age=300');
  res.set('Content-Type', 'application/json');
  delete require.cache[require.resolve('../manifests/myday-agent.json')];
  const manifest = require('../manifests/myday-agent.json');
  res.json(manifest);
});

/**
 * .well-known/agent-card.json — OASF Agent Card (with CORS)
 */
app.get('/.well-known/agent-card.json', (req, res) => {
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
app.get('/.well-known/mcp.json', (req, res) => {
  res.set('Cache-Control', 'public, max-age=300');
  res.set('Content-Type', 'application/json');
  // Serve the canonical manifest (same as agent-card.json) — single source of truth
  delete require.cache[require.resolve('../manifests/myday-agent.json')];
  const manifest = require('../manifests/myday-agent.json');
  res.json(manifest);
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
  // Serve the canonical manifest — single source of truth
  delete require.cache[require.resolve('../manifests/myday-agent.json')];
  const manifest = require('../manifests/myday-agent.json');
  res.json(manifest);
});

// ── Express starts UNCONDITIONALLY before any async init ─────────────────────
// This ensures /health, /.well-known/* are ALWAYS reachable on Railway,
// even if Supabase, Telegram, or Gemini fail to initialize.
app.listen(PORT, () => {
  console.log(`🌐 MyDay Guardian (#7) running on port ${PORT}`);
  console.log(`   /.well-known/agent-card.json — OASF Agent Card`);
  console.log(`   /.well-known/mcp.json — MCP Discovery`);
  console.log(`   /mcp — MCP Server (JSON-RPC 2.0)`);
  console.log(`   /api/v1/agent — A2A metadata`);
  console.log(`   /api/v1/discipline-score/:id — Behavioral Oracle`);
  console.log(`   /x402/stake — x402 Payment Gateway (HTTP 402)`);
  console.log(`   /x402/verify — x402 Payment Verification`);
  console.log(`   /x402/requirements — x402 Payment Requirements`);
  console.log(`   /api/verify — SelfClaw Humanity Verification`);
  console.log(`   /pay — MiniPay Redirector (legacy)`);
  console.log(`   /health — Health check`);
  console.log(`🔐 x402: ACTIVE | MCP: ACTIVE | OASF: ACTIVE | A2A: ACTIVE`);
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
        const telegramId = Number(req.params.telegram_id);
        if (!telegramId) return res.status(400).json({ error: 'invalid telegram id' });

        // Return valid default JSON for new/unknown users even without DB
        if (!apiDb) {
          return res.json({
            agent: 'MyDay Guardian (#7)',
            chain: 'Celo L2 (42220)',
            telegram_id: telegramId,
            grit_score: 0,
            streak: 0,
            emotional_stability_index: 50,
            status: 'Warning',
            avg_morning_energy: 3,
            avg_sunset_mood: 3,
            total_staked_cUSD: 0,
            note: 'Database unavailable — showing defaults'
          });
        }

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
