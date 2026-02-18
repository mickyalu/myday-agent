#!/bin/bash
echo "=== 1. RAW GITHUB URL ==="
curl -sI https://raw.githubusercontent.com/mickyalu/myday-agent/main/manifests/myday-agent.json | head -5
echo ""

echo "=== 2. RAILWAY .well-known/agent-card.json ==="
curl -sI https://myday-guardian-production.up.railway.app/.well-known/agent-card.json | head -10
echo ""

echo "=== 3. CORS HEADERS ==="
curl -sI https://myday-guardian-production.up.railway.app/.well-known/agent-card.json | grep -i access-control
echo ""

echo "=== 4. RAILWAY .well-known/mcp.json ==="
curl -sI https://myday-guardian-production.up.railway.app/.well-known/mcp.json | head -5
echo ""

echo "=== 5. HEALTH CHECK ==="
curl -s https://myday-guardian-production.up.railway.app/health
echo ""
echo ""

echo "=== 6. MANIFEST CONTENT (from raw github) ==="
curl -s https://raw.githubusercontent.com/mickyalu/myday-agent/main/manifests/myday-agent.json | head -40
echo ""

echo "=== 7. MANIFEST CONTENT (from railway) ==="
curl -s https://myday-guardian-production.up.railway.app/.well-known/agent-card.json | head -40
echo ""

echo "=== 8. GIT STATUS ==="
cd /workspaces/myday-agent
git log --oneline -3
echo ""
git remote -v
echo ""
git status --short
echo ""

echo "=== 9. ON-CHAIN URI (ethers read) ==="
node -e "
const { ethers } = require('ethers');
require('dotenv').config();
(async () => {
  try {
    const provider = new ethers.JsonRpcProvider(process.env.RPC_URL || 'https://forno.celo.org', 42220);
    const abi = ['function agentURI(uint256) view returns (string)'];
    const contract = new ethers.Contract('0x8004A169FB4a3325136EB29fA0ceB6D2e539a432', abi, provider);
    const uri = await contract.agentURI(7);
    console.log('On-chain URI:', uri.substring(0, 200));
    console.log('URI length:', uri.length);
  } catch(e) {
    console.error('Error reading on-chain URI:', e.message);
  }
})();
" 2>&1

echo ""
echo "=== DONE ==="
