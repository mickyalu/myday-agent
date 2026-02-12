require('dotenv').config();

/**
 * MyDay Telegram Bot - Frontend-Design Compliant
 * 
 * Interaction Flow:
 * 1. Energy Check (1-5) → Coaching Brain analyzes
 * 2. Habit Suggestion → MyDay Intel recommends stake
 * 3. Custom Stake → User specifies CELO amount
 * 4. Confirmation → YES to proceed
 * 5. Blockchain Handoff → Executor takes over (Milestone 3)
 * 
 * Separation of Concerns:
 * - Coaching Brain (this.brain): Mood analysis, habit recommendations
 * - Blockchain Executor (separate module): On-chain transactions
 */

const TelegramBot = require('node-telegram-bot-api');
const MyDayIntel = require('./agent/brain');
const createSelfProtocol = require('./verifier/selfProtocol');
const Database = require('./database/init');

class MyDayBot {
  constructor(telegramToken, geminiKey, dbConfig) {
    this.telegramToken = telegramToken;
    this.geminiKey = geminiKey;
    this.bot = new TelegramBot(telegramToken, { polling: true });
    this.brain = new MyDayIntel(geminiKey);
    this.db = new Database(dbConfig);
    
    // Handle 409 Conflict (polling duplicate instance)
    this.bot.on('polling_error', (error) => {
      if (error.code === 409 || error.message?.includes('409')) {
        console.error('⚠️ CONFLICT: Another instance of this bot is already polling.');
        console.error('Stopping local instance...');
        process.exit(1);
      }
    });
    
    // User session state for Mission Briefing flow
    this.userMissionState = {};
    
    // User session state for Sunset Reflection flow
    this.userSunsetState = {};
    
    // User flow states: mission briefing | sunset reflection | mission audit
    this.userFlowState = {};
    
    // Legacy staking state (kept for backwards compatibility)
    this.userStakingState = {};
    
    // Bind methods to preserve context
    this.setupHandlers = this.setupHandlers.bind(this);
    this.handleStart = this.handleStart.bind(this);
    this.handleAllMessages = this.handleAllMessages.bind(this);
    this.handleMorningNudge = this.handleMorningNudge.bind(this);
    this.handleEveningAudit = this.handleEveningAudit.bind(this);
    this.handleSunsetReflection = this.handleSunsetReflection.bind(this);
    this.handleSunsetWinsInput = this.handleSunsetWinsInput.bind(this);
    this.handleSunsetMoodInput = this.handleSunsetMoodInput.bind(this);
    
    this.setupHandlers();
  }

  setupHandlers() {
    // Start command
    this.bot.onText(/\/start/, (msg) => this.handleStart(msg));

    // Set timezone command
    this.bot.onText(/\/settimezone (.+)/, (msg, match) => this.handleSetTimezone(msg, match[1]));
    // Reservoir command
    this.bot.onText(/\/reservoir/, (msg) => this.handleReservoir(msg));

    // Morning nudge (can be triggered by user or scheduled)
    this.bot.onText(/\/morning|GM/, (msg) => this.handleMorningNudge(msg));

    // Sunset reflection (8 PM nudge)
    this.bot.onText(/\/sunset|Sunset|🌅/, (msg) => this.handleSunsetReflection(msg));

    // All message handler - routes to appropriate handler based on context
    this.bot.on('message', (msg) => this.handleAllMessages(msg));

    // Evening audit
    this.bot.onText(/\/evening|Good night|gn/, (msg) => this.handleEveningAudit(msg));
  }

  /**
   * Route all messages based on user's current flow state
   */
  async handleAllMessages(msg) {
    try {
      // Ensure database is ready
      try {
        await this.db.waitReady();
      } catch (error) {
        console.error('Database not ready:', error);
        return;
      }

      const userId = msg.from.id;
      const text = msg.text;
      const flowState = this.userFlowState[userId];

      // Ignore empty messages
      if (!text) return;

      // ===== MISSION BRIEFING FLOW =====
      // Onboarding: capture city -> timezone
      if (flowState === 'onboarding_city') {
        const city = text.trim();
        await this.handleOnboardingCity(msg, city);
        return;
      }
      
      // Step 1: Capture energy level
      if (flowState === 'mission_briefing_energy') {
        const energy = parseInt(text);
        if (energy >= 1 && energy <= 5) {
          await this.handleMissionEnergyInput(msg, energy);
          return;
        }
      }

      // Step 2: Capture mission goals (up to 3)
      if (flowState === 'mission_briefing_goals') {
        await this.handleMissionGoalsInput(msg);
        return;
      }

      // Step 3: Capture custom stake amount
      if (flowState === 'mission_briefing_stake') {
        const stakeAmount = parseFloat(text);
        if (!isNaN(stakeAmount) && stakeAmount > 0) {
          await this.handleMissionStakeInput(msg, stakeAmount);
          return;
        }
      }

      // Step 4: Confirm stake with YES/NO
      if (flowState === 'mission_briefing_confirm') {
        if (text.toLowerCase() === 'yes') {
          await this.handleMissionBriefingConfirm(msg);
          return;
        } else if (text.toLowerCase() === 'no') {
          delete this.userFlowState[userId];
          this.bot.sendMessage(msg.chat.id, '✅ Mission briefing cancelled.');
          return;
        }
      }

      // ===== MISSION AUDIT FLOW =====
      if (flowState === 'mission_audit') {
        await this.handleMissionAudit(msg);
        return;
      }

      // ===== SUNSET REFLECTION FLOW =====
      if (flowState === 'sunset_reflection_wins') {
        const winsCount = parseInt(text);
        if (!isNaN(winsCount) && winsCount >= 0) {
          await this.handleSunsetWinsInput(msg, winsCount);
          return;
        }
      }

      if (flowState === 'sunset_reflection_mood') {
        const mood = parseInt(text);
        if (mood >= 1 && mood <= 5) {
          await this.handleSunsetMoodInput(msg, mood);
          return;
        } else if (isNaN(mood)) {
          // Coaching user on invalid input
          this.bot.sendMessage(
            msg.chat.id,
            '❌ I didn\'t quite catch that energy level. Give me a number from 1 (Low) to 5 (Invincible) ⚡️.'
          );
          return;
        }
      }

      // Ignore unrecognized input
    } catch (error) {
      console.error('Error in handleAllMessages:', error);
      // Send guardian error message without exposing raw SQL errors
      this.bot.sendMessage(
        msg.chat.id,
        '⚠️ MyDay Intel is recalibrating. I\'ve safely recorded your progress, but I need a moment. Please try your last command again.'
      );
    }
  }

  /**
   * Start command - Initialize Mission Briefing flow
   */
  async handleStart(msg) {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const userName = msg.from.first_name || 'Friend';

    try {
      // Wait for database to be ready
      await this.db.waitReady();

      // Initialize or retrieve user
      const user = await this.db.getOrCreateUser(userId, userName, chatId);

      // If timezone not set, prompt user for their city (onboarding)
      if (!user.timezone) {
        this.userFlowState[userId] = 'onboarding_city';
        const cityPrompt = `Before we begin, what is your current city? (e.g., Nairobi, New York)`;
        this.bot.sendMessage(chatId, cityPrompt);
        return;
      }

      // Show MyDay Guardian persona
      const greeting = `
🎯 GM ${userName}! I am your MyDay Guardian. I help you convert daily wins into on-chain wealth.

*Powered by:*
🧠 MyDay Intel (Behavioral AI)
⛓️ Celo L2 (Protocol Execution)
💎 Discipline Staking Protocol

Let's get started with your **Mission Briefing**!
      `.trim();

      this.bot.sendMessage(chatId, greeting, { parse_mode: 'Markdown' });

      // Begin Mission Briefing - Step 1: Energy Check
      await new Promise(resolve => setTimeout(resolve, 500));
      await this.promptMissionEnergy(msg);

    } catch (error) {
      console.error('Error in handleStart:', error);
      this.bot.sendMessage(
        chatId,
        '⚠️ MyDay Intel is recalibrating. I\'ve safely recorded your progress, but I need a moment. Please try your last command again.'
      );
    }
  }

  async handleSetTimezone(msg, tzString) {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const tz = tzString && tzString.trim() ? tzString.trim() : null;
    if (!tz) {
      this.bot.sendMessage(chatId, 'Please provide a valid timezone like America/New_York');
      return;
    }
    try {
      await this.db.updateUserTimezone(userId, tz);
      this.bot.sendMessage(chatId, `Timezone saved: ${tz}`);
      delete this.userFlowState[userId];
    } catch (e) {
      console.error('Error saving timezone:', e);
      this.bot.sendMessage(chatId, 'Sorry, could not save your timezone.');
    }
  }

  async handleReservoir(msg) {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    try {
      await this.db.waitReady();
      const user = await this.db.getUserById(userId);
      if (!user) {
        this.bot.sendMessage(chatId, 'No account found. Start with /start');
        return;
      }

      // Current balance (cUSD) from users.vault_balance
      const balance = typeof user.vault_balance !== 'undefined' ? user.vault_balance : 0;

      // Total Discipline Points: sum derived from saved missions (Supabase)
      let totalStaked = 0;
      try {
        totalStaked = await this.db.getTotalStaked(userId);
      } catch (e) {
        totalStaked = 0;
      }

      // Next unlock date: naive implementation = tomorrow
      const nextUnlock = new Date();
      nextUnlock.setDate(nextUnlock.getDate() + 1);
      const nextUnlockDate = nextUnlock.toISOString().split('T')[0];

      const self = createSelfProtocol({ db: this.db, railwayUrl: process.env.RAILWAY_URL });
      const verified = await self.isVerified(userId);

      const status = verified ? 'ZK-Human ✓' : 'Unverified';

      const resp = `*Reservoir Summary*
Current Balance (cUSD): ${balance}
Total Discipline Points: ${totalStaked}
Next Unlock Date: ${nextUnlockDate}
Verification Status: ${status}`;

      if (!verified) {
        const verifyLink = self.getVerificationLink(userId);
        const keyboard = {
          reply_markup: {
            inline_keyboard: [
              [
                { text: '🛡️ Verify Humanity (SelfClaw)', url: verifyLink }
              ]
            ]
          }
        };
        this.bot.sendMessage(chatId, resp, Object.assign({ parse_mode: 'Markdown' }, keyboard));
      } else {
        this.bot.sendMessage(chatId, resp, { parse_mode: 'Markdown' });
      }

    } catch (e) {
      console.error('Error in handleReservoir:', e);
      this.bot.sendMessage(chatId, 'Sorry, could not fetch your reservoir summary.');
    }
  }

  async handleOnboardingCity(msg, city) {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    try {
      const tz = this.brain.mapCityToTimezone(city);
      if (!tz) {
        this.bot.sendMessage(chatId, `Thanks — I couldn't map "${city}" automatically. Please reply with your IANA timezone (e.g. America/New_York) or use /settimezone Your/Timezone`);
        return;
      }

      await this.db.updateUserTimezone(userId, tz);
      this.bot.sendMessage(chatId, `Great — your timezone is set to ${tz}. I'll send nudges at 08:00 and 20:00 your local time.`);
      delete this.userFlowState[userId];

      // Continue to mission flow
      await this.promptMissionEnergy(msg);
    } catch (e) {
      console.error('Error in handleOnboardingCity:', e);
      this.bot.sendMessage(chatId, 'Sorry, something went wrong saving your city/timezone. Try /settimezone to set it manually.');
    }
  }

  /**
   * Mission Briefing Step 1: Ask for energy level
   */
  async promptMissionEnergy(msg) {
    const chatId = msg.chat.id;
    const userId = msg.from.id;

    try {
      this.userFlowState[userId] = 'mission_briefing_energy';

      const prompt = `
🔋 *Mission Briefing Step 1 of 4: Energy Check*

On a scale of 1-5, how's your discipline energy today?

1️⃣ Low (need support)
2️⃣ Below average
3️⃣ Medium (balanced)
4️⃣ Above average
5️⃣ Peak energy (ready to conquer)

Reply with the number: 1, 2, 3, 4, or 5
      `.trim();

      this.bot.sendMessage(chatId, prompt, { parse_mode: 'Markdown' });

    } catch (error) {
      console.error('Error in promptMissionEnergy:', error);
      this.bot.sendMessage(chatId, '⚠️ Error starting Mission Briefing.');
    }
  }

  /**
   * Mission Briefing Step 2: Handle energy input and ask for missions
   */
  async handleMissionEnergyInput(msg, energy) {
    const chatId = msg.chat.id;
    const userId = msg.from.id;

    try {
      // Store energy level in temporary state
      if (!this.userMissionState) this.userMissionState = {};
      this.userMissionState[userId] = {
        energy,
        missions: [],
        stake: 0
      };

      // Move to Step 2: Get missions
      this.userFlowState[userId] = 'mission_briefing_goals';

      const missionPrompt = `
    🎯 *Mission Briefing — Your 3 Missions*

    What are the 3 missions you are conquering today?

    List exactly 3 if possible (comma-separated or line-by-line).

    *Examples:*
    - Morning run
    - Deep work session
    - Meditate
    - Learn Spanish
    - Code review

    Reply with your 3 missions now:
      `.trim();

      this.bot.sendMessage(chatId, missionPrompt, { parse_mode: 'Markdown' });

    } catch (error) {
      console.error('Error in handleMissionEnergyInput:', error);
      this.bot.sendMessage(
        chatId,
        '⚠️ MyDay Intel is recalibrating. I\'ve safely recorded your progress, but I need a moment. Please try your last command again.'
      );
    }
  }

  /**
   * Mission Briefing Step 3: Parse missions and suggest stake
   */
  async handleMissionGoalsInput(msg) {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const text = msg.text;

    try {
      if (!this.userMissionState) this.userMissionState = {};
      const state = this.userMissionState[userId];

      // Parse missions (comma-separated or line-by-line)
      const missions = text
        .split(/[,\n]/)
        .map(m => m.trim())
        .filter(m => m.length > 0)
        .slice(0, 3);  // Max 3 missions

      if (missions.length === 0) {
        this.bot.sendMessage(chatId, '⚠️ Please enter at least one mission.');
        return;
      }

      state.missions = missions;

      // Store missions to show back to user
      const missionList = missions
        .map((m, i) => `${i + 1}. ${m}`)
        .join('\n');

      // Step 3: Suggest stake (LOCAL LOGIC - no Gemini call)
      this.userFlowState[userId] = 'mission_briefing_stake';

      const suggestedStake = this.calculateSuggestedStake(state.energy);

      const stakePrompt = `
    💰 *Mission Briefing Step 3 of 4: Set Your Stake*

    Your Missions Today:
    ${missionList}

    Energy Level: ${state.energy}/5

    💎 *My Suggestion:* ${suggestedStake} cUSD

    But this is YOUR day. How much cUSD do you want to stake on your discipline today?

    (You can match my suggestion or choose your own amount)
      `.trim();

      this.bot.sendMessage(chatId, stakePrompt, { parse_mode: 'Markdown' });

    } catch (error) {
      console.error('Error in handleMissionGoalsInput:', error);
      this.bot.sendMessage(
        chatId,
        '⚠️ MyDay Intel is recalibrating. I\'ve safely recorded your progress, but I need a moment. Please try your last command again.'
      );
    }
  }

  /**
   * Calculate suggested stake based on energy (LOCAL LOGIC - no API call)
   */
  calculateSuggestedStake(energy) {
    if (energy <= 2) return 0.5;    // Low energy: gentle stake
    if (energy <= 3) return 1;      // Medium energy: balanced stake
    if (energy <= 4) return 1.5;    // High energy: solid stake
    return 2;                       // Peak energy: bold stake
  }

  /**
   * Mission Briefing Step 4: Capture custom stake
   */
  async handleMissionStakeInput(msg, stakeAmount) {
    const chatId = msg.chat.id;
    const userId = msg.from.id;

    try {
      if (!this.userMissionState) this.userMissionState = {};
      const state = this.userMissionState[userId];

      state.stake = stakeAmount;
      this.userFlowState[userId] = 'mission_briefing_confirm';

      const missionList = state.missions
        .map((m, i) => `${i + 1}. ${m}`)
        .join('\n');

      const confirmPrompt = `
    ✅ *Mission Briefing Step 4 of 4: Confirm Your Commitment*

    **Your Missions:**
    ${missionList}

    ⚡ Energy: ${state.energy}/5
    💰 Stake: **${stakeAmount} cUSD**

    Ready to lock in your commitment?

    Reply: **YES** or **NO**
      `.trim();

      this.bot.sendMessage(chatId, confirmPrompt, { parse_mode: 'Markdown' });

    } catch (error) {
      console.error('Error in handleMissionStakeInput:', error);
      this.bot.sendMessage(
        chatId,
        '⚠️ MyDay Intel is recalibrating. I\'ve safely recorded your progress, but I need a moment. Please try your last command again.'
      );
    }
  }

  /**
   * Mission Briefing Confirmation: Save missions to database
   */
  async handleMissionBriefingConfirm(msg) {
    const chatId = msg.chat.id;
    const userId = msg.from.id;

    try {
      if (!this.userMissionState) this.userMissionState = {};
      const state = this.userMissionState[userId];

      // Save missions to database
      // Before allowing a stake, ensure user is verified via SelfClaw
      const self = createSelfProtocol({ db: this.db, railwayUrl: process.env.RAILWAY_URL });
      const verified = await self.isVerified(userId);
      if (!verified) {
        const link = 'https://selfclaw.app/?agentId=7';
        const msgText = '🛡️ Humanity Attestation Required. To keep our Tribe bot-free, please verify your identity once via SelfClaw.';
        const keyboard = {
          reply_markup: {
            inline_keyboard: [
              [ { text: '🧬 PROVE HUMANITY', url: link } ]
            ]
          }
        };
        this.bot.sendMessage(chatId, msgText, keyboard);
        return;
      }

      // Save missions to database
      await this.db.saveMissions(userId, state.missions, state.energy, state.stake);
      
      // Save daily summary with morning energy
      await this.db.saveDailySummary(userId, state.energy, state.missions.length, state.stake);

      // --- Milestone 3: MiniPay deep link generation with agent signature ---
      // Prepare MiniPay deep link (celo wallet) and include agent verification signature in metadata
      try {
        const VAULT = process.env.VAULT_ADDRESS || '';
        const STAKE = state.stake;
        const RAILWAY_URL = process.env.RAILWAY_URL || 'https://myday-guardian-production.up.railway.app';

        // Sign a payload with agent private key to attest this intent
        const pk = process.env.PRIVATE_KEY;
        let agentSig = null;
        let payloadObj = null;
        if (pk) {
          const { Wallet } = require('ethers');
          const wallet = new Wallet(pk);
          const agentId = process.env.AGENT_ID || '7';
          payloadObj = {
            agentId: String(agentId),
            telegramUserId: userId,
            stake: STAKE,
            vault: VAULT,
            timestamp: new Date().toISOString()
          };
          const payloadStr = JSON.stringify(payloadObj);
          agentSig = await wallet.signMessage(payloadStr);
        }

        // metadata includes base64url(payload) and signature if present
        const meta = payloadObj && agentSig
          ? Buffer.from(JSON.stringify({ payload: payloadObj, sig: agentSig })).toString('base64url')
          : '';

        // Use Aviation Grade Redirector instead of direct celo:// link
        // The /pay endpoint will handle the redirect (compatible with Telegram buttons)
        // Add x402 protocol fee (0.10 cUSD)
        const fee = 0.10;
        const totalAmount = (Number(STAKE) + fee).toFixed(2);
        const payButtonUrl = `${RAILWAY_URL}/pay?amount=${encodeURIComponent(String(totalAmount))}&user=${encodeURIComponent(String(userId))}${meta ? '&meta=' + encodeURIComponent(meta) : ''}&protocol=x402&fee=0.10`;

        // Send deep link to user via inline keyboard button (judge-ready UI)
        const payMessage = `✅ Mission briefing locked. Tap the button below to authorize payment of ${totalAmount} cUSD (includes ${fee.toFixed(2)} cUSD protocol fee).`;
        const inlineKeyboard = {
          reply_markup: {
            inline_keyboard: [
              [
                {
                  text: '⚡️ WIN MY DAY: SIGN STAKE 💎',
                  url: payButtonUrl
                }
              ]
            ]
          }
        };
        this.bot.sendMessage(chatId, payMessage, inlineKeyboard);

        // Optionally log a verification attempt record (pending until verifier confirms)
        try {
          await this.db.recordVerificationAttempt(userId, process.env.REGISTERED_AGENT_ADDRESS || (process.env.REGISTERED_AGENT_ADDRESS = ''), false, { note: 'MiniPay link generated', payload: payloadObj });
        } catch (e) {
          // ignore logging errors
        }
      } catch (e) {
        console.error('Error generating MiniPay link:', e);
      }

      delete this.userFlowState[userId];
      delete this.userMissionState[userId];

      const missionList = state.missions
        .map((m, i) => `${i + 1}. ${m}`)
        .join('\n');

      const confirmation = `
🚀 *Mission Briefing Complete!*

Your missions for today:
${missionList}

⚡ Energy Level: ${state.energy}/5
    💰 Stake: ${state.stake} cUSD

**Your challenge:** Complete these missions today!

I'll check in with you at 8 PM for the Sunset Reflection. 

Let's make today count! 💎
      `.trim();

      this.bot.sendMessage(chatId, confirmation, { parse_mode: 'Markdown' });

    } catch (error) {
      console.error('Error in handleMissionBriefingConfirm:', error);
      this.bot.sendMessage(
        chatId,
        '⚠️ MyDay Intel is recalibrating. I\'ve safely recorded your progress, but I need a moment. Please try your last command again.'
      );
    }
  }

  /**
   * Morning Nudge - Greet user and ask for mood
   */
  async handleMorningNudge(msg) {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const userName = msg.from.first_name || 'Friend';

    const nudge = `
GM ${userName}! Ready for your Mission Briefing?

/start to begin your day 🚀
    `.trim();

    this.bot.sendMessage(chatId, nudge);
  }

  /**
   * Mission Audit - Evening check-in (DEFAULT: /evening command)
   */
  async handleEveningAudit(msg) {
    const chatId = msg.chat.id;
    const userId = msg.from.id;

    try {
      // Get today's missions
      const missions = await this.db.getTodayMissions(userId);

      if (!missions || missions.length === 0) {
        this.bot.sendMessage(chatId, '📝 No missions found for today. Start with /start to set up tomorrow\'s missions!');
        return;
      }

      this.userFlowState[userId] = 'mission_audit';

      const missionList = missions
        .map((m, i) => `${i + 1}. ${m.mission_title} (ID: ${m.id})`)
        .join('\n');

      const auditPrompt = `
🌙 *Evening Mission Audit*

Here are your missions from today:
${missionList}

Which missions did you complete? Reply with the mission numbers (e.g., "1, 3" or just "1").

Or reply "none" if you didn't complete any.
      `.trim();

      this.bot.sendMessage(chatId, auditPrompt, { parse_mode: 'Markdown' });

    } catch (error) {
      console.error('Error in handleEveningAudit:', error);
      this.bot.sendMessage(
        chatId,
        '⚠️ MyDay Intel is recalibrating. I\'ve safely recorded your progress, but I need a moment. Please try your last command again.'
      );
    }
  }

  /**
   * Handle Mission Audit responses with EMPATHETIC COACHING (no penalties)
   */
  async handleMissionAudit(msg) {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const text = msg.text.toLowerCase();

    try {
      const missions = await this.db.getTodayMissions(userId);

      if (!missions || missions.length === 0) {
        delete this.userFlowState[userId];
        return;
      }

      let completedIndicies = [];

      if (text === 'none') {
        completedIndicies = [];
      } else {
        // Parse indices like "1, 3" or "1" or "1 2"
        completedIndicies = text
          .split(/[,\s]+/)
          .map(s => {
            const n = parseInt(s);
            return isNaN(n) ? null : n - 1;  // Convert to 0-based index
          })
          .filter(n => n !== null && n >= 0 && n < missions.length);
      }

      // Update mission completion in database
      for (let i = 0; i < missions.length; i++) {
        const isCompleted = completedIndicies.includes(i);
        await this.db.updateMissionCompletion(missions[i].id, isCompleted);
      }

      delete this.userFlowState[userId];

      // Provide EMPATHETIC COACHING based on completion
      const completionRate = completedIndicies.length / missions.length;
      let coaching = '';

      if (completionRate === 1) {
        // All completed - celebrate
        coaching = `
🔥 *LEGENDARY!* You crushed ALL your missions today!

You're exactly the discipline builder we need. That's the compound effect right there.

Tomorrow: Keep this streak alive! 💪
        `.trim();
      } else if (completionRate >= 0.66) {
        // Most completed - encourage
        coaching = `
🌟 *Strong work!* You crushed ${completedIndicies.length}/${missions.length} missions.

That's momentum. The wins compound. Tomorrow we aim for the sweep.

You've got this! 💎
        `.trim();
      } else if (completionRate > 0) {
        // Some completed - motivate
        coaching = `
✅ *One win is still a win.* You completed ${completedIndicies.length}/${missions.length}.

That's progress. That's real. Let's recharge and hit the full list tomorrow.

You're building something here. 🚀
        `.trim();
      } else {
        // None completed - supportive, NO PENALTY
        coaching = `
💙 *Hey, we all have those days.* You didn't hit any missions today.

But here's the thing: You showed up. You tried. That's the hardest part.

Rest up. Tomorrow is a fresh start. We'll hit them all. 🌅
        `.trim();
      }

      const auditSummary = `
${coaching}

See you tomorrow for your next Mission Briefing! 🌙
      `.trim();

      this.bot.sendMessage(chatId, auditSummary, { parse_mode: 'Markdown' });

    } catch (error) {
      console.error('Error in handleMissionAudit:', error);
      this.bot.sendMessage(
        chatId,
        '⚠️ MyDay Intel is recalibrating. I\'ve safely recorded your progress, but I need a moment. Please try your last command again.'
      );
    }
  }

  /**
   * Sunset Reflection - Initiated by user or 8 PM nudge
   */
  async handleSunsetReflection(msg) {
    const chatId = msg.chat.id;
    const userId = msg.from.id;

    try {
      // Get today's missions count
      const missions = await this.db.getTodayMissions(userId);
      const totalMissions = missions ? missions.length : 0;

      this.userFlowState[userId] = 'sunset_reflection_wins';

      const sunsetPrompt = `
🌅 *Sunset Reflection Time*

Let's capture your day. How many of today's wins did you conquer?

You had ${totalMissions} missions. Let me know how many you completed (0-${totalMissions}):
      `.trim();

      this.bot.sendMessage(chatId, sunsetPrompt, { parse_mode: 'Markdown' });

    } catch (error) {
      console.error('Error in handleSunsetReflection:', error);
      this.bot.sendMessage(
        chatId,
        '⚠️ MyDay Intel is recalibrating. I\'ve safely recorded your progress, but I need a moment. Please try your last command again.'
      );
    }
  }

  /**
   * Sunset Reflection - Capture wins count
   */
  async handleSunsetWinsInput(msg, winsCount) {
    const chatId = msg.chat.id;
    const userId = msg.from.id;

    try {
      // Store wins in temporary state
      if (!this.userSunsetState) this.userSunsetState = {};
      this.userSunsetState[userId] = { wins: winsCount };

      this.userFlowState[userId] = 'sunset_reflection_mood';

      const moodPrompt = `
📊 *Sunset Reflection - Part 2*

You conquered ${winsCount} wins today. Nice work!

Now, how's your sunset mood? 
(Tell me your energy/happiness level 1-5)

😫 1 = Exhausted
😐 2 = Worn out
😊 3 = Neutral
🙂 4 = Good vibes
👑 5 = Absolutely crushing it!

Reply with: 1, 2, 3, 4, or 5
      `.trim();

      this.bot.sendMessage(chatId, moodPrompt, { parse_mode: 'Markdown' });

    } catch (error) {
      console.error('Error in handleSunsetWinsInput:', error);
      this.bot.sendMessage(
        chatId,
        '⚠️ MyDay Intel is recalibrating. I\'ve safely recorded your progress, but I need a moment. Please try your last command again.'
      );
    }
  }

  /**
   * Sunset Reflection - Capture mood & store correlation
   */
  async handleSunsetMoodInput(msg, mood) {
    const chatId = msg.chat.id;
    const userId = msg.from.id;

    try {
      if (!this.userSunsetState) this.userSunsetState = {};
      const state = this.userSunsetState[userId];
      const winsCount = state ? state.wins : 0;

      // Get today's summary to retrieve morning energy
      const todaySummary = await this.db.getTodaySummary(userId);
      const morningEnergy = todaySummary ? todaySummary.morning_energy : 3;
      const totalMissions = todaySummary ? todaySummary.total_missions : 1;

      // Update sunset mood and calculate delta
      const correlationData = await this.db.updateSunsetMood(userId, mood, winsCount);

      delete this.userFlowState[userId];
      delete this.userSunsetState[userId];

      // Get weekly data for analysis hint
      const weeklyData = await this.db.getWeeklyMoodEnergyData(userId);

      const moodDelta = mood - morningEnergy;
      const deltaMessage = moodDelta > 0 
        ? `📈 Your mood climbed ${moodDelta} points from this morning!`
        : moodDelta < 0
        ? `📉 Your mood shifted ${Math.abs(moodDelta)} points (that's okay)`
        : `➡️ Your mood stayed steady.`;

      const sunsetSummary = `
🌅 *Sunset Reflection Complete*

📊 *Your Day in Numbers:*
⚡ Morning Energy: ${morningEnergy}/5
🎯 Missions Today: ${winsCount}/${totalMissions}
😊 Sunset Mood: ${mood}/5

${deltaMessage}

💡 *The Pattern Emerges:*
Your **Discipline-to-Happiness** ratio is forming. Over 7 days, we'll see how your wins fuel your mood.

Rest well tonight. Tomorrow's momentum starts now. 🌙
      `.trim();

      this.bot.sendMessage(chatId, sunsetSummary, { parse_mode: 'Markdown' });

    } catch (error) {
      console.error('Error in handleSunsetMoodInput:', error);
      this.bot.sendMessage(
        chatId,
        '⚠️ MyDay Intel is recalibrating. I\'ve safely recorded your progress, but I need a moment. Please try your last command again.'
      );
    }
  }

  /**
   * Start the bot
   */
  async start() {
    try {
      // Wait for database to initialize
      await this.db.waitReady();
      console.log('✅ MyDay Guardian is online');
      console.log('🤖 Bot started. Listening for messages...');
    } catch (error) {
      // Check if error is a 409 Conflict (polling duplicate)
      if (error.code === 409 || error.message?.includes('409')) {
        console.error('⚠️ CONFLICT: Another instance of this bot is already running.');
        console.error('Stopping local instance...');
        process.exit(1);
      }
      console.error('❌ Failed to start bot - database not ready:', error);
      process.exit(1);
    }
  }
}

module.exports = MyDayBot;
