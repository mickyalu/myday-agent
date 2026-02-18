#!/bin/bash
echo "=== COMMAND 1: selfmolt agent registration (key1) ==="
curl -sS 'https://selfmolt.replit.app/api/selfclaw/v1/agent/MCowBQYDK2VwAyEApEb6YZ8Cb0CkvLUDJcedbULhRngN2yZsZEW95j4USU4%3D/registration.json'
echo ""
echo ""

echo "=== COMMAND 2: selfmolt agent registration (key2) ==="
curl -sS 'https://selfmolt.replit.app/api/selfclaw/v1/agent/MCowBQYDK2VwAyEAcmSLtdlQk4%2B3j82t%2F8ac2LqLVrr20LZya5qkxe19gSM%3D/registration.json'
echo ""
echo ""

echo "=== COMMAND 3: myday health ==="
curl -sS 'https://myday-guardian-production.up.railway.app/health'
echo ""
echo ""

echo "=== COMMAND 4: myday agent-card.json ==="
curl -sS 'https://myday-guardian-production.up.railway.app/.well-known/agent-card.json'
echo ""
echo ""

echo "=== COMMAND 5: myday mcp.json ==="
curl -sS 'https://myday-guardian-production.up.railway.app/.well-known/mcp.json'
echo ""
echo ""

echo "=== COMMAND 6: selfclaw agent lookup (key2) ==="
curl -sS 'https://selfclaw.ai/api/selfclaw/v1/agent?publicKey=MCowBQYDK2VwAyEAcmSLtdlQk4%2B3j82t%2F8ac2LqLVrr20LZya5qkxe19gSM%3D'
echo ""
echo ""

echo "=== COMMAND 7: selfclaw agent lookup (key1) ==="
curl -sS 'https://selfclaw.ai/api/selfclaw/v1/agent?publicKey=MCowBQYDK2VwAyEApEb6YZ8Cb0CkvLUDJcedbULhRngN2yZsZEW95j4USU4%3D'
echo ""
echo ""

echo "=== ALL DONE ==="
