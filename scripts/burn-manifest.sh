#!/bin/bash
echo "=== Burning manifest on-chain ==="
cd /workspaces/myday-agent
node scripts/update-agent-uri.js
echo ""
echo "=== Verifying on-chain data ==="
node scripts/decode-onchain.js
echo ""
echo "=== Done ==="
