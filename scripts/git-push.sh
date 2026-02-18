#!/bin/bash
set -e
cd /workspaces/myday-agent

echo "=== Step 1: Validate manifest JSON ==="
node -e "const m = require('./manifests/myday-agent.json'); console.log('JSON valid'); console.log('endpoints:', JSON.stringify(m.endpoints)); console.log('services:', Array.isArray(m.services) ? m.services.map(s=>s.type) : Object.keys(m.services)); console.log('size:', JSON.stringify(m).length, 'bytes');"
echo "Done."

echo ""
echo "=== Step 1b: Decode on-chain tokenURI ==="
node scripts/decode-onchain.js
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
git commit -m "fix: services as array + strip angle brackets — badge fix"

echo ""
echo "=== Step 5: Push to main ==="
git push origin main

echo ""
echo "=== ALL DONE ==="
