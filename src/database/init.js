/**
 * Database Scaffolding for MyDay Agent
 * 
 * Supports both local SQLite and Supabase (PostgreSQL)
 * Tracks: user_id, daily_mood, current_streak, total_staked
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');

class Database {
  constructor(config = {}) {
    this.type = config.type || 'sqlite'; // 'sqlite' or 'supabase'
    this.config = config;
    this.db = null;
    this.ready = false;
    this.readyPromise = new Promise((resolve, reject) => {
      this.resolveReady = resolve;
      this.rejectReady = reject;
    });

    if (this.type === 'sqlite') {
      this.initSqlite();
    } else if (this.type === 'supabase') {
      this.initSupabase();
    }
  }

  /**
   * Record a verification attempt into daily_summary.notes
   * If telegramUserId is not provided, a system user (telegram_user_id = 0) is used.
   */
  async recordVerificationAttempt(telegramUserId, addr, success, details = {}) {
    return new Promise(async (resolve, reject) => {
      if (!this.db) return reject(new Error('Database not initialized'));

      const tId = typeof telegramUserId !== 'undefined' && telegramUserId !== null
        ? telegramUserId
        : 0;

      try {
        // Ensure user exists (system user if tId == 0)
        await this.getOrCreateUser(tId, tId === 0 ? 'system' : 'user', null);
      } catch (err) {
        // ignore create errors
      }

      const today = new Date().toISOString().split('T')[0];

      // Build attempt record
      const attempt = {
        addr,
        success: !!success,
        details,
        timestamp: new Date().toISOString()
      };

      // Get current notes and append JSON entry
      this.db.get(
        `SELECT notes FROM daily_summary WHERE user_id = (SELECT id FROM users WHERE telegram_user_id = ?) AND date = ?`,
        [tId, today],
        (err, row) => {
          if (err) return reject(err);

          const existing = row && row.notes ? row.notes : '[]';
          let arr = [];
          try { arr = JSON.parse(existing); } catch (e) { arr = []; }
          arr.push(attempt);

          const notesString = JSON.stringify(arr);

          // Insert or update daily_summary row for today
          this.db.run(
            `INSERT OR REPLACE INTO daily_summary (user_id, date, notes, updated_at)
             SELECT id, ?, ?, CURRENT_TIMESTAMP FROM users WHERE telegram_user_id = ?`,
            [today, notesString, tId],
            (err) => {
              if (err) return reject(err);
              resolve(attempt);
            }
          );
        }
      );
    });
  }

  /**
   * Wait for database to be ready
   */
  async waitReady() {
    return this.readyPromise;
  }

  /**
   * Initialize SQLite database
   */
  initSqlite() {
    const dbPath = this.config.dbPath || path.join(__dirname, '../../data/myday.db');
    this.db = new sqlite3.Database(dbPath, (err) => {
      if (err) {
        console.error('SQLite connection error:', err);
        this.rejectReady(err);
      } else {
        console.log('✓ Connected to SQLite database');
        this.ready = true;
        this.createTables();
        this.runMigrations();
        this.resolveReady();
      }
    });
  }

  /**
   * Initialize Supabase connection (placeholder for future)
   */
  initSupabase() {
    // TODO: Implement Supabase client integration
    // const { createClient } = require('@supabase/supabase-js');
    // this.client = createClient(this.config.url, this.config.key);
    console.log('⚠️ Supabase support coming soon. Using SQLite as fallback.');
    this.initSqlite();
  }

  /**
   * Create database tables
   */
  createTables() {
    const tables = `
      -- Users table
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        telegram_user_id INTEGER UNIQUE NOT NULL,
        telegram_chat_id INTEGER,
        name TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      -- Daily mood tracking
      CREATE TABLE IF NOT EXISTS mood_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        mood_score INTEGER CHECK(mood_score >= 1 AND mood_score <= 5),
        logged_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(user_id) REFERENCES users(id)
      );

      -- Habit stakes
      CREATE TABLE IF NOT EXISTS habit_stakes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        habit_name TEXT NOT NULL,
        emoji TEXT,
        category TEXT, -- 'Spirit', 'Mind', 'Fitness', 'Work'
        is_completed BOOLEAN DEFAULT 0,
        staked_date DATE,
        completed_date DATE,
        streak_count INTEGER DEFAULT 0,
        total_staked REAL DEFAULT 0, -- Amount of CELO or other token staked
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(user_id) REFERENCES users(id)
      );

      -- Streak tracking
      CREATE TABLE IF NOT EXISTS streaks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        current_streak INTEGER DEFAULT 0,
        longest_streak INTEGER DEFAULT 0,
        last_completed_date DATE,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(user_id) REFERENCES users(id),
        UNIQUE(user_id)
      );

      -- Daily summary (tracks morning energy, mission completion, and sunset mood)
      CREATE TABLE IF NOT EXISTS daily_summary (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        date DATE,
        morning_energy INTEGER CHECK(morning_energy >= 1 AND morning_energy <= 5),
        missions_completed INTEGER DEFAULT 0,
        total_missions INTEGER DEFAULT 0,
        evening_mood INTEGER CHECK(evening_mood >= 1 AND evening_mood <= 5),
        mood_delta INTEGER,
        staked_amount REAL DEFAULT 0,
        notes TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(user_id) REFERENCES users(id)
      );

      -- Daily Missions (new)
      CREATE TABLE IF NOT EXISTS daily_missions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        mission_date DATE,
        mission_title TEXT NOT NULL,
        energy_level INTEGER CHECK(energy_level >= 1 AND energy_level <= 5),
        staked_amount REAL DEFAULT 0,
        is_completed BOOLEAN DEFAULT 0,
        completed_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(user_id) REFERENCES users(id)
      );

      -- Processed transactions to avoid duplicate webhook handling
      CREATE TABLE IF NOT EXISTS processed_transactions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tx_hash TEXT UNIQUE NOT NULL,
        user_id INTEGER,
        amount REAL,
        currency TEXT,
        payload TEXT,
        processed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(user_id) REFERENCES users(id)
      );
    `;

    // Split and execute each statement
    tables.split(';').forEach(sql => {
      if (sql.trim()) {
        this.db.run(sql, (err) => {
          if (err) console.error('Table creation error:', err);
        });
      }
    });
  }

  /**
   * Run database migrations - add missing columns without data loss
   */
  runMigrations() {
    // Migration 1: Check daily_summary columns
    this.db.all(
      `PRAGMA table_info(daily_summary)`,
      (err, columns) => {
        if (err) {
          console.error('Migration check error:', err);
          return;
        }

        const columnNames = columns.map(col => col.name);
        const missingColumns = [];

        if (!columnNames.includes('morning_energy')) {
          missingColumns.push('morning_energy');
        }
        if (!columnNames.includes('evening_mood')) {
          missingColumns.push('evening_mood');
        }
        if (!columnNames.includes('missions_json')) {
          missingColumns.push('missions_json');
        }

        // Run ALTER TABLE for missing columns
        missingColumns.forEach(columnName => {
          let alterSql = '';
          if (columnName === 'morning_energy') {
            alterSql = `ALTER TABLE daily_summary ADD COLUMN morning_energy INTEGER CHECK(morning_energy >= 1 AND morning_energy <= 5)`;
          } else if (columnName === 'evening_mood') {
            alterSql = `ALTER TABLE daily_summary ADD COLUMN evening_mood INTEGER CHECK(evening_mood >= 1 AND evening_mood <= 5)`;
          } else if (columnName === 'missions_json') {
            alterSql = `ALTER TABLE daily_summary ADD COLUMN missions_json TEXT`;
          }

          if (alterSql) {
            this.db.run(alterSql, (err) => {
              if (err) {
                if (!err.message.includes('duplicate column')) {
                  console.error(`Migration error for ${columnName}:`, err);
                }
              } else {
                console.log(`✓ Migration: Added ${columnName} column to daily_summary`);
              }
            });
          }
        });
      }
    );

    // Migration 2: Check users table for timezone
    this.db.all(
      `PRAGMA table_info(users)`,
      (err, columns) => {
        if (err) {
          console.error('Users migration check error:', err);
          return;
        }

        const columnNames = columns.map(col => col.name);

        if (!columnNames.includes('timezone')) {
          this.db.run(
            `ALTER TABLE users ADD COLUMN timezone TEXT DEFAULT 'UTC'`,
            (err) => {
              if (err) {
                if (!err.message.includes('duplicate column')) {
                  console.error('Migration error for timezone:', err);
                }
              } else {
                console.log('✓ Migration: Added timezone column to users');
              }
            }
          );
        }
        // Add vault_balance to users if missing
        if (!columnNames.includes('vault_balance')) {
          this.db.run(
            `ALTER TABLE users ADD COLUMN vault_balance REAL DEFAULT 0`,
            (err) => {
              if (err) {
                if (!err.message.includes('duplicate column')) {
                  console.error('Migration error for vault_balance:', err);
                }
              } else {
                console.log('✓ Migration: Added vault_balance column to users');
              }
            }
          );
        }
      }
    );
  }

  /**
   * Get or create a user
   */
  async getOrCreateUser(telegramUserId, name, chatId) {
    return new Promise((resolve, reject) => {
      if (!this.db) return reject(new Error('Database not initialized'));

      this.db.get(
        'SELECT * FROM users WHERE telegram_user_id = ?',
        [telegramUserId],
        (err, user) => {
          if (err) return reject(err);

          if (user) {
            resolve(user);
          } else {
            this.db.run(
              'INSERT INTO users (telegram_user_id, telegram_chat_id, name) VALUES (?, ?, ?)',
              [telegramUserId, chatId, name],
              (err) => {
                if (err) return reject(err);
                // use arrow so `this` refers to the Database instance
                this.db.get(
                  'SELECT * FROM users WHERE telegram_user_id = ?',
                  [telegramUserId],
                  (err, newUser) => {
                    if (err) return reject(err);
                    resolve(newUser);
                  }
                );
              }
            );
          }
        }
      );
    });
  }

  /**
   * Get user by ID
   */
  async getUserById(telegramUserId) {
    return new Promise((resolve, reject) => {
      if (!this.db) return reject(new Error('Database not initialized'));

      this.db.get(
        'SELECT * FROM users WHERE telegram_user_id = ?',
        [telegramUserId],
        (err, user) => {
          if (err) return reject(err);
          resolve(user);
        }
      );
    });
  }

  /**
   * Check if a transaction hash was already processed
   */
  async hasProcessedTransaction(txHash) {
    return new Promise((resolve, reject) => {
      if (!this.db) return reject(new Error('Database not initialized'));
      this.db.get(
        `SELECT * FROM processed_transactions WHERE tx_hash = ?`,
        [txHash],
        (err, row) => {
          if (err) return reject(err);
          resolve(!!row);
        }
      );
    });
  }

  /**
   * Record a processed transaction to prevent duplicates
   */
  async recordProcessedTransaction(txHash, telegramUserId, amount = 0, currency = 'cUSD', payload = {}) {
    return new Promise(async (resolve, reject) => {
      if (!this.db) return reject(new Error('Database not initialized'));

      const userId = telegramUserId || 0;

      this.db.run(
        `INSERT INTO processed_transactions (tx_hash, user_id, amount, currency, payload) VALUES (?, (SELECT id FROM users WHERE telegram_user_id = ?), ?, ?, ?)`,
        [txHash, userId, amount, currency, JSON.stringify(payload)],
        (err) => {
          if (err) return reject(err);
          resolve();
        }
      );
    });
  }

  /**
   * Credit user's vault balance (increments users.vault_balance)
   */
  async creditUserVault(telegramUserId, amount) {
    return new Promise((resolve, reject) => {
      if (!this.db) return reject(new Error('Database not initialized'));
      this.db.run(
        `UPDATE users SET vault_balance = COALESCE(vault_balance, 0) + ? WHERE telegram_user_id = ?`,
        [amount, telegramUserId],
        (err) => {
          if (err) return reject(err);
          resolve();
        }
      );
    });
  }

  /**
   * Update user's mood
   */
  async updateUserMood(telegramUserId, moodScore) {
    return new Promise((resolve, reject) => {
      if (!this.db) return reject(new Error('Database not initialized'));

      this.db.run(
        `INSERT INTO mood_logs (user_id, mood_score) 
         SELECT id, ? FROM users WHERE telegram_user_id = ?`,
        [moodScore, telegramUserId],
        (err) => {
          if (err) return reject(err);
          resolve();
        }
      );
    });
  }

  /**
   * Increment user's streak
   */
  async incrementStreak(telegramUserId) {
    return new Promise((resolve, reject) => {
      if (!this.db) return reject(new Error('Database not initialized'));

      this.db.run(
        `UPDATE streaks 
         SET current_streak = current_streak + 1,
             last_completed_date = DATE('now'),
             updated_at = CURRENT_TIMESTAMP
         WHERE user_id = (SELECT id FROM users WHERE telegram_user_id = ?)`,
        [telegramUserId],
        (err) => {
          if (err) return reject(err);
          resolve();
        }
      );
    });
  }

  /**
   * Reset user's streak
   */
  async resetStreak(telegramUserId) {
    return new Promise((resolve, reject) => {
      if (!this.db) return reject(new Error('Database not initialized'));

      this.db.run(
        `UPDATE streaks 
         SET current_streak = 0,
             updated_at = CURRENT_TIMESTAMP
         WHERE user_id = (SELECT id FROM users WHERE telegram_user_id = ?)`,
        [telegramUserId],
        (err) => {
          if (err) return reject(err);
          resolve();
        }
      );
    });
  }

  /**
   * Record a habit stake
   */
  async recordStake(telegramUserId, stakeData) {
    return new Promise((resolve, reject) => {
      if (!this.db) return reject(new Error('Database not initialized'));

      const { habitName, habitEmoji, moodScore, recommendedAmount, finalAmount } = stakeData;
      const today = new Date().toISOString().split('T')[0];

      this.db.run(
        `INSERT INTO habit_stakes (user_id, habit_name, emoji, category, is_completed, staked_date, total_staked)
         SELECT id, ?, ?, ?, 0, ?, ?
         FROM users WHERE telegram_user_id = ?`,
        [habitName, habitEmoji, 'custom', today, finalAmount, telegramUserId],
        (err) => {
          if (err) return reject(err);
          resolve();
        }
      );
    });
  }

  /**
   * Get today's active stake for user
   */
  async getTodayStake(telegramUserId) {
    return new Promise((resolve, reject) => {
      if (!this.db) return reject(new Error('Database not initialized'));

      const today = new Date().toISOString().split('T')[0];
      this.db.get(
        `SELECT habit_stakes.* FROM habit_stakes
         JOIN users ON habit_stakes.user_id = users.id
         WHERE users.telegram_user_id = ? 
         AND DATE(habit_stakes.staked_date) = ?
         ORDER BY habit_stakes.created_at DESC
         LIMIT 1`,
        [telegramUserId, today],
        (err, stake) => {
          if (err) return reject(err);
          resolve(stake);
        }
      );
    });
  }

  /**
   * Get user's recent mood history (last 7 days)
   */
  async getRecentMoodHistory(telegramUserId, days = 7) {
    return new Promise((resolve, reject) => {
      if (!this.db) return reject(new Error('Database not initialized'));

      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - days);

      this.db.all(
        `SELECT mood_logs.mood_score, mood_logs.logged_at FROM mood_logs
         JOIN users ON mood_logs.user_id = users.id
         WHERE users.telegram_user_id = ?
         AND mood_logs.logged_at >= ?
         ORDER BY mood_logs.logged_at DESC`,
        [telegramUserId, cutoffDate.toISOString()],
        (err, moods) => {
          if (err) return reject(err);
          resolve(moods || []);
        }
      );
    });
  }

  /**
   * Get user's habit completion rate
   */
  async getCompletionRate(telegramUserId) {
    return new Promise((resolve, reject) => {
      if (!this.db) return reject(new Error('Database not initialized'));

      this.db.get(
        `SELECT 
          COUNT(*) as total_stakes,
          SUM(CASE WHEN is_completed = 1 THEN 1 ELSE 0 END) as completed_stakes,
          ROUND(100.0 * SUM(CASE WHEN is_completed = 1 THEN 1 ELSE 0 END) / COUNT(*), 1) as completion_rate
         FROM habit_stakes
         WHERE user_id = (SELECT id FROM users WHERE telegram_user_id = ?)`,
        [telegramUserId],
        (err, stats) => {
          if (err) return reject(err);
          resolve(stats || { total_stakes: 0, completed_stakes: 0, completion_rate: 0 });
        }
      );
    });
  }

  /**
   * Save daily missions for a user
   */
  async saveMissions(telegramUserId, missions, energyLevel, stakedAmount = 0) {
    return new Promise((resolve, reject) => {
      if (!this.db) return reject(new Error('Database not initialized'));

      const today = new Date().toISOString().split('T')[0];
      let completed = 0;

      const saveNext = (index) => {
        if (index >= missions.length) {
          resolve();
          return;
        }

        const mission = missions[index];
        this.db.run(
          `INSERT INTO daily_missions (user_id, mission_date, mission_title, energy_level, staked_amount)
           SELECT id, ?, ?, ?, ?
           FROM users WHERE telegram_user_id = ?`,
          [today, mission, energyLevel, stakedAmount, telegramUserId],
          (err) => {
            if (err) return reject(err);
            completed++;
            saveNext(index + 1);
          }
        );
      };

      saveNext(0);
    });
  }

  /**
   * Get today's missions for a user
   */
  async getTodayMissions(telegramUserId) {
    return new Promise((resolve, reject) => {
      if (!this.db) return reject(new Error('Database not initialized'));

      const today = new Date().toISOString().split('T')[0];
      this.db.all(
        `SELECT * FROM daily_missions
         WHERE user_id = (SELECT id FROM users WHERE telegram_user_id = ?)
         AND mission_date = ?
         ORDER BY created_at ASC`,
        [telegramUserId, today],
        (err, missions) => {
          if (err) return reject(err);
          resolve(missions || []);
        }
      );
    });
  }

  /**
   * Update mission completion status
   */
  async updateMissionCompletion(missionId, isCompleted) {
    return new Promise((resolve, reject) => {
      if (!this.db) return reject(new Error('Database not initialized'));

      const completedAt = isCompleted ? new Date().toISOString() : null;
      this.db.run(
        `UPDATE daily_missions 
         SET is_completed = ?, completed_at = ?
         WHERE id = ?`,
        [isCompleted ? 1 : 0, completedAt, missionId],
        (err) => {
          if (err) return reject(err);
          resolve();
        }
      );
    });
  }

  /**
   * Save/update daily summary with morning energy
   */
  async saveDailySummary(telegramUserId, morningEnergy, missionCount, stakedAmount = 0) {
    return new Promise((resolve, reject) => {
      if (!this.db) return reject(new Error('Database not initialized'));

      const today = new Date().toISOString().split('T')[0];

      this.db.run(
        `INSERT OR REPLACE INTO daily_summary 
         (user_id, date, morning_energy, total_missions, staked_amount, updated_at)
         SELECT id, ?, ?, ?, ?, CURRENT_TIMESTAMP
         FROM users WHERE telegram_user_id = ?`,
        [today, morningEnergy, missionCount, stakedAmount, telegramUserId],
        (err) => {
          if (err) return reject(err);
          resolve();
        }
      );
    });
  }

  /**
   * Update daily summary with sunset mood (evening reflection)
   */
  async updateSunsetMood(telegramUserId, eveningMood, missionsCompleted) {
    return new Promise((resolve, reject) => {
      if (!this.db) return reject(new Error('Database not initialized'));

      // Validate mood score
      if (typeof eveningMood !== 'number' || eveningMood < 1 || eveningMood > 5) {
        return reject(new Error('Invalid mood score. Must be between 1 and 5.'));
      }

      const today = new Date().toISOString().split('T')[0];

      // Get morning energy first to calculate delta
      this.db.get(
        `SELECT morning_energy FROM daily_summary
         WHERE user_id = (SELECT id FROM users WHERE telegram_user_id = ?)
         AND date = ?`,
        [telegramUserId, today],
        (err, row) => {
          if (err) return reject(err);

          const morningEnergy = row ? row.morning_energy : 3;  // Default to 3 if not found
          const moodDelta = eveningMood - morningEnergy;

          // Update with evening mood and delta
          this.db.run(
            `UPDATE daily_summary
             SET evening_mood = ?, missions_completed = ?, mood_delta = ?, updated_at = CURRENT_TIMESTAMP
             WHERE user_id = (SELECT id FROM users WHERE telegram_user_id = ?)
             AND date = ?`,
            [eveningMood, missionsCompleted, moodDelta, telegramUserId, today],
            (err) => {
              if (err) return reject(err);
              resolve({
                morning_energy: morningEnergy,
                evening_mood: eveningMood,
                mood_delta: moodDelta
              });
            }
          );
        }
      );
    });
  }

  /**
   * Get daily summary for today
   */
  async getTodaySummary(telegramUserId) {
    return new Promise((resolve, reject) => {
      if (!this.db) return reject(new Error('Database not initialized'));

      const today = new Date().toISOString().split('T')[0];

      this.db.get(
        `SELECT * FROM daily_summary
         WHERE user_id = (SELECT id FROM users WHERE telegram_user_id = ?)
         AND date = ?`,
        [telegramUserId, today],
        (err, row) => {
          if (err) return reject(err);
          resolve(row || null);
        }
      );
    });
  }

  /**
   * Get 7-day mood-energy correlation data for analysis
   */
  async getWeeklyMoodEnergyData(telegramUserId) {
    return new Promise((resolve, reject) => {
      if (!this.db) return reject(new Error('Database not initialized'));

      const lastWeek = new Date();
      lastWeek.setDate(lastWeek.getDate() - 7);
      const weekStart = lastWeek.toISOString().split('T')[0];

      this.db.all(
        `SELECT date, morning_energy, evening_mood, mood_delta, missions_completed, total_missions
         FROM daily_summary
         WHERE user_id = (SELECT id FROM users WHERE telegram_user_id = ?)
         AND date >= ?
         ORDER BY date DESC`,
        [telegramUserId, weekStart],
        (err, rows) => {
          if (err) return reject(err);
          resolve(rows || []);
        }
      );
    });
  }

  /**
   * Close database connection
   */
  close() {
    if (this.db) {
      this.db.close((err) => {
        if (err) console.error('Database close error:', err);
        else console.log('✓ Database connection closed');
      });
    }
  }
}

module.exports = Database;
