#!/bin/bash
echo "=== A. Agent #17 Registration JSON ==="
curl -sS "https://selfmolt.replit.app/api/selfclaw/v1/agent/MCowBQYDK2VwAyEApEb6YZ8Cb0CkvLUDJcedbULhRngN2yZsZEW95j4USU4=/registration.json" 2>&1
echo ""
echo "=== B. Agent #5 Registration JSON ==="
curl -sS "https://selfmolt.replit.app/api/selfclaw/v1/agent/MCowBQYDK2VwAyEA1XCRtd2xYmoxpdRBRAR6+v4OKkuoHGfDIVB2VtLxsCs=/registration.json" 2>&1
echo ""
echo "=== C. Agent #14 Registration JSON ==="
curl -sS "https://selfmolt.replit.app/api/selfclaw/v1/agent/MCowBQYDK2VwAyEAh4AuZQKsM38AS+ibNvqxt7zfgQwskKTLpfsidhaBDeY=/registration.json" 2>&1
echo ""
echo "=== D. Selfmolt.replit.app root ==="
curl -sS "https://selfmolt.replit.app/" 2>&1 | head -50
echo ""
echo "=== E. Selfmolt API base ==="
curl -sS "https://selfmolt.replit.app/api/selfclaw/v1/" 2>&1
echo ""
echo "=== F. 8004scan API for agent 17 ==="
curl -sS "https://www.8004scan.io/api/agents/celo/17" 2>&1
echo ""
echo "=== G. 8004scan alt API ==="
curl -sS "https://www.8004scan.io/api/v1/agents/celo/17" 2>&1
echo ""
echo "=== DONE PART 2 ==="
