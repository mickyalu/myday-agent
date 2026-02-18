#!/bin/bash
echo "=== 1. 8004scan page for agent #17 ==="
curl -sS "https://www.8004scan.io/agents/celo/17" 2>&1 | head -300
echo ""
echo "=== 2. API endpoint ==="
curl -sS "https://www.8004scan.io/api/agents/celo/17" 2>&1
echo ""
echo "=== 3. Alt API path ==="
curl -sS "https://www.8004scan.io/api/v1/agents/celo/17" 2>&1
echo ""
echo "=== PAUSE: waiting to parse agent URL ==="
echo "=== 4-7 will follow after we find agent #17 URL ==="
echo ""
echo "=== 8. Our agent-card ==="
curl -sS "https://myday-guardian-production.up.railway.app/.well-known/agent-card.json" 2>&1
echo ""
echo "=== 9. Our mcp.json ==="
curl -sS "https://myday-guardian-production.up.railway.app/.well-known/mcp.json" 2>&1
echo ""
echo "=== 10. Our health ==="
curl -sS "https://myday-guardian-production.up.railway.app/health" 2>&1
echo ""
echo "=== 11. Self.xyz docs ==="
curl -sS "https://docs.self.xyz" 2>&1 | head -100
echo ""
echo "=== 12. self.xyz/docs ==="
curl -sS "https://self.xyz/docs" 2>&1 | head -100
echo ""
echo "=== 13. docs.self.xyz/integration ==="
curl -sS "https://docs.self.xyz/integration" 2>&1 | head -100
echo ""
echo "=== 14. Selfclaw agent query ==="
curl -sS "https://selfclaw.ai/api/selfclaw/v1/agent?publicKey=MCowBQYDK2VwAyEAcmSLtdlQk4%2B3j82t%2F8ac2LqLVrr20LZya5qkxe19gSM%3D" 2>&1
echo ""
echo "=== 15. Selfclaw agent-registration ==="
curl -sS "https://selfclaw.ai/.well-known/agent-registration.json" 2>&1
echo ""
echo "=== DONE ==="
