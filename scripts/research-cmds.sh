#!/bin/bash
OUT="/workspaces/myday-agent/data/curl-results.txt"
rm -f "$OUT"

{
echo '=== COMMAND 1: selfmolt agent registration (key1 - competitor) ==='
curl -sS --max-time 20 'https://selfmolt.replit.app/api/selfclaw/v1/agent/MCowBQYDK2VwAyEApEb6YZ8Cb0CkvLUDJcedbULhRngN2yZsZEW95j4USU4%3D/registration.json' 2>&1
echo ''
echo ''

echo '=== COMMAND 2: selfmolt agent registration (key2 - our agent) ==='
curl -sS --max-time 20 'https://selfmolt.replit.app/api/selfclaw/v1/agent/MCowBQYDK2VwAyEAcmSLtdlQk4%2B3j82t%2F8ac2LqLVrr20LZya5qkxe19gSM%3D/registration.json' 2>&1
echo ''
echo ''

echo '=== COMMAND 3: myday-guardian health ==='
curl -sS --max-time 20 'https://myday-guardian-production.up.railway.app/health' 2>&1
echo ''
echo ''

echo '=== COMMAND 4: myday-guardian agent-card.json ==='
curl -sS --max-time 20 'https://myday-guardian-production.up.railway.app/.well-known/agent-card.json' 2>&1
echo ''
echo ''

echo '=== COMMAND 5: myday-guardian mcp.json ==='
curl -sS --max-time 20 'https://myday-guardian-production.up.railway.app/.well-known/mcp.json' 2>&1
echo ''
echo ''

echo '=== COMMAND 6: selfclaw agent lookup (key2 - our agent) ==='
curl -sS --max-time 20 'https://selfclaw.ai/api/selfclaw/v1/agent?publicKey=MCowBQYDK2VwAyEAcmSLtdlQk4%2B3j82t%2F8ac2LqLVrr20LZya5qkxe19gSM%3D' 2>&1
echo ''
echo ''

echo '=== COMMAND 7: selfclaw agent lookup (key1 - competitor) ==='
curl -sS --max-time 20 'https://selfclaw.ai/api/selfclaw/v1/agent?publicKey=MCowBQYDK2VwAyEApEb6YZ8Cb0CkvLUDJcedbULhRngN2yZsZEW95j4USU4%3D' 2>&1
echo ''

echo '=== ALL DONE ==='
} > "$OUT" 2>&1

echo "Results written to $OUT"
cat "$OUT" | wc -l
