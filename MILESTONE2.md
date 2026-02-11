# Milestone 2: The Animo Brain 🧠

## Overview

The Animo Brain is a proactive coaching loop that combines:
- **Mood Analysis** via Gemini 2.0 
- **Personalized Habit Coaching** based on user energy levels
- **Telegram Bot Integration** for morning nudges and evening audits
- **Local Database** (SQLite) for tracking mood, streaks, and stakes

**Philosophy:** Empathy > Numbers

---

## Architecture

```
src/
├── agent/
│   └── brain.js          # Gemini 2.0 integration for mood analysis
├── bot.js                # Telegram bot with nudge/audit flow
├── database/
│   └── init.js           # SQLite schema & database operations
└── index.js              # Main entry point
```

### 1. **Animo Brain** (`src/agent/brain.js`)

Analyzes user mood and generates empathetic coaching responses.

**Key Methods:**
- `analyzeMoodAndSuggest(mood, userName, userStreaks)` - Analyzes mood (1-5) and suggests habits
- `generateEveningAudit(userName, habit, completed)` - Non-judgmental evening reflection

**Mood → Habit Mapping:**
- **Mood 1-2 (Low):** Spirit 🪷 or Mind 🧠 (restorative habits)
- **Mood 4-5 (High):** Fitness 💪 or Work 💻 (high-stakes challenges)

### 2. **Telegram Bot** (`src/bot.js`)

Implements the daily coaching conversation flow.

**Commands:**
- `/start` - Initialize user
- `/morning` or `GM` - Morning Nudge
- `1-5` - Mood input (triggers coaching)
- `/evening` or `GN` - Evening Audit

**Flow:**
```
Morning:
1. "GM [Name]. How is the energy today (1-5)?"
2. User replies with mood (1-5)
3. Brain suggests habit based on mood
4. User stakes on habit goal

Evening:
1. "Did you conquer your [Habit]?"
2. User confirms completion
3. Brain generates celebration or reset message
4. Streak incremented or reset
```

### 3. **Database** (`src/database/init.js`)

SQLite database with 6 tables:

| Table | Purpose |
|-------|---------|
| `users` | Telegram user profiles |
| `mood_logs` | Daily mood tracking (1-5) |
| `habit_stakes` | Habit goals with completion status |
| `streaks` | Current and longest streaks |
| `daily_summary` | Daily performance summary |
| (Supabase-ready) | Future PostgreSQL migration |

---

## Setup

### Prerequisites
- Node.js 16+
- Telegram Bot Token (from [@BotFather](https://t.me/botfather))
- Google Gemini API Key (from [Google AI Studio](https://aistudio.google.com))

### 1. Install Dependencies

```bash
bash install-milestone2.sh
```

Or manually:
```bash
npm install @google/generative-ai node-telegram-bot-api sqlite3 @supabase/supabase-js
```

### 2. Configure Environment Variables

Copy `.env.example` to `.env` and add your API keys:

```bash
cp .env.example .env
```

Edit `.env`:
```env
TELEGRAM_BOT_TOKEN=your_bot_token_from_botfather
GEMINI_API_KEY=your_gemini_api_key_from_google
DB_TYPE=sqlite
DB_PATH=./data/myday.db
```

### 3. Run the Bot

```bash
node src/index.js
```

Expected output:
```
✓ Connected to SQLite database
✓ MyDay Agent (Milestone 2) is running
  - Morning Nudge: Active
  - Animo Brain: Connected
  - Database: SQLite (data/myday.db)
```

---

## Example Interaction

**User (7 AM):**
```
/start
```

**Bot:**
```
🌟 GM [Name]! I'm Animo, your behavioral finance coach.

I'm here to help you:
• Check in on your daily mood (1-5)
• Suggest meaningful habit stakes based on your energy
• Celebrate your wins and normalize your setbacks

Start your day: What's your mood today? 
(1 = Low Energy, 5 = High Energy)
```

**User:**
```
2
```

**Bot (Animo Brain response):**
```
I see you're feeling low-energy today. That's real, and it's okay. 
Let's focus on something restorative: Your Spirit 🪷 

How about a 10-minute meditation or journaling session? 
Small wins rebuild momentum.

---

*Today's Focus:* 🪷 Spirit

Ready to stake on this? Reply with your habit goal 
(e.g., "10 min meditation" or "journal reflection")
```

**User:**
```
10 min meditation
```

**Bot:**
```
✓ Staked on: 10 min meditation 🪷
Good luck! I'll check in this evening.
```

---

## Future Enhancements

- [ ] Supabase migration for cloud database
- [ ] CELO token staking integration (with Milestone 1 contracts)
- [ ] Scheduling for automatic morning/evening nudges
- [ ] Multi-language support
- [ ] Community leaderboard (anonymized)
- [ ] Web dashboard for analytics
- [ ] Discord integration

---

## Troubleshooting

**Bot not responding:**
- Check `TELEGRAM_BOT_TOKEN` in `.env`
- Verify bot has polling enabled

**Database errors:**
- Ensure `./data/` directory exists
- Check file permissions in working directory

**Gemini API errors:**
- Verify `GEMINI_API_KEY` is valid
- Check API quota in Google AI Studio

---

## Philosophy

> "Empathy > Numbers"

The Animo Brain doesn't shame users for missed habits. Instead, it:
- Acknowledges their emotional state
- Normalizes setbacks as part of growth
- Creates intrinsic motivation through understanding
- Celebrates incremental progress

---

## References

- [Gemini 2.0 API](https://ai.google.dev/)
- [node-telegram-bot-api](https://github.com/yagop/node-telegram-bot-api)
- [SQLite with Node.js](https://github.com/mapbox/node-sqlite3)
- [Supabase JavaScript Client](https://supabase.com/docs/reference/javascript)
