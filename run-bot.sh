#!/bin/bash
# 🚀 MILESTONE 2 - QUICK START (Live Bot)

echo ""
echo "╔════════════════════════════════════════════════╗"
echo "║  🚀 MyDay Agent - Milestone 2 - LIVE BOT 🚀   ║"
echo "║     Agentic Architecture | Proactive Flow      ║"
echo "╚════════════════════════════════════════════════╝"
echo ""

# Check if dependencies are installed
if ! npm ls node-telegram-bot-api > /dev/null 2>&1; then
  echo "⚠️  Missing dependencies. Installing..."
  npm install
  echo ""
fi

# Verify .env file
if [ ! -f ".env" ]; then
  echo "⚠️  .env file not found!"
  echo "Please create .env with:"
  echo ""
  echo "  TELEGRAM_BOT_TOKEN=your_token_here"
  echo "  GEMINI_API_KEY=your_key_here"
  echo ""
  exit 1
fi

# Check for required env vars
if ! grep -q "TELEGRAM_BOT_TOKEN" .env; then
  echo "❌ TELEGRAM_BOT_TOKEN not in .env"
  exit 1
fi

if ! grep -q "GEMINI_API_KEY" .env; then
  echo "❌ GEMINI_API_KEY not in .env"
  exit 1
fi

echo "✅ Configuration verified"
echo ""

echo "════════════════════════════════════════════════"
echo "📋 WHAT'S LIVE:"
echo "════════════════════════════════════════════════"
echo ""
echo "✓ Proactive Energy Check (1-5 mood scale)"
echo "✓ Gemini 2.0 Coaching Brain"
echo "✓ Flexible CELO Staking"
echo "✓ SQLite Data Persistence"
echo "✓ High-Stake Celebration Logic"
echo "✓ Blockchain Ready (M3)"
echo ""

echo "════════════════════════════════════════════════"
echo "🎯 USER FLOW:"
echo "════════════════════════════════════════════════"
echo ""
echo "1. /start → Bot asks for energy level"
echo "2. User: 1-5 → Coaching analysis"
echo "3. Bot suggests habit → User enters CELO"
echo "4. Bot: 'Confirm? YES/NO' → YES locks data"
echo "5. Ready for blockchain phase (M3)"
echo ""

echo "════════════════════════════════════════════════"
echo ""
echo "🚀 STARTING BOT IN 3... 2... 1..."
echo ""

# Start the bot
node src/index.js
