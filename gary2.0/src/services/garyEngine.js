// ——————————————
// IMPORTS: Gary's Enhanced Intelligence
// ——————————————
import { perplexityService } from './perplexityService';
import { openaiService } from './openaiService';
import { sportsDataService } from './sportsDataService';

// ——————————————
// 1. CONFIG: Gary's Core Models
// ——————————————
export const PreferenceModel = {
  teams: {
    CIN_Reds: { bias: 0.9, ride_streaks: true, emotional_connection: "childhood" },
    CIN_Bengals: { bias: 0.9, ride_streaks: true, emotional_connection: "loyalty" },
    IND_Pacers: { bias: 0.8, emotional_connection: "nostalgia" },
    NYY_Yankees: { bias: 0.7, historical_wins: true, trust_in_big_moments: true },
    NYM_Mets: { bias: 0.6, emotional_connection: "underdog love" },
    BigEast_Basketball: { bias: 0.75, gritty_teams: true, tourney_momentum: true },
  },
  preferences: {
    east_coast_bias: 0.75,
    gritty_play_multiplier: 1.2,
    entertainer_bonus: 1.5,
    home_underdog_bias: 1.3,
    fade_West_Coast: true,
    superstition_weight: 1.4,
  },
};

export const ProfitModel = {
  monthly_target: 0.30,   // 30% return
  bankroll: 10000,
  bet_types: {
    straight_moneyline: { risk: 1, reward: 1, confidence_boost: 1.1 },
    spread:              { risk: 1.1, reward: 1.3, requires_trust: true },
    parlay:              { risk: 1.9, reward: 3.5, gut_override_required: true },
    same_game_parlay:    { risk: 2.1, reward: 5, only_if_hot: true },
    teaser:              { risk: 1.6, reward: 2.2, low_variance: true },
    mixed_sport_parlay:  { risk: 2.5, reward: 6, only_on_sundays: true },
  },
};

// ——————————————
// 2. CORE SCORING FUNCTIONS
// ——————————————
export function scoreBrain(dataMetrics) {
  // e.g. dataMetrics.ev, lineValue, publicVsSharp
  return dataMetrics.ev; // normalized 0–1
}

export function scoreSoul(narrative) {
  // narrative: { revenge: bool, superstition: bool, momentum: 0–1 }
  let score = narrative.momentum * 0.6;
  if (narrative.revenge) score += 0.2;
  if (narrative.superstition) score += 0.2 * PreferenceModel.preferences.superstition_weight;
  return Math.min(score, 1);
}

export function scorePreference(teamKey, playerKeys=[]) {
  let boost = 0;
  if (PreferenceModel.teams[teamKey]) {
    boost += PreferenceModel.teams[teamKey].bias;
  }
  playerKeys.forEach(p => {
    if (PreferenceModel.players[p]) boost += PreferenceModel.players[p].bias * 0.5;
  });
  // add general East Coast or gritty bias
  boost += PreferenceModel.preferences.east_coast_bias;
  return Math.min(boost / 3, 1);
}

export function scoreMemory(pastPerformance) {
  // pastPerformance: { gutOverrideHits: n, totalGutOverrides: m }
  if (pastPerformance.totalGutOverrides === 0) return 0.5;
  return pastPerformance.gutOverrideHits / pastPerformance.totalGutOverrides;
}

export function scoreProfit(progressToTarget) {
  // progressToTarget: currentROI / monthly_target
  // if behind, returns >1 to push aggression
  return 1 + (1 - progressToTarget);
}

// ——————————————
// 3. TRAP SAFE CHECK
// ——————————————
export function trapSafeCheck(marketData) {
  // marketData: { lineMoved: boolean, publicPct: 0–100 }
  if (!marketData.lineMoved && marketData.publicPct > 70) {
    return { isTrap: true, action: "reduce_stake", reason: "Heavy public money, no line movement" };
  }
  return { isTrap: false };
}

// ——————————————
// 4. GUT OVERRIDE LOGIC
// ——————————————
export function shouldGutOverride(brainScore, soulScore) {
  return soulScore >= brainScore * 2;
}

// ——————————————
// 5. BET TYPE & STAKE DECISION
// ——————————————
export function selectBetType(confidence, behindPace) {
  const types = ProfitModel.bet_types;
  // Simplified - any confidence above 0.6 qualifies for any bet type
  if (confidence > 0.6) {
    // Randomize between available bet types for variety
    const betOptions = ["straight_moneyline", "spread", "parlay", "teaser"];
    if (behindPace) betOptions.push("same_game_parlay");
    
    // Random selection from available options
    const randomIndex = Math.floor(Math.random() * betOptions.length);
    return betOptions[randomIndex];
  }
  return "no_bet";
}

export function calculateStake(bankroll, betType, confidence) {
  // no hard cap: Gary goes by feel but temp limit =  max 40%
  const maxPct = confidence > 0.8 ? 0.4 : 0.2;
  return Math.floor(bankroll * maxPct * (ProfitModel.bet_types[betType].risk || 1));
}

// ——————————————
// 6. NEW AI-POWERED GARY ANALYSIS
// ——————————————

/**
 * Fetch real-time information about a game using Perplexity API
 * @param {string} homeTeam - Home team name
 * @param {string} awayTeam - Away team name
 * @param {string} league - Sports league
 * @returns {Promise<string>} - Real-time information about the game
 */
export async function fetchRealTimeGameInfo(homeTeam, awayTeam, league) {
  try {
    if (!homeTeam || !awayTeam || !league) {
      console.error('Missing required parameters for fetchRealTimeGameInfo');
      return null;
    }
    
    console.log(`Fetching real-time info for ${awayTeam} @ ${homeTeam} (${league})`);
    
    const query = `
      Provide detailed analysis for the upcoming ${league} game between ${homeTeam} and ${awayTeam}.
      Include recent team performance, important injuries, betting trends, and any relevant news that could impact the game.
      Focus on factual information rather than opinions.
    `;
    
    // Use perplexityService to get real-time information
    const realTimeInfo = await perplexityService.fetchRealTimeInfo(query, {
      temperature: 0.3,   // Lower temperature for more factual information
      maxTokens: 1500   // Increased token limit for more comprehensive information
    });
    
    if (!realTimeInfo) {
      console.error('No real-time information returned from Perplexity API');
      throw new Error('Failed to get required real-time data from Perplexity API');
    }
    
    console.log('Successfully retrieved real-time game information');
    return realTimeInfo;
  } catch (error) {
    console.error('Error fetching real-time game information:', error);
    throw error; // Propagate error - no fallback data
  }
}

/**
 * Generate detailed game analysis using OpenAI
 * @param {object} gameData - Game and team data
 * @param {string} realTimeInfo - Real-time information from Perplexity
 * @param {object} preferences - Gary's preferences
 * @returns {Promise<object>} - Generated analysis
 */
export async function generateGaryAnalysis(gameData, realTimeInfo, preferences = {}) {
  try {
    console.log('Generating Gary\'s detailed analysis with OpenAI...');
    
    const { odds, lineMovement, sport, game } = gameData || {};
    
    // Get enhanced stats if available
    let teamStats = gameData.teamStats || '';
    let statsText = typeof teamStats === 'string' ? teamStats : JSON.stringify(teamStats, null, 2);
    
    // Format line movement data
    const lineMovementText = lineMovement ? 
      `Line Movement: ${JSON.stringify(lineMovement, null, 2)}` : 
      'No line movement data available';
    
    // Format the odds data
    const oddsText = odds ? 
      `Odds Data: ${JSON.stringify(odds, null, 2)}` : 
      'No odds data available';
    
    // Get preferences for teams
    const preferencesText = Object.keys(preferences).length > 0 ? 
      `Gary's Preferences: ${JSON.stringify(preferences, null, 2)}` : 
      'No specific team preferences';

    // Using the exact system message format specified
    const systemMessage = {
      role: "system",
      content: `
You are **Gary the Bear**, a grizzled, old-school sports betting expert with 50+ years of experience.  
You're known for:
1. **Picking winners**, not favorites.
2. Using a battle-tested system that blends deep analytics with instinct.
3. Speaking with blunt, confident swagger.

Here's how you operate:
- You analyze full-team stats, recent performance, and matchup trends
- You use injury reports, pace, usage, home/away splits, and **momentum** to evaluate real advantages
- You spot traps using line movement and sharp/public split
- You recognize revenge spots, rivalries, and superstition streaks
- You factor in fatigue, rest days, emotional games, and locker room vibes
- You trust your gut — but only when the numbers back it up
- You lean slightly toward your favorite teams: Reds, Bengals, Pacers, Yankees, Mets, and Big East basketball

**IMPORTANT:**  
> 80% of Gary's decision should be based on real stats, analytics, and matchup data — including momentum.  
You never guess. You only trust your gut after the data earns it.

**You NEVER chase favorites or avoid big dogs. If your system says a +350 underdog is the right side, you hammer it.**

**CRITICAL FORMATTING INSTRUCTION:**
You MUST include the EXACT spread/total/moneyline number in your pick. NEVER say simply "+spread" or "-spread" - always include the specific number (e.g., "+7.5" or "-3"). For totals, always include the exact number (e.g., "OVER 222.5" not just "OVER"). For moneylines, include the team name followed by "ML" (e.g., "Celtics ML"). Include the odds for the pick in a standardized format (e.g., "+150", "-110", "-115").

**ONLY provide picks with high confidence (0.75 or higher)**. If you do not have confidence of at least 0.75 in any pick for this game, DO NOT generate any output for that game - simply skip it entirely. Gary only makes picks when he has strong conviction - games with expected confidence below 0.75 should be completely ignored.

RESPONSE FORMAT (STRICT JSON — NO EXTRAS):
\`\`\`json
{
  "pick": "e.g., Bulls ML +150 / Celtics -4.5 -110 / OVER 222.5 -115",
  "type": "spread | moneyline | total",
  "confidence": 0.75–1.0,
  "trapAlert": true|false,
  "revenge": true|false,
  "superstition": true|false,
  "momentum": 0.0–1.0,
  "homeTeam": "Full home team name",
  "awayTeam": "Full away team name",
  "league": "NBA | MLB | NHL | EPL",
  "time": "7:10 PM ET",
  "rationale": "1–2 sentence breakdown. Data-backed, but with Gary's swagger."
}
\`\`\`
`
    };
    
    // Create user prompt with all the game data
    const userPrompt = {
      role: 'user',
      content: `Analyze this upcoming ${sport || ''} game: ${game || ''}

${oddsText}

${lineMovementText}

${statsText}

REAL-TIME DATA:
${realTimeInfo || 'No real-time data available'}

${preferencesText}

Remember to follow the decision weights:
- **80%** on hard data & stats (team & player metrics, pace, injuries, home/away splits, momentum, line movement, public/sharp splits)  
- **10%** on fan bias (Reds, Bengals, Pacers, Yankees, Mets, Big East hoops)  
- **10%** on trap detection, revenge angles, and superstition streaks

Provide your betting analysis in the exact JSON format specified.`
    };
    
    // Generate analysis from OpenAI using the specified prompt format
    const analysis = await openaiService.generateResponse([systemMessage, userPrompt], {
      temperature: 0.7,
      maxTokens: 1500
    });
    
    if (!analysis) {
      throw new Error('Failed to generate analysis from OpenAI');
    }
    
    // Parse the JSON response from OpenAI
    try {
      // Find JSON content within the response (in case there's any markdown wrapper)
      const jsonMatch = analysis.match(/\{[\s\S]*\}/); // Match everything between { and }
      const jsonContent = jsonMatch ? jsonMatch[0] : analysis;
      
      // Parse the JSON content
      const parsedOutput = JSON.parse(jsonContent);
      
      // Return success result with structured data
      return {
        success: true,
        rawOpenAIOutput: parsedOutput, // Already parsed JSON object
        fullAnalysis: analysis // Keep the original full response too
      };
    } catch (parseError) {
      console.error('Error parsing OpenAI response as JSON:', parseError);
      
      // If we can't parse as JSON, return the raw response
      return {
        success: true,
        parseError: true,
        fullAnalysis: analysis
      };
    }
  } catch (error) {
    console.error('Error generating Gary\'s analysis:', error);
    
    // Return failure result with error message
    return {
      success: false,
      fullAnalysis: `Gary's analysis engine encountered an error: ${error.message}`
    };
  }
}

/**
 * Simplified function that now just makes the rawOpenAIOutput available in a standardized format
 * Since we now directly parse the JSON in generateGaryAnalysis, this function mainly exists for compatibility
 * @param {object} analysisObject - The object from generateGaryAnalysis (either rawOpenAIOutput or fullAnalysis)
 * @returns {object} - A standardized format with the raw OpenAI output preserved
 */
export function parseGaryAnalysis(analysisObject) {
  try {
    // Default result in case we can't extract anything useful
    const defaultResult = {
      pick: null,
      confidence: 'Medium',
      betType: 'moneyline', 
      stake: 0,
      keyPoints: [],
      reasoning: '',
      rawOpenAIOutput: null
    };
    
    if (!analysisObject) return defaultResult;
    
    // If we were passed a response from generateGaryAnalysis with rawOpenAIOutput already parsed
    if (analysisObject.rawOpenAIOutput) {
      const output = analysisObject.rawOpenAIOutput;
      
      return {
        pick: output.pick,
        // Convert numeric confidence to text confidence for backwards compatibility
        confidence: typeof output.confidence === 'number' ?
          (output.confidence >= 0.75 ? 'High' : 'Medium') : 'Medium',
        betType: output.type,
        stake: typeof output.confidence === 'number' ? Math.round(output.confidence * 300) : 200,
        keyPoints: [output.rationale].filter(Boolean),
        reasoning: output.rationale,
        rawOpenAIOutput: output
      };
    }
    
    // If we were passed the raw OpenAI output directly
    if (typeof analysisObject === 'object' && analysisObject.pick && analysisObject.confidence) {
      return {
        pick: analysisObject.pick,
        confidence: typeof analysisObject.confidence === 'number' ?
          (analysisObject.confidence >= 0.75 ? 'High' : 'Medium') : 'Medium',
        betType: analysisObject.type || 'moneyline',
        stake: typeof analysisObject.confidence === 'number' ? Math.round(analysisObject.confidence * 300) : 200,
        keyPoints: [analysisObject.rationale].filter(Boolean),
        reasoning: analysisObject.rationale,
        rawOpenAIOutput: analysisObject
      };
    }
    
    return defaultResult;
  } catch (error) {
    console.error('Error parsing Gary\'s analysis:', error);
    return {
      pick: null,
      confidence: 'Medium',
      betType: 'Moneyline',
      stake: 0,
      keyPoints: ['Analysis parsing error'],
      reasoning: ''
    };
  }
}

// ——————————————
// 7. ENHANCED MAIN PICK FUNCTION
// ——————————————
export async function makeGaryPick({
  gameId,
  homeTeam,
  awayTeam,
  league,
  dataMetrics,
  narrative,
  pastPerformance,
  progressToTarget,
  bankroll
}) {
  console.log(`Gary is analyzing game ${gameId}: ${awayTeam} @ ${homeTeam}`);
  
  // Step 1: Process traditional metrics using original Gary logic (for compatibility)
  const teamKey = narrative.favoredTeam || homeTeam;
  const playerKeys = narrative.keyPlayers || [];
  
  const brain = scoreBrain(dataMetrics);
  const soul = scoreSoul(narrative);
  const pref = scorePreference(teamKey, playerKeys);
  const memory = scoreMemory(pastPerformance);
  const profit = scoreProfit(progressToTarget);

  // Calculate original Gary confidence
  const baseConfidence = 
    brain * 0.35 +
    soul * 0.20 +
    pref * 0.10 +
    memory * 0.15 +
    profit * 0.20;
    
  // Step 2: Fetch real-time data using Perplexity
  // Add validation to prevent undefined values from being passed
  let realTimeInfo = null;
  if (homeTeam && awayTeam && league) {
    console.log(`Fetching real-time data for validated teams: ${awayTeam} @ ${homeTeam} (${league})`);
    realTimeInfo = await fetchRealTimeGameInfo(homeTeam, awayTeam, league);
  } else {
    console.log(`Missing team or league data. Using default analysis without real-time data.`);
    realTimeInfo = 'No real-time data available due to missing team information.';
  }
  
  // Step 3: Get additional sports data if available
  let enrichedGameData = { ...dataMetrics };
  try {
    // Add validation to ensure we have valid team names and league
    if (homeTeam && awayTeam && league) {
      console.log(`Fetching sports data for: ${homeTeam} vs ${awayTeam} (${league})`);
      const teamStats = await sportsDataService.generateTeamStatsForGame(homeTeam, awayTeam, league);
      if (teamStats) {
        enrichedGameData.teamStats = teamStats;
      }
    } else {
      console.log('Skipping sports data fetch due to missing team or league information');
      enrichedGameData.teamStats = 'No team stats available due to missing team information';
    }
  } catch (statsError) {
    console.error('Error fetching additional sports data:', statsError);
    enrichedGameData.statsError = true;
  }
  
  // Step 4: Extract Gary's team preferences for this specific game
  const gamePreferences = {};
  if (PreferenceModel.teams[homeTeam]) {
    gamePreferences.homeTeamPreference = PreferenceModel.teams[homeTeam];
  }
  if (PreferenceModel.teams[awayTeam]) {
    gamePreferences.awayTeamPreference = PreferenceModel.teams[awayTeam];
  }
  for (const player of playerKeys) {
    if (PreferenceModel.players[player]) {
      if (!gamePreferences.playerPreferences) gamePreferences.playerPreferences = {};
      gamePreferences.playerPreferences[player] = PreferenceModel.players[player];
    }
  }
  
  // Step 5: Generate Gary's AI-powered analysis
  const aiAnalysis = await generateGaryAnalysis(enrichedGameData, realTimeInfo, gamePreferences);
  
  // Step 6: Use the simplified parseGaryAnalysis to get standardized access to the data
  // Since we now parse the JSON directly in generateGaryAnalysis, this is mostly for compatibility
  const parsedAnalysis = parseGaryAnalysis(aiAnalysis);
  
  // Step 7: Blend traditional Gary logic with AI insights
  const trap = trapSafeCheck(dataMetrics.market || {});
  const gutOverride = shouldGutOverride(brain, soul);
  
  // Final decision blends AI confidence with original Gary logic
  let status = parsedAnalysis.confidence === 'High' ? "YES" : 
               parsedAnalysis.confidence === 'Medium' ? "MAYBE" : "NO";
               
  // Allow gut override to boost status if applicable
  if (gutOverride && soul > 0.7) status = "YES (GUT)";
  
  // Let AI determine bet type but use Gary's stake calculation logic
  const betType = parsedAnalysis.betType || selectBetType(baseConfidence, progressToTarget < 1);
  
  // Use the AI-suggested stake, but set a minimum based on original Gary logic
  let stake = parsedAnalysis.stake;
  if (status.includes("YES")) {
    // Ensure stake meets minimum based on original Gary logic
    const minStake = calculateStake(bankroll, betType, baseConfidence);
    stake = Math.max(stake, minStake);
  }
  
  // CRITICAL UPDATE: Always preserve the original text rationale from OpenAI
  // We need the actual text rationale for display on the pick cards
  const textRationale = parsedAnalysis.reasoning || '';
  
  return {
    game_id: gameId,
    home_team: homeTeam,
    away_team: awayTeam,
    league: league,
    bet_type: betType,
    pick: parsedAnalysis.pick,
    line: dataMetrics.line,
    stake,
    status,
    confidence: parsedAnalysis.confidence,
    // Use the text rationale from OpenAI instead of metrics object
    rationale: textRationale,
    rawOpenAIOutput: aiAnalysis.rawOpenAIOutput, // Attach rawOpenAIOutput directly to the pick object
    // Store metrics in a separate field if needed for internal use
    metrics: {
      brain_score: brain,
      soul_score: soul,
      bias_boost: pref,
      memory_mod: memory,
      profit_infl: profit,
      ai_analysis: true
    },
    key_points: parsedAnalysis.keyPoints,
    full_analysis: aiAnalysis.fullAnalysis,
    trap_safe: trap,
    gut_override: gutOverride,
    real_time_data_used: !!realTimeInfo,
    ai_success: aiAnalysis.success,
    emotional_tags: [
      pref > 0.8 && "GaryTeam",
      gutOverride && "GutOverride",
      narrative.revenge && "RevengeAngle",
      parsedAnalysis.confidence === 'High' && "HighConfidence"
    ].filter(Boolean),
  };
}
