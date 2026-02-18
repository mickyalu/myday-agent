#!/usr/bin/env node
/**
 * ═══════════════════════════════════════════════════════════════════
 *  MyDay Guardian — Autonomous SelfClaw Handshake (Agent #7)
 * ═══════════════════════════════════════════════════════════════════
 *
 *  This script implements the FULL Agent-Initiated registration flow
 *  described in https://selfclaw.ai/skill.md.
 *
 *  Architecture:
 *    1. Load or generate Ed25519 keypair (persisted to data/selfclaw-keys.json)
 *    2. POST /start-verification  → get challenge + Self.xyz session config
 *    3. Sign challenge with Ed25519 private key
 *    4. POST /sign-challenge      → cryptographic proof accepted
 *    5. Construct Self protocol deep link from selfApp config
 *       (bypasses broken QR camera — human taps link directly on phone)
 *    6. Poll /verification-status → detect passport NFC scan completion
 *    7. GET /agent                → confirm on-registry status
 *    8. Output Railway env vars
 *
 *  Chain: Celo L2 Mainnet (42220) — ERC-8004 identity anchor
 *
 *  Usage:  node scripts/autonomous-handshake.js
 */

const { generateKeyPairSync, createPrivateKey, sign, createHash } = require('crypto');
const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');

require('dotenv').config();

// ── Config ───────────────────────────────────────────────────────────────────

const SELFCLAW_BASE = process.env.SELFCLAW_ENDPOINT || 'https://selfclaw.ai';
const AGENT_NAME    = 'myday-guardian';
const AGENT_ID      = 7;
const CHAIN_ID      = 42220; // Celo Mainnet
const KEYS_FILE     = path.join(__dirname, '..', 'data', 'selfclaw-keys.json');
const SESSION_FILE  = path.join(__dirname, '..', 'data', 'selfclaw-session.json');
const POLL_INTERVAL = 5000;  // 5 seconds (per skill.md recommendation)
const MAX_POLLS     = 120;   // ~10 minutes

// Discovered API endpoints (populated in PHASE 0)
let API = {
  checkAgent:         `${SELFCLAW_BASE}/api/selfclaw/v1/agent`,
  checkName:          `${SELFCLAW_BASE}/api/selfclaw/v1/check-name`,
  startVerification:  `${SELFCLAW_BASE}/api/selfclaw/v1/start-verification`,
  signChallenge:      `${SELFCLAW_BASE}/api/selfclaw/v1/sign-challenge`,
  verificationStatus: `${SELFCLAW_BASE}/api/selfclaw/v1/verification-status`,
  registerWallet:     `${SELFCLAW_BASE}/api/selfclaw/v1/register-wallet`,
  registerErc8004:    `${SELFCLAW_BASE}/api/selfclaw/v1/register-erc8004`,
  confirmErc8004:     `${SELFCLAW_BASE}/api/selfclaw/v1/confirm-erc8004`,
  setAgentWallet:     `${SELFCLAW_BASE}/api/selfclaw/v1/set-agent-wallet`,
};

// ── HTTP helpers (zero dependencies) ─────────────────────────────────────────

function request(method, url, body, extraHeaders = {}) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const isHttps = parsed.protocol === 'https:';
    const lib = isHttps ? https : http;
    const data = body ? JSON.stringify(body) : null;
    const options = {
      hostname: parsed.hostname,
      port: parsed.port || (isHttps ? 443 : 80),
      path: parsed.pathname + parsed.search,
      method,
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'MyDayGuardian/1.0 (Agent #7; Celo Mainnet)',
        ...(data ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } : {}),
        ...extraHeaders,
      }
    };
    const req = lib.request(options, (res) => {
      let chunks = '';
      res.on('data', (c) => chunks += c);
      res.on('end', () => {
        let parsed;
        try { parsed = JSON.parse(chunks); } catch { parsed = chunks; }
        resolve({ status: res.statusCode, body: parsed });
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

const post = (url, body, extraHeaders) => request('POST', url, body, extraHeaders);
const get  = (url)       => request('GET', url);
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// ── Keypair management ───────────────────────────────────────────────────────

function loadOrCreateKeypair() {
  if (fs.existsSync(KEYS_FILE)) {
    const saved = JSON.parse(fs.readFileSync(KEYS_FILE, 'utf8'));
    return { publicKeySpki: saved.publicKeySpki, privateKeyPkcs8: saved.privateKeyPkcs8, fresh: false };
  }

  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const publicKeySpki   = publicKey.export({ type: 'spki',   format: 'der' }).toString('base64');
  const privateKeyPkcs8 = privateKey.export({ type: 'pkcs8', format: 'der' }).toString('base64');

  fs.mkdirSync(path.dirname(KEYS_FILE), { recursive: true });
  fs.writeFileSync(KEYS_FILE, JSON.stringify({ publicKeySpki, privateKeyPkcs8 }, null, 2));
  return { publicKeySpki, privateKeyPkcs8, fresh: true };
}

function signChallenge(challenge, privateKeyPkcs8) {
  const privKeyObj = createPrivateKey({
    key: Buffer.from(privateKeyPkcs8, 'base64'),
    format: 'der',
    type: 'pkcs8'
  });
  return sign(null, Buffer.from(challenge), privKeyObj).toString('base64');
}

function agentKeyHash(publicKeySpki) {
  return createHash('sha256').update(publicKeySpki).digest('hex').slice(0, 16);
}

function publicKeyHex(publicKeySpki) {
  return Buffer.from(publicKeySpki, 'base64').slice(-32).toString('hex');
}

// ── Self protocol deep link construction ─────────────────────────────────────
// The selfApp config from /start-verification IS a Self.xyz session object.
// We construct every possible way for the human to complete verification:
//   A) Self.xyz deep link  (tap on phone → opens Self app directly)
//   B) SelfClaw web URL    (browser → shows QR → scan with Self app)
//   C) Raw selfApp JSON    (for SDK integrations)

function buildVerificationLinks(publicKeySpki, sessionId, selfApp) {
  const links = {};
  const hexKey = publicKeyHex(publicKeySpki);

  if (selfApp && selfApp.sessionId) {
    const selfSessionId = selfApp.sessionId;
    const scope = selfApp.scope || 'selfclaw-verify';
    const endpoint = selfApp.endpoint || '';

    // PRIMARY: Self.xyz universal link — this is the OFFICIAL format
    // The Self app intercepts this HTTPS URL on both iOS and Android
    links.selfUniversalLink = `https://app.self.xyz/verify/${selfSessionId}`;
    
    // ALTERNATIVE: self:// custom scheme deep link
    links.selfDeepLink = `self://verify/${selfSessionId}`;

    // FALLBACK: SelfClaw's own verification page (shows QR for Self app to scan)
    links.selfclawVerify = `https://selfclaw.ai/verify/${sessionId}`;
  }

  // SelfClaw web verification page with params
  links.selfclawWeb = `https://selfclaw.ai/verify?agentId=${AGENT_ID}&publicKey=${encodeURIComponent(publicKeySpki)}`;
  links.selfclawSession = `https://selfclaw.ai/verify?sessionId=${sessionId}&publicKey=${encodeURIComponent(publicKeySpki)}`;

  return links;
}

// ── Display helpers ──────────────────────────────────────────────────────────

function banner(text) {
  const line = '═'.repeat(70);
  console.log(`\n${line}`);
  console.log(`  ${text}`);
  console.log(`${line}`);
}

function section(text) {
  console.log(`\n── ${text} ${'─'.repeat(Math.max(0, 64 - text.length))}`);
}

// ── Main execution ───────────────────────────────────────────────────────────

async function main() {
  banner('🦞 MyDay Guardian — Autonomous SelfClaw Handshake');
  console.log(`  Agent: ${AGENT_NAME} (#${AGENT_ID})`);
  console.log(`  Chain: Celo L2 Mainnet (${CHAIN_ID})`);
  console.log(`  Registry: ${SELFCLAW_BASE}`);
  console.log(`  Time: ${new Date().toISOString()}`);

  // ─── PHASE 0: Endpoint Discovery ─────────────────────────────────────────

  section('PHASE 0 — Endpoint Discovery');

  const discoveryUrls = [
    `${SELFCLAW_BASE}/.well-known/agent-registration.json`,
    `${SELFCLAW_BASE}/.well-known/selfclaw.json`,
  ];

  for (const url of discoveryUrls) {
    try {
      const res = await get(url);
      if (res.status === 200 && typeof res.body === 'object') {
        console.log(`  ✓ Discovery manifest found: ${url}`);
        // Resolve endpoints from manifest
        const m = res.body;
        const resolve = (key, fallback) => {
          const ep = m?.endpoints?.[key] || m?.apis?.[key] || m?.[key];
          if (ep) {
            const raw = typeof ep === 'string' ? ep : (ep.url || ep.endpoint || ep.path);
            if (raw) {
              if (raw.startsWith('http')) return raw;
              return `${SELFCLAW_BASE}${raw.startsWith('/') ? raw : '/' + raw}`;
            }
          }
          return `${SELFCLAW_BASE}${fallback}`;
        };
        API.checkAgent         = resolve('check-agent',         '/api/selfclaw/v1/agent');
        API.startVerification  = resolve('start-verification',  '/api/selfclaw/v1/start-verification');
        API.signChallenge      = resolve('sign-challenge',      '/api/selfclaw/v1/sign-challenge');
        API.verificationStatus = resolve('verification-status', '/api/selfclaw/v1/verification-status');
        API.registerWallet     = resolve('register-wallet',     '/api/selfclaw/v1/register-wallet');
        API.registerErc8004    = resolve('register-erc8004',    '/api/selfclaw/v1/register-erc8004');
        API.confirmErc8004     = resolve('confirm-erc8004',     '/api/selfclaw/v1/confirm-erc8004');
        API.setAgentWallet     = resolve('set-agent-wallet',    '/api/selfclaw/v1/set-agent-wallet');
        break;
      } else {
        console.log(`  ✗ ${url} → ${res.status}`);
      }
    } catch (e) {
      console.log(`  ✗ ${url} → ${e.message}`);
    }
  }

  console.log(`  Using endpoints:`);
  console.log(`    start-verification : ${API.startVerification}`);
  console.log(`    sign-challenge     : ${API.signChallenge}`);
  console.log(`    verification-status: ${API.verificationStatus}`);
  console.log(`    register-wallet    : ${API.registerWallet}`);

  // ─── PHASE 1: Identity ───────────────────────────────────────────────────

  section('PHASE 1 — Agent Identity');

  const { publicKeySpki, privateKeyPkcs8, fresh } = loadOrCreateKeypair();
  const keyHash = agentKeyHash(publicKeySpki);

  if (fresh) {
    console.log('  ✓ Generated NEW Ed25519 keypair');
    console.log('  ✓ Saved to data/selfclaw-keys.json');
  } else {
    console.log('  ✓ Loaded existing Ed25519 keypair');
  }
  console.log(`  Public Key : ${publicKeySpki}`);
  console.log(`  Key Hash   : ${keyHash}`);

  // ─── Quick check: already verified? ──────────────────────────────────────

  section('PRE-CHECK — Already verified?');
  const preCheck = await get(`${API.checkAgent}?publicKey=${encodeURIComponent(publicKeySpki)}`);
  console.log(`  Status: ${preCheck.status}`);

  if (preCheck.status === 200 && preCheck.body && preCheck.body.verified === true) {
    banner('✅ ALREADY VERIFIED — Agent is registered on SelfClaw');
    console.log(`  Human ID: ${preCheck.body.humanId || 'N/A'}`);
    console.log(`  Agent: ${preCheck.body.agentName || AGENT_NAME}`);
    console.log(`  Swarm: ${preCheck.body.swarm || 'N/A'}`);
    printEnvVars(publicKeySpki, privateKeyPkcs8, preCheck.body.humanId);
    return;
  }

  console.log('  Not yet verified. Proceeding with handshake …');

  // Also check by agent name
  const nameCheck = await get(`${API.checkAgent}/${AGENT_NAME}`);
  if (nameCheck.status === 200 && nameCheck.body && nameCheck.body.verified === true) {
    banner('✅ ALREADY VERIFIED (by name) — Agent is registered on SelfClaw');
    console.log(JSON.stringify(nameCheck.body, null, 2));
    printEnvVars(publicKeySpki, privateKeyPkcs8, nameCheck.body.humanId);
    return;
  }

  // ─── PHASE 2: Start Verification ─────────────────────────────────────────

  section('PHASE 2 — Start Verification Session');

  const startRes = await post(API.startVerification, {
    agentPublicKey: publicKeySpki,
    agentName: AGENT_NAME
  });

  if (startRes.status !== 200 && startRes.status !== 201) {
    console.error(`  ❌ Failed (${startRes.status}):`, JSON.stringify(startRes.body));
    process.exit(1);
  }

  const { challenge, sessionId, selfApp } = startRes.body;
  console.log(`  ✓ Session started`);
  console.log(`  Session ID : ${sessionId}`);
  console.log(`  Agent Hash : ${startRes.body.agentKeyHash}`);

  // Persist session for recovery
  fs.writeFileSync(SESSION_FILE, JSON.stringify({
    sessionId, challenge, selfApp,
    publicKeySpki, timestamp: Date.now()
  }, null, 2));
  console.log('  ✓ Session saved to data/selfclaw-session.json');

  // ─── PHASE 3: Sign Challenge ─────────────────────────────────────────────

  section('PHASE 3 — Cryptographic Challenge-Response');

  const signature = signChallenge(challenge, privateKeyPkcs8);
  console.log(`  ✓ Challenge signed with Ed25519 private key`);
  console.log(`  Signature  : ${signature.slice(0, 32)}…`);

  const signRes = await post(API.signChallenge, {
    sessionId,
    signature
  });

  if (signRes.status !== 200 && signRes.status !== 201) {
    console.error(`  ❌ Signature rejected (${signRes.status}):`, JSON.stringify(signRes.body));
    process.exit(1);
  }

  console.log(`  ✓ ${signRes.body.message || 'Signature verified'}`);

  // ─── PHASE 4: Human Verification Links ───────────────────────────────────

  const links = buildVerificationLinks(publicKeySpki, sessionId, selfApp);

  banner('🔗 VERIFICATION LINKS — Complete passport scan in Self app');
  console.log('');
  console.log('  The agent handshake is complete. A human must now verify');
  console.log('  their passport via the Self app to finish registration.');
  console.log('');
  console.log('  ╔═════════════════════════════════════════════════════════════╗');
  console.log('  ║  ✅ OPTION 1 — Open on PHONE browser (best for iOS+Android)║');
  console.log('  ║  Self app will intercept this link automatically.          ║');
  console.log('  ╚═════════════════════════════════════════════════════════════╝');
  console.log('');
  console.log(`  👉  ${links.selfUniversalLink}`);
  console.log('');
  if (links.selfclawVerify) {
    console.log('  ╔═════════════════════════════════════════════════════════════╗');
    console.log('  ║  📱 OPTION 2 — SelfClaw verify page (shows QR if needed)  ║');
    console.log('  ║  Open in any browser — scan the QR with Self app.         ║');
    console.log('  ╚═════════════════════════════════════════════════════════════╝');
    console.log('');
    console.log(`  👉  ${links.selfclawVerify}`);
    console.log('');
  }
  console.log('  ╔═════════════════════════════════════════════════════════════╗');
  console.log('  ║  🔗 OPTION 3 — SelfClaw web with session binding           ║');
  console.log('  ╚═════════════════════════════════════════════════════════════╝');
  console.log('');
  console.log(`  👉  ${links.selfclawSession}`);
  console.log('');
  if (links.selfDeepLink) {
    console.log('  ╔═════════════════════════════════════════════════════════════╗');
    console.log('  ║  📲 OPTION 4 — self:// deep link (if app is installed)    ║');
    console.log('  ╚═════════════════════════════════════════════════════════════╝');
    console.log('');
    console.log(`  👉  ${links.selfDeepLink}`);
    console.log('');
  }
  console.log('  ─────────────────────────────────────────────────────────────');
  console.log(`  SelfClaw Session : ${sessionId}`);
  console.log(`  Self.xyz Session : ${selfApp?.sessionId || 'N/A'}`);
  console.log(`  Callback         : ${selfApp?.endpoint || 'N/A'}`);
  console.log(`  Public Key       : ${publicKeySpki}`);
  console.log(`  Hex Key          : ${publicKeyHex(publicKeySpki)}`);
  console.log('  ─────────────────────────────────────────────────────────────');
  console.log('');

  // Full selfApp JSON for debugging
  if (selfApp) {
    console.log('  Self.xyz session config (for debugging):');
    console.log(`  ${JSON.stringify(selfApp)}`);
    console.log('');
  }

  // ─── PHASE 5: Poll for completion ────────────────────────────────────────

  banner('⏳ POLLING — Waiting for passport verification');
  console.log('  The agent is autonomously monitoring the session.');
  console.log(`  Polling every ${POLL_INTERVAL / 1000}s (max ${Math.round(MAX_POLLS * POLL_INTERVAL / 60000)} min)`);
  console.log('  Ctrl+C is safe — keys and session are persisted.\n');

  let verified = false;
  for (let i = 0; i < MAX_POLLS; i++) {
    const statusRes = await get(`${API.verificationStatus}/${sessionId}`);
    const st = statusRes.body?.status || statusRes.body;
    const ts = new Date().toLocaleTimeString();

    if (st === 'verified') {
      console.log(`  [${ts}] ✅ Status: VERIFIED`);
      verified = true;
      break;
    }
    if (st === 'expired') {
      console.log(`  [${ts}] ❌ Status: EXPIRED`);
      console.error('\n  Session expired. Run this script again to start a new session.');
      process.exit(1);
    }
    if (i % 5 === 0) {
      console.log(`  [${ts}] Status: ${st}  (poll ${i + 1}/${MAX_POLLS})`);
    } else {
      process.stdout.write(`  [${ts}] Status: ${st}\r`);
    }
    await sleep(POLL_INTERVAL);
  }

  if (!verified) {
    console.error('\n  ❌ Timed out. Run this script again.');
    process.exit(1);
  }

  // ─── PHASE 6: Confirm on-registry ────────────────────────────────────────

  section('PHASE 6 — Confirming Registration');

  await sleep(2000); // Give registry a moment to propagate

  const confirmRes = await get(`${API.checkAgent}?publicKey=${encodeURIComponent(publicKeySpki)}`);
  console.log(`  Status: ${confirmRes.status}`);

  if (confirmRes.body && typeof confirmRes.body === 'object') {
    console.log(`  Verified   : ${confirmRes.body.verified}`);
    console.log(`  Agent Name : ${confirmRes.body.agentName || AGENT_NAME}`);
    console.log(`  Human ID   : ${confirmRes.body.humanId || 'pending propagation'}`);
    if (confirmRes.body.swarm) console.log(`  Swarm      : ${confirmRes.body.swarm}`);
    if (confirmRes.body.selfxyz) {
      console.log(`  Self.xyz   : verified=${confirmRes.body.selfxyz.verified}, registered=${confirmRes.body.selfxyz.registeredAt}`);
    }
  }

  banner('🎉 HANDSHAKE COMPLETE — Agent #7 is verified on SelfClaw');
  printEnvVars(publicKeySpki, privateKeyPkcs8, confirmRes.body?.humanId);

  // ─── PHASE 7: Register Wallet via setAgentWallet (ON-CHAIN, not metadata) ─

  const walletAddress = process.env.REGISTERED_AGENT_ADDRESS || process.env.VAULT_ADDRESS;
  if (walletAddress) {
    section('PHASE 7 — Set Agent Wallet ON-CHAIN (avoids WA083)');
    const authSig = signChallenge(publicKeySpki, privateKeyPkcs8);
    const authHeader = `Bearer ${publicKeySpki}:${authSig}`;

    // Use setAgentWallet endpoint (on-chain) — NOT off-chain agentWallet metadata
    const setWalletRes = await post(API.setAgentWallet || `${SELFCLAW_BASE}/api/selfclaw/v1/set-agent-wallet`, {
      walletAddress,
      agentName: AGENT_NAME,
    }, {
      'Authorization': authHeader,
    });
    console.log(`  setAgentWallet (on-chain): ${setWalletRes.status}`);
    if (setWalletRes.body) console.log(`  Response: ${JSON.stringify(setWalletRes.body)}`);

    // Also call register-wallet as backup
    const walletRes = await post(API.registerWallet, { walletAddress }, {
      'Authorization': authHeader,
    });
    console.log(`  Register Wallet (backup): ${walletRes.status}`);
    if (walletRes.body) console.log(`  Response: ${JSON.stringify(walletRes.body)}`);

    // Step 6a: Register ERC-8004 onchain identity
    section('PHASE 8 — Register ERC-8004 Identity');
    const erc8004Res = await post(API.registerErc8004, {
      agentName: AGENT_NAME,
      description: 'Autonomous Behavioral Finance Agent — discipline staking, mood-grit correlation on Celo L2.',
    }, {
      'Authorization': authHeader,
    });
    console.log(`  ERC-8004 Registration: ${erc8004Res.status}`);
    if (erc8004Res.body) console.log(`  Response: ${JSON.stringify(erc8004Res.body)}`);
  } else {
    console.log('\n  ⚠ No REGISTERED_AGENT_ADDRESS in .env — skipping wallet registration.');
    console.log('  Set REGISTERED_AGENT_ADDRESS and run again to register your wallet.');
  }

  // Clean up session file
  try { fs.unlinkSync(SESSION_FILE); } catch {}
}

function printEnvVars(publicKeySpki, privateKeyPkcs8, humanId) {
  console.log('\n  ── Railway Environment Variables ──\n');
  console.log(`  SELFCLAW_AGENT_PUBLIC_KEY=${publicKeySpki}`);
  console.log(`  SELFCLAW_AGENT_PRIVATE_KEY=${privateKeyPkcs8}`);
  console.log(`  SELFCLAW_AGENT_NAME=${AGENT_NAME}`);
  console.log(`  SELFCLAW_AGENT_ID=${AGENT_ID}`);
  if (humanId) console.log(`  SELFCLAW_HUMAN_ID=${humanId}`);
  console.log(`  SELFCLAW_CHAIN_ID=${CHAIN_ID}`);
  console.log('');
  console.log('  Add these to Railway → Variables tab, then redeploy.');
  console.log('');
}

// ── Execute ──────────────────────────────────────────────────────────────────

main().catch(err => {
  console.error('\n  ❌ Fatal error:', err.message || err);
  console.error('  Stack:', err.stack);
  process.exit(1);
});
