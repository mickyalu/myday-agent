#!/bin/bash
echo "=== AGENT 17 REGISTRATION ==="
curl -sS "https://selfmolt.replit.app/api/selfclaw/v1/agent/MCowBQYDK2VwAyEApEb6YZ8Cb0CkvLUDJcedbULhRngN2yZsZEW95j4USU4=/registration.json" 2>&1
echo ""
echo ""
echo "=== AGENT 5 REGISTRATION ==="
curl -sS "https://selfmolt.replit.app/api/selfclaw/v1/agent/MCowBQYDK2VwAyEA1XCRtd2xYmoxpdRBRAR6+v4OKkuoHGfDIVB2VtLxsCs=/registration.json" 2>&1
echo ""
echo ""
echo "=== SELFMOLT ROOT ==="
curl -sS -o /dev/null -w "HTTP_CODE: %{http_code}\nSIZE: %{size_download}\nCONTENT_TYPE: %{content_type}\n" "https://selfmolt.replit.app/" 2>&1
echo ""
echo "=== SELFMOLT well-known ==="
curl -sS "https://selfmolt.replit.app/.well-known/agent-card.json" 2>&1
echo ""
echo ""
echo "=== SELFMOLT MCP ==="
curl -sS "https://selfmolt.replit.app/.well-known/mcp.json" 2>&1
echo ""
echo ""
echo "=== DONE P4 ==="
