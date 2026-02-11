# Milestone 2 - Agentic Architecture & Live Deployment

## 🎯 Architecture Overview

MyDay Agent implements **Subagent-Driven Development** with clear separation of concerns:

```
┌─────────────────────────────────────────────────────────────┐
│                    TELEGRAM BOT LAYER                       │
│         (Frontend-Design Compliant Flow Control)            │
└─────────────────────────────────────────────────────────────┘
                              ↓
          ┌─────────────────────────────────────┐
          │    🧠 COACHING BRAIN (Animo)        │
          │  - Mood Analysis (1-5)              │
          │  - Habit Suggestions                │
          │  - High-Stake Celebration           │
          │  - Evening Audits                   │
          │                                     │
          │  Module: src/agent/brain.js         │
          └─────────────────────────────────────┘
                              ↓
          ┌─────────────────────────────────────┐
          │   💾 DATABASE LAYER (SQLite)        │
          │  - mood_logs (mood_score)           │
          │  - habit_stakes (habit_name, amt)   │
          │  - streaks (current, longest)       │
          │  - daily_summary                    │
          │                                     │
          │  Module: src/database/init.js       │
          └─────────────────────────────────────┘
                              ↓
          ┌─────────────────────────────────────┐
          │  ⛓️ BLOCKCHAIN EXECUTOR (Future)    │
          │  - Stake Transactions (M3)          │
          │  - Settlement Logic (M3)            │
          │  - Contract Interactions (M3)       │
          │                                     │
          │  Module: src/blockchain/executor.js │
          └─────────────────────────────────────┘
```

---

## 🔄 Frontend-Design: User Interaction Flow

### Step 1: Energy Check (Proactive)
```
Bot: "On a scale of 1-5, what's your discipline energy?"
User: "4"
```
**Flow State:** `energy_check`  
**Database Update:** `mood_logs` (mood_score=4)

---

### Step 2: Habit Suggestion (Coaching Brain)
```
Animo Brain analyzes:
  Input: mood=4, userName, user_habits
  Output: suggestion = {
    mood: 4,
    moodCategory: 'high',
    suggestedHabits: ['Fitness', 'Work'],
    emoji: ['💪', '💻'],
    coaching: "You're energized! Let's channel this..."
  }
```
**Module Called:** `AnimoBrain.analyzeMoodAndSuggest()`

---

### Step 3: Stake Recommendation
```
Bot: "Habit: 💪 Fitness"
Bot: "Suggested Stake: 2 CELO (Bold commitment)"
Bot: "How much CELO will you stake?"
User: "3"  ← Custom amount (higher than recommendation)
```

**Flow State:** `awaiting_amount`  
**Celebration:** If 3 > 2, trigger `celebrateHighStake()`  
**Celebration Output:** "You're committing 50% more. THIS is the energy!"

---

### Step 4: Final Confirmation
```
Bot: "Habit: 💪 Fitness | Amount: 3 CELO | Confirm? YES/NO"
User: "YES"
```

**Flow State:** `awaiting_confirmation`  
**Database Update:** `habit_stakes` (habit_name='Fitness', total_staked=3)

---

### Step 5: Blockchain Handoff (Milestone 3)
```
Bot: "🚀 Stake Locked! Now entering Blockchain Phase...
     3 CELO ready for smart contract execution
     Evening: Complete your habit to unlock earnings!"
```

**Module Ready:** `BlockchainExecutor.executeStake()`  
**Status:** Stored and ready for on-chain execution

---

## 📊 Database Schema (SQLite)

### mood_logs
| Field | Type | Purpose |
|-------|------|---------|
| id | INTEGER PK | Unique ID |
| user_id | INTEGER FK | User reference |
| mood_score | INTEGER | 1-5 daily energy |
| logged_at | DATETIME | Timestamp |

### habit_stakes
| Field | Type | Purpose |
|-------|------|---------|
| id | INTEGER PK | Unique ID |
| user_id | INTEGER FK | User reference |
| habit_name | TEXT | e.g., "Fitness", "Work" |
| emoji | TEXT | e.g., "💪", "💻" |
| total_staked | REAL | **CELO amount** |
| is_completed | BOOLEAN | Completion status |
| staked_date | DATE | When staked |
| completed_date | DATE | When completed |

### streaks
| Field | Type | Purpose |
|-------|------|---------|
| user_id | INTEGER FK | User reference |
| current_streak | INTEGER | Days completed |
| longest_streak | INTEGER | Historical max |
| last_completed_date | DATE | Most recent completion |

### daily_summary
| Field | Type | Purpose |
|-------|------|---------|
| user_id | INTEGER FK | User reference |
| date | DATE | Day summary |
| mood_score | INTEGER | That day's energy |
| habits_completed | INTEGER | Count |
| total_earned | REAL | **CELO earned** |

---

## 🧠 Coaching Brain Methods

### `analyzeMoodAndSuggest(mood, userName, userStreaks)`
- **Input:** Mood score (1-5), user name, habit history
- **Output:** Coaching response + habit suggestions + emoji
- **Mood Mapping:**
  - 1-2 (Low): Spirit 🪷, Mind 🧠
  - 4-5 (High): Fitness 💪, Work 💻
- **Uses:** Gemini 2.0 for personalized empathetic responses

### `celebrateHighStake(userName, habit, customAmount, recommendedAmount)`
- **Trigger:** When user stakes > recommendation
- **Output:** Motivational celebration text
- **Example:** "Holy 🔥! 50% above suggestion. THIS is the energy of winners!"

### `generateEveningAudit(userName, habit, completed)`
- **Trigger:** Evening check-in
- **Output:** Non-judgmental reflection
- **Completed:** "🎉 You crushed it! Streak grows!"
- **Missed:** "💙 Every attempt counts. Try again tomorrow!"

---

## 🗄️ Database Helper Methods

### `getTodayStake(telegramUserId)`
Returns today's active stake (habit name, emoji, amount)

### `getRecentMoodHistory(telegramUserId, days=7)`
Returns mood scores for past N days (for trend analysis)

### `getCompletionRate(telegramUserId)`
Returns: total_stakes, completed_stakes, completion_rate %

### `recordStake(telegramUserId, stakeData)`
Stores: habitName, habitEmoji, moodScore, recommendedAmount, finalAmount

---

## ⛓️ Blockchain Executor (Milestone 3 Preview)

```javascript
const executor = new BlockchainExecutor(
  rpcUrl,         // Celo RPC endpoint
  privateKey,     // Agent wallet private key
  registryAddress // Stake registry contract
);

// When user confirms stake:
await executor.executeStake('Fitness', 3); // Lock 3 CELO

// When user completes habit (evening):
await executor.settleStake(stakeId, true); // Unlock + settle earnings
```

---

## 🚀 Live Deployment Checklist

✅ **Environment Setup**
- [ ] `.env` file with TELEGRAM_BOT_TOKEN and GEMINI_API_KEY
- [ ] RPC_URL for Celo (optional, for Milestone 3)
- [ ] PRIVATE_KEY for blockchain operations (optional, for Milestone 3)

✅ **Database Ready**
- [ ] `./data/myday.db` created on first run
- [ ] All tables initialized with proper schema
- [ ] Foreign keys enforced

✅ **Bot Modules**
- [ ] `src/agent/brain.js` - Coaching engine
- [ ] `src/bot.js` - Telegram interface + flow control
- [ ] `src/database/init.js` - SQLite persistence
- [ ] `src/blockchain/executor.js` - On-chain preparation

✅ **Dependencies**
- [ ] `node-telegram-bot-api` - Telegram API
- [ ] `@google/generative-ai` - Gemini 2.0
- [ ] `sqlite3` - Database
- [ ] `ethers` - Blockchain (for Milestone 3)

---

## 🎮 Testing the Bot

```bash
# 1. Start the bot
node src/index.js

# 2. In Telegram, find your bot and send:
/start

# 3. Follow the flow:
#    Energy: 4
#    Stake: 2.5
#    Confirm: YES

# 4. Database persists in:
./data/myday.db
```

---

## 📈 Metrics Tracked

| Metric | Purpose |
|--------|---------|
| Daily mood score | Energy trend analysis |
| Habit completion | Behavioral tracking |
| Streak count | Motivation reinforcement |
| Total CELO staked | Financial commitment signal |
| Earnings (M3) | Reward distribution |

---

## 🔮 Milestone 3 Integration

When Milestone 3 launches:
1. Blockchain Executor auto-locks CELO in smart contract
2. Settlement logic enforces habit completion
3. Earnings routed back to user wallet
4. All data flows through same DB schema

**No changes needed to Milestone 2 code** - architecture is ready! 🎯

---

## 📝 Architecture Principles

1. **Subagent-Driven:** Coaching and Execution are separate modules
2. **Frontend-Design:** Clear, progressive user flow (4 steps)
3. **Database-Centric:** All state persisted for auditability
4. **Blockchain-Ready:** Executor module prepared for M3 integration
5. **Empathy-First:** Coaching prioritizes human connection over metrics

---

**Status:** ✅ Milestone 2 LIVE  
**Next:** Milestone 3 - Blockchain Execution  
**Deployment:** Ready for production on Celo testnet
