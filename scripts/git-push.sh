#!/bin/bash
set -e
cd /workspaces/myday-agent

echo "=== Step 1: Validate manifest JSON ==="
node -e "const m = require('./manifests/myday-agent.json'); console.log('JSON valid'); console.log('endpoints:', JSON.stringify(m.endpoints)); console.log('services:', Array.isArray(m.services) ? m.services.map(s=>s.name) : 'NOT ARRAY'); console.log('size:', JSON.stringify(m).length, 'bytes');"
echo "Done."

echo ""
echo "=== Step 1b: Decode on-chain tokenURI — SERVICES FOCUS ==="
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
  console.log('services isArray:', Array.isArray(j.services));
  if (Array.isArray(j.services)) {
    j.services.forEach((s,i) => console.log('  ['+i+'] name='+s.name+' endpoint='+s.endpoint));
  }
  console.log('endpoints isArray:', Array.isArray(j.endpoints));
  if (j.endpoints) j.endpoints.forEach((e,i) => console.log('  ['+i+'] name='+e.name+' endpoint='+e.endpoint));
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
git commit -m "fix: services use name/endpoint fields for 8004 scanner" --allow-empty

echo ""
echo "=== Step 5: Push to main ==="
git push origin main

echo ""
echo "=== ALL DONE ==="
