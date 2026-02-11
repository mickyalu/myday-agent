#!/usr/bin/env node
const { Wallet } = require('ethers');
const qs = require('querystring');

// Simple utility: generate a signed verification link proving control of a wallet
// Usage:
// 1) With env: PRIVATE_KEY=0xabc node scripts/generate-handshake.js --agent 7
// 2) Or pass via CLI: node scripts/generate-handshake.js --agent 7 --privateKey 0xabc

function parseArgs() {
  const args = process.argv.slice(2);
  const out = {};
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--agent' && args[i+1]) { out.agent = args[++i]; }
    else if (a === '--privateKey' && args[i+1]) { out.privateKey = args[++i]; }
    else if (a === '--domain' && args[i+1]) { out.domain = args[++i]; }
  }
  return out;
}

async function main() {
  const { agent, privateKey, domain } = parseArgs();
  const agentId = agent || process.env.AGENT_ID || '7';
  let pk = privateKey || process.env.PRIVATE_KEY;

  let ephemeral = false;
  if (!pk) {
    // Create ephemeral wallet for example/demo (do NOT use this to verify ownership in production)
    const w = Wallet.createRandom();
    pk = w.privateKey;
    ephemeral = true;
  }

  const wallet = new Wallet(pk);
  const address = await wallet.getAddress();

  const payload = {
    agentId: String(agentId),
    app: 'MyDay Guardian',
    statement: `I am the human creator of MyDay Guardian (Agent #${agentId}).`,
    timestamp: new Date().toISOString()
  };

  const payloadString = JSON.stringify(payload);
  const signature = await wallet.signMessage(payloadString);

  // URL-safe base64 for payload
  const b64 = Buffer.from(payloadString).toString('base64url');

  const query = qs.stringify({ addr: address, payload: b64, sig: signature });
  const verifyDomain = domain || 'https://myday.guardian/verify';
  const verificationLink = `${verifyDomain}?${query}`;

  console.log('=== SelfClaw Humanity Handshake - Verification Link ===');
  console.log('Agent ID:', agentId);
  console.log('Address:', address);
  console.log('Timestamp:', payload.timestamp);
  console.log('Ephemeral key used:', ephemeral ? 'YES (demo only)' : 'NO');
  console.log('');
  console.log('Verification link:');
  console.log(verificationLink);
  console.log('');
  console.log('To verify: retrieve `payload` from query, base64url-decode it, and use the `addr` and `sig` to verify the signed message matches the payload.');
  if (ephemeral) {
    console.log('\nNOTE: An ephemeral key was generated because no PRIVATE_KEY was provided.');
    console.log('Run with your real private key to generate a verifiable link:');
    console.log('  PRIVATE_KEY=0x... node scripts/generate-handshake.js --agent 7');
  }
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
