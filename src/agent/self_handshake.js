const fetch = require('node-fetch');
const { Wallet } = require('ethers');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

/**
 * SelfClaw Handshake helper
 * - Signs an agent-backed payload proving human backing
 * - Optionally requests a gas-subsidy (payload) from SelfClaw endpoint
 *
 * This is a best-effort implementation following the public SelfClaw "skill" pattern
 * — if SelfClaw updates their API, this will need adjustment.
 */

const SELFCLAW_BASE = process.env.SELFCLAW_ENDPOINT || 'https://selfclaw.app';
const AGENT_ID = process.env.AGENT_ID || '7';

function loadSkillSpec() {
  // Try local skill.md first (repo root or src/agent)
  const candidates = [
    path.join(process.cwd(), 'skill.md'),
    path.join(process.cwd(), 'src', 'agent', 'skill.md')
  ];
  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) return fs.readFileSync(p, 'utf8');
    } catch (e) {}
  }
  return null;
}

async function signAgentPayload(payload) {
  const pk = process.env.PRIVATE_KEY;
  if (!pk) throw new Error('PRIVATE_KEY not configured for signing');
  const wallet = new Wallet(pk);
  const str = JSON.stringify(payload);
  const sig = await wallet.signMessage(str);
  return { payload, signature: sig, signer: wallet.address };
}

async function requestGasSubsidy(toAddress, amountCUSD = '0.10') {
  // Best-effort POST to a SelfClaw subsidy endpoint (if available)
  const url = `${SELFCLAW_BASE}/api/request-subsidy`;
  const body = { agentId: AGENT_ID, to: toAddress, amount: String(amountCUSD) };
  try {
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const json = await res.json().catch(() => null);
    return { ok: res.ok, status: res.status, body: json };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

async function performAgentHandshake({ telegramUserId = null, extra = {} } = {}) {
  // Build handshake payload following SelfClaw "skill" conventions
  const skill = loadSkillSpec();
  const timestamp = new Date().toISOString();
  const payload = {
    agentId: AGENT_ID,
    telegramUserId: telegramUserId || null,
    timestamp,
    skill_preview: skill ? skill.slice(0, 200) : null,
    extra
n  };

  const signed = await signAgentPayload(payload);

  // POST to SelfClaw handshake endpoint to attest backing
  const url = `${SELFCLAW_BASE}/api/handshake`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(signed)
    });
    const json = await res.json().catch(() => null);
    return { ok: res.ok, status: res.status, body: json };
  } catch (err) {
    return { ok: false, error: String(err), signed };
  }
}

module.exports = {
  performAgentHandshake,
  requestGasSubsidy,
  loadSkillSpec
};
