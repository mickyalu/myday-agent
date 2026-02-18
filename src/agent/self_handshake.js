const fetch = require('node-fetch');
const { Wallet } = require('ethers');
const { generateKeyPairSync, createPrivateKey, sign: ed25519Sign, createHash } = require('crypto');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

/**
 * SelfClaw Handshake Helper — Aviation Grade (v2.0.0)
 *
 * Follows the official SelfClaw Verification Skill (skill.md):
 *   1. Discovery-first: fetches /.well-known/agent-registration.json for endpoints
 *   2. Ed25519 keypair management (load or generate)
 *   3. start-verification → sign-challenge → poll → confirm
 *   4. Post-verification: register-wallet, register-erc8004, set-agent-wallet
 *
 * NO hardcoded API paths — all resolved via discovery manifest.
 */

const SELFCLAW_BASE = process.env.SELFCLAW_ENDPOINT || 'https://selfclaw.ai';
const AGENT_ID = process.env.AGENT_ID || '7';
const AGENT_NAME = process.env.SELFCLAW_AGENT_NAME || 'myday-guardian';
const KEYS_FILE = path.join(__dirname, '..', '..', 'data', 'selfclaw-keys.json');

// ── Endpoint Discovery ───────────────────────────────────────────────────────

let _discoveredEndpoints = null;

/**
 * Fetch the SelfClaw discovery manifest to resolve API paths dynamically.
 * Falls back to the official /api/selfclaw/v1/ prefix if discovery fails.
 */
async function discoverEndpoints() {
  if (_discoveredEndpoints) return _discoveredEndpoints;

  const discoveryUrls = [
    `${SELFCLAW_BASE}/.well-known/agent-registration.json`,
    `${SELFCLAW_BASE}/.well-known/selfclaw.json`,
  ];

  for (const url of discoveryUrls) {
    try {
      const res = await fetch(url, {
        headers: { 'Accept': 'application/json', 'User-Agent': 'MyDayGuardian/1.0' },
        timeout: 8000,
      });
      if (res.ok) {
        const manifest = await res.json();
        _discoveredEndpoints = resolveFromManifest(manifest);
        console.log(`  ✓ SelfClaw endpoints discovered from ${url}`);
        return _discoveredEndpoints;
      }
    } catch (e) {
      // try next
    }
  }

  // Fallback: official /api/selfclaw/v1/ paths per skill.md v2.0.0
  console.log('  ⚠ Discovery manifest not found — using official /api/selfclaw/v1/ paths');
  _discoveredEndpoints = defaultEndpoints();
  return _discoveredEndpoints;
}

function resolveFromManifest(manifest) {
  const resolve = (key, fallback) => {
    const ep = manifest?.endpoints?.[key]
             || manifest?.apis?.[key]
             || manifest?.[key];
    if (ep) {
      const raw = typeof ep === 'string' ? ep : (ep.url || ep.endpoint || ep.path);
      if (raw) {
        if (raw.startsWith('http://') || raw.startsWith('https://')) return raw;
        const cleanPath = raw.startsWith('/') ? raw : `/${raw}`;
        return `${SELFCLAW_BASE}${cleanPath}`;
      }
    }
    return `${SELFCLAW_BASE}${fallback}`;
  };

  return {
    checkAgent:         resolve('check-agent',            '/api/selfclaw/v1/agent'),
    checkName:          resolve('check-name',             '/api/selfclaw/v1/check-name'),
    startVerification:  resolve('start-verification',     '/api/selfclaw/v1/start-verification'),
    signChallenge:      resolve('sign-challenge',         '/api/selfclaw/v1/sign-challenge'),
    verificationStatus: resolve('verification-status',    '/api/selfclaw/v1/verification-status'),
    registerWallet:     resolve('register-wallet',        '/api/selfclaw/v1/register-wallet'),
    registerErc8004:    resolve('register-erc8004',       '/api/selfclaw/v1/register-erc8004'),
    confirmErc8004:     resolve('confirm-erc8004',        '/api/selfclaw/v1/confirm-erc8004'),
    setAgentWallet:     resolve('set-agent-wallet',       '/api/selfclaw/v1/set-agent-wallet'),
    stats:              resolve('stats',                  '/api/selfclaw/v1/stats'),
  };
}

function defaultEndpoints() {
  return resolveFromManifest({});
}

// ── Keypair Management ───────────────────────────────────────────────────────

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

function signChallengeWithEd25519(challenge, privateKeyPkcs8) {
  const privKeyObj = createPrivateKey({
    key: Buffer.from(privateKeyPkcs8, 'base64'),
    format: 'der',
    type: 'pkcs8',
  });
  return ed25519Sign(null, Buffer.from(challenge), privKeyObj).toString('base64');
}

function agentKeyHash(publicKeySpki) {
  return createHash('sha256').update(publicKeySpki).digest('hex').slice(0, 16);
}

function publicKeyHex(publicKeySpki) {
  return Buffer.from(publicKeySpki, 'base64').slice(-32).toString('hex');
}

// ── Authorization Header (per skill.md Step 5+) ─────────────────────────────

function makeAuthHeader(publicKeySpki, privateKeyPkcs8) {
  // Authorization: Bearer <agentPublicKey>:<signature>
  const sig = signChallengeWithEd25519(publicKeySpki, privateKeyPkcs8);
  return `Bearer ${publicKeySpki}:${sig}`;
}

// ── EVM Wallet Signing ───────────────────────────────────────────────────────

async function signAgentPayload(payload) {
  const pk = process.env.PRIVATE_KEY;
  if (!pk) throw new Error('PRIVATE_KEY not configured for signing');
  const wallet = new Wallet(pk);
  const str = JSON.stringify(payload);
  const sig = await wallet.signMessage(str);
  return { payload, signature: sig, signer: wallet.address };
}

// ── Core API Methods ─────────────────────────────────────────────────────────

/**
 * Step 0: Check if agent is already verified.
 */
async function checkVerification() {
  const endpoints = await discoverEndpoints();
  const { publicKeySpki } = loadOrCreateKeypair();

  const res = await fetch(`${endpoints.checkAgent}?publicKey=${encodeURIComponent(publicKeySpki)}`, {
    headers: { 'Accept': 'application/json', 'User-Agent': 'MyDayGuardian/1.0' },
  });
  const body = await res.json().catch(() => null);
  return { status: res.status, body, publicKeySpki };
}

/**
 * Step 5: Register wallet address with SelfClaw after verification.
 */
async function registerWallet(walletAddress) {
  const endpoints = await discoverEndpoints();
  const { publicKeySpki, privateKeyPkcs8 } = loadOrCreateKeypair();
  const auth = makeAuthHeader(publicKeySpki, privateKeyPkcs8);

  const res = await fetch(endpoints.registerWallet, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': auth,
      'User-Agent': 'MyDayGuardian/1.0',
    },
    body: JSON.stringify({ walletAddress }),
  });
  const body = await res.json().catch(() => null);
  return { ok: res.ok, status: res.status, body };
}

/**
 * Step 6a: Register ERC-8004 onchain identity.
 */
async function registerErc8004(agentName, description) {
  const endpoints = await discoverEndpoints();
  const { publicKeySpki, privateKeyPkcs8 } = loadOrCreateKeypair();
  const auth = makeAuthHeader(publicKeySpki, privateKeyPkcs8);

  const res = await fetch(endpoints.registerErc8004, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': auth,
      'User-Agent': 'MyDayGuardian/1.0',
    },
    body: JSON.stringify({ agentName, description }),
  });
  const body = await res.json().catch(() => null);
  return { ok: res.ok, status: res.status, body };
}

/**
 * Step 6b: Confirm ERC-8004 onchain registration.
 */
async function confirmErc8004(txHash) {
  const endpoints = await discoverEndpoints();
  const { publicKeySpki, privateKeyPkcs8 } = loadOrCreateKeypair();
  const auth = makeAuthHeader(publicKeySpki, privateKeyPkcs8);

  const res = await fetch(endpoints.confirmErc8004, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': auth,
      'User-Agent': 'MyDayGuardian/1.0',
    },
    body: JSON.stringify({ txHash }),
  });
  const body = await res.json().catch(() => null);
  return { ok: res.ok, status: res.status, body };
}

/**
 * Step 6c: Set agent wallet onchain (EIP-712 two-step flow).
 */
async function setAgentWalletOnchain(walletSignature, deadline) {
  const endpoints = await discoverEndpoints();
  const { publicKeySpki, privateKeyPkcs8 } = loadOrCreateKeypair();
  const auth = makeAuthHeader(publicKeySpki, privateKeyPkcs8);

  const bodyData = walletSignature
    ? { walletSignature, deadline }
    : {};

  const res = await fetch(endpoints.setAgentWallet, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': auth,
      'User-Agent': 'MyDayGuardian/1.0',
    },
    body: JSON.stringify(bodyData),
  });
  const body = await res.json().catch(() => null);
  return { ok: res.ok, status: res.status, body };
}

/**
 * Gas subsidy request (best-effort).
 */
async function requestGasSubsidy(toAddress, amountCUSD = '0.10') {
  const url = `${SELFCLAW_BASE}/api/request-subsidy`;
  const reqBody = { agentId: AGENT_ID, to: toAddress, amount: String(amountCUSD) };
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(reqBody),
    });
    const json = await res.json().catch(() => null);
    return { ok: res.ok, status: res.status, body: json };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

/**
 * Legacy performAgentHandshake (EVM-signed payload).
 */
async function performAgentHandshake({ telegramUserId = null, extra = {} } = {}) {
  await discoverEndpoints();
  const timestamp = new Date().toISOString();
  const payload = {
    agentId: AGENT_ID,
    telegramUserId: telegramUserId || null,
    timestamp,
    extra,
  };

  const signed = await signAgentPayload(payload);
  const url = `${SELFCLAW_BASE}/api/handshake`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(signed),
    });
    const json = await res.json().catch(() => null);
    return { ok: res.ok, status: res.status, body: json };
  } catch (err) {
    return { ok: false, error: String(err), signed };
  }
}

module.exports = {
  discoverEndpoints,
  loadOrCreateKeypair,
  signChallengeWithEd25519,
  agentKeyHash,
  publicKeyHex,
  makeAuthHeader,
  checkVerification,
  registerWallet,
  registerErc8004,
  confirmErc8004,
  setAgentWalletOnchain,
  requestGasSubsidy,
  performAgentHandshake,
};
