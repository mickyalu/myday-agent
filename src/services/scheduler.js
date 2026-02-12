const cron = require('node-cron');

// Helper to get user's local hour and minute using Intl
function getLocalTimeParts(timezone) {
  try {
    const now = new Date();
    const parts = now.toLocaleString('en-GB', { timeZone: timezone, hour12: false });
    // parts like '11/02/2026, 20:05:00' or '11/02/2026, 20:05'
    const time = new Date(parts);
    return { hour: time.getHours(), minute: time.getMinutes(), day: time.getDay() };
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
        if (t.hour === 20 && t.minute === 0) {
          const key = keyBase + ':sunset';
          if (lastTriggered[key] === new Date().toDateString()) continue;
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
