const path = require('path');

/**
 * SelfClaw verifier helper (minimal scaffold)
 * - isVerified(userId): checks DB for verification flag (best-effort)
 * - getVerificationLink(userId): returns a link the user can visit to verify
 */

module.exports = function createSelfProtocol({ db, railwayUrl }) {
  return {
    async isVerified(telegramUserId) {
      try {
        const user = await db.getUserById(telegramUserId);
        if (!user) return false;
        // If a `verified` column exists, honor it. Otherwise check vault_balance > 0
        if (typeof user.verified !== 'undefined') return !!user.verified;
        if (typeof user.vault_balance !== 'undefined' && user.vault_balance > 0) return true;
        return false;
      } catch (err) {
        console.error('SelfProtocol.isVerified error:', err);
        return false;
      }
    },

    getVerificationLink(telegramUserId) {
      const base = railwayUrl || process.env.RAILWAY_URL || 'https://myday-guardian-production.up.railway.app';
      return `${base}/verify/selfclaw?user=${encodeURIComponent(String(telegramUserId))}`;
    }
  };
};
