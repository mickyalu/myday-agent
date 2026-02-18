const cron = require('node-cron');

// Helper to get user's local hour and minute using Intl.DateTimeFormat
function getLocalTimeParts(timezone) {
  try {
    const now = new Date();
    const fmt = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hour: 'numeric',
      minute: 'numeric',
      hour12: false,
      weekday: 'short'
    });
    const parts = {};
    for (const { type, value } of fmt.formatToParts(now)) {
      if (type === 'hour') parts.hour = parseInt(value, 10);
      if (type === 'minute') parts.minute = parseInt(value, 10);
      if (type === 'weekday') {
        const dayMap = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
        parts.day = dayMap[value] ?? new Date().getDay();
      }
    }
    if (typeof parts.hour !== 'number') return null;
    return parts;
  } catch (e) {
    return null;
  }
}

module.exports = function initScheduler({ db, bot }) {
  // In-memory map to avoid duplicate triggers within the same minute
  const lastTriggered = {};

  // Run every minute and check users' local time
  cron.schedule('* * * * *', async () => {
    try {
      const users = await db.listUsers();

      for (const u of users) {
        const tz = u.timezone || 'UTC';
        const t = getLocalTimeParts(tz);
        if (!t) continue;
        const keyBase = `${u.telegram_id || u.telegram_id}:${tz}`;

        // Morning 08:00 - trigger bot's morning flow
        if (t.hour === 8 && t.minute === 0) {
          const key = keyBase + ':morning';
          if (lastTriggered[key] === new Date().toDateString()) continue;
          lastTriggered[key] = new Date().toDateString();
          try {
            const fakeMsg = { chat: { id: u.telegram_id }, from: { id: u.telegram_id, first_name: u.name || '' }, text: '/morning' };
            if (typeof bot.handleMorningNudge === 'function') {
              bot.handleMorningNudge(fakeMsg);
            } else {
              bot.bot.sendMessage(u.telegram_id, '🔋 Morning Nudge: Please check your energy for today. /start to begin.');
            }
          } catch (e) {}
        }

        // Sunset 20:00 - trigger Sunset Reflection flow (calls bot handler)
        // STATE GUARD: Skip if user is mid-onboarding or mid-staking to avoid stealing CTA focus
        if (t.hour === 20 && t.minute === 0) {
          const key = keyBase + ':sunset';
          if (lastTriggered[key] === new Date().toDateString()) continue;

          // Check if user is in an active flow that should not be interrupted
          const activeFlow = bot.userFlowState ? bot.userFlowState[u.telegram_id] : null;
          const blockingStates = [
            'onboarding_city',
            'mission_briefing_energy',
            'mission_briefing_goals',
            'mission_briefing_stake',
            'mission_briefing_confirm'
          ];
          if (activeFlow && blockingStates.includes(activeFlow)) {
            // Queue: mark as pending so we can send it once the flow completes
            if (!bot._pendingSunset) bot._pendingSunset = {};
            bot._pendingSunset[u.telegram_id] = true;
            console.log(`Scheduler: Sunset deferred for user ${u.telegram_id} (active flow: ${activeFlow})`);
            continue;
          }

          lastTriggered[key] = new Date().toDateString();
          try {
            const fakeMsg = { chat: { id: u.telegram_id }, from: { id: u.telegram_id, first_name: u.name || '' }, text: '/sunset' };
            if (typeof bot.handleSunsetReflection === 'function') {
              bot.handleSunsetReflection(fakeMsg);
            } else {
              bot.bot.sendMessage(u.telegram_id, '🌅 Sunset Reflection: How many wins did you record today?');
            }
          } catch (e) {}
        }

        // Friday 17:00
        if (t.day === 5 && t.hour === 17 && t.minute === 0) {
          const key = keyBase + ':weekly';
          const today = new Date().toDateString();
          if (lastTriggered[key] === today) continue;
          lastTriggered[key] = today;
          try { bot.bot.sendMessage(u.telegram_id, '📣 Weekly Roundup: Here is your MyDay Intel weekly summary.'); } catch (e) {}
        }
      }
    } catch (err) {
      console.error('Scheduler error:', err);
    }
  });
};
