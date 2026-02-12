const express = require('express');
const rateLimit = require('express-rate-limit');
const { ethers } = require('ethers');
const { verifyMessage, id, getAddress } = ethers;
const Database = require('../database/init');
const bodyParser = require('body-parser');

const keccak256 = id; // Alias for compatibility

const app = express();
app.use(bodyParser.json());

// Rate limit: 100 requests per hour per IP
const limiter = rateLimit({ windowMs: 60 * 60 * 1000, max: 100 });
app.use(limiter);

const db = new Database();

const REGISTERED_AGENT_ADDRESS = process.env.REGISTERED_AGENT_ADDRESS || '0x2C7C...9AEB';

function base64urlDecode(s) {
  // Node's base64url decode via Buffer
  return Buffer.from(s, 'base64url').toString('utf8');
}

app.post('/verify', async (req, res) => {
  try {
    const { addr, payload, sig, telegramUserId } = req.body;
    if (!addr || !payload || !sig) {
      return res.status(400).json({ success: false, error: 'Missing addr|payload|sig' });
    }

    const payloadString = base64urlDecode(payload);

    // Recover address from signature
    let recovered;
    try {
      recovered = verifyMessage(payloadString, sig);
    } catch (err) {
      await db.recordVerificationAttempt(telegramUserId, addr, false, { error: 'invalid_signature' }).catch(()=>{});
      return res.status(400).json({ success: false, error: 'Invalid signature' });
    }

    const normalizedRecovered = (recovered || '').toLowerCase();
    const registered = (REGISTERED_AGENT_ADDRESS || '').toLowerCase();

    const isFromRegisteredAgent = normalizedRecovered === registered;

    // Log attempt to DB (use telegramUserId or system user)
    try {
      await db.waitReady();
      await db.recordVerificationAttempt(telegramUserId, addr, isFromRegisteredAgent, { recovered, payload: payloadString });
    } catch (e) {
      console.error('DB log error:', e);
    }

    if (!isFromRegisteredAgent) {
      return res.status(403).json({ success: false, verified: false, recovered });
    }

    return res.json({ success: true, verified: true, recovered });
  } catch (err) {
    console.error('Verifier error:', err);
    return res.status(500).json({ success: false, error: 'server_error' });
  }
});

/**
 * Webhook: MiniPay /api/verify
const { app, db } = require('./app');

const port = process.env.VERIFIER_PORT || 4000;
app.listen(port, async () => {
  await db.waitReady().catch(()=>{});
  console.log(`Verifier listening on port ${port}`);
});

module.exports = app;
    const { tx_hash, telegramUserId, amount = 0, currency = 'cUSD' } = req.body;
