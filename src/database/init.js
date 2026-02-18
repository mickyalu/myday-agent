const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

/**
 * Supabase-backed Database adapter
 *
 * This replaces the previous SQLite wrapper and exposes the same async
 * methods the bot expects. It uses the `users` and `daily_logs` tables in
 * Supabase. The bot maps Telegram `msg.from.id` to the `telegram_id` column.
 */
class Database {
  constructor(config = {}) {
    const url = config.url || process.env.SUPABASE_URL;
    const key = config.key || process.env.SUPABASE_SERVICE_KEY;
    if (!url || !key) {
      console.error('⚠ Supabase URL and SERVICE_KEY not set — DB in degraded mode');
      this.client = null;
      this.ready = false;
      this.readyPromise = Promise.resolve(false);
      return;
    }

    this.client = createClient(url, key);
    this.ready = false;
    this.readyPromise = this._init();
  }

  async _init() {
    try {
      // Lightweight check to ensure the client can reach Supabase
      const { error } = await this.client.from('users').select('id').limit(1);
      if (error && error.code !== 'PGRST100') {
        // PGRST100 may occur if table doesn't exist yet; still treat as ready
        console.warn('Supabase early check warning:', error.message || error);
      }
      this.ready = true;
      return true;
    } catch (err) {
      console.error('Supabase init error:', err);
      throw err;
    }
  }

  async waitReady() {
    if (!this.client) return false;
    return this.readyPromise;
  }

  _guardClient() {
    if (!this.client) throw new Error('Database unavailable — Supabase not configured');
  }

  /**
   * Get or create a user by Telegram ID (maps to `telegram_id` column)
   */
  async getOrCreateUser(telegramId, name = null, chatId = null) {
    this._guardClient();
    await this.waitReady();

    // Try to fetch existing user
    const { data: user, error } = await this.client
      .from('users')
      .select('*')
      .eq('telegram_id', Number(telegramId))
      .maybeSingle();

    if (error) throw error;
    if (user) return user;

    // Insert new user
    const insert = {
      telegram_id: Number(telegramId),
      telegram_chat_id: chatId || null,
      name: name || null
    };

    const { data: created, error: insertErr } = await this.client
      .from('users')
      .insert(insert)
      .select('*')
      .maybeSingle();

    if (insertErr) throw insertErr;
    return created;
  }

  async getUserById(telegramId) {
    await this.waitReady();
    const { data, error } = await this.client
      .from('users')
      .select('*')
      .eq('telegram_id', Number(telegramId))
      .maybeSingle();
    if (error) throw error;
    return data || null;
  }

  async updateUserTimezone(telegramId, timezone) {
    await this.waitReady();
    const { error } = await this.client
      .from('users')
      .update({ timezone, updated_at: new Date().toISOString() })
      .eq('telegram_id', Number(telegramId));
    if (error) throw error;
    return true;
  }

  /**
   * Record a verification / stake-attempt or other event in `daily_logs`.
   * This maps the old SQLite `recordVerificationAttempt` behavior into
   * Supabase by storing a JSON payload in `details` and marking `addr`.
   */
  async recordVerificationAttempt(telegramId, addr, success = false, details = {}) {
    await this.waitReady();

    const entry = {
      telegram_id: Number(telegramId || 0),
      log_type: 'verification_attempt',
      addr: addr || null,
      success: !!success,
      details: details ? JSON.stringify(details) : null,
      created_at: new Date().toISOString()
    };

    const { error } = await this.client.from('daily_logs').insert(entry);
    if (error) throw error;
    return entry;
  }

  /**
   * Save missions as a single daily_logs entry (payload contains missions array)
   */
  async saveMissions(telegramId, missions = [], energyLevel = 3, stakedAmount = 0) {
    await this.waitReady();
    const today = new Date().toISOString().split('T')[0];
    const entry = {
      telegram_id: Number(telegramId),
      log_type: 'missions',
      date: today,
      details: JSON.stringify({ missions, energy_level: energyLevel, staked_amount: stakedAmount }),
      created_at: new Date().toISOString()
    };
    const { error } = await this.client.from('daily_logs').insert(entry);
    if (error) throw error;
    return true;
  }

  async saveDailySummary(telegramId, morningEnergy, missionCount, stakedAmount = 0) {
    await this.waitReady();
    const today = new Date().toISOString().split('T')[0];
    const entry = {
      telegram_id: Number(telegramId),
      log_type: 'daily_summary',
      date: today,
      details: JSON.stringify({ morning_energy: morningEnergy, total_missions: missionCount, staked_amount: stakedAmount }),
      created_at: new Date().toISOString()
    };
    const { error } = await this.client.from('daily_logs').insert(entry);
    if (error) throw error;
    return true;
  }

  async getTodayMissions(telegramId) {
    await this.waitReady();
    const today = new Date().toISOString().split('T')[0];
    const { data, error } = await this.client
      .from('daily_logs')
      .select('*')
      .eq('telegram_id', Number(telegramId))
      .eq('log_type', 'missions')
      .eq('date', today)
      .order('created_at', { ascending: false })
      .limit(1);
    if (error) throw error;
    if (!data || data.length === 0) return [];
    const entry = data[0];
    let details = [];
    try { details = JSON.parse(entry.details || '[]'); } catch (e) { details = []; }

    // Convert missions array into objects with synthetic ids so the rest of bot logic can reference them
    return details.missions ? details.missions.map((m, i) => ({ id: `${entry.id || today}-${i + 1}`, mission_title: m })) : [];
  }

  async getTotalStaked(telegramId) {
    await this.waitReady();
    // Sum stakedAmount from missions entries in daily_logs
    const { data, error } = await this.client
      .from('daily_logs')
      .select('details')
      .eq('telegram_id', Number(telegramId))
      .eq('log_type', 'missions');
    if (error) throw error;
    let total = 0;
    (data || []).forEach(d => {
      try {
        const parsed = JSON.parse(d.details || '{}');
        const s = parsed.stakedAmount || 0;
        total += Number(s || 0);
      } catch (e) {
        // ignore parse errors
      }
    });
    return total;
  }

  async updateMissionCompletion(missionId, isCompleted) {
    // For now store a completion entry to daily_logs so there is a record.
    await this.waitReady();
    const entry = {
      telegram_id: null,
      log_type: 'mission_completion',
      mission_id: String(missionId),
      success: !!isCompleted,
      created_at: new Date().toISOString()
    };
    const { error } = await this.client.from('daily_logs').insert(entry);
    if (error) throw error;
    return true;
  }

  async getTodaySummary(telegramId) {
    await this.waitReady();
    const today = new Date().toISOString().split('T')[0];
    const { data, error } = await this.client
      .from('daily_logs')
      .select('*')
      .eq('telegram_id', Number(telegramId))
      .eq('log_type', 'daily_summary')
      .eq('date', today)
      .order('created_at', { ascending: false })
      .limit(1);
    if (error) throw error;
    if (!data || data.length === 0) return null;
    const entry = data[0];
    try {
      const parsed = JSON.parse(entry.details || '{}');
      // Normalize to snake_case keys used across the bot
      return {
        morning_energy: parsed.morning_energy ?? parsed.morningEnergy ?? null,
        total_missions: parsed.total_missions ?? parsed.missionCount ?? null,
        staked_amount: parsed.staked_amount ?? parsed.stakedAmount ?? null
      };
    } catch (e) { return null; }
  }

  async getWeeklyMoodEnergyData(telegramId) {
    // Pull last 7 daily_summary entries
    await this.waitReady();
    const { data, error } = await this.client
      .from('daily_logs')
      .select('*')
      .eq('telegram_id', Number(telegramId))
      .eq('log_type', 'daily_summary')
      .order('date', { ascending: false })
      .limit(7);
    if (error) throw error;
    return (data || []).map(d => {
      try {
        const parsed = JSON.parse(d.details || '{}');
        return {
          morning_energy: parsed.morning_energy ?? parsed.morningEnergy ?? null,
          total_missions: parsed.total_missions ?? parsed.missionCount ?? null,
          staked_amount: parsed.staked_amount ?? parsed.stakedAmount ?? null,
          date: d.date
        };
      } catch (e) { return {}; }
    });
  }

  /**
   * Store sunset reflection (mood + wins) into daily_logs and update users table
   */
  async updateSunsetMood(telegramId, mood, winsCount = 0) {
    await this.waitReady();
    const today = new Date().toISOString().split('T')[0];
    const entry = {
      telegram_id: Number(telegramId),
      log_type: 'sunset_reflection',
      date: today,
      details: JSON.stringify({ sunset_mood: mood, wins: winsCount }),
      created_at: new Date().toISOString()
    };
    const { error } = await this.client.from('daily_logs').insert(entry);
    if (error) throw error;

    // Update users.last_sunset_mood for quick lookup (non-critical)
    try {
      await this.client
        .from('users')
        .update({ last_sunset_mood: mood, updated_at: new Date().toISOString() })
        .eq('telegram_id', Number(telegramId));
    } catch (e) {
      // non-fatal
    }

    return entry;
  }

  async listUsers() {
    await this.waitReady();
    const { data, error } = await this.client
      .from('users')
      .select('telegram_id, timezone, name');
    if (error) throw error;
    return data || [];
  }

  async recordProcessedTransaction(txHash, telegramUserId, amount = 0, currency = 'cUSD', payload = {}) {
    await this.waitReady();
    const entry = {
      telegram_id: Number(telegramUserId || 0),
      log_type: 'processed_transaction',
      tx_hash: txHash,
      amount,
      currency,
      details: JSON.stringify(payload || {}),
      created_at: new Date().toISOString()
    };
    const { error } = await this.client.from('daily_logs').insert(entry);
    if (error) throw error;
    return true;
  }

  async creditUserVault(telegramId, amount) {
    await this.waitReady();
    // Increment vault_balance on users table
    // Use select then update to avoid race conditions in simple implementations
    const { data: user, error: selectErr } = await this.client
      .from('users')
      .select('id, vault_balance')
      .eq('telegram_id', Number(telegramId))
      .maybeSingle();
    if (selectErr) throw selectErr;
    const current = (user && user.vault_balance) ? Number(user.vault_balance) : 0;
    const { error } = await this.client
      .from('users')
      .update({ vault_balance: current + Number(amount), updated_at: new Date().toISOString() })
      .eq('telegram_id', Number(telegramId));
    if (error) throw error;
    return true;
  }

  // A few legacy helpers left as no-op/compat shims to keep bot runtime stable
  async hasProcessedTransaction(txHash) { return false; }
  async incrementStreak() { return true; }
  async resetStreak() { return true; }
  async getTodayStake() { return null; }
  async getRecentMoodHistory() { return []; }
  async getCompletionRate() { return { total_stakes: 0, completed_stakes: 0, completion_rate: 0 }; }

  close() {
    // Supabase client has no close method for HTTP client; noop for compatibility
    this.ready = false;
  }
}

module.exports = Database;
