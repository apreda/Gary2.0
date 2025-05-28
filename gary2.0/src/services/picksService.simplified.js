/**
 * Simplified Picks Service
 * Streamlined version of the normal picks generation process with reduced repetition
 * and improved maintainability
 */
import { makeGaryPick } from './garyEngine.js';
import { oddsService } from './oddsService.js';
import { supabase } from '../supabaseClient.js';
import { ballDontLieService } from './ballDontLieService.js';
import { picksService as enhancedPicksService } from './picksService.enhanced.js';
import { mlbPicksGenerationService } from './mlbPicksGenerationService.js';

/**
 * Common utilities and helpers
 */
const utils = {
  // Get EST date string
  getESTDateString(date = new Date()) {
    const estOptions = { timeZone: 'America/New_York' };
    const estDateString = date.toLocaleDateString('en-US', estOptions);
    const [month, day, year] = estDateString.split('/');
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  },

  // Check if team names match
  teamNameMatch(team1, team2) {
    if (!team1 || !team2) return false;
    const clean1 = team1.toLowerCase().replace(/[^a-z0-9]/g, '');
    const clean2 = team2.toLowerCase().replace(/[^a-z0-9]/g, '');
    return clean1 === clean2 || clean1.includes(clean2) || clean2.includes(clean1);
  },

  // Filter games for today/tomorrow
  filterGamesForToday(games) {
    const now = new Date();
    const twentyFourHoursLater = now.getTime() + (24 * 60 * 60 * 1000);
    const todayEST = this.getESTDateString(now);
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowEST = this.getESTDateString(tomorrow);

    return games.filter(game => {
      const gameTime = new Date(game.commence_time).getTime();
      const isWithin24Hours = gameTime >= now.getTime() && gameTime <= twentyFourHoursLater;
      const gameEST = this.getESTDateString(new Date(game.commence_time));
      const isTodayOrTomorrow = gameEST === todayEST || gameEST === tomorrowEST;
      
      return isWithin24Hours || isTodayOrTomorrow;
    });
  },

  // Parse pick analysis consistently
  parsePickAnalysis(pick) {
    let pickData = null;
    try {
      if (typeof pick.analysis === 'string') {
        pickData = JSON.parse(pick.analysis);
      } else if (pick.analysis?.rawOpenAIOutput) {
        pickData = pick.analysis.rawOpenAIOutput;
      } else if (pick.analysis) {
        pickData = pick.analysis;
      }
    } catch (parseError) {
      console.error('Error parsing pick analysis:', parseError);
    }
    return pickData;
  },

  // Create standardized pick object
  createStandardizedPick(pick, sport, pickType = 'normal') {
    const pickData = this.parsePickAnalysis(pick);
    
    return {
      ...pick,
      sport,
      pickType,
      success: true,
      rawAnalysis: { rawOpenAIOutput: pickData },
      // Standardized fields
      pick: pickData?.pick || '',
      time: pickData?.time || pick.gameTime || 'TBD',
      type: pickData?.type || 'moneyline',
      league: pickData?.league || sport.toUpperCase(),
      revenge: pickData?.revenge || false,
      awayTeam: pickData?.awayTeam || pick.awayTeam,
      homeTeam: pickData?.homeTeam || pick.homeTeam,
      momentum: pickData?.momentum || 0,
      rationale: pickData?.rationale || '',
      trapAlert: pickData?.trapAlert || false,
      confidence: pickData?.confidence || 0,
      superstition: pickData?.superstition || false,
      timestamp: new Date().toISOString()
    };
  }
};

/**
 * Sport-specific processors
 */
const sportProcessors = {
  // MLB processor
  async processMLB() {
    console.log('Processing MLB games...');
    const picks = [];

    try {
      // Normal picks
      const normalMlbPicks = await enhancedPicksService.generateDailyPicks('baseball_mlb');
      const standardizedNormalPicks = normalMlbPicks.map(pick => 
        utils.createStandardizedPick(pick, 'baseball_mlb', 'normal')
      );
      picks.push(...standardizedNormalPicks);

      // Prop picks
      const propPicks = await mlbPicksGenerationService.generateDailyPropPicks();
      picks.push(...propPicks);

      console.log(`Generated ${picks.length} MLB picks (${standardizedNormalPicks.length} normal, ${propPicks.length} props)`);
    } catch (error) {
      console.error('Error processing MLB games:', error);
    }

    return picks;
  },

  // NBA processor
  async processNBA() {
    console.log('Processing NBA games...');
    const picks = [];
    const processedGames = new Set();

    try {
      const games = await oddsService.getUpcomingGames('basketball_nba');
      const todayGames = utils.filterGamesForToday(games);
      
      console.log(`Found ${todayGames.length} NBA games for today/tomorrow`);

      for (const game of todayGames) {
        const gameId = `${game.id}`;
        if (processedGames.has(gameId)) continue;
        processedGames.add(gameId);

        try {
          const pick = await this.processNBAGame(game);
          if (pick) picks.push(pick);
        } catch (error) {
          console.error(`Error processing NBA game ${game.away_team} @ ${game.home_team}:`, error);
        }
      }
    } catch (error) {
      console.error('Error processing NBA games:', error);
    }

    return picks;
  },

  // Process individual NBA game
  async processNBAGame(game) {
    console.log(`Processing NBA game: ${game.away_team} @ ${game.home_team}`);

    // Get team stats
    const teamStats = await this.getNBATeamStats(game);
    
    // Get playoff stats report
    const playoffStatsReport = await ballDontLieService.generateNbaPlayoffReport(
      game.home_team, 
      game.away_team, 
      new Date().getFullYear()
    );

    // Create game object
    const gameObj = {
      id: `${game.id}`,
      sport: 'nba',
      league: 'NBA',
      homeTeam: game.home_team,
      awayTeam: game.away_team,
      homeTeamStats: teamStats.home,
      awayTeamStats: teamStats.away,
      statsReport: `## PLAYOFF STATS:\n${playoffStatsReport}`,
      isPlayoffGame: true,
      odds: this.formatOddsData(game),
      gameTime: game.commence_time,
      time: game.commence_time
    };

    // Generate pick
    const result = await makeGaryPick(gameObj);
    
    if (result.success) {
      console.log(`Successfully generated NBA pick: ${result.rawAnalysis?.rawOpenAIOutput?.pick || 'Unknown pick'}`);
      return {
        ...result,
        game: `${game.away_team} @ ${game.home_team}`,
        sport: 'basketball_nba',
        homeTeam: game.home_team,
        awayTeam: game.away_team,
        gameTime: game.commence_time,
        pickType: 'normal',
        timestamp: new Date().toISOString()
      };
    } else {
      console.log(`Failed to generate NBA pick for ${game.away_team} @ ${game.home_team}:`, result.error);
      return null;
    }
  },

  // Get NBA team stats
  async getNBATeamStats(game) {
    let homeTeamStats = null;
    let awayTeamStats = null;
    
    try {
      const nbaTeams = await ballDontLieService.getNbaTeams();
      
      const homeTeam = nbaTeams.find(t => 
        t.full_name.toLowerCase().includes(game.home_team.toLowerCase()) ||
        game.home_team.toLowerCase().includes(t.full_name.toLowerCase())
      );
      
      const awayTeam = nbaTeams.find(t => 
        t.full_name.toLowerCase().includes(game.away_team.toLowerCase()) ||
        game.away_team.toLowerCase().includes(t.full_name.toLowerCase())
      );
      
      if (homeTeam) {
        homeTeamStats = {
          name: homeTeam.full_name,
          abbreviation: homeTeam.abbreviation,
          conference: homeTeam.conference,
          division: homeTeam.division
        };
      }
      
      if (awayTeam) {
        awayTeamStats = {
          name: awayTeam.full_name,
          abbreviation: awayTeam.abbreviation,
          conference: awayTeam.conference,
          division: awayTeam.division
        };
      }
    } catch (error) {
      console.log(`Could not get NBA team info: ${error.message}`);
    }
    
    return { home: homeTeamStats, away: awayTeamStats };
  },

  // Format odds data
  formatOddsData(game) {
    if (game.bookmakers && game.bookmakers.length > 0) {
      const bookmaker = game.bookmakers[0];
      return {
        bookmaker: bookmaker.title,
        markets: bookmaker.markets
      };
    }
    return null;
  },

  // NHL processor (placeholder for future implementation)
  async processNHL() {
    console.log('NHL processing not yet implemented in simplified service');
    return [];
  }
};

/**
 * Database operations
 */
const database = {
  async ensureValidSession() {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        const { error } = await supabase.auth.signInAnonymously();
        if (error) return false;
      }
      return true;
    } catch {
      return false;
    }
  },

  async checkForExistingPicks(dateString) {
    await this.ensureValidSession();
    const { data, error } = await supabase
      .from('daily_picks')
      .select('id')
      .eq('date', dateString)
      .limit(1);
    if (error) return false;
    return data && data.length > 0;
  },

  async storePicks(picks) {
    if (!picks || !Array.isArray(picks) || picks.length === 0) {
      return { success: false, message: 'No picks provided' };
    }

    const currentDateString = utils.getESTDateString();
    console.log(`Storing picks for date: ${currentDateString}`);

    // Check if picks already exist
    const picksExist = await this.checkForExistingPicks(currentDateString);
    if (picksExist) {
      console.log(`Picks for ${currentDateString} already exist in database, skipping insertion`);
      return { success: true, count: 0, message: 'Picks already exist for today' };
    }

    // Filter picks by confidence (>= 0.7 for MLB, all others included)
    const validPicks = picks.map((pick, index) => {
      const pickData = utils.parsePickAnalysis(pick);
      
      // Generate a consistent pick ID
      const generatePickId = (data, date, index) => {
        const components = [
          data?.league || 'sport',
          data?.homeTeam || data?.awayTeam || 'teams',
          data?.pick || 'pick',
          index.toString()
        ];
        
        const pickString = components.join('-').toLowerCase().replace(/[^a-z0-9-]/g, '');
        return `pick-${date}-${pickString}`;
      };
      
      const result = {
        pick_id: generatePickId(pickData || pick, currentDateString, index),
        pick: pickData?.pick || pick.pick,
        time: pickData?.time || pick.time,
        type: pickData?.type || pick.type || 'moneyline',
        league: pickData?.league || pick.league || 'NBA',
        revenge: pickData?.revenge || false,
        awayTeam: pickData?.awayTeam || pick.awayTeam,
        homeTeam: pickData?.homeTeam || pick.homeTeam,
        momentum: pickData?.momentum || 0,
        rationale: pickData?.rationale || pick.rationale,
        trapAlert: pickData?.trapAlert || false,
        confidence: pickData?.confidence || pick.confidence || 0,
        superstition: pickData?.superstition || false,
        sport: pick.sport
      };
      
      return result;
    }).filter(pick => {
      const confidence = typeof pick.confidence === 'number' ? pick.confidence : 0;
      const sport = pick.sport || '';
      
      // For NBA and NHL, always include regardless of confidence
      if (sport === 'basketball_nba' || sport === 'icehockey_nhl') {
        return true;
      }
      
      // For MLB, apply 0.7 confidence threshold
      return confidence >= 0.7;
    });

    console.log(`After filtering: ${validPicks.length} picks remaining from ${picks.length} total`);

    if (validPicks.length === 0) {
      return { success: false, message: 'No picks to store after filtering' };
    }

    // Store in database
    await this.ensureValidSession();

    try {
      const { error } = await supabase
        .from('daily_picks')
        .insert({
          date: currentDateString,
          picks: validPicks
        });

      if (error) {
        console.error('Error inserting picks:', error);
        throw new Error(`Failed to store picks: ${error.message}`);
      }

      console.log(`Successfully stored ${validPicks.length} picks in database`);
      return { success: true, count: validPicks.length };
    } catch (error) {
      console.error('Error storing picks:', error);
      throw new Error(`Failed to store picks: ${error.message}`);
    }
  }
};

/**
 * Main simplified picks service
 */
export const simplifiedPicksService = {
  async generateDailyPicks() {
    try {
      console.log('=== Starting Simplified Daily Picks Generation ===');
      
      const sportsToProcess = ['baseball_mlb', 'basketball_nba'];
      let allPicks = [];

      // Process each sport
      for (const sport of sportsToProcess) {
        console.log(`\n--- Processing ${sport.toUpperCase()} ---`);
        
        let sportPicks = [];
        if (sport === 'baseball_mlb') {
          sportPicks = await sportProcessors.processMLB();
        } else if (sport === 'basketball_nba') {
          sportPicks = await sportProcessors.processNBA();
        }
        
        allPicks.push(...sportPicks);
        console.log(`Added ${sportPicks.length} ${sport} picks to collection`);
      }

      console.log(`\n=== Generated ${allPicks.length} total picks ===`);

      // Store picks in database
      if (allPicks.length > 0) {
        const storeResult = await database.storePicks(allPicks);
        console.log('Store result:', storeResult);
        return { success: true, picks: allPicks, storeResult };
      } else {
        console.log('No picks generated');
        return { success: false, message: 'No picks generated' };
      }

    } catch (error) {
      console.error('Error in simplified daily picks generation:', error);
      throw error;
    }
  }
};

export default simplifiedPicksService; 