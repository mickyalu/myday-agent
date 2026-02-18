#!/usr/bin/env node
/**
 * SelfClaw Agent-Initiated Registration Script
 * 
 * Aviation-Grade flow:
 *   0. Discover actual API endpoints from /.well-known/agent-registration.json
 *   1. Load existing Ed25519 keypair (or generate + persist if first run)
 *   2. POST start-verification
 *   3. Sign the challenge
 *   4. POST sign-challenge
 *   5. Print deep links for passport scan
 *   6. Poll verification-status until verified
 *
 * Usage:  node scripts/selfclaw-register.js
 */

const { generateKeyPairSync, createPrivateKey, sign } = require('crypto');
const https = require('https');

const fs = require('fs');
const path = require('path');

const SELFCLAW_BASE = 'https://selfclaw.ai';
const AGENT_NAME = 'myday-guardian';
const KEYS_FILE = path.join(__dirname, '..', 'data', 'selfclaw-keys.json');

// ── Helpers ──────────────────────────────────────────────────────────────────

function post(url, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const parsed = new URL(url);
    const options = {
      hostname: parsed.hostname,
      port: 443,
      path: parsed.pathname + parsed.search,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) }
    };
    const req = https.request(options, (res) => {
      let chunks = '';
      res.on('data', (c) => chunks += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(chunks) }); }
        catch { resolve({ status: res.statusCode, body: chunks }); }
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

function get(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      // Follow 301/302 redirects
      if ((res.statusCode === 301 || res.statusCode === 302) && res.headers.location) {
        return get(res.headers.location).then(resolve).catch(reject);
      }
      let chunks = '';
      res.on('data', (c) => chunks += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(chunks) }); }
        catch { resolve({ status: res.statusCode, body: chunks }); }
      });
    }).on('error', reject);
  });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

/**
 * Resolve an endpoint path from the manifest.
 * Accepts full URLs or relative paths, always returns a full URL.
 */
function resolveEndpoint(manifest, key, fallbackPath) {
  // Try to find the endpoint in the manifest under various structures
  const ep = manifest?.endpoints?.[key]
           || manifest?.apis?.[key]
           || manifest?.[key];

  if (ep) {
    // ep could be a string (URL or path) or an object with .url / .endpoint
    const raw = typeof ep === 'string' ? ep : (ep.url || ep.endpoint || ep.path);
    if (raw) {
      // If already a full URL, return as-is — never double-prepend the domain
      if (raw.startsWith('http://') || raw.startsWith('https://')) return raw;
      // Ensure exactly one slash between base and path
      const cleanPath = raw.startsWith('/') ? raw : `/${raw}`;
      return `${SELFCLAW_BASE}${cleanPath}`;
    }
  }
  return `${SELFCLAW_BASE}${fallbackPath}`;
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('═══════════════════════════════════════════════════');
  console.log('  🦞 SelfClaw Agent-Initiated Registration');
  console.log('  Agent: myday-guardian  (agentId 7)');
  console.log('═══════════════════════════════════════════════════\n');

  // Step 0 – Discover actual API endpoints from manifest
  console.log('Step 0: Discovering SelfClaw API endpoints …');
  let manifest = null;
  const discoveryUrls = [
    `${SELFCLAW_BASE}/.well-known/agent-registration.json`,
    `${SELFCLAW_BASE}/.well-known/selfclaw.json`,
    `${SELFCLAW_BASE}/api/manifest.json`,
  ];

  for (const url of discoveryUrls) {
    try {
      const res = await get(url);
      if (res.status === 200 && typeof res.body === 'object') {
        manifest = res.body;
        console.log(`  ✓ Found manifest at: ${url}`);
        console.log('  Manifest:', JSON.stringify(manifest, null, 2).split('\n').map(l => '    ' + l).join('\n'));
        break;
      } else {
        console.log(`  ✗ ${url} → ${res.status}`);
      }
    } catch (e) {
      console.log(`  ✗ ${url} → ${e.message}`);
    }
  }

  if (!manifest) {
    console.log('  ⚠ No manifest found. Falling back to common API path patterns …');
    manifest = {};
  }

  // Resolve endpoints (use manifest values or fall back to common paths)
  const startUrl = resolveEndpoint(manifest, 'start-verification', '/api/selfclaw/v1/start-verification');
  const signUrl = resolveEndpoint(manifest, 'sign-challenge', '/api/selfclaw/v1/sign-challenge');
  const statusBaseUrl = resolveEndpoint(manifest, 'verification-status', '/api/selfclaw/v1/verification-status');

  console.log(`\n  Resolved endpoints:`);
  console.log(`    start-verification: ${startUrl}`);
  console.log(`    sign-challenge:     ${signUrl}`);
  console.log(`    verification-status: ${statusBaseUrl}/{sessionId}`);
  console.log('');

  // Step 1 – Load or generate Ed25519 keypair
  let publicKeySpki, privateKeyPkcs8;

  if (fs.existsSync(KEYS_FILE)) {
    console.log('Step 1: Loading existing Ed25519 keypair from data/selfclaw-keys.json …');
    const saved = JSON.parse(fs.readFileSync(KEYS_FILE, 'utf8'));
    publicKeySpki = saved.publicKeySpki;
    privateKeyPkcs8 = saved.privateKeyPkcs8;
    console.log('  Public Key (SPKI/base64):', publicKeySpki);
    // Also show hex for services that reject base64
    const rawKey = Buffer.from(publicKeySpki, 'base64').slice(-32).toString('hex');
    console.log('  Public Key (HEX):        ', rawKey);
  } else {
    console.log('Step 1: Generating Ed25519 keypair …');
    const { publicKey, privateKey } = generateKeyPairSync('ed25519');
    publicKeySpki  = publicKey.export({ type: 'spki',  format: 'der' }).toString('base64');
    privateKeyPkcs8 = privateKey.export({ type: 'pkcs8', format: 'der' }).toString('base64');

    // Persist keys so we never lose them
    fs.mkdirSync(path.dirname(KEYS_FILE), { recursive: true });
    fs.writeFileSync(KEYS_FILE, JSON.stringify({ publicKeySpki, privateKeyPkcs8 }, null, 2));
    console.log('  Public Key (SPKI):', publicKeySpki);
    console.log('  Keys saved to data/selfclaw-keys.json');
  }
  console.log('');

  // Step 2 – Start verification
  console.log('Step 2: Starting verification session …');
  const startRes = await post(startUrl, {
    agentPublicKey: publicKeySpki,
    agentName: AGENT_NAME
  });

  console.log('  Response status:', startRes.status);
  console.log('  Response body:', JSON.stringify(startRes.body, null, 2));

  if (startRes.status !== 200 && startRes.status !== 201) {
    // Print helpful fallback info even if API is down
    const encodedKey = encodeURIComponent(publicKeySpki);
    const rawHex = Buffer.from(publicKeySpki, 'base64').slice(-32).toString('hex');
    console.error('\n❌ start-verification failed (status ' + startRes.status + ').');
    console.log('\n  You can still register manually using these links:\n');
    console.log('  ╔══════════════════════════════════════════════════════════════╗');
    console.log('  ║  OPTION B — Universal/HTTPS Link                           ║');
    console.log('  ╚══════════════════════════════════════════════════════════════╝');
    console.log(`  https://selfclaw.ai/verify?agentId=7&publicKey=${encodedKey}`);
    console.log('');
    console.log('  ╔══════════════════════════════════════════════════════════════╗');
    console.log('  ║  OPTION B-HEX — If base64 fails, use HEX key              ║');
    console.log('  ╚══════════════════════════════════════════════════════════════╝');
    console.log(`  https://selfclaw.ai/verify?agentId=7&publicKey=${rawHex}`);
    console.log('');
    console.log('  ╔══════════════════════════════════════════════════════════════╗');
    console.log('  ║  OPTION A — Self App Deep Link                             ║');
    console.log('  ╚══════════════════════════════════════════════════════════════╝');
    console.log(`  selfid://verify?agentId=7&publicKey=${rawHex}`);
    console.log('');
    process.exit(1);
  }

  const { challenge, sessionId, selfApp } = startRes.body;
  if (!challenge || !sessionId) {
    console.error('❌ Missing challenge or sessionId in response.');
    process.exit(1);
  }

  console.log('\n  Session ID:', sessionId);
  console.log('  Challenge:', challenge);
  if (selfApp) {
    console.log('\n  📱 Self App QR config:', JSON.stringify(selfApp, null, 2));
  }

  // Step 3 – Sign the challenge
  console.log('\nStep 3: Signing challenge with Ed25519 private key …');
  const privKeyObj = createPrivateKey({ key: Buffer.from(privateKeyPkcs8, 'base64'), format: 'der', type: 'pkcs8' });
  const signature = sign(null, Buffer.from(challenge), privKeyObj).toString('base64');
  console.log('  Signature (base64):', signature);

  // Step 4 – Submit signed challenge
  console.log('\nStep 4: Submitting signed challenge …');
  const signRes = await post(signUrl, {
    sessionId,
    signature
  });

  console.log('  Response status:', signRes.status);
  console.log('  Response body:', JSON.stringify(signRes.body, null, 2));

  if (signRes.status !== 200 && signRes.status !== 201) {
    console.error('\n❌ sign-challenge failed. Exiting.');
    process.exit(1);
  }

  // Step 5 – Deep Links for passport scan completion
  const encodedKey = encodeURIComponent(publicKeySpki);
  const rawHex = Buffer.from(publicKeySpki, 'base64').slice(-32).toString('hex');
  const selfAppDeepLink = `selfid://verify?sessionId=${sessionId}&agentId=7&publicKey=${rawHex}`;
  const selfAppUniversalLink = `https://selfclaw.ai/verify?sessionId=${sessionId}&agentId=7&publicKey=${encodedKey}`;
  const manualUrl = `https://selfclaw.ai/verify?agentId=7&publicKey=${encodedKey}`;

  console.log('\n═══════════════════════════════════════════════════════════════════');
  console.log('');
  console.log('  YOUR AGENT PUBLIC KEY:');
  console.log('  (SPKI/B64): ' + publicKeySpki);
  console.log('  (HEX):      ' + rawHex);
  console.log('');
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('');
  console.log('  ╔══════════════════════════════════════════════════════════════╗');
  console.log('  ║  OPTION A — Self App Deep Link (paste in mobile browser)    ║');
  console.log('  ╚══════════════════════════════════════════════════════════════╝');
  console.log('');
  console.log('  ' + selfAppDeepLink);
  console.log('');
  console.log('  ╔══════════════════════════════════════════════════════════════╗');
  console.log('  ║  OPTION B — Universal HTTPS Link (works on iOS & Android)  ║');
  console.log('  ╚══════════════════════════════════════════════════════════════╝');
  console.log('');
  console.log('  ' + selfAppUniversalLink);
  console.log('');
  console.log('  ╔══════════════════════════════════════════════════════════════╗');
  console.log('  ║  OPTION C — Browser QR (scan with Self app camera)         ║');
  console.log('  ╚══════════════════════════════════════════════════════════════╝');
  console.log('');
  console.log('  ' + manualUrl);
  console.log('');
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('  Open any link above to complete the passport scan.');
  console.log('  Polling every 10 seconds … (Ctrl+C safe — keys are saved)');
  console.log('═══════════════════════════════════════════════════════════════════\n');

  // Step 6 – Poll for verification
  let verified = false;
  const statusUrl = statusBaseUrl.endsWith('/') ? statusBaseUrl + sessionId : statusBaseUrl + '/' + sessionId;
  for (let i = 0; i < 60; i++) {  // poll up to 10 minutes
    const statusRes = await get(statusUrl);
    const st = statusRes.body?.status || statusRes.body;
    process.stdout.write(`  [${new Date().toLocaleTimeString()}] Status: ${st}\n`);

    if (st === 'verified') {
      verified = true;
      break;
    }
    if (st === 'expired') {
      console.error('\n❌ Session expired. Run this script again.');
      process.exit(1);
    }
    await sleep(10000);
  }

  if (!verified) {
    console.error('\n❌ Timed out waiting for verification.');
    process.exit(1);
  }

  // Step 7 – Confirm
  console.log('\n✅ VERIFIED! Agent myday-guardian is now registered with SelfClaw.\n');
  console.log('  Public Key:', publicKeySpki);

  // Print env vars to set
  console.log('\n── Add these to your Railway environment ──');
  console.log(`SELFCLAW_AGENT_PUBLIC_KEY=${publicKeySpki}`);
  console.log(`SELFCLAW_AGENT_PRIVATE_KEY=${privateKeyPkcs8}`);
  console.log('');

  // Verify registration
  console.log('Step 7: Confirming registration …');
  const checkRes = await get(`${SELFCLAW_BASE}/api/selfclaw/v1/agent?publicKey=${encodeURIComponent(publicKeySpki)}`);
  console.log('  Status:', checkRes.status);
  console.log('  Agent record:', JSON.stringify(checkRes.body, null, 2));
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
