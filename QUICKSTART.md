# Milestone 2 Quick Start Guide

## 5-Minute Setup

### Step 1: Get API Keys (5 min)

**Telegram Bot Token:**
1. Open Telegram and search for [@BotFather](https://t.me/botfather)
2. Send `/newbot`
3. Follow prompts to create a bot
4. Copy the token (looks like: `123456789:ABCDefGhIjKlMnOpQrStUvWxYz...`)

**Google Gemini API Key:**
1. Go to [Google AI Studio](https://aistudio.google.com)
2. Sign in with your Google account
3. Click "Get API Key" → "Create API key in new project"
4. Copy the key

### Step 2: Update .env

```bash
# Edit your .env file
nano .env
```

Add:
```env
TELEGRAM_BOT_TOKEN=your_token_from_botfather
GEMINI_API_KEY=your_key_from_google_ai_studio
```

### Step 3: Install Dependencies

```bash
bash install-milestone2.sh
```

### Step 4: Run the Bot

```bash
node src/index.js
```

### Step 5: Test the Bot

Open Telegram and find your new bot by name. Send:
```
/start
```

You should see the greeting message!

---

## File Structure Created

```
src/
├── agent/
│   └── brain.js              ← Animo Brain (Gemini 2.0)
├── database/
│   └── init.js               ← SQLite schema
├── bot.js                    ← Telegram bot main logic
└── index.js                  ← Entry point

files created:
├── .env.example              ← Copy this to .env
├── install-milestone2.sh     ← Run this to install deps
├── MILESTONE2.md             ← Full documentation
└── this file                 ← QUICKSTART.md
```

---

## What Each File Does

| File | Purpose |
|------|---------|
| `src/agent/brain.js` | Analyzes mood (1-5), suggests habits via Gemini 2.0 |
| `src/bot.js` | Telegram bot logic (morning nudge, evening audit) |
| `src/database/init.js` | SQLite setup & user/mood/streak tracking |
| `src/index.js` | Starts everything (brain + bot + db) |

---

## Core Features

✅ **Morning Nudge**
- "GM [Name]. How is the energy today (1-5)?"
- User rates mood
- Brain suggests habit based on mood

✅ **Mood-Based Habit Mapping**
- Low mood (1-2) → Spirit 🪷 or Mind 🧠
- High mood (4-5) → Fitness 💪 or Work 💻

✅ **Evening Audit**
- "Did you conquer your [Habit]?"
- Celebrates wins or normalizes misses
- Updates streak in database

✅ **Database Tracking**
- User mood history
- Current streak count
- Habit completion rate
- Daily summary stats

---

## Testing Checklist

- [ ] Bot responds to `/start`
- [ ] Bot asks for morning mood
- [ ] User can enter 1-5
- [ ] Bot sends personalized coaching
- [ ] Evening audit flow works
- [ ] Streak increments on completion
- [ ] Data persists in `./data/myday.db`

---

## Environment Variables Reference

```env
# Required
TELEGRAM_BOT_TOKEN=your_token

# Required
GEMINI_API_KEY=your_key

# Optional (defaults shown)
DB_TYPE=sqlite
DB_PATH=./data/myday.db
NODE_ENV=development
PORT=3000

# Future (Supabase)
# SUPABASE_URL=...
# SUPABASE_KEY=...
```

---

## Next: Integrate with Milestone 1

Once Milestone 2 is working, you can integrate with Milestone 1 (Celo Identity Registry):

In `src/bot.js`, add habit staking logic:
```javascript
// TODO: Call serializeAndRegisterStake() to lock CELO on Celo blockchain
const { createAgent } = require('../scripts/register-agent');

// When user confirms habit:
await createAgent(userId, habitName, amountInCELO);
```

---

## Troubleshooting

**"Missing environment variables"**
```bash
# Make sure .env exists and has your API keys
cp .env.example .env
nano .env
```

**"Cannot find module '@google/generative-ai'"**
```bash
# Reinstall dependencies
bash install-milestone2.sh
```

**"Bot not responding to messages"**
- Verify bot token is correct in `.env`
- Make sure bot has polling enabled
- Check Telegram: search for your bot by name and send `/start`

**"Database error"**
```bash
# Create data directory if it doesn't exist
mkdir -p data
```

---

## Success! 🎉

Your Animo Brain is now live. Users can:
- ✓ Check in with daily mood
- ✓ Get personalized habit suggestions
- ✓ Track streaks and progress
- ✓ Receive empathetic coaching

Ready to move to production? See `MILESTONE2.md` for advanced setup.
