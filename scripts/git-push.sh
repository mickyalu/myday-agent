#!/bin/bash
set -e
cd /workspaces/myday-agent

echo "=== Step 1: Validate manifest JSON ==="
node -e "const m = require('./manifests/myday-agent.json'); console.log('JSON valid'); console.log('endpoints:', JSON.stringify(m.endpoints)); console.log('services:', Array.isArray(m.services) ? m.services.map(s=>s.name) : 'NOT ARRAY'); console.log('size:', JSON.stringify(m).length, 'bytes');"
echo "Done."

echo ""
echo "=== Step 1b: Decode on-chain tokenURI ==="
node -e "
const { ethers } = require('ethers');
require('dotenv').config();
(async () => {
  const p = new ethers.JsonRpcProvider(process.env.RPC_URL, 42220);
  const c = new ethers.Contract('0x8004A169FB4a3325136EB29fA0ceB6D2e539a432', ['function tokenURI(uint256) view returns (string)'], p);
  const uri = await c.tokenURI(7);
  const b64 = uri.replace('data:application/json;base64,', '');
  const j = JSON.parse(Buffer.from(b64, 'base64').toString('utf-8'));
  console.log('URI length:', uri.length);
  console.log('type:', j.type);
  console.log('supportedTrust:', JSON.stringify(j.supportedTrust));
  console.log('endpoints:');
  if (j.endpoints) j.endpoints.forEach((e,i) => console.log('  ['+i+'] type='+e.type+' url='+(e.url||e.address||'?')));
  console.log('has services:', !!j.services);
})();
"
echo "Done."

echo ""
echo "=== Step 2: Stage all changes ==="
git add -A
echo "Done."

echo ""
echo "=== Step 3: Git Status ==="
git status

echo ""
echo "=== Step 4: Commit ==="
git commit -m "fix: match official ERC-8004 spec - type:Agent, endpoints use type/url, wallet endpoint" --allow-empty

echo ""
echo "=== Step 5: Push to main ==="
git push origin main

echo ""
echo "=== Step 6: Burn manifest on-chain ==="
node scripts/update-agent-uri.js

echo ""
echo "=== Step 7: Verify on-chain data ==="
node -e "
const { ethers } = require('ethers');
require('dotenv').config();
(async () => {
  const p = new ethers.JsonRpcProvider(process.env.RPC_URL, 42220);
  const c = new ethers.Contract('0x8004A169FB4a3325136EB29fA0ceB6D2e539a432', ['function tokenURI(uint256) view returns (string)'], p);
  const uri = await c.tokenURI(7);
  const b64 = uri.replace('data:application/json;base64,', '');
  const j = JSON.parse(Buffer.from(b64, 'base64').toString('utf-8'));
  console.log('ON-CHAIN type:', j.type);
  console.log('ON-CHAIN supportedTrust:', JSON.stringify(j.supportedTrust));
  console.log('ON-CHAIN endpoints:');
  if (j.endpoints) j.endpoints.forEach((e,i) => console.log('  ['+i+'] type='+e.type+' url='+(e.url||e.address||'?')));
  console.log('ON-CHAIN has services:', !!j.services);
})();
"

echo ""
echo "=== ALL DONE ==="
