/**
 * Optimized Picks Service
 * A streamlined version of the picks generation process that reduces redundancy
 * while maintaining the same functionality as picksService.js
 */
import { makeGaryPick } from './garyEngine.js';
import { oddsService } from './oddsService';
import { supabase } from '../supabaseClient.js';
import { sportsDataService } from './sportsDataService.js';
import { apiSportsService } from './apiSportsService.js';
import { ballDontLieService } from './ballDontLieService.js';
import { mlbStatsApiService } from './mlbStatsApiService.js';
import { perplexityService } from './perplexityService.js';

// Simple request cache to avoid redundant API calls
const requestCache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// Log levels
const LOG_LEVELS = {
  ERROR: 0,
  WARN: 1,
  INFO: 2,
  DEBUG: 3
};

// Current log level - can be changed programmatically
let currentLogLevel = LOG_LEVELS.INFO;

const optimizedPicksService = {
  // Set the current log level
  setLogLevel(level) {
    if (LOG_LEVELS[level] !== undefined) {
      currentLogLevel = LOG_LEVELS[level];
    }
  },

  // Logging functions with levels
  log(level, ...args) {
    if (LOG_LEVELS[level] <= currentLogLevel) {
      const prefix = `[${level}]`;
      console.log(prefix, ...args);
    }
  },

  // Cache helper function - get from cache or fetch
  async getCachedOrFetch(cacheKey, fetchFn) {
    const now = Date.now();
    const cached = requestCache.get(cacheKey);
    
    if (cached && (now - cached.timestamp < CACHE_TTL)) {
      this.log('DEBUG', `Using cached data for ${cacheKey}`);
      return cached.data;
    }
    
    this.log('DEBUG', `Cache miss for ${cacheKey}, fetching fresh data...`);
    const data = await fetchFn();
    requestCache.set(cacheKey, { data, timestamp: now });
    return data;
  },

  // Team name matching helper (same as in picksService)
  _teamNameMatch(team1, team2) {
    if (!team1 || !team2) return false;
    
    // Clean and lowercase both names
    const clean1 = team1.toLowerCase().replace(/[^a-z0-9]/g, '');
    const clean2 = team2.toLowerCase().replace(/[^a-z0-9]/g, '');
    
    // Check for exact match or substring match
    return clean1 === clean2 || 
           clean1.includes(clean2) || 
           clean2.includes(clean1);
  },

  // Batch fetch all data needed for a game instead of fetching it repeatedly
  async batchFetchGameData(game, sportName) {
    this.log('INFO', `Batch fetching all data for ${game.home_team} vs ${game.away_team}`);
    
    const data = {
      game,
      sportName,
      statsContext: null,
      pitcherData: null,
      gameTimeAndHeadlines: null
    };

    // Get comprehensive team statistics
    data.statsContext = await this.getCachedOrFetch(
      `stats_${game.home_team}_${game.away_team}_${sportName}`,
      async () => sportsDataService.generateTeamStatsForGame(
        game.home_team,
        game.away_team,
        sportName
      )
    );
    
    // Add odds data to the stats context
    if (data.statsContext.statsAvailable) {
      data.statsContext.odds = {
        home: game.bookmakers?.[0]?.markets?.[0]?.outcomes?.[0]?.price,
        away: game.bookmakers?.[0]?.markets?.[0]?.outcomes?.[1]?.price,
        pointSpread: game.bookmakers?.[0]?.markets?.[1]?.outcomes?.[0]?.point
      };
    }
    
    // Get pitcher data for MLB games
    if (sportName === 'MLB') {
      // Fetch all MLB-specific data in parallel
      const [pitcherData, gameTimeHeadlines] = await Promise.all([
        // Pitcher matchup data
        this.getCachedOrFetch(
          `pitcher_${game.home_team}_${game.away_team}`,
          async () => {
            try {
              return await ballDontLieService.getMlbPitcherMatchup(game.home_team, game.away_team);
            } catch (error) {
              this.log('ERROR', `Error fetching pitcher matchup:`, error);
              return null;
            }
          }
        ),
        
        // Game time and headlines
        this.getCachedOrFetch(
          `game_time_${game.home_team}_${game.away_team}_${sportName}`,
          async () => {
            try {
              return await perplexityService.getGameTimeAndHeadlines(
                game.home_team,
                game.away_team,
                sportName
              );
            } catch (error) {
              this.log('ERROR', `Error fetching game time and headlines:`, error);
              return { gameTime: 'Unknown', headlines: [] };
            }
          }
        )
      ]);
      
      data.pitcherData = pitcherData;
      data.gameTimeAndHeadlines = gameTimeHeadlines;
    } else {
      // For non-MLB games, just get game time and headlines
      data.gameTimeAndHeadlines = await this.getCachedOrFetch(
        `game_time_${game.home_team}_${game.away_team}_${sportName}`,
        async () => {
          try {
            return await perplexityService.getGameTimeAndHeadlines(
              game.home_team,
              game.away_team,
              sportName
            );
          } catch (error) {
            this.log('ERROR', `Error fetching game time and headlines:`, error);
            return { gameTime: 'Unknown', headlines: [] };
          }
        }
      );
    }
    
    return data;
  },

  // Process a single game and generate a pick
  async processGame(gameData) {
    const { game, sportName, statsContext, pitcherData, gameTimeAndHeadlines } = gameData;
    
    this.log('INFO', `Processing ${game.home_team} vs ${game.away_team} (${sportName})`);
    
    // Skip games with insufficient stats
    if (!statsContext || !statsContext.statsAvailable) {
      this.log('WARN', `Insufficient stats available for ${game.home_team} vs ${game.away_team}, skipping`);
      return null;
    }
    
    // Prepare the prompt context
    let promptContext = `Game: ${game.away_team} @ ${game.home_team}\n`;
    promptContext += `Game Time: ${gameTimeAndHeadlines?.gameTime || 'Unknown'}\n\n`;
    
    if (gameTimeAndHeadlines?.headlines?.length > 0) {
      promptContext += "Recent Headlines:\n";
      gameTimeAndHeadlines.headlines.forEach(headline => {
        promptContext += `- ${headline}\n`;
      });
      promptContext += "\n";
    }
    
    // Add stats context
    promptContext += statsContext.statsText || '';
    
    // Add pitcher data for MLB games
    if (sportName === 'MLB' && pitcherData) {
      promptContext += `\n\nPITCHER MATCHUP:\n${pitcherData.pitcherMatchupText || ''}`;
    }
    
    // Add odds information
    promptContext += `\n\nODDS:\n`;
    promptContext += `${game.home_team} Moneyline: ${statsContext.odds?.home || 'Unknown'}\n`;
    promptContext += `${game.away_team} Moneyline: ${statsContext.odds?.away || 'Unknown'}\n`;
    
    if (statsContext.odds?.pointSpread) {
      promptContext += `Spread: ${statsContext.odds.pointSpread}\n`;
    }
    
    // Generate pick using Gary's engine
    this.log('INFO', `Generating pick for ${game.home_team} vs ${game.away_team}`);
    const pickData = await makeGaryPick(
      game.home_team,
      game.away_team,
      promptContext,
      sportName,
      statsContext.odds
    );
    
    // Add game information to the pick
    pickData.gameInfo = {
      home: game.home_team,
      away: game.away_team,
      league: sportName,
      gameTime: gameTimeAndHeadlines?.gameTime || 'Unknown',
      odds: statsContext.odds
    };
    
    return pickData;
  },

  // Main function to generate daily picks
  async generateDailyPicks() {
    try {
      this.log('INFO', 'Generating optimized daily picks with reduced redundancy');
      
      // Get active sports and their games
      const sportsToAnalyze = ['basketball_nba', 'baseball_mlb', 'icehockey_nhl'];
      const allPicks = [];
      
      // Process one sport at a time
      for (const sport of sportsToAnalyze) {
        this.log('INFO', `Processing ${sport} games`);
        
        try {
          // Get games for this sport
          const games = await this.getCachedOrFetch(
            `upcoming_games_${sport}`,
            async () => oddsService.getUpcomingGames(sport)
          );
          
          this.log('INFO', `Got ${games.length} games for ${sport}`);
          
          if (games.length === 0) {
            this.log('INFO', `No games found for ${sport}, skipping...`);
            continue;
          }
          
          // Map sport key to readable name
          const sportName = sport.includes('basketball') ? 'NBA' :
                          sport.includes('baseball') ? 'MLB' :
                          sport.includes('hockey') ? 'NHL' :
                          sport.includes('football') ? 'NFL' : 'Unknown';
          
          // Batch fetch all game data first
          const gameDataPromises = games.map(game => 
            this.batchFetchGameData(game, sportName)
          );
          
          // Wait for all data to be fetched
          const allGameData = await Promise.all(gameDataPromises);
          
          // Process each game and generate picks
          this.log('INFO', `Generating picks for ${games.length} ${sportName} games...`);
          
          const pickPromises = allGameData.map(gameData => 
            this.processGame(gameData)
          );
          
          // Wait for all picks to be generated
          const gamePicks = (await Promise.all(pickPromises)).filter(pick => pick !== null);
          
          // Filter based on confidence level
          const confidenceThreshold = sportName === 'MLB' ? 0.79 : 0.79;
          const confidencePicks = gamePicks.filter(pick => 
            pick && pick.confidence >= confidenceThreshold
          );
          
          this.log('INFO', `Generated ${confidencePicks.length} picks (${gamePicks.length} total picks, confidence threshold: ${confidenceThreshold})`);
          
          // Add picks to the collection
          allPicks.push(...confidencePicks);
          
        } catch (sportError) {
          this.log('ERROR', `Error processing ${sport}:`, sportError);
        }
      }
      
      // Skip storage if no picks were generated
      if (allPicks.length === 0) {
        this.log('WARN', 'No picks were generated, skipping database storage');
        return { success: false, error: 'No picks generated' };
      }
      
      // Store picks in database
      return await this.storeDailyPicksInDatabase(allPicks);
      
    } catch (error) {
      this.log('ERROR', 'Error generating daily picks:', error);
      throw error;
    }
  },

  // Ensure valid Supabase session
  async ensureValidSupabaseSession() {
    try {
      const { data, error } = await supabase.auth.getSession();
      
      if (error || !data.session) {
        this.log('WARN', 'No valid Supabase session found, attempting to sign in anonymously');
        
        const { error: signInError } = await supabase.auth.signInAnonymously();
        
        if (signInError) {
          this.log('ERROR', 'Failed to sign in anonymously:', signInError);
          throw new Error(`Supabase authentication failed: ${signInError.message}`);
        }
      }
      
      return true;
    } catch (error) {
      this.log('ERROR', 'Error ensuring valid Supabase session:', error);
      throw error;
    }
  },

  // Check if picks for today already exist
  async checkForExistingPicks(dateString) {
    try {
      await this.ensureValidSupabaseSession();
      
      const { data, error } = await supabase
        .from('daily_picks')
        .select('id')
        .eq('date', dateString)
        .limit(1);
        
      if (error) {
        this.log('ERROR', 'Error checking for existing picks:', error);
        throw new Error(`Failed to check for existing picks: ${error.message}`);
      }
      
      return data && data.length > 0;
    } catch (error) {
      this.log('ERROR', 'Error checking for existing picks:', error);
      throw error;
    }
  },

  // Store picks in database
  async storeDailyPicksInDatabase(picks) {
    try {
      const now = new Date();
      const currentDateString = now.toISOString().split('T')[0]; // YYYY-MM-DD format
      
      // Check if we already have picks for today
      const picksExist = await this.checkForExistingPicks(currentDateString);
      if (picksExist) {
        this.log('WARN', `Picks for ${currentDateString} already exist, skipping storage`);
        return { success: false, error: 'Picks for today already exist' };
      }
      
      // Store raw JSON outputs directly
      const rawJsonOutputs = picks.map(pick => {
        // Keep only necessary data and ensure we're not duplicating or transforming the OpenAI output
        return {
          home_team: pick.gameInfo.home,
          away_team: pick.gameInfo.away,
          league: pick.gameInfo.league,
          gameTime: pick.gameInfo.gameTime,
          pick: pick.pick,
          analysis: pick.analysis,
          confidence: pick.confidence,
          odds: pick.gameInfo.odds
        };
      });
      
      const pickData = {
        date: currentDateString,
        picks: rawJsonOutputs // Store raw JSON objects directly
      };
      
      this.log('INFO', 'Storing raw JSON objects directly in picks column for Supabase');
      
      // Ensure there's a valid Supabase session
      await this.ensureValidSupabaseSession();
      
      try {
        this.log('INFO', `Inserting raw JSON outputs directly into daily_picks table...`);
        const { error: insertError } = await supabase
          .from('daily_picks')
          .insert(pickData);
          
        if (insertError) {
          // Check if the error is specifically about the bankroll table
          if (insertError.code === '42P01' && insertError.message.includes('bankroll')) {
            this.log('WARN', 'Bankroll table does not exist - using alternative approach without bankroll reference');
            
            // Alternative approach: Use a simplified object that doesn't trigger any bankroll references
            const simplifiedPickData = {
              date: currentDateString,
              picks: rawJsonOutputs // Keep as raw JSON objects for consistency
            };
            
            // Try direct insert without any triggers/functions that might access bankroll
            const { error: simplifiedInsertError } = await supabase
              .from('daily_picks')
              .insert(simplifiedPickData);
              
            if (simplifiedInsertError) {
              this.log('ERROR', 'Error inserting simplified picks:', simplifiedInsertError);
              throw new Error(`Failed to store simplified picks: ${simplifiedInsertError.message}`);
            }
            
            this.log('INFO', 'Picks stored successfully using simplified approach');
            return { success: true, count: rawJsonOutputs.length, method: 'simplified' };
          } else {
            // Some other database error occurred
            this.log('ERROR', 'Error inserting picks:', insertError);
            throw new Error(`Failed to store picks in database: ${insertError.message}`);
          }
        }
        
        this.log('INFO', 'Picks stored successfully in database');
        return { success: true, count: rawJsonOutputs.length };
      } catch (dbError) {
        // Handle database errors
        this.log('ERROR', 'Database error while storing picks:', dbError);
        throw new Error(`Failed to store picks in database: ${dbError.message}`);
      }
    } catch (error) {
      this.log('ERROR', 'Error storing picks:', error);
      throw new Error(`Failed to store picks in database: ${error.message}`);
    }
  }
};

export { optimizedPicksService };
