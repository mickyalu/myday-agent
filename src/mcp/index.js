/**
 * MyDay Guardian — MCP Server (Model Context Protocol)
 *
 * Exposes MyDay's tools to AI agents (Claude, Cursor, other MCP clients)
 * via the JSON-RPC 2.0 based MCP protocol over Streamable HTTP transport.
 *
 * Tools exposed:
 *   1. get_discipline_score  — Behavioral Oracle (grit, streak, stability)
 *   2. stake_habit            — x402-gated habit staking on Celo L2
 *   3. verify_x402_payment    — On-chain payment verification
 *   4. get_agent_metadata     — Agent capabilities & endpoints
 *   5. get_x402_requirements  — Payment requirements for staking
 *
 * Transport: Streamable HTTP (POST /mcp)
 * Discovery: /.well-known/mcp.json
 *
 * References:
 *   - https://modelcontextprotocol.io/specification
 *   - https://eips.ethereum.org/EIPS/eip-8004
 */

const { verifyPayment, buildPaymentRequirements, CELO_CUSD_ADDRESS, CELO_CHAIN_ID } = require('../x402/middleware');

// ── MCP Protocol Constants ───────────────────────────────────────────────────
const MCP_PROTOCOL_VERSION = '2024-11-05';
const SERVER_NAME = 'myday-guardian';
const SERVER_VERSION = '2.0.0';

// ── Tool Definitions ─────────────────────────────────────────────────────────
const MCP_TOOLS = [
  {
    name: 'get_discipline_score',
    description: 'Returns the user\'s behavioral finance metrics: grit score (0-100), win streak, emotional stability index, morning energy average, sunset mood average, and total cUSD staked. Powered by the MyDay Behavioral Oracle on Celo L2.',
    inputSchema: {
      type: 'object',
      properties: {
        telegram_id: {
          type: 'integer',
          description: 'Telegram user ID to look up'
        }
      },
      required: ['telegram_id']
    }
  },
  {
    name: 'stake_habit',
    description: 'Initiates an x402-gated habit stake on Celo L2. Returns payment requirements (vault address, amount, asset) that the caller must fulfill by sending cUSD. After payment, call verify_x402_payment with the transaction hash.',
    inputSchema: {
      type: 'object',
      properties: {
        amount: {
          type: 'string',
          description: 'cUSD amount to stake (e.g. "1.00")'
        },
        user: {
          type: 'string',
          description: 'Telegram user ID for follow-up notification (optional)'
        }
      },
      required: ['amount']
    }
  },
  {
    name: 'verify_x402_payment',
    description: 'Verifies an on-chain cUSD payment on Celo L2 (chain 42220) against the MyDay vault. Checks ERC-20 Transfer logs and confirms the transaction was successful.',
    inputSchema: {
      type: 'object',
      properties: {
        txHash: {
          type: 'string',
          description: 'Celo L2 transaction hash (0x...)'
        },
        expectedAmount: {
          type: 'number',
          description: 'Expected cUSD amount (default: 0.10)'
        }
      },
      required: ['txHash']
    }
  },
  {
    name: 'get_agent_metadata',
    description: 'Returns MyDay Guardian agent metadata including capabilities, supported protocols (x402, OASF), available endpoints, and ERC-8004 registration info.',
    inputSchema: {
      type: 'object',
      properties: {}
    }
  },
  {
    name: 'get_x402_requirements',
    description: 'Returns x402 payment requirements for a given staking amount. Includes vault address, asset (cUSD), network (Celo L2), and amount in wei.',
    inputSchema: {
      type: 'object',
      properties: {
        amount: {
          type: 'number',
          description: 'cUSD amount (default: 0.10)'
        }
      }
    }
  }
];

// ── Tool Handlers ────────────────────────────────────────────────────────────

/**
 * Execute an MCP tool call
 * @param {string} toolName
 * @param {object} args
 * @param {object} deps - { db } injected dependencies
 * @returns {Promise<{content: Array}>}
 */
async function executeTool(toolName, args, deps = {}) {
  const { db } = deps;

  switch (toolName) {
    case 'get_discipline_score': {
      const telegramId = Number(args.telegram_id);
      if (!telegramId) {
        return { content: [{ type: 'text', text: 'Error: telegram_id is required and must be a number' }], isError: true };
      }

      if (!db) {
        return { content: [{ type: 'text', text: 'Error: Database unavailable — degraded mode' }], isError: true };
      }

      try {
        const weekly = await db.getWeeklyMoodEnergyData(telegramId);
        const totalStaked = await db.getTotalStaked(telegramId);

        const energies = (weekly || []).map(w => Number(w.morning_energy || 0)).filter(n => !isNaN(n));
        const avgEnergy = energies.length ? energies.reduce((a, b) => a + b, 0) / energies.length : 3;

        const sunsetMoods = (weekly || []).map(w => Number(w.sunset_mood || 0)).filter(n => !isNaN(n) && n > 0);
        const avgSunsetMood = sunsetMoods.length ? sunsetMoods.reduce((a, b) => a + b, 0) / sunsetMoods.length : 3;

        let emotionalStability = 50;
        if (sunsetMoods.length >= 3) {
          const variance = sunsetMoods.reduce((sum, m) => sum + Math.pow(m - avgSunsetMood, 2), 0) / sunsetMoods.length;
          emotionalStability = Math.round(Math.max(0, Math.min(100, (1 - Math.sqrt(variance) / 2) * 100)));
        }

        // Streak calculation
        let streak = 0;
        try {
          const { data: reflections } = await db.client
            .from('daily_logs')
            .select('details,date')
            .eq('telegram_id', telegramId)
            .eq('log_type', 'sunset_reflection')
            .order('date', { ascending: false })
            .limit(14);
          if (reflections) {
            for (const r of reflections) {
              try {
                const parsed = JSON.parse(r.details || '{}');
                if (Number(parsed.wins || 0) > 0) streak++; else break;
              } catch (e) { break; }
            }
          }
        } catch (e) { /* streak stays 0 */ }

        const energyScore = (Math.max(1, Math.min(5, avgEnergy)) / 5) * 40;
        const stakeScore = Math.min(40, Number(totalStaked) * 2);
        const streakScore = Math.min(20, streak * 5);
        const grit_score = Math.round(Math.max(0, Math.min(100, energyScore + stakeScore + streakScore)));
        const status = grit_score >= 80 ? 'Elite' : (grit_score >= 50 ? 'Stable' : 'Warning');

        const result = {
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
        };

        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      } catch (err) {
        return { content: [{ type: 'text', text: `Error fetching discipline score: ${err.message}` }], isError: true };
      }
    }

    case 'stake_habit': {
      const amount = parseFloat(args.amount) || 0;
      const fee = 0.10;
      const vault = process.env.VAULT_ADDRESS || '';

      if (!vault) {
        return { content: [{ type: 'text', text: 'Error: VAULT_ADDRESS not configured on server' }], isError: true };
      }

      const requirements = buildPaymentRequirements({
        payTo: vault,
        amount: String(BigInt(Math.round((amount + fee) * 1e18))),
        resource: '/x402/stake',
        description: `MyDay habit stake: ${amount} cUSD + ${fee} cUSD x402 fee`,
        extra: { stakeAmount: amount, fee, userId: args.user || undefined }
      });

      const result = {
        protocol: 'x402',
        action: 'stake_required',
        message: `To stake ${amount} cUSD, send ${(amount + fee).toFixed(2)} cUSD (includes ${fee} cUSD x402 fee) to ${vault} on Celo L2 (chain 42220).`,
        vault_address: vault,
        total_amount: (amount + fee).toFixed(2),
        asset: 'cUSD (0x765DE816845861e75A25fCA122bb6898B8B1282a)',
        network: 'Celo L2 (eip155:42220)',
        next_step: 'After sending the transaction, call verify_x402_payment with the txHash to confirm.',
        paymentRequirements: requirements
      };

      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    }

    case 'verify_x402_payment': {
      const txHash = args.txHash;
      const expectedAmount = args.expectedAmount || 0.10;
      const vault = process.env.VAULT_ADDRESS || '';
      const rpc = process.env.RPC_URL || 'https://forno.celo.org';

      if (!txHash) {
        return { content: [{ type: 'text', text: 'Error: txHash is required' }], isError: true };
      }
      if (!vault) {
        return { content: [{ type: 'text', text: 'Error: VAULT_ADDRESS not configured' }], isError: true };
      }

      try {
        const result = await verifyPayment(txHash, vault, expectedAmount, rpc);
        return { content: [{ type: 'text', text: JSON.stringify({ protocol: 'x402', ...result }, null, 2) }] };
      } catch (err) {
        return { content: [{ type: 'text', text: `Verification error: ${err.message}` }], isError: true };
      }
    }

    case 'get_agent_metadata': {
      const metadata = {
        name: 'MyDay Guardian',
        agentId: 7,
        chain: 'Celo L2 (42220)',
        description: 'Autonomous Behavioral Finance Agent — discipline staking, mood-grit correlation, x402 payment protocol on Celo L2.',
        protocols: ['x402', 'OASF', 'MCP'],
        supportsX402: true,
        x402: {
          version: '1.0',
          network: 'eip155:42220',
          asset: CELO_CUSD_ADDRESS,
          fee: '0.10 cUSD',
          endpoints: { stake: '/x402/stake', verify: '/x402/verify', requirements: '/x402/requirements' }
        },
        erc8004: {
          agentId: '7',
          registry: 'eip155:42220:0x8004A169FB4a3325136EB29fA0ceB6D2e539a432',
          wallet: '0x2C7CE8dc27283beFD939adC894798A52c03A9AEB'
        },
        endpoints: {
          discipline_score: '/api/v1/discipline-score/:telegram_id',
          mcp: '/mcp',
          agent_card: '/.well-known/agent-card.json',
          mcp_discovery: '/.well-known/mcp.json'
        },
        humanity_verification: 'SelfClaw (selfclaw.ai)'
      };

      return { content: [{ type: 'text', text: JSON.stringify(metadata, null, 2) }] };
    }

    case 'get_x402_requirements': {
      const amount = args.amount || 0.10;
      const vault = process.env.VAULT_ADDRESS || '';

      if (!vault) {
        return { content: [{ type: 'text', text: 'Error: VAULT_ADDRESS not configured' }], isError: true };
      }

      const requirements = buildPaymentRequirements({
        payTo: vault,
        amount: String(BigInt(Math.round(amount * 1e18))),
        resource: '/x402/stake',
        description: `MyDay staking: ${amount.toFixed ? amount.toFixed(2) : amount} cUSD on Celo L2`
      });

      return { content: [{ type: 'text', text: JSON.stringify({ protocol: 'x402', paymentRequirements: requirements }, null, 2) }] };
    }

    default:
      return { content: [{ type: 'text', text: `Unknown tool: ${toolName}` }], isError: true };
  }
}

// ── JSON-RPC Message Handler ─────────────────────────────────────────────────

/**
 * Handle a single MCP JSON-RPC message
 * @param {object} message - JSON-RPC 2.0 message
 * @param {object} deps - { db }
 * @returns {object|null} JSON-RPC response (null for notifications)
 */
async function handleMCPMessage(message, deps = {}) {
  const { jsonrpc, method, params, id } = message;

  // Validate JSON-RPC
  if (jsonrpc !== '2.0') {
    return { jsonrpc: '2.0', error: { code: -32600, message: 'Invalid Request: jsonrpc must be "2.0"' }, id: id || null };
  }

  switch (method) {
    // ── Lifecycle ──────────────────────────────────────────────────────────
    case 'initialize': {
      return {
        jsonrpc: '2.0',
        result: {
          protocolVersion: MCP_PROTOCOL_VERSION,
          capabilities: {
            tools: { listChanged: false }
          },
          serverInfo: {
            name: SERVER_NAME,
            version: SERVER_VERSION
          }
        },
        id
      };
    }

    case 'notifications/initialized': {
      // Client acknowledged initialization — no response needed
      return null;
    }

    case 'ping': {
      return { jsonrpc: '2.0', result: {}, id };
    }

    // ── Tools ─────────────────────────────────────────────────────────────
    case 'tools/list': {
      return {
        jsonrpc: '2.0',
        result: {
          tools: MCP_TOOLS
        },
        id
      };
    }

    case 'tools/call': {
      const toolName = params && params.name;
      const toolArgs = (params && params.arguments) || {};

      if (!toolName) {
        return { jsonrpc: '2.0', error: { code: -32602, message: 'Missing tool name' }, id };
      }

      const found = MCP_TOOLS.find(t => t.name === toolName);
      if (!found) {
        return { jsonrpc: '2.0', error: { code: -32602, message: `Unknown tool: ${toolName}` }, id };
      }

      try {
        const result = await executeTool(toolName, toolArgs, deps);
        return { jsonrpc: '2.0', result, id };
      } catch (err) {
        return {
          jsonrpc: '2.0',
          result: { content: [{ type: 'text', text: `Tool execution error: ${err.message}` }], isError: true },
          id
        };
      }
    }

    // ── Unsupported ───────────────────────────────────────────────────────
    default: {
      return {
        jsonrpc: '2.0',
        error: { code: -32601, message: `Method not found: ${method}` },
        id: id || null
      };
    }
  }
}

// ── Express Route Setup ──────────────────────────────────────────────────────

/**
 * Mount MCP routes on an Express app
 * @param {import('express').Express} app
 * @param {object} deps - { db }
 */
function mountMCPRoutes(app, deps = {}) {
  // MCP Streamable HTTP endpoint
  app.post('/mcp', async (req, res) => {
    res.set('Content-Type', 'application/json');

    const body = req.body;

    // Handle batch requests
    if (Array.isArray(body)) {
      const results = [];
      for (const msg of body) {
        const result = await handleMCPMessage(msg, deps);
        if (result !== null) results.push(result);
      }
      return res.json(results);
    }

    // Handle single request
    const result = await handleMCPMessage(body, deps);
    if (result === null) {
      return res.sendStatus(204); // Notification — no response
    }
    return res.json(result);
  });

  // MCP GET for server info (convenience)
  app.get('/mcp', (req, res) => {
    res.json({
      name: SERVER_NAME,
      version: SERVER_VERSION,
      protocolVersion: MCP_PROTOCOL_VERSION,
      transport: 'streamable-http',
      endpoint: '/mcp',
      tools: MCP_TOOLS.map(t => ({ name: t.name, description: t.description }))
    });
  });

  // OPTIONS for CORS on /mcp
  app.options('/mcp', (req, res) => {
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.sendStatus(204);
  });

  console.log('✓ MCP Server mounted at /mcp');
}

module.exports = {
  mountMCPRoutes,
  handleMCPMessage,
  executeTool,
  MCP_TOOLS,
  MCP_PROTOCOL_VERSION,
  SERVER_NAME,
  SERVER_VERSION
};
