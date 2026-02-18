#!/usr/bin/env node
/**
 * MyDay Guardian MCP Server v2.0.0
 * Behavioral Finance Agent for Celo L2
 *
 * Gives AI agents native access to discipline scoring,
 * x402 staking, and on-chain payment verification.
 *
 * Usage:
 *   npx myday-mcp
 *   # or
 *   VAULT_ADDRESS=0x... node mcp-server/index.js
 *
 * Claude Desktop config:
 *   {
 *     "mcpServers": {
 *       "myday": {
 *         "command": "node",
 *         "args": ["mcp-server/index.js"],
 *         "env": { "VAULT_ADDRESS": "0x2C7CE8dc27283beFD939adC894798A52c03A9AEB" }
 *       }
 *     }
 *   }
 */

const readline = require('readline');
const https = require('https');

const VAULT = process.env.VAULT_ADDRESS || '0x2C7CE8dc27283beFD939adC894798A52c03A9AEB';
const BASE_URL = process.env.MYDAY_API_URL || 'https://myday-guardian-production.up.railway.app';
const CUSD = '0x765DE816845861e75A25fCA122bb6898B8B1282a';
const CHAIN_ID = 42220;

const tools = [
  {
    name: 'get_discipline_score',
    description: 'Get a user\'s behavioral finance metrics from MyDay Guardian on Celo L2. Returns grit score (0-100), win streak, emotional stability index, mood and energy averages, and total cUSD staked.',
    inputSchema: {
      type: 'object',
      properties: {
        telegram_id: { type: 'integer', description: 'Telegram user ID' }
      },
      required: ['telegram_id']
    }
  },
  {
    name: 'stake_habit',
    description: 'Get x402 payment requirements for habit staking on Celo L2. Returns vault address and amount to send in cUSD. After payment, use verify_x402_payment with the tx hash.',
    inputSchema: {
      type: 'object',
      properties: {
        amount: { type: 'string', description: 'cUSD amount to stake (e.g. "1.00")' }
      },
      required: ['amount']
    }
  },
  {
    name: 'verify_x402_payment',
    description: 'Verify an on-chain cUSD payment on Celo L2 against the MyDay vault.',
    inputSchema: {
      type: 'object',
      properties: {
        txHash: { type: 'string', description: 'Transaction hash (0x...)' },
        expectedAmount: { type: 'number', description: 'Expected cUSD amount (default 0.10)' }
      },
      required: ['txHash']
    }
  },
  {
    name: 'get_agent_metadata',
    description: 'Get MyDay Guardian agent metadata, capabilities, and ERC-8004 registration info.',
    inputSchema: { type: 'object', properties: {} }
  },
  {
    name: 'get_x402_requirements',
    description: 'Get x402 payment requirements for a given amount. Returns vault address, asset, network, and amount.',
    inputSchema: {
      type: 'object',
      properties: {
        amount: { type: 'number', description: 'cUSD amount (default 0.10)' }
      }
    }
  }
];

function httpGet(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', (c) => data += c);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch { resolve({ raw: data }); }
      });
    }).on('error', reject);
  });
}

async function handleToolCall(name, args) {
  switch (name) {
    case 'get_discipline_score': {
      const id = args.telegram_id;
      if (!id) return { error: 'telegram_id required' };
      try {
        const data = await httpGet(`${BASE_URL}/api/v1/discipline-score/${id}`);
        return data;
      } catch (e) {
        return { error: e.message };
      }
    }

    case 'stake_habit': {
      const amount = parseFloat(args.amount) || 0;
      const fee = 0.10;
      const total = amount + fee;
      return {
        protocol: 'x402',
        action: 'payment_required',
        vault_address: VAULT,
        total_amount: total.toFixed(2),
        stake_amount: amount.toFixed(2),
        fee: fee.toFixed(2),
        asset: `cUSD (${CUSD})`,
        network: `Celo L2 (eip155:${CHAIN_ID})`,
        instructions: `Send ${total.toFixed(2)} cUSD to ${VAULT} on Celo L2, then call verify_x402_payment with the tx hash.`
      };
    }

    case 'verify_x402_payment': {
      const { txHash, expectedAmount = 0.10 } = args;
      if (!txHash) return { error: 'txHash required' };
      try {
        const url = `${BASE_URL}/x402/verify`;
        return new Promise((resolve, reject) => {
          const body = JSON.stringify({ txHash, expectedAmount });
          const req = https.request(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
          }, (res) => {
            let data = '';
            res.on('data', (c) => data += c);
            res.on('end', () => { try { resolve(JSON.parse(data)); } catch { resolve({ raw: data }); } });
          });
          req.on('error', reject);
          req.write(body);
          req.end();
        });
      } catch (e) {
        return { error: e.message };
      }
    }

    case 'get_agent_metadata': {
      return {
        name: 'MyDay Guardian',
        agentId: 7,
        chain: `Celo L2 (${CHAIN_ID})`,
        protocols: ['x402', 'OASF', 'MCP', 'A2A'],
        registry: '0x8004A169FB4a3325136EB29fA0ceB6D2e539a432',
        wallet: VAULT,
        website: BASE_URL
      };
    }

    case 'get_x402_requirements': {
      const amount = args.amount || 0.10;
      return {
        protocol: 'x402',
        vault: VAULT,
        amount: amount.toFixed ? amount.toFixed(2) : String(amount),
        asset: CUSD,
        asset_name: 'cUSD',
        network: `eip155:${CHAIN_ID}`,
        chain: 'Celo L2'
      };
    }

    default:
      return { error: `Unknown tool: ${name}` };
  }
}

// MCP stdio protocol - JSON-RPC 2.0 over stdin/stdout
const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: false });

rl.on('line', async (line) => {
  try {
    const msg = JSON.parse(line);

    if (msg.method === 'initialize') {
      process.stdout.write(JSON.stringify({
        jsonrpc: '2.0',
        id: msg.id,
        result: {
          protocolVersion: '2024-11-05',
          capabilities: { tools: {} },
          serverInfo: { name: 'myday-guardian', version: '2.0.0' }
        }
      }) + '\n');
    }
    else if (msg.method === 'notifications/initialized') {
      // no response needed
    }
    else if (msg.method === 'tools/list') {
      process.stdout.write(JSON.stringify({
        jsonrpc: '2.0',
        id: msg.id,
        result: { tools }
      }) + '\n');
    }
    else if (msg.method === 'tools/call') {
      try {
        const result = await handleToolCall(msg.params.name, msg.params.arguments || {});
        process.stdout.write(JSON.stringify({
          jsonrpc: '2.0',
          id: msg.id,
          result: { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }
        }) + '\n');
      } catch (err) {
        process.stdout.write(JSON.stringify({
          jsonrpc: '2.0',
          id: msg.id,
          result: { content: [{ type: 'text', text: JSON.stringify({ error: err.message }) }] }
        }) + '\n');
      }
    }
    else if (msg.method === 'ping') {
      process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: msg.id, result: {} }) + '\n');
    }
  } catch (e) {
    process.stderr.write('Parse error: ' + e.message + '\n');
  }
});
