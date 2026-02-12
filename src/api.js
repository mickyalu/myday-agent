/**
 * Discipline Score API module
 * Exports a function to register API routes on an Express app using the provided DB instance.
 */

module.exports = function registerApi(app, apiDb) {
  // Health / verify is left in index.js; this module focuses on discipline-score
  app.get('/api/discipline-score/:telegram_id', async (req, res) => {
    try {
      const telegramId = Number(req.params.telegram_id);
      if (!telegramId) return res.status(400).json({ error: 'invalid telegram id' });

      const weekly = await apiDb.getWeeklyMoodEnergyData(telegramId);
      const totalStaked = await apiDb.getTotalStaked(telegramId);

      const energies = (weekly || []).map(w => Number(w.morning_energy || 0)).filter(n => !isNaN(n));
      const avgEnergy = energies.length ? energies.reduce((a,b)=>a+b,0)/energies.length : 3;

      // Pull recent sunset reflections for streak
      const { data: reflections } = await apiDb.client
        .from('daily_logs')
        .select('details,date')
        .eq('telegram_id', telegramId)
        .eq('log_type', 'sunset_reflection')
        .order('date', { ascending: false })
        .limit(14);

      let streak = 0;
      if (reflections && reflections.length) {
        for (const r of reflections) {
          try {
            const parsed = JSON.parse(r.details || '{}');
            const wins = Number(parsed.wins || 0);
            if (wins > 0) streak += 1; else break;
          } catch (e) { break; }
        }
      }

      const energyScore = (Math.max(1, Math.min(5, avgEnergy)) / 5) * 40;
      const stakeScore = Math.min(40, Number(totalStaked) * 2);
      const streakScore = Math.min(20, streak * 5);
      const score = Math.round(Math.max(0, Math.min(100, energyScore + stakeScore + streakScore)));
      const status = score >= 80 ? 'Elite' : (score >= 50 ? 'Stable' : 'Warning');

      return res.json({ score, streak, status });
    } catch (err) {
      console.error('Discipline score error:', err);
      return res.status(500).json({ error: 'internal error' });
    }
  });
};
