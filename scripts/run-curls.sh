#!/bin/bash
echo '=== COMMAND 1: Query by publicKey ==='
curl -sS "https://selfclaw.ai/api/selfclaw/v1/agent?publicKey=MCowBQYDK2VwAyEAcmSLtdlQk4%2B3j82t%2F8ac2LqLVrr20LZya5qkxe19gSM%3D" 2>&1
echo ''
echo ''

echo '=== COMMAND 2: Query by name myday-guardian ==='
curl -sS "https://selfclaw.ai/api/selfclaw/v1/agent/myday-guardian" 2>&1
echo ''
echo ''

echo '=== COMMAND 3: Query agent ID 7 ==='
curl -sS "https://selfclaw.ai/api/selfclaw/v1/agent/7" 2>&1
echo ''
echo ''

echo '=== COMMAND 4: Check name availability ==='
curl -sS "https://selfclaw.ai/api/selfclaw/v1/check-name?name=myday-guardian" 2>&1
echo ''
echo ''

echo '=== COMMAND 5: Stats ==='
curl -sS "https://selfclaw.ai/api/selfclaw/v1/stats" 2>&1
echo ''
echo ''

echo '=== COMMAND 6: Callback endpoint ==='
curl -sS "https://selfclaw.ai/api/selfclaw/v1/callback" 2>&1
echo ''
echo ''

echo '=== COMMAND 7: Agent 17 registration on selfmolt ==='
curl -sS "https://selfmolt.replit.app/api/selfclaw/v1/agent/MCowBQYDK2VwAyEApEb6YZ8Cb0CkvLUDJcedbULhRngN2yZsZEW95j4USU4=/registration.json" 2>&1
echo ''
echo ''

echo '=== COMMAND 8: Our agent registration on selfmolt ==='
curl -sS "https://selfmolt.replit.app/api/selfclaw/v1/agent/MCowBQYDK2VwAyEAcmSLtdlQk4+3j82t/8ac2LqLVrr20LZya5qkxe19gSM=/registration.json" 2>&1
echo ''
echo ''

echo '=== COMMAND 9: 8004scan for agent 7 ==='
curl -sS "https://www.8004scan.io/api/agents/celo/7" 2>&1 | head -100
echo ''
echo ''

echo '=== COMMAND 10: Loopuman agent card ==='
curl -sS "https://api.loopuman.com/.well-known/agent-card.json" 2>&1 | head -150
echo ''
