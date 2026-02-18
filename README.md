# MyDay Guardian — Agent #7

**Autonomous Behavioral Finance Agent on Celo L2**
Discipline staking, mood-grit correlation, and x402 payment protocol.

> Registered on-chain: `eip155:42220:0x8004A169FB4a3325136EB29fA0ceB6D2e539a432` (Agent ID: 7)

---

## Architecture

```
┌────────────────────────────────────────────────┐
│  Telegram Bot (@MyDayWinBot)                   │
│  - Morning Nudge → Energy + Missions           │
│  - Open Stake → x402 cUSD Payment              │
│  - Sunset Reflection → Mood + Wins             │
└────────────┬───────────────────────────────────┘
             │
┌────────────▼───────────────────────────────────┐
│  Express Server (Railway)                      │
│                                                │
│  /.well-known/agent-card.json — OASF Card      │
│  /.well-known/mcp.json        — MCP Discovery  │
│  /mcp                         — MCP Server     │
│  /api/v1/agent                — A2A Metadata   │
│  /api/v1/discipline-score/:id — Oracle API     │
│  /x402/stake                  — x402 Gateway   │
│  /x402/verify                 — Tx Verifier    │
│  /api/verify                  — SelfClaw Hook  │
│  /pay                         — MiniPay Redir  │
└────────────┬───────────────────────────────────┘
             │
┌────────────▼───────────────────────────────────┐
│  Celo L2 Mainnet (42220)                       │
│  - cUSD staking via ERC-20 transfer to vault   │
│  - On-chain tx verification (ethers.js + RPC)  │
│  - ERC-8004 Agent Registry                     │
└────────────────────────────────────────────────┘
             │
┌────────────▼───────────────────────────────────┐
│  Supabase (PostgreSQL)                         │
│  - users, daily_logs, mood_logs                │
│  - vault_balance, verification_attempts        │
└────────────────────────────────────────────────┘
```

## Protocols

| Protocol | Status | Implementation |
|----------|--------|----------------|
| **x402** | ✅ Active | Real HTTP 402 responses with `X-PAYMENT-REQUIRED` header. Verifies cUSD transfers on Celo L2 on-chain. See `/x402/stake`. |
| **MCP** | ✅ Active | JSON-RPC 2.0 MCP Server at `/mcp`. Exposes 5 tools to Claude, Cursor, and MCP clients. |
| **OASF** | ✅ Active | Agent card at `/.well-known/agent-card.json`. Discipline score API for inter-agent data sharing. |
| **A2A** | ✅ Active | Agent-to-Agent discovery at `/api/v1/agent`. |
| **ERC-8004** | ✅ Registered | On-chain at `0x8004A169FB4a3325136EB29fA0ceB6D2e539a432`, Agent ID 7. URI points to raw GitHub manifest. |

## x402 Flow (Real Implementation)

```
Agent/Client                     MyDay Server                    Celo L2
    │                                │                              │
    │── GET /x402/stake?amount=1 ──▶│                              │
    │                                │                              │
    │◀── 402 Payment Required ──────│                              │
    │    X-PAYMENT-REQUIRED: {       │                              │
    │      payTo, amount, asset,     │                              │
    │      network: eip155:42220     │                              │
    │    }                           │                              │
    │                                │                              │
    │── (send cUSD to vault) ───────┼─── ERC-20 Transfer ────────▶│
    │                                │                              │
    │── GET /x402/stake ────────────▶│                              │
    │   X-PAYMENT: 0x<tx_hash>       │── getTransaction() ────────▶│
    │                                │◀── tx + receipt ────────────│
    │                                │   (verify Transfer logs)     │
    │◀── 200 OK { verified: true } ─│                              │
```

## MCP Server

The MCP Server at `/mcp` exposes these tools via JSON-RPC 2.0:

| Tool | Description |
|------|-------------|
| `get_discipline_score` | Behavioral Oracle — grit score, streak, emotional stability |
| `stake_habit` | x402-gated staking — returns payment requirements |
| `verify_x402_payment` | On-chain cUSD payment verification |
| `get_agent_metadata` | Agent capabilities and registration info |
| `get_x402_requirements` | Payment requirements for a given amount |

**Connect from Claude/Cursor:**
```json
{
  "mcpServers": {
    "myday-guardian": {
      "url": "https://myday-guardian-production.up.railway.app/mcp"
    }
  }
}
```

## Quick Start

```bash
# Install
npm install

# Set environment variables
cp .env.example .env
# Fill in: TELEGRAM_BOT_TOKEN, GEMINI_API_KEY, SUPABASE_URL,
#          SUPABASE_SERVICE_KEY, PRIVATE_KEY, VAULT_ADDRESS, RPC_URL

# Run locally
npm start

# Update on-chain agent URI (points to raw GitHub manifest)
node scripts/update-agent-uri.js

# Deploy to Railway
railway up
```

## 🛡️ Humanity Verification

SelfClaw NFC passport scanning is implemented via the `/api/verify` webhook endpoint. The programmatic handshake (Milestone 3) is fully built — the bot checks `verified_human` status before allowing stakes, and the SelfClaw callback updates the user record in Supabase.

**Note:** SelfClaw NFC scanning hardware availability varies by region. The verification webhook and programmatic flow are production-ready and can be tested via the POST `/api/verify` endpoint with `{ "telegramId": <id>, "verified": true }`.

## Milestones

- ✅ **Milestone 1:** Project setup, Telegram bot, Supabase DB
- ✅ **Milestone 2:** Animo Brain (Gemini), morning/sunset flow, discipline scoring
- ✅ **Milestone 3:** MiniPay deep links, agent signature, on-chain verification
- ✅ **Milestone 4:** x402 protocol, MCP Server, OASF agent card, ERC-8004 registration

## License

MIT

