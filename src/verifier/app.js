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

const REGISTERED_AGENT_ADDRESS = process.env.REGISTERED_AGENT_ADDRESS || '0x2C7CE8dc27283beFD939adC894798A52c03A9AEB';

function base64urlDecode(s) {
  return Buffer.from(s, 'base64url').toString('utf8');
}

// Existing signature verification endpoint
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
 * Expected payload: { tx_hash, telegramUserId, amount, currency }
 */
const apiVerifyHandler = async (req, res) => {
  try {
    const { tx_hash, telegramUserId, amount = 0, currency = 'cUSD' } = req.body;
    if (!tx_hash || !telegramUserId) {
      return res.status(400).json({ success: false, error: 'Missing tx_hash or telegramUserId' });
    }

    // Prevent duplicates
    try {
      await db.waitReady();
      const seen = await db.hasProcessedTransaction(tx_hash);
      if (seen) return res.status(409).json({ success: false, error: 'already_processed' });
    } catch (e) {
      console.error('DB check error:', e);
    }

    const rpc = process.env.RPC_URL || 'https://forno.celo.org';
    // Celo Mainnet — hardcoded, no testnet fallback
    const chainId = 42220;
    const provider = new ethers.JsonRpcProvider(rpc, chainId);

    let tx;
    try {
      tx = await provider.getTransaction(tx_hash);
    } catch (netErr) {
      // Network unavailable (expected in offline environments)
      console.error('RPC network error:', netErr.message);
      return res.status(503).json({ success: false, error: 'network_unavailable' });
    }
    
    if (!tx) {
      return res.status(404).json({ success: false, error: 'tx_not_found' });
    }

    const VAULT = (process.env.VAULT_ADDRESS || '').toLowerCase();

    // Check direct 'to' match
    const toMatch = tx.to && tx.to.toLowerCase() === VAULT;

    // If not direct, check receipt logs for ERC20 Transfer to vault
    let transferToVault = false;
    const receipt = await provider.getTransactionReceipt(tx_hash);
    if (receipt && receipt.logs && receipt.logs.length > 0) {
      const transferTopic = keccak256('Transfer(address,address,uint256)');
      const vaultAddr = getAddress(VAULT || '0x0000000000000000000000000000000000000000');
      const vaultTopic = ethers.toBeHex(vaultAddr, 32).toLowerCase();
      for (const log of receipt.logs) {
        if (!log.topics || log.topics.length < 3) continue;
        if (log.topics[0].toLowerCase() === transferTopic.toLowerCase()) {
          if (log.topics[2].toLowerCase() === vaultTopic) {
            transferToVault = true;
            break;
          }
        }
      }
    }

    if (!toMatch && !transferToVault) {
      return res.status(400).json({ success: false, error: 'to_address_mismatch' });
    }

    // Record processed tx and credit user's vault
    try {
      await db.recordProcessedTransaction(tx_hash, telegramUserId, amount, currency, { tx: tx, receipt: receipt });
      await db.creditUserVault(telegramUserId, Number(amount) || 0);
    } catch (e) {
      console.error('DB write error:', e);
      return res.status(500).json({ success: false, error: 'db_error' });
    }

    // Notify user via Telegram if we have chat id
    try {
      const TelegramBot = require('node-telegram-bot-api');
      const token = process.env.TELEGRAM_BOT_TOKEN;
      if (token) {
        const bot = new TelegramBot(token);
        const user = await db.getUserById(telegramUserId);
        const chatId = user ? user.telegram_chat_id : null;
        const amountStr = Number(amount) || 0;
        if (chatId) {
          const message = `✅ Stake confirmed! ${amountStr} ${currency} locked in your MyDay Vault.`;
          await bot.sendMessage(chatId, message);
        }
      } else {
        console.warn('TELEGRAM_BOT_TOKEN not set; skipping notification');
      }
    } catch (e) {
      console.error('Telegram notify error:', e);
    }

    return res.json({ success: true, processed: true });
  } catch (err) {
    console.error('API verify error:', err);
    return res.status(500).json({ success: false, error: 'server_error' });
  }
};

app.post('/api/verify', apiVerifyHandler);

module.exports = { app, db, apiVerifyHandler };
