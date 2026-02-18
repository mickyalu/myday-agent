#!/bin/bash
set -e
cd /workspaces/myday-agent

echo "=== Step 1: Delete temp file ==="
rm -f scripts/crawl-competitor.js
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
git commit -m "fix: Railway 502 crash + ERC-8004 registration format + Self verification flow"

echo ""
echo "=== Step 5: Push to main ==="
git push origin main

echo ""
echo "=== ALL DONE ==="
