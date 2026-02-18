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
        // Prefer an explicit `verified_human` flag in users table
        if (typeof user.verified_human !== 'undefined') return !!user.verified_human;
        // Fallback to legacy `verified` column
        if (typeof user.verified !== 'undefined') return !!user.verified;
        // As a last resort, treat users with a vault balance as verified
        if (typeof user.vault_balance !== 'undefined' && user.vault_balance > 0) return true;
        return false;
      } catch (err) {
        console.error('SelfProtocol.isVerified error:', err);
        return false;
      }
    },

    getVerificationLink(telegramUserId) {
      // Direct link to SelfClaw verification page — not our Railway app
      return `https://selfclaw.ai/verify?agentId=7&user=${encodeURIComponent(String(telegramUserId))}`;
    }
  };
};
