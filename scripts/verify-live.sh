#!/bin/bash
echo "=== Check .well-known/agent.json ==="
curl -s https://myday-guardian-production.up.railway.app/.well-known/agent.json | python3 -c "
import json,sys
d=json.load(sys.stdin)
print('type:', d.get('type'))
print('supportedTrust:', d.get('supportedTrust'))
print('endpoints:')
for e in d.get('endpoints', []):
    print(f'  - {e.get(\"type\")}: {e.get(\"url\", e.get(\"address\", \"?\"))}')
print('has services:', 'services' in d)
"

echo ""
echo "=== Check x402/stake returns 402 ==="
curl -s -o /dev/null -w "HTTP status: %{http_code}\n" https://myday-guardian-production.up.railway.app/x402/stake

echo ""
echo "=== Check CORS headers ==="
curl -sI https://myday-guardian-production.up.railway.app/.well-known/agent.json 2>&1 | grep -i "access-control\|content-type"

echo ""
echo "=== DONE ==="
