#!/usr/bin/env node
/**
 * High-Precision Sync — Load existing key (or generate if missing) + Polling Keep-Alive
 *
 * Outputs the public key as a raw 64-character hexadecimal string (no symbols,
 * no slashes, no percent-encoding), then polls indefinitely so the terminal
 * stays awake while you complete the handshake on the website.
 *
 * IMPORTANT: This script LOADS the existing keypair. It does NOT regenerate.
 *            Use autonomous-handshake.js for the full verification flow.
 *
 * Usage:  node scripts/high-precision-sync.js
 */

const { generateKeyPairSync } = require('crypto');
const fs   = require('fs');
const path = require('path');

const KEYS_FILE = path.join(__dirname, '..', 'data', 'selfclaw-keys.json');

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  console.log('');
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('  HIGH-PRECISION SYNC — Ed25519 Key Display + Keep-Alive');
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('');

  let publicKeySpki, privateKeyPkcs8;

  // ── Load existing keypair, or generate ONLY if none exists ───────────────
  if (fs.existsSync(KEYS_FILE)) {
    console.log('  Loading existing Ed25519 keypair from data/selfclaw-keys.json …');
    const saved = JSON.parse(fs.readFileSync(KEYS_FILE, 'utf8'));
    publicKeySpki = saved.publicKeySpki;
    privateKeyPkcs8 = saved.privateKeyPkcs8;
    console.log('  ✓ Loaded existing keys (NOT regenerated)');
  } else {
    console.log('  No existing keys found. Generating fresh Ed25519 keypair …');
    const { publicKey, privateKey } = generateKeyPairSync('ed25519');
    publicKeySpki   = publicKey.export({ type: 'spki',  format: 'der' }).toString('base64');
    privateKeyPkcs8 = privateKey.export({ type: 'pkcs8', format: 'der' }).toString('base64');
    fs.mkdirSync(path.dirname(KEYS_FILE), { recursive: true });
    fs.writeFileSync(KEYS_FILE, JSON.stringify({ publicKeySpki, privateKeyPkcs8 }, null, 2));
    console.log('  ✓ Fresh keys generated and saved');
  }

  // Raw 32-byte Ed25519 public key → 64-char hex (no symbols)
  const rawHex = Buffer.from(publicKeySpki, 'base64').slice(-32).toString('hex');
  console.log('');

  // ── Print the key ────────────────────────────────────────────────────────
  console.log('  ╔══════════════════════════════════════════════════════════════════╗');
  console.log('  ║  AGENT PUBLIC KEY — RAW 64-CHARACTER HEX (paste this)          ║');
  console.log('  ╠══════════════════════════════════════════════════════════════════╣');
  console.log(`  ║  ${rawHex}  ║`);
  console.log('  ╚══════════════════════════════════════════════════════════════════╝');
  console.log('');
  console.log('  SPKI/Base64 (backup): ' + publicKeySpki);
  console.log('');
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('  Terminal will stay awake — polling every 15 s.');
  console.log('  Press Ctrl+C when you have finished verifying on the website.');
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('');

  // ── Polling keep-alive loop ──────────────────────────────────────────────
  let tick = 0;
  while (true) {
    tick++;
    const ts = new Date().toLocaleTimeString();
    process.stdout.write(`  [${ts}] Polling … tick #${tick} — session alive\n`);
    await sleep(15000);
  }
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
