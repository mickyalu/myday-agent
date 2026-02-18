#!/bin/bash
OUT="/workspaces/myday-agent/data/selfxyz-research-output.txt"
exec > "$OUT" 2>&1

echo "=== 1. VERIFY URL HEADERS ==="
curl -sIL "https://app.self.xyz/verify/4db47692-1274-4dba-9d80-53ffefc0e0d1" 2>&1
echo ""

echo "=== 2. VERIFY PAGE CONTENT (first 50 lines) ==="
curl -sS "https://app.self.xyz/verify/4db47692-1274-4dba-9d80-53ffefc0e0d1" 2>&1 | head -50
echo ""

echo "=== 3. APPLE APP SITE ASSOCIATION (app.self.xyz) ==="
curl -sS "https://app.self.xyz/.well-known/apple-app-site-association" 2>&1
echo ""

echo "=== 4. ANDROID ASSETLINKS (app.self.xyz) ==="
curl -sS "https://app.self.xyz/.well-known/assetlinks.json" 2>&1
echo ""

echo "=== 5. APPLE APP SITE ASSOCIATION (self.xyz) ==="
curl -sS "https://self.xyz/.well-known/apple-app-site-association" 2>&1
echo ""

echo "=== 6. ANDROID ASSETLINKS (self.xyz) ==="
curl -sS "https://self.xyz/.well-known/assetlinks.json" 2>&1
echo ""

echo "=== 7. VERIFY URL ON self.xyz DOMAIN ==="
curl -sIL "https://self.xyz/verify/4db47692-1274-4dba-9d80-53ffefc0e0d1" 2>&1
echo ""

echo "=== 8. NPM @selfxyz/core ==="
curl -sS "https://registry.npmjs.org/@selfxyz/core" 2>&1 | head -50
echo ""

echo "=== 9. NPM @selfxyz/qrcode ==="
curl -sS "https://registry.npmjs.org/@selfxyz/qrcode" 2>&1 | head -50
echo ""

echo "=== 10. NPM @self.xyz/core ==="
curl -sS "https://registry.npmjs.org/@self.xyz/core" 2>&1 | head -50
echo ""

echo "=== 11. GITHUB SEARCH ==="
curl -sS "https://api.github.com/search/repositories?q=self+xyz+sdk+verify&per_page=5" 2>&1 | head -200
echo ""

echo "=== DONE ==="
