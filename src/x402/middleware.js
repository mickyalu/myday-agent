/**
 * x402 Protocol Middleware — Native Implementation for Celo L2
 *
 * Implements the HTTP 402 Payment Required protocol for machine-to-machine
 * payments on Celo L2 using cUSD stablecoins.
 *
 * Flow:
 *   1. Client hits a gated endpoint without payment → 402 + X-PAYMENT-REQUIRED header
 *   2. Client makes on-chain cUSD transfer to VAULT_ADDRESS
 *   3. Client retries with X-PAYMENT header containing tx_hash proof
 *   4. Server verifies the tx on-chain via Celo RPC → serves 200 response
 *
 * Compatible with: MiniPay, Valora, any Celo wallet, and programmatic agents.
 *
 * References:
 *   - https://www.x402.org
 *   - EIP-8004 Agent Registration
 */

const { ethers } = require('ethers');

// ── Celo cUSD contract address (Mainnet) ─────────────────────────────────────
const CELO_CUSD_ADDRESS = '0x765DE816845861e75A25fCA122bb6898B8B1282a';
const CELO_CHAIN_ID = 42220;
const CELO_NETWORK = 'eip155:42220';

// ERC-20 Transfer event topic
const TRANSFER_EVENT_TOPIC = ethers.id('Transfer(address,address,uint256)');

/**
 * Build a PaymentRequirements object per x402 spec
 */
function buildPaymentRequirements({
  payTo,
  amount,
  asset = CELO_CUSD_ADDRESS,
  network = CELO_NETWORK,
  resource,
  description = 'MyDay Guardian staking fee',
  maxTimeoutSeconds = 600,
  extra = {}
}) {
  return {
    scheme: 'exact',
    network,
    maxAmountRequired: String(amount),
    resource,
    description,
    mimeType: 'application/json',
    payTo,
    maxTimeoutSeconds,
    asset,
    extra: {
      chainId: CELO_CHAIN_ID,
      name: 'cUSD',
      version: '1.0',
      ...extra
    }
  };
}

/**
 * Verify an on-chain cUSD payment to the vault
 *
 * @param {string} txHash - Transaction hash to verify
 * @param {string} vaultAddress - Expected recipient (VAULT_ADDRESS)
 * @param {number} expectedAmount - Minimum cUSD amount expected (in token units, e.g. 0.10)
 * @param {string} rpcUrl - Celo RPC endpoint
 * @returns {Promise<{valid: boolean, amount: number, from: string, error?: string}>}
 */
async function verifyPayment(txHash, vaultAddress, expectedAmount, rpcUrl) {
  const provider = new ethers.JsonRpcProvider(rpcUrl, CELO_CHAIN_ID);
  const vault = vaultAddress.toLowerCase();

  let tx;
  try {
    tx = await provider.getTransaction(txHash);
  } catch (err) {
    return { valid: false, amount: 0, from: '', error: 'rpc_error', details: err.message };
  }

  if (!tx) {
    return { valid: false, amount: 0, from: '', error: 'tx_not_found' };
  }

  // Wait for confirmation (at least 1 block)
  let receipt;
  try {
    receipt = await provider.getTransactionReceipt(txHash);
  } catch (err) {
    return { valid: false, amount: 0, from: tx.from || '', error: 'receipt_error' };
  }

  if (!receipt || receipt.status !== 1) {
    return { valid: false, amount: 0, from: tx.from || '', error: 'tx_failed' };
  }

  // Check for ERC-20 Transfer to vault in logs
  let transferAmount = 0;
  let senderAddress = tx.from || '';

  for (const log of (receipt.logs || [])) {
    if (!log.topics || log.topics.length < 3) continue;

    // Match Transfer(address,address,uint256) event
    if (log.topics[0].toLowerCase() !== TRANSFER_EVENT_TOPIC.toLowerCase()) continue;

    // topics[2] = to address (zero-padded to 32 bytes)
    const toTopic = '0x' + log.topics[2].slice(26).toLowerCase();
    if (toTopic !== vault) continue;

    // Decode the amount from log data (uint256)
    const rawAmount = BigInt(log.data);
    // cUSD has 18 decimals on Celo
    const parsedAmount = Number(ethers.formatUnits(rawAmount, 18));
    transferAmount += parsedAmount;

    // Extract sender from topics[1]
    senderAddress = '0x' + log.topics[1].slice(26);
  }

  // Also check direct native CELO transfer (in case user sends CELO not cUSD)
  if (transferAmount === 0 && tx.to && tx.to.toLowerCase() === vault) {
    const nativeAmount = Number(ethers.formatEther(tx.value || '0'));
    if (nativeAmount > 0) {
      transferAmount = nativeAmount;
    }
  }

  if (transferAmount < expectedAmount * 0.99) { // 1% tolerance for rounding
    return {
      valid: false,
      amount: transferAmount,
      from: senderAddress,
      error: 'insufficient_amount',
      expected: expectedAmount,
      received: transferAmount
    };
  }

  return {
    valid: true,
    amount: transferAmount,
    from: senderAddress,
    txHash,
    blockNumber: receipt.blockNumber
  };
}

/**
 * Express middleware factory: Protects a route with x402 payment gating
 *
 * Usage:
 *   app.get('/api/premium', x402PaymentGate({ amount: 0.10 }), handler);
 *
 * If no X-PAYMENT header is present, responds with 402 + payment requirements.
 * If X-PAYMENT header is present, verifies the tx on-chain and passes through.
 *
 * @param {object} opts
 * @param {number} opts.amount - Required payment amount in cUSD (e.g. 0.10)
 * @param {string} [opts.description] - Description of what's being paid for
 * @param {string} [opts.resource] - Override resource path (defaults to req.path)
 * @returns {Function} Express middleware
 */
function x402PaymentGate(opts = {}) {
  const { amount = 0.10, description = 'MyDay Guardian x402 protocol fee' } = opts;

  return async (req, res, next) => {
    const paymentHeader = req.headers['x-payment'] || req.headers['X-Payment'];
    const vault = process.env.VAULT_ADDRESS || '';
    const rpc = process.env.RPC_URL || 'https://forno.celo.org';

    if (!vault) {
      return res.status(503).json({ error: 'VAULT_ADDRESS not configured' });
    }

    // ── No payment provided → return 402 with requirements ───────────────
    if (!paymentHeader) {
      const requirements = buildPaymentRequirements({
        payTo: vault,
        amount: String(ethers.parseUnits(String(amount), 18)),
        resource: opts.resource || req.originalUrl || req.path,
        description
      });

      res.status(402);
      res.set('X-PAYMENT-REQUIRED', JSON.stringify(requirements));
      res.set('Access-Control-Expose-Headers', 'X-PAYMENT-REQUIRED');
      return res.json({
        error: 'payment_required',
        message: `This endpoint requires a payment of ${amount} cUSD. Send cUSD to ${vault} on Celo L2, then retry with X-PAYMENT header containing your tx hash.`,
        paymentRequirements: requirements
      });
    }

    // ── Payment header present → verify on-chain ─────────────────────────
    let paymentData;
    try {
      // Accept either raw tx hash or JSON envelope
      if (paymentHeader.startsWith('0x')) {
        paymentData = { txHash: paymentHeader };
      } else {
        // Try base64 decode then JSON parse
        const decoded = Buffer.from(paymentHeader, 'base64').toString('utf8');
        paymentData = JSON.parse(decoded);
      }
    } catch (err) {
      return res.status(400).json({ error: 'invalid_payment_header', message: 'X-PAYMENT must be a tx hash (0x...) or base64-encoded JSON' });
    }

    const txHash = paymentData.txHash || paymentData.tx_hash || paymentData.hash;
    if (!txHash) {
      return res.status(400).json({ error: 'missing_tx_hash', message: 'Payment proof must include txHash' });
    }

    // Verify the payment on-chain
    const result = await verifyPayment(txHash, vault, amount, rpc);

    if (!result.valid) {
      return res.status(402).json({
        error: 'payment_verification_failed',
        reason: result.error,
        details: result
      });
    }

    // Attach payment info to request for downstream handlers
    req.x402 = {
      verified: true,
      txHash,
      amount: result.amount,
      from: result.from,
      blockNumber: result.blockNumber
    };

    next();
  };
}

/**
 * Helper: Generate a x402 payment URL for Telegram bot buttons
 * Returns a URL that, when visited, shows payment instructions or redirects to wallet
 */
function buildStakeUrl({
  baseUrl,
  amount,
  userId,
  meta = '',
  fee = 0.10
}) {
  const totalAmount = (Number(amount) + fee).toFixed(2);
  const params = new URLSearchParams({
    amount: totalAmount,
    user: String(userId),
    fee: String(fee),
    protocol: 'x402'
  });
  if (meta) params.set('meta', meta);
  return `${baseUrl}/x402/stake?${params.toString()}`;
}

module.exports = {
  x402PaymentGate,
  verifyPayment,
  buildPaymentRequirements,
  buildStakeUrl,
  CELO_CUSD_ADDRESS,
  CELO_CHAIN_ID,
  CELO_NETWORK,
  TRANSFER_EVENT_TOPIC
};
