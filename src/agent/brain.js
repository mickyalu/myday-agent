/**
 * MyDay Intel: Behavioral AI Coaching Loop
 * 
 * Uses Gemini 2.0 to analyze user mood and suggest discipline stakes.
 * Philosophy: Empathy > Numbers
 */

const { GoogleGenerativeAI } = require('@google/generative-ai');

class MyDayIntel {
  constructor(apiKey) {
    this.apiKey = apiKey;
    this.client = new GoogleGenerativeAI(apiKey);
    this.model = this.client.getGenerativeModel({ model: 'gemini-2.0-flash' });
  }

  /**
   * Analyze user mood and generate personalized habit suggestions
   * @param {number} mood - Mood score 1-5 (1=Low, 5=High)
   * @param {string} userName - User's name for personalization
   * @param {object} userStreaks - User's current habits/streaks
   * @returns {Promise<object>} - Suggestion object with habit recommendation
   */
  async analyzeMoodAndSuggest(mood, userName, userStreaks = {}) {
    if (mood < 1 || mood > 5) {
      throw new Error('Mood must be between 1 and 5');
    }

    // Map mood to category recommendations per MyDay Intel Proactive Flow
    let category, emoji, description;
    
    if (mood === 1 || mood === 2) {
      category = 'Spirit';
      emoji = '🪷';
      description = 'gentle, restorative practice for inner strength';
    } else if (mood === 3 || mood === 4) {
      category = 'Mind';
      emoji = '🧠';
      description = 'focused practice to sharpen your discipline';
    } else if (mood === 5) {
      category = 'Fitness';
      emoji = '💪';
      description = 'high-energy practice to channel your power';
    }

    const prompt = `
You are MyDay Intel, a compassionate behavioral finance coach. Your philosophy is Empathy > Numbers.

User: ${userName}
Current Mood: ${mood}/5
${mood <= 2 ? 'Status: User is in a low-energy state' : mood <= 4 ? 'Status: User has balanced energy' : 'Status: User is energized and peak'}
Suggested Category: ${category} ${emoji}
(${description})

Generate ONE empathetic, human-like coaching response that:
1. Acknowledges their current emotional state
2. Suggests a specific habit in the ${category} category
3. Frames it as a win, not a burden
4. Includes a brief motivational insight

Keep it under 100 words. Be warm and understanding, not robotic.
    `;

    try {
      const result = await this.model.generateContent(prompt);
      const response = result.response.text();

      return {
        mood,
        category,
        emoji,
        coaching: response,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      console.error('Error in analyzeMoodAndSuggest:', error);
      // Fallback response if API fails
      return {
        mood,
        category,
        emoji,
        coaching: `Hey ${userName}! Your energy is perfect for ${category} ${emoji} today. Let's go!`,
        timestamp: new Date().toISOString(),
        fallback: true
      };
    }
  }

  /**
   * Celebrate a high stake commitment
   * @param {string} userName - User's name
   * @param {string} habit - Habit they're staking on
   * @param {number} customAmount - Custom CELO amount they chose
   * @param {number} recommendedAmount - Base recommendation amount
   * @returns {Promise<string>} - Motivational celebration response
   */
  async celebrateHighStake(userName, habit, customAmount, recommendedAmount) {
    if (customAmount <= recommendedAmount) {
      return null; // Not a high stake
    }

    const exceedPercentage = Math.round(((customAmount - recommendedAmount) / recommendedAmount) * 100);
    const prompt = `
You are MyDay Intel, a behavioral finance coach who celebrates bold commitments.

User: ${userName}
Habit Stake: "${habit}"
Recommended CELO: ${recommendedAmount}
Actual Commitment: ${customAmount} CELO (+${exceedPercentage}% increase)

Generate ONE short, HIGHLY MOTIVATIONAL response (max 25 words) that:
1. Shows genuine excitement about their boldness
2. Frames this as a powerful commitment signal
3. Creates urgency and pride

Examples of tone:
- "Holy 🔥! You're committing 3x the suggestion. THIS is the energy of winners!"
- "2 CELO? That's not following. That's LEADING. I'm pumped for you!"

Be energetic, authentic, and brief.
    `;

    try {
      const result = await this.model.generateContent(prompt);
      return result.response.text();
    } catch (error) {
      console.error('Error in celebrateHighStake:', error);
      // Fallback celebration
      return `🔥 ${customAmount} CELO?! That's a POWERFUL commitment, ${userName}. Let's GO!`;
    }
  }

  /**
   * Generate evening audit response
   * @param {string} userName - User's name
   * @param {string} habit - Habit name they staked on
   * @param {boolean} completed - Did they complete it?
   * @returns {Promise<string>} - Audit response
   */
  async generateEveningAudit(userName, habit, completed) {
    const prompt = `
You are MyDay Intel, a behavioral finance coach. 
${userName} staked on "${habit}" today and ${completed ? 'completed it' : 'did not complete it'}.

Generate one warm, non-judgmental line (max 30 words) that:
${completed ? '- Celebrates their win\n- Reinforces the streak\n- Motivates for tomorrow' : '- Normalizes the setback\n- Offers perspective\n- Encourages another attempt'}

Be human, brief, and kind.
    `;

    try {
      const result = await this.model.generateContent(prompt);
      return result.response.text();
    } catch (error) {
      console.error('Error in generateEveningAudit:', error);
      // Fallback response
      return completed
        ? `🎉 You crushed "${habit}"! Streak momentum is real. Tomorrow: double down.`
        : `No worries on "${habit}" today. Every attempt is a step. Try again tomorrow? 💪`;
    }
  }

  /**
   * Analyze discipline-to-mood correlation from weekly data
   * @param {Array} weeklyData - Array of daily_summary records
   * @returns {Promise<object>} - Correlation analysis
   */
  async analyzeDisciplineMoodCorrelation(weeklyData) {
    if (!weeklyData || weeklyData.length === 0) {
      return {
        correlation: 'insufficient_data',
        insight: 'Start your week - we\'ll see the pattern emerge!'
      };
    }

    // Calculate stats
    const energyValues = weeklyData.map(d => d.morning_energy).filter(v => v);
    const moodValues = weeklyData.map(d => d.evening_mood).filter(v => v);
    const deltas = weeklyData.map(d => d.mood_delta).filter(v => v !== null);

    const avgEnergy = energyValues.length > 0 
      ? (energyValues.reduce((a, b) => a + b, 0) / energyValues.length).toFixed(1)
      : 0;
      
    const avgMood = moodValues.length > 0 
      ? (moodValues.reduce((a, b) => a + b, 0) / moodValues.length).toFixed(1)
      : 0;

    const avgDelta = deltas.length > 0 
      ? (deltas.reduce((a, b) => a + b, 0) / deltas.length).toFixed(1)
      : 0;

    // Determine correlation type
    let correlationType = 'neutral';
    let insight = '';

    if (avgDelta > 1) {
      correlationType = 'positive_strong';
      insight = `Your discipline is fueling your happiness. Wins compound momentum.`;
    } else if (avgDelta > 0.3) {
      correlationType = 'positive_mild';
      insight = `Small wins = mood lift. Keep building.`;
    } else if (avgDelta < -1) {
      correlationType = 'negative_strong';
      insight = `Recovery mode. Be gentle with yourself. Recharge this week.`;
    } else if (avgDelta < -0.3) {
      correlationType = 'negative_mild';
      insight = `Energy shifts are normal. The pattern will stabilize.`;
    } else {
      correlationType = 'neutral';
      insight = `Your mood is independent today. That's resilience.`;
    }

    return {
      averageEnergy: avgEnergy,
      averageMood: avgMood,
      averageDelta: avgDelta,
      correlationType,
      insight,
      dataPoints: weeklyData.length
    };
  }

  /**
   * Generate weekly summary with discipline-mood insights
   * @param {string} userName - User's name
   * @param {Array} weeklyData - Array of daily_summary records
   * @returns {Promise<string>} - Weekly summary report
   */
  async generateWeeklySummary(userName, weeklyData) {
    const correlation = await this.analyzeDisciplineMoodCorrelation(weeklyData);

    const prompt = `
You are MyDay Intel. You've been analyzing ${userName}'s discipline and mood for a week.

Weekly Stats:
- Average Morning Energy: ${correlation.averageEnergy}/5
- Average Sunset Mood: ${correlation.averageMood}/5
- Discipline-to-Mood Delta: ${correlation.averageDelta} (positive = mood lifted by wins)
- Correlation Type: ${correlation.correlationType}
- Key Insight: ${correlation.insight}

Generate ONE brief, empowering weekly summary (max 50 words) that:
1. Acknowledges their pattern
2. Reinforces the link between discipline and happiness
3. Motivates for next week

Be warm, data-backed, and human.
    `;

    try {
      const result = await this.model.generateContent(prompt);
      return result.response.text();
    } catch (error) {
      console.error('Error in generateWeeklySummary:', error);
      return `${userName}, your week shows that discipline fuels mood. ${correlation.insight} Keep going! 💎`;
    }
  }

  /**
   * Map a city name to an IANA timezone string or UTC offset fallback.
   * This is a small curated map; falls back to null if unknown.
   */
  mapCityToTimezone(city) {
    if (!city || typeof city !== 'string') return null;
    const c = city.trim().toLowerCase();
    const map = {
      'nairobi': 'Africa/Nairobi',
      'new york': 'America/New_York',
      'los angeles': 'America/Los_Angeles',
      'san francisco': 'America/Los_Angeles',
      'london': 'Europe/London',
      'paris': 'Europe/Paris',
      'berlin': 'Europe/Berlin',
      'singapore': 'Asia/Singapore',
      'bangalore': 'Asia/Kolkata',
      'mumbai': 'Asia/Kolkata',
      'delhi': 'Asia/Kolkata',
      'tokyo': 'Asia/Tokyo',
      'sydney': 'Australia/Sydney',
      'melbourne': 'Australia/Melbourne',
      'toronto': 'America/Toronto',
      'vancouver': 'America/Vancouver',
      'cape town': 'Africa/Johannesburg',
      'johannesburg': 'Africa/Johannesburg'
    };

    if (map[c]) return map[c];

    // Try simple heuristics: if user provided 'City, Country' take city part
    const parts = c.split(',').map(p => p.trim());
    if (parts.length > 1 && map[parts[0]]) return map[parts[0]];

    return null;
  }
}

module.exports = MyDayIntel;