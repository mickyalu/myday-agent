#!/bin/bash
set -e
cd /workspaces/myday-agent

echo "=== Step 1: Validate manifest JSON ==="
node -e "const m = require('./manifests/myday-agent.json'); console.log('JSON valid'); console.log('endpoints:', JSON.stringify(m.endpoints)); console.log('services:', Object.keys(m.services)); console.log('size:', JSON.stringify(m).length, 'bytes');"
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
git commit -m "fix: rename x402.endpoints→paths (WA006) + remove validation trust (IA009) — pre data-URI burn"

echo ""
echo "=== Step 5: Push to main ==="
git push origin main

echo ""
echo "=== ALL DONE ==="
