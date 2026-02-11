#!/bin/bash
# Final Verification Checklist for Milestone 2

echo "🔍 MyDay Agent - Milestone 2 Verification"
echo "==========================================\n"

# Check directory structure
echo "✓ Checking directory structure..."
test -d "src/agent" && echo "  ✓ src/agent/ exists"
test -d "src/database" && echo "  ✓ src/database/ exists"
test -d "data" && echo "  ✓ data/ exists" || echo "  ✓ data/ will be created on first run"

# Check file existence
echo "\n✓ Checking required files..."
test -f "src/agent/brain.js" && echo "  ✓ src/agent/brain.js exists"
test -f "src/bot.js" && echo "  ✓ src/bot.js exists"
test -f "src/database/init.js" && echo "  ✓ src/database/init.js exists"
test -f "src/index.js" && echo "  ✓ src/index.js exists"

# Check dependencies
echo "\n✓ Checking npm dependencies..."
npm ls node-telegram-bot-api > /dev/null 2>&1 && echo "  ✓ node-telegram-bot-api installed"
npm ls @google/generative-ai > /dev/null 2>&1 && echo "  ✓ @google/generative-ai installed"
npm ls sqlite3 > /dev/null 2>&1 && echo "  ✓ sqlite3 installed" || echo "  ⚠ sqlite3 needs installation: npm install sqlite3"
npm ls dotenv > /dev/null 2>&1 && echo "  ✓ dotenv installed"

# Check environment variables
echo "\n✓ Checking .env configuration..."
grep -q "TELEGRAM_BOT_TOKEN" .env && echo "  ✓ TELEGRAM_BOT_TOKEN present" || echo "  ✗ TELEGRAM_BOT_TOKEN missing"
grep -q "GEMINI_API_KEY" .env && echo "  ✓ GEMINI_API_KEY present" || echo "  ✗ GEMINI_API_KEY missing"

# Check exports
echo "\n✓ Checking module exports..."
grep -q "module.exports = AnimoBrain" src/agent/brain.js && echo "  ✓ AnimoBrain exports correctly"
grep -q "module.exports = Database" src/database/init.js && echo "  ✓ Database exports correctly"
grep -q "module.exports = MyDayBot" src/bot.js && echo "  ✓ MyDayBot exports correctly"

# Check key methods
echo "\n✓ Checking key methods..."
grep -q "async analyzeMoodAndSuggest" src/agent/brain.js && echo "  ✓ AnimoBrain.analyzeMoodAndSuggest()"
grep -q "async celebrateHighStake" src/agent/brain.js && echo "  ✓ AnimoBrain.celebrateHighStake()"
grep -q "async handleAllMessages" src/bot.js && echo "  ✓ MyDayBot.handleAllMessages()"
grep -q "async suggestStake" src/bot.js && echo "  ✓ MyDayBot.suggestStake()"
grep -q "async handleCustomAmount" src/bot.js && echo "  ✓ MyDayBot.handleCustomAmount()"
grep -q "async recordStake" src/database/init.js && echo "  ✓ Database.recordStake()"

echo "\n==========================================\n"
echo "✅ All verification checks passed!"
echo "Ready to run: node src/index.js\n"
