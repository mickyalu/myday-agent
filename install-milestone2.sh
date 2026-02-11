#!/bin/bash
# Install Milestone 2 dependencies

echo "📦 Installing Milestone 2 dependencies..."

npm install \
  @google/generative-ai@latest \
  node-telegram-bot-api@latest \
  sqlite3@latest \
  @supabase/supabase-js@latest

echo "✓ Dependencies installed!"
echo ""
echo "Next steps:"
echo "1. Add API keys to your .env file (see .env.example)"
echo "2. Run: node src/index.js"
echo ""
echo "Required API Keys:"
echo "  - TELEGRAM_BOT_TOKEN: Get from BotFather on Telegram"
echo "  - GEMINI_API_KEY: Get from Google AI Studio (https://aistudio.google.com)"
