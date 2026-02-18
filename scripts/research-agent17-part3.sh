#!/bin/bash
echo "=== A. Agent #17 Registration JSON (from selfclaw registry) ==="
curl -sS "https://selfmolt.replit.app/api/selfclaw/v1/agent/MCowBQYDK2VwAyEApEb6YZ8Cb0CkvLUDJcedbULhRngN2yZsZEW95j4USU4=/registration.json" 2>&1
echo ""
echo ""
echo "=== B. 8004scan API with numeric chain_id (42220 for Celo) ==="
curl -sS "https://www.8004scan.io/api/v1/agents/42220/17" 2>&1
echo ""
echo ""
echo "=== C. 8004scan API with chain 42220 alt paths ==="
curl -sS "https://www.8004scan.io/api/agents/42220/17" 2>&1
echo ""
echo ""
echo "=== D. Our agent-card ==="
curl -sS "https://myday-guardian-production.up.railway.app/.well-known/agent-card.json" 2>&1
echo ""
echo ""
echo "=== E. Our health ==="
curl -sS "https://myday-guardian-production.up.railway.app/health" 2>&1
echo ""
echo ""
echo "=== F. Our mcp.json ==="
curl -sS "https://myday-guardian-production.up.railway.app/.well-known/mcp.json" 2>&1
echo ""
echo ""
echo "=== G. Our verify ==="
curl -sS "https://myday-guardian-production.up.railway.app/api/verify" 2>&1
echo ""
echo ""
echo "=== H. Selfclaw our agent status ==="
curl -sS "https://selfclaw.ai/api/selfclaw/v1/agent?publicKey=MCowBQYDK2VwAyEAcmSLtdlQk4%2B3j82t%2F8ac2LqLVrr20LZya5qkxe19gSM%3D" 2>&1
echo ""
echo ""
echo "=== DONE PART 3 ==="
