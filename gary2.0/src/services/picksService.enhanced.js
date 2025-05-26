/**
 * Enhanced Picks Service
 * 
 * Provides an improved implementation of the normal picks service using the following data sources:
 * 1. Ball Don't Lie API for team stats (PRIORITY 1)
 * 2. MLB Stats API for pitcher data (PRIORITY 2)
 * 3. Perplexity for game context, storylines, and other relevant data
 * 
 * Focused exclusively on moneyline and spread bets (no totals or player props).
 */
import { generateGaryAnalysis, parseGaryAnalysis } from './garyEngine.js';
import { combinedMlbService } from './combinedMlbService.js';
import { oddsService } from './oddsService.js';
import { perplexityService } from './perplexityService.js';

// Set the Perplexity API key for Node.js environments
if (typeof process !== 'undefined' && process.env && process.env.VITE_PERPLEXITY_API_KEY) {
  perplexityService.API_KEY = process.env.VITE_PERPLEXITY_API_KEY;
  console.log(`[Enhanced Picks Service] Perplexity API key loaded successfully`);
}

export const picksService = {
  /**
   * Generates daily picks for the provided sport using enhanced data sources
   * Focuses exclusively on moneyline and spread bets
   * @param {string} sport - Sport key (e.g., 'baseball_mlb')
   * @param {Date} [date=new Date()] - The date to generate picks for
   * @returns {Promise<Array>} - Array of picks
   */
  generateDailyPicks: async function(sport, date = new Date()) {
    try {
      console.log(`[Enhanced Picks Service] Generating normal picks for ${sport}`);
      
      // Format date as needed
      const formattedDate = date.toISOString().split('T')[0];
      console.log(`[Enhanced Picks Service] Date: ${formattedDate}`);
      
      // Get upcoming games from odds service
      const games = await oddsService.getUpcomingGames(sport);
      
      if (!games || games.length === 0) {
        console.log(`[Enhanced Picks Service] No upcoming games found for ${sport}`);
        return [];
      }
      
      console.log(`[Enhanced Picks Service] Found ${games.length} upcoming games`);
      
      // Process games and generate picks based on sport
      let picks = [];
      
      if (sport === 'baseball_mlb') {
        picks = await this.generateMlbNormalPicks(games, formattedDate);
      }
      // Add other sports as needed
      
      // Sort picks by confidence (highest first)
      picks.sort((a, b) => {
        const aConfidence = this.extractHighestConfidence(a.analysis);
        const bConfidence = this.extractHighestConfidence(b.analysis);
        return bConfidence - aConfidence;
      });
      
      // Only return the top 6 picks with the highest confidence
      const topPicks = picks.slice(0, 6);
      console.log(`[Enhanced Picks Service] Generated ${topPicks.length} top picks out of ${picks.length} total`);
      
      return topPicks;
    } catch (error) {
      console.error(`[Enhanced Picks Service] Error generating daily picks:`, error);
      throw error;
    }
  },
  
  /**
   * Extract the highest confidence score from the analysis
   * @param {string} analysis - The pick analysis JSON string
   * @returns {number} - The highest confidence score (0-1)
   */
  extractHighestConfidence: function(analysis) {
    try {
      let parsedAnalysis;
      
      if (typeof analysis === 'string') {
        parsedAnalysis = JSON.parse(analysis);
      } else {
        parsedAnalysis = analysis;
      }
      
      if (parsedAnalysis.recommendations && Array.isArray(parsedAnalysis.recommendations)) {
        // Find the highest confidence score among all recommendations
        const confidenceScores = parsedAnalysis.recommendations.map(rec => rec.confidence || 0);
        return Math.max(...confidenceScores, 0);
      }
      
      return 0;
    } catch (error) {
      console.error('Error extracting confidence score:', error);
      return 0;
    }
  },
  
  /**
   * Generates normal MLB picks using the enhanced combined service
   * @param {Array} games - Array of upcoming games
   * @param {string} date - Formatted date string
   * @returns {Promise<Array>} - Array of MLB picks
   */
  generateMlbNormalPicks: async function(games, date) {
    try {
      console.log(`[Enhanced Picks Service] Generating MLB normal picks for ${games.length} games`);
      const allPicks = [];
      
      // Process each game one by one
      for (const game of games) {
        try {
          // Extract teams
          const homeTeam = game.home_team;
          const awayTeam = game.away_team;
          
          console.log(`[Enhanced Picks Service] Processing ${awayTeam} @ ${homeTeam}`);
          
          // Get comprehensive game data using our enhanced combined service
          const gameData = await combinedMlbService.getComprehensiveGameData(homeTeam, awayTeam, date);
          
          if (!gameData) {
            console.log(`[Enhanced Picks Service] No comprehensive data available for ${awayTeam} @ ${homeTeam}`);
            continue;
          }
          
          // Build the game analysis prompt for Gary's engine
          const analysisPrompt = this.buildMlbGameAnalysisPrompt(gameData, game);
          
          // Generate analysis using Gary's engine
          console.log(`[Enhanced Picks Service] Generating analysis for ${awayTeam} @ ${homeTeam}`);
        
          // Ensure all required fields have values even if they come back as null from combinedMlbService
          // This prevents nulls from flowing into the Gary engine
          const ensureValidData = (data, defaultValue = {}) => {
            return data || defaultValue;
          };
          
          // Create a complete data object that includes all the stats with fallback values
          const completeGameData = {
            homeTeam,
            awayTeam,
            prompt: analysisPrompt,
            sport: 'baseball_mlb',
            // Ensure teamStats is never null, provide default structure if needed
            teamStats: ensureValidData(gameData.teamStats, {
              homeTeam: { teamName: homeTeam, wins: 0, losses: 0, record: '0-0' },
              awayTeam: { teamName: awayTeam, wins: 0, losses: 0, record: '0-0' }
            }),
            // Ensure pitchers is never null, provide default structure if needed
            pitchers: ensureValidData(gameData.pitchers, {
              home: { fullName: 'TBD', seasonStats: { era: '0.00', wins: 0, losses: 0 } },
              away: { fullName: 'TBD', seasonStats: { era: '0.00', wins: 0, losses: 0 } }
            }),
            // Ensure gameContext is never null
            gameContext: ensureValidData(gameData.gameContext, { gamePreview: 'No preview available' }),
            // Ensure hitterStats is never null
            hitterStats: ensureValidData(gameData.hitterStats, { home: [], away: [] }),
            // Other data
            odds: gameData.odds || null,
            gameTime: game.commence_time || new Date().toISOString()
          };
          
          // Validate data completeness before passing to Gary engine
          console.log(`[Enhanced Picks Service] Data validation for ${awayTeam} @ ${homeTeam}:`, {
            hasTeamStats: !!completeGameData.teamStats,
            hasHomeTeamData: !!completeGameData.teamStats.homeTeam,
            hasAwayTeamData: !!completeGameData.teamStats.awayTeam,
            hasPitchers: !!completeGameData.pitchers,
            hasHomePitcher: !!completeGameData.pitchers.home,
            hasAwayPitcher: !!completeGameData.pitchers.away,
            hasGameContext: !!completeGameData.gameContext
          });
          
          console.log(`[Enhanced Picks Service] Passing complete stats to Gary engine for ${awayTeam} @ ${homeTeam}`);
          const analysis = await generateGaryAnalysis(completeGameData);
          
          if (!analysis) {
            console.log(`[Enhanced Picks Service] No analysis generated for ${awayTeam} @ ${homeTeam}`);
            continue;
          }
          
          // Create pick object
          const pick = {
            id: game.id,
            sport: 'baseball_mlb',
            homeTeam,
            awayTeam,
            analysisPrompt,
            analysis,
            gameData,
            gameTime: game.commence_time,
            pickType: 'normal', // Explicitly mark as normal pick
            timestamp: new Date().toISOString()
          };
          
          allPicks.push(pick);
          console.log(`[Enhanced Picks Service] Successfully generated pick for ${awayTeam} @ ${homeTeam}`);
          
        } catch (gameError) {
          console.error(`[Enhanced Picks Service] Error processing game:`, gameError);
          // Continue to next game
        }
      }
      
      return allPicks;
    } catch (error) {
      console.error(`[Enhanced Picks Service] Error generating MLB normal picks:`, error);
      return [];
    }
  },
  
  /**
   * Builds a comprehensive analysis prompt for MLB game analysis
   * @param {Object} gameData - Comprehensive game data from combined service
   * @param {Object} game - Original game object with odds data
   * @returns {string} - Analysis prompt for Gary's engine
   */
  buildMlbGameAnalysisPrompt: function(gameData, game) {
    // Extract necessary data
    const { homeTeam, awayTeam } = gameData.game;
    const homePitcher = gameData.pitchers?.home;
    const awayPitcher = gameData.pitchers?.away;
    const homeStats = gameData.teamStats?.homeTeam;
    const awayStats = gameData.teamStats?.awayTeam;
    const gameContext = gameData.gameContext;
    
    // Add odds information if available from either source
    let oddsString = '';
    let moneylineOdds = { home: null, away: null };
    let spreadOdds = { home: null, away: null };
    
    // Try to get odds from combinedMlbService first (via gameData.odds)
    if (gameData.odds?.bookmakers?.length > 0) {
      console.log(`[Enhanced Picks Service] Using odds data from combinedMlbService`);
      const bookmaker = gameData.odds.bookmakers[0];
      
      // Get moneyline odds
      const h2hMarket = bookmaker.markets?.find(m => m.key === 'h2h');
      if (h2hMarket) {
        const homeMoneyline = h2hMarket.outcomes.find(o => o.name === homeTeam || o.name.includes(homeTeam) || homeTeam.includes(o.name));
        const awayMoneyline = h2hMarket.outcomes.find(o => o.name === awayTeam || o.name.includes(awayTeam) || awayTeam.includes(o.name));
        
        if (homeMoneyline && awayMoneyline) {
          moneylineOdds.home = homeMoneyline.price;
          moneylineOdds.away = awayMoneyline.price;
          oddsString += `MONEYLINE ODDS (use these for ML bets only):\n`;
          oddsString += `  ${homeTeam}: ${homeMoneyline.price > 0 ? '+' : ''}${homeMoneyline.price}\n`;
          oddsString += `  ${awayTeam}: ${awayMoneyline.price > 0 ? '+' : ''}${awayMoneyline.price}\n\n`;
        }
      }
      
      // Get spread odds
      const spreadMarket = bookmaker.markets?.find(m => m.key === 'spreads');
      if (spreadMarket) {
        const homeSpread = spreadMarket.outcomes.find(o => o.name === homeTeam || o.name.includes(homeTeam) || homeTeam.includes(o.name));
        const awaySpread = spreadMarket.outcomes.find(o => o.name === awayTeam || o.name.includes(awayTeam) || awayTeam.includes(o.name));
        
        if (homeSpread && awaySpread) {
          spreadOdds.home = { point: homeSpread.point, price: homeSpread.price };
          spreadOdds.away = { point: awaySpread.point, price: awaySpread.price };
          oddsString += `POINT SPREAD ODDS (use these for spread bets only):\n`;
          oddsString += `  ${homeTeam} ${homeSpread.point > 0 ? '+' : ''}${homeSpread.point}: ${homeSpread.price > 0 ? '+' : ''}${homeSpread.price}\n`;
          oddsString += `  ${awayTeam} ${awaySpread.point > 0 ? '+' : ''}${awaySpread.point}: ${awaySpread.price > 0 ? '+' : ''}${awaySpread.price}\n`;
        }
      }
    } 
    // Fallback to game object if available
    else if (game.bookmakers?.length > 0) {
      console.log(`[Enhanced Picks Service] Using odds data from game object fallback`);
      const h2hMarket = game.bookmakers[0]?.markets?.find(m => m.key === 'h2h');
      const spreadMarket = game.bookmakers[0]?.markets?.find(m => m.key === 'spreads');
      
      if (h2hMarket) {
        const homeMoneyline = h2hMarket.outcomes.find(o => o.name === homeTeam);
        const awayMoneyline = h2hMarket.outcomes.find(o => o.name === awayTeam);
        
        if (homeMoneyline && awayMoneyline) {
          moneylineOdds.home = homeMoneyline.price;
          moneylineOdds.away = awayMoneyline.price;
          oddsString += `MONEYLINE ODDS (use these for ML bets only):\n`;
          oddsString += `  ${homeTeam}: ${homeMoneyline.price > 0 ? '+' : ''}${homeMoneyline.price}\n`;
          oddsString += `  ${awayTeam}: ${awayMoneyline.price > 0 ? '+' : ''}${awayMoneyline.price}\n\n`;
        }
      }
      
      if (spreadMarket) {
        const homeSpread = spreadMarket.outcomes.find(o => o.name === homeTeam);
        const awaySpread = spreadMarket.outcomes.find(o => o.name === awayTeam);
        
        if (homeSpread && awaySpread) {
          spreadOdds.home = { point: homeSpread.point, price: homeSpread.price };
          spreadOdds.away = { point: awaySpread.point, price: awaySpread.price };
          oddsString += `POINT SPREAD ODDS (use these for spread bets only):\n`;
          oddsString += `  ${homeTeam} ${homeSpread.point > 0 ? '+' : ''}${homeSpread.point}: ${homeSpread.price > 0 ? '+' : ''}${homeSpread.price}\n`;
          oddsString += `  ${awayTeam} ${awaySpread.point > 0 ? '+' : ''}${awaySpread.point}: ${awaySpread.price > 0 ? '+' : ''}${awaySpread.price}\n`;
        }
      }
    } else {
      console.log(`[Enhanced Picks Service] No odds data available for ${homeTeam} vs ${awayTeam}`);
    }
    
    // Start building the prompt
    let prompt = `Generate a detailed MLB betting analysis for ${awayTeam} @ ${homeTeam}. Focus ONLY on moneyline and spread bets (NO totals or player props):\n\n`;
    
    // Add team records and stats
    prompt += `TEAM COMPARISON:\n`;
    if (homeStats && awayStats) {
      prompt += `${homeTeam} (${homeStats.record || 'N/A'}) vs ${awayTeam} (${awayStats.record || 'N/A'})\n`;
      prompt += `${homeTeam} last 10: ${homeStats.lastTenGames || 'N/A'}, Home: ${homeStats.homeRecord || 'N/A'}\n`;
      prompt += `${awayTeam} last 10: ${awayStats.lastTenGames || 'N/A'}, Away: ${awayStats.awayRecord || 'N/A'}\n\n`;
    } else {
      prompt += `Team records and recent performance data not available.\n\n`;
    }
    
    // Add starting pitcher information
    prompt += `PROBABLE STARTING PITCHERS:\n`;
    if (homePitcher && homePitcher.fullName && homePitcher.fullName !== 'Unknown Pitcher') {
      const homeStats = homePitcher.seasonStats || {};
      prompt += `${homeTeam}: ${homePitcher.fullName} (${homeStats.wins || 0}-${homeStats.losses || 0}, ERA: ${homeStats.era || 'N/A'}, WHIP: ${homeStats.whip || 'N/A'}, K: ${homeStats.strikeouts || 0})\n`;
    } else {
      prompt += `${homeTeam}: Probable starter TBD\n`;
    }
    
    if (awayPitcher && awayPitcher.fullName && awayPitcher.fullName !== 'Unknown Pitcher') {
      const awayStats = awayPitcher.seasonStats || {};
      prompt += `${awayTeam}: ${awayPitcher.fullName} (${awayStats.wins || 0}-${awayStats.losses || 0}, ERA: ${awayStats.era || 'N/A'}, WHIP: ${awayStats.whip || 'N/A'}, K: ${awayStats.strikeouts || 0})\n\n`;
    } else {
      prompt += `${awayTeam}: Probable starter TBD\n\n`;
    }
    
    // Add game context from Perplexity if available
    if (gameContext) {
      prompt += `GAME CONTEXT:\n`;
      
      if (gameContext.playoffStatus) {
        prompt += `Playoff Status: ${gameContext.playoffStatus}\n`;
      }
      
      if (gameContext.homeTeamStorylines) {
        prompt += `${homeTeam} Storylines: ${gameContext.homeTeamStorylines}\n`;
      }
      
      if (gameContext.awayTeamStorylines) {
        prompt += `${awayTeam} Storylines: ${gameContext.awayTeamStorylines}\n`;
      }
      
      if (gameContext.injuryReport) {
        prompt += `Injury Report: ${gameContext.injuryReport}\n`;
      }
      
      if (gameContext.keyMatchups) {
        prompt += `Key Matchups: ${gameContext.keyMatchups}\n`;
      }
      
      if (gameContext.bettingTrends) {
        prompt += `Betting Trends: ${gameContext.bettingTrends}\n`;
      }
      
      if (gameContext.weatherConditions) {
        prompt += `Weather: ${gameContext.weatherConditions}\n`;
      }
      
      prompt += `\n`;
    }
    
    // Add odds information
    if (oddsString) {
      prompt += `ODDS INFORMATION:\n${oddsString}\n\n`;
    } else {
      prompt += `ODDS INFORMATION: Not available\n\n`;
    }
    
    // Add instructions for generating the analysis
    prompt += `Based on the above information, analyze this game and make your best pick. Remember, you are Gary the grizzled betting expert.\n\n`;
    
    prompt += `SPREAD VS MONEYLINE DECISION CRITERIA:\n`;
    prompt += `1. For MLB games, the spread is always -1.5/+1.5. Consider the spread when:\n`;
    prompt += `   - A dominant pitcher faces a weak lineup (take favorite -1.5)\n`;
    prompt += `   - The favorite has been winning by 2+ runs consistently\n`;
    prompt += `   - The underdog +1.5 offers great value against an inconsistent favorite\n`;
    prompt += `2. Consider moneyline when:\n`;
    prompt += `   - The game is expected to be close (strong pitching matchup)\n`;
    prompt += `   - The underdog has upset potential but might lose by 1 run\n`;
    prompt += `   - The favorite's ML odds are reasonable (-150 or better)\n`;
    prompt += `3. IMPORTANT: Aim for a balanced mix of spread and moneyline picks\n\n`;
    
    prompt += `CRITICAL: You must return ONLY a single JSON object in the exact format specified. Do not return an analysis object with recommendations array. Return the pick directly.\n\n`;
    
    prompt += `ODDS USAGE RULES:\n`;
    prompt += `1. If you pick a SPREAD bet (e.g., "Yankees -1.5"), you MUST use the spread odds from "POINT SPREAD ODDS" section\n`;
    prompt += `2. If you pick a MONEYLINE bet (e.g., "Yankees ML"), you MUST use the moneyline odds from "MONEYLINE ODDS" section\n`;
    prompt += `3. NEVER mix up the odds - using moneyline odds for a spread bet is WRONG\n\n`;
    
    prompt += `IMPORTANT: The "pick" field MUST ALWAYS include the odds. Never omit the odds. Examples:\n`;
    prompt += `- For moneyline: "Boston Red Sox ML -120" or "Yankees ML +145"\n`;
    prompt += `- For spread: "Yankees -1.5 -110" or "Red Sox +1.5 -105"\n`;
    prompt += `NEVER write just "Boston Red Sox ML" without the odds!\n\n`;
    
    prompt += `The JSON must include ALL these fields exactly:\n`;
    prompt += `{\n`;
    prompt += `  "pick": "MUST include team name, bet type (ML or spread with number), AND odds (e.g., 'Boston Red Sox ML -120' or 'Yankees -1.5 -105')",\n`;
    prompt += `  "odds": "${oddsString ? 'The specific odds number for your chosen bet type (e.g., "-110" or "+145")' : '-110'}",\n`;
    prompt += `  "time": "${game.commence_time ? new Date(game.commence_time).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'America/New_York' }) + ' EST' : 'TBD'}",\n`;
    prompt += `  "type": "spread" or "moneyline",\n`;
    prompt += `  "league": "MLB",\n`;
    prompt += `  "revenge": false,\n`;
    prompt += `  "awayTeam": "${awayTeam}",\n`;
    prompt += `  "homeTeam": "${homeTeam}",\n`;
    prompt += `  "momentum": 0.0-1.0,\n`;
    prompt += `  "rationale": "Your 2-4 sentence Gary-style explanation - vary your reasoning, don't always focus on ERA",\n`;
    prompt += `  "trapAlert": false,\n`;
    prompt += `  "confidence": 0.5-1.0,\n`;
    prompt += `  "superstition": false\n`;
    prompt += `}\n\n`;
    prompt += `Remember: ALWAYS include the odds in the pick field! This is mandatory.`;
    
    return prompt;
  }
};

export default picksService;
