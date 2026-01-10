/**
 * Scout Report Builder
 * 
 * Builds the initial context that helps Gary form a unique hypothesis.
 * This is the "Level 1" context that Gary always receives.
 */

import { ballDontLieService } from '../../ballDontLieService.js';
import { formatTokenMenu } from '../tools/toolDefinitions.js';
import { fixBdlInjuryStatus } from '../sharedUtils.js';
// All context comes from Gemini 3 Flash with Google Search Grounding
import { GoogleGenerativeAI } from '@google/generative-ai';
import axios from 'axios';

// Lazy-initialize Gemini for grounded searches
let geminiClient = null;
function getGeminiClient() {
  if (!geminiClient) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.warn('[Scout Report] GEMINI_API_KEY not set - Grounding disabled');
      return null;
    }
    geminiClient = new GoogleGenerativeAI(apiKey);
  }
  return geminiClient;
}

/**
 * Calculate the NFL week number from a given date
 * NFL season typically starts first week of September
 * @param {Date} gameDate - The date of the game
 * @returns {number|null} - The NFL week number (1-18) or null if can't determine
 */
function calculateNFLWeek(gameDate) {
  if (!gameDate || !(gameDate instanceof Date)) return null;
  
  const year = gameDate.getFullYear();
  const month = gameDate.getMonth();
  
  // NFL regular season: September through early January
  // Season starts first Thursday of September
  // For January games, they're part of previous year's season
  const seasonYear = month <= 1 ? year - 1 : year;
  
  // Find the first Tuesday of September for the season year
  // (Week 1 starts the Thursday after that Tuesday)
  const sept1 = new Date(seasonYear, 8, 1); // September 1
  const firstTuesday = new Date(sept1);
  const dayOfWeek = sept1.getDay();
  const daysUntilTuesday = (2 - dayOfWeek + 7) % 7;
  firstTuesday.setDate(sept1.getDate() + daysUntilTuesday);
  
  // Week 1 starts on Thursday (2 days after Tuesday)
  const week1Start = new Date(firstTuesday);
  week1Start.setDate(firstTuesday.getDate() + 2);
  
  // Calculate days since Week 1 start
  const daysSinceStart = Math.floor((gameDate - week1Start) / (1000 * 60 * 60 * 24));
  
  if (daysSinceStart < 0) return null; // Before season start
  
  const weekNum = Math.floor(daysSinceStart / 7) + 1;
  
  // Regular season is 18 weeks
  if (weekNum > 18) return null; // Playoffs
  
  return weekNum;
}

/**
 * Fetch a snapshot of the league landscape (standings) to ground analysis
 * This prevents Gary from using historical knowledge for current season evaluation.
 */
async function fetchStandingsSnapshot(sport) {
  try {
    const bdlSport = sportToBdlKey(sport);
    if (!bdlSport || sport === 'NCAAB' || sport === 'NCAAF') return '';

    // Calculate current season dynamically
    const currentMonth = new Date().getMonth() + 1;
    const currentYear = new Date().getFullYear();
    const currentSeason = currentMonth <= 6 ? currentYear - 1 : currentYear;

    const standings = await ballDontLieService.getStandingsGeneric(bdlSport, { season: currentSeason });
    if (!standings || standings.length === 0) return '';

    // Sort by conference/division and rank
    const snapshot = [];
    
    // NBA: Groups by Conference
    if (sport === 'NBA') {
      const east = standings.filter(s => (s.conference === 'East' || s.team?.conference === 'East')).sort((a, b) => a.conference_rank - b.conference_rank);
      const west = standings.filter(s => (s.conference === 'West' || s.team?.conference === 'West')).sort((a, b) => a.conference_rank - b.conference_rank);

      const formatRec = (s) => `${s.wins}-${s.losses}`;

      snapshot.push('EASTERN CONFERENCE TOP 3: ' + east.slice(0, 3).map(s => `${s.team.name} (${formatRec(s)})`).join(', '));
      snapshot.push('EASTERN CONFERENCE BOTTOM 2: ' + east.slice(-2).map(s => `${s.team.name} (${formatRec(s)})`).join(', '));
      snapshot.push('WESTERN CONFERENCE TOP 3: ' + west.slice(0, 3).map(s => `${s.team.name} (${formatRec(s)})`).join(', '));
      snapshot.push('WESTERN CONFERENCE BOTTOM 2: ' + west.slice(-2).map(s => `${s.team.name} (${formatRec(s)})`).join(', '));
    } else {
      // General top 5 for other sports
      const top5 = [...standings].sort((a, b) => (b.wins || 0) - (a.wins || 0)).slice(0, 5);
      const formatRec = (s) => s.overall_record || `${s.wins}-${s.losses}`;
      snapshot.push('LEAGUE TOP 5: ' + top5.map(s => `${s.team.name} (${formatRec(s)})`).join(', '));
    }

    return `
LEAGUE LANDSCAPE (CURRENT 2025-26 STANDINGS)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${snapshot.join('\n')}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`;
  } catch (error) {
    console.warn(`[Scout Report] Error fetching standings snapshot:`, error.message);
    return '';
  }
}

/**
 * Determine game significance tag based on standings/rankings
 * Returns meaningful tags like "Top 10 Matchup", "Division Rivals", etc.
 */
async function determineGameSignificance(homeTeam, awayTeam, sport, standings) {
  try {
    // For NBA: Check conference standings
    if (sport === 'NBA' && standings && standings.length > 0) {
      const homeStanding = standings.find(s => 
        s.team?.name?.toLowerCase().includes(homeTeam.toLowerCase().split(' ').pop()) ||
        homeTeam.toLowerCase().includes(s.team?.name?.toLowerCase().split(' ').pop())
      );
      const awayStanding = standings.find(s => 
        s.team?.name?.toLowerCase().includes(awayTeam.toLowerCase().split(' ').pop()) ||
        awayTeam.toLowerCase().includes(s.team?.name?.toLowerCase().split(' ').pop())
      );
      
      if (homeStanding && awayStanding) {
        const homeRank = homeStanding.conference_rank || homeStanding.rank || 15;
        const awayRank = awayStanding.conference_rank || awayStanding.rank || 15;
        const homeConf = homeStanding.conference || homeStanding.team?.conference;
        const awayConf = awayStanding.conference || awayStanding.team?.conference;
        const homeDiv = homeStanding.division || homeStanding.team?.division;
        const awayDiv = awayStanding.division || awayStanding.team?.division;
        
        // Top 5 matchup in same conference
        if (homeRank <= 5 && awayRank <= 5 && homeConf === awayConf) {
          return `Top 5 ${homeConf}ern Showdown`;
        }
        // Top 10 matchup
        if (homeRank <= 10 && awayRank <= 10) {
          if (homeConf === awayConf) {
            return `${homeConf}ern Conference Battle`;
          }
          return 'Top 10 Matchup';
        }
        // Division rivals
        if (homeDiv && awayDiv && homeDiv === awayDiv) {
          return `${homeDiv} Division Rivals`;
        }
        // Playoff race (teams ranked 6-10)
        if ((homeRank >= 6 && homeRank <= 10) || (awayRank >= 6 && awayRank <= 10)) {
          return 'Playoff Race';
        }
      }
    }
    
    // For NHL: Check conference standings
    if (sport === 'NHL' && standings && standings.length > 0) {
      const homeStanding = standings.find(s => 
        s.team?.name?.toLowerCase().includes(homeTeam.toLowerCase().split(' ').pop()) ||
        homeTeam.toLowerCase().includes(s.team?.name?.toLowerCase().split(' ').pop())
      );
      const awayStanding = standings.find(s => 
        s.team?.name?.toLowerCase().includes(awayTeam.toLowerCase().split(' ').pop()) ||
        awayTeam.toLowerCase().includes(s.team?.name?.toLowerCase().split(' ').pop())
      );
      
      if (homeStanding && awayStanding) {
        const homeRank = homeStanding.conference_rank || homeStanding.rank || 15;
        const awayRank = awayStanding.conference_rank || awayStanding.rank || 15;
        const homeConf = homeStanding.conference || homeStanding.team?.conference;
        const awayConf = awayStanding.conference || awayStanding.team?.conference;
        const homeDiv = homeStanding.division || homeStanding.team?.division;
        const awayDiv = awayStanding.division || awayStanding.team?.division;
        
        // Division rivals (most meaningful in NHL)
        if (homeDiv && awayDiv && homeDiv === awayDiv) {
          return `${homeDiv} Division`;
        }
        // Conference matchup with both teams in playoff position
        if (homeRank <= 8 && awayRank <= 8 && homeConf === awayConf) {
          return `${homeConf}ern Playoff Race`;
        }
        // Top 10 matchup
        if (homeRank <= 10 && awayRank <= 10) {
          return 'Playoff Matchup';
        }
      }
    }
    
    return 'Regular Season';
  } catch (error) {
    console.warn('[Scout Report] Error determining game significance:', error.message);
    return 'Regular Season';
  }
}

/**
 * Build a scout report for a game
 * This gives Gary enough context to think, not just react to odds.
 */
export async function buildScoutReport(game, sport) {
  const homeTeam = game.home_team;
  const awayTeam = game.away_team;
  const sportKey = normalizeSport(sport);
  
  // Fetch basic data in parallel
  const [homeProfile, awayProfile, injuries, recentHome, recentAway, standingsSnapshot, rawStandings] = await Promise.all([
    fetchTeamProfile(homeTeam, sportKey),
    fetchTeamProfile(awayTeam, sportKey),
    fetchInjuries(homeTeam, awayTeam, sportKey),
    fetchRecentGames(homeTeam, sportKey, 5),
    fetchRecentGames(awayTeam, sportKey, 5),
    fetchStandingsSnapshot(sportKey),
    // Also fetch raw standings for game significance determination
    (async () => {
      try {
        const bdlSport = sportToBdlKey(sportKey);
        if (!bdlSport || sportKey === 'NCAAB' || sportKey === 'NCAAF') return null;
        const currentMonth = new Date().getMonth() + 1;
        const currentYear = new Date().getFullYear();
        const currentSeason = currentMonth <= 6 ? currentYear - 1 : currentYear;
        return await ballDontLieService.getStandingsGeneric(bdlSport, { season: currentSeason });
      } catch { return null; }
    })()
  ]);
  
  // For NBA, fetch game context using Gemini Grounding (venue, tournament context, game significance)
  // This works dynamically for regular season, NBA Cup, playoffs, etc.
  let gameContextData = null;
  if (sportKey === 'NBA') {
    try {
      // Use US Eastern time to get correct date (avoids UTC offset issues for evening games)
      let dateStr;
      if (game.commence_time) {
        const gameDate = new Date(game.commence_time);
        dateStr = gameDate.toLocaleDateString('en-CA', { timeZone: 'America/New_York' }); // YYYY-MM-DD format
      } else {
        dateStr = new Date().toISOString().slice(0, 10);
      }
      console.log(`[Scout Report] Fetching NBA game context via Gemini Grounding for ${dateStr}...`);
      
      // Dynamic query to identify regular season, NBA Cup, playoffs, etc.
      const contextQuery = `Given this NBA game: ${awayTeam} vs ${homeTeam} on ${dateStr}.

Determine:
1. GAME TYPE: Is this a regular season game, NBA Cup (In-Season Tournament) game, playoff game, or other? If NBA Cup, specify the round (group stage, quarterfinal, semifinal, championship).
2. VENUE: What is the actual arena/venue name and city where this game is being played? (NBA Cup knockout rounds are at T-Mobile Arena in Las Vegas; regular season games are at the home team's arena)
3. GAME SIGNIFICANCE: If this is a special game (NBA Cup, playoff, rivalry, etc.), briefly explain its significance and what's at stake.
4. TOURNAMENT CONTEXT: If this is an NBA Cup game, what are each team's results/path in this year's tournament so far?

Be specific and factual. If it's just a regular season game, say so clearly.`;

      const contextResult = await geminiGroundingSearch(contextQuery, { 
        temperature: 0.1, 
        maxTokens: 1500 
      });
      
      if (contextResult?.success && contextResult?.data) {
        const responseText = contextResult.data;
        const responseLower = responseText.toLowerCase();

        // Check for explicit REGULAR SEASON indicators first (takes priority)
        const isRegularSeason = responseLower.includes('regular season game') || 
                               responseLower.includes('this is a regular season') ||
                               responseLower.includes('standard regular season') ||
                               (responseLower.includes('regular season') && !responseLower.includes('nba cup'));
        
        // Check for explicit NOT NBA Cup indicators
        const isNotNbaCup = responseLower.includes('not an nba cup') || 
                           responseLower.includes('not nba cup') ||
                           responseLower.includes('nba cup has ended') ||
                           responseLower.includes('nba cup is over') ||
                           responseLower.includes('after the nba cup');

        // Only detect NBA Cup if explicitly stated AND not negated
        const mentionsNbaCup = responseLower.includes('nba cup') || responseLower.includes('in-season tournament');
        const isNbaCup = mentionsNbaCup && !isNotNbaCup && !isRegularSeason &&
                        (responseLower.includes('this is an nba cup') || 
                         responseLower.includes('nba cup game') ||
                         responseLower.includes('nba cup quarterfinal') ||
                         responseLower.includes('nba cup semifinal') ||
                         responseLower.includes('nba cup championship'));
        
        const isPlayoffs = responseLower.includes('playoff game') && !responseLower.includes('not a playoff');
        const isChampionship = isNbaCup && (responseLower.includes('championship') || responseLower.includes('final'));
        const isSemifinal = isNbaCup && responseLower.includes('semifinal');
        const isQuarterfinal = isNbaCup && responseLower.includes('quarterfinal');

        // Parse venue dynamically
        const tMobileMatch = responseLower.includes('t-mobile arena') || responseLower.includes('t‑mobile arena');
        const lasVegasMatch = responseLower.includes('las vegas') && isNbaCup; // Only Vegas matters for NBA Cup

        // Set game properties based on parsed response
        if (isRegularSeason || isNotNbaCup) {
          console.log('[Scout Report] Regular season game (confirmed)');
          // For regular season, determine actual game significance based on standings
          const significance = await determineGameSignificance(homeTeam, awayTeam, 'NBA', rawStandings);
          game.tournamentContext = significance;
          console.log(`[Scout Report] NBA game significance: ${significance}`);
        } else if (isNbaCup) {
          game.isNeutralSite = tMobileMatch || lasVegasMatch;

          if (isChampionship) {
            game.tournamentContext = 'NBA Cup Championship';
            console.log('[Scout Report] ✓ NBA Cup Championship detected');
          } else if (isSemifinal) {
            game.tournamentContext = 'NBA Cup Semifinal';
            console.log('[Scout Report] ✓ NBA Cup Semifinal detected');
          } else if (isQuarterfinal) {
            game.tournamentContext = 'NBA Cup Quarterfinal';
            console.log('[Scout Report] ✓ NBA Cup Quarterfinal detected');
          } else {
            game.tournamentContext = 'NBA Cup';
            console.log('[Scout Report] ✓ NBA Cup game detected');
          }
        } else if (isPlayoffs) {
          game.tournamentContext = 'NBA Playoffs';
          console.log('[Scout Report] ✓ Playoff game detected');
        } else {
          console.log('[Scout Report] Regular season game');
        }
        
        // Set venue if detected
        if (tMobileMatch && lasVegasMatch) {
          game.venue = 'T-Mobile Arena, Las Vegas';
          console.log('[Scout Report] ✓ Venue: T-Mobile Arena, Las Vegas');
        }
        
        // Store the full context for Gary to use
        game.gameSignificance = responseText;
        gameContextData = {
          rawContext: responseText,
          isNbaCup,
          isPlayoffs,
          isNeutralSite: game.isNeutralSite || false
        };
        
        console.log('[Scout Report] ✓ Game context retrieved via Gemini Grounding');
      }
    } catch (e) {
      console.warn('[Scout Report] NBA game context fetch failed:', e.message);
    }
  }
  
  // For NFL, set venue from stadium mapping (Gemini Grounding handles game context)
  // All NFL context comes from Gemini 3 Pro Grounding
  if (sportKey === 'NFL') {
    // NFL team to home stadium mapping (for reliable venue data) - stadium name only, no city
    const nflStadiums = {
      'Arizona Cardinals': 'State Farm Stadium',
      'Atlanta Falcons': 'Mercedes-Benz Stadium',
      'Baltimore Ravens': 'M&T Bank Stadium',
      'Buffalo Bills': 'Highmark Stadium',
      'Carolina Panthers': 'Bank of America Stadium',
      'Chicago Bears': 'Soldier Field',
      'Cincinnati Bengals': 'Paycor Stadium',
      'Cleveland Browns': 'Cleveland Browns Stadium',
      'Dallas Cowboys': 'AT&T Stadium',
      'Denver Broncos': 'Empower Field at Mile High',
      'Detroit Lions': 'Ford Field',
      'Green Bay Packers': 'Lambeau Field',
      'Houston Texans': 'NRG Stadium',
      'Indianapolis Colts': 'Lucas Oil Stadium',
      'Jacksonville Jaguars': 'EverBank Stadium',
      'Kansas City Chiefs': 'GEHA Field at Arrowhead Stadium',
      'Las Vegas Raiders': 'Allegiant Stadium',
      'Los Angeles Chargers': 'SoFi Stadium',
      'Los Angeles Rams': 'SoFi Stadium',
      'Miami Dolphins': 'Hard Rock Stadium',
      'Minnesota Vikings': 'U.S. Bank Stadium',
      'New England Patriots': 'Gillette Stadium',
      'New Orleans Saints': 'Caesars Superdome',
      'New York Giants': 'MetLife Stadium',
      'New York Jets': 'MetLife Stadium',
      'Philadelphia Eagles': 'Lincoln Financial Field',
      'Pittsburgh Steelers': 'Acrisure Stadium',
      'San Francisco 49ers': 'Levi\'s Stadium',
      'Seattle Seahawks': 'Lumen Field',
      'Tampa Bay Buccaneers': 'Raymond James Stadium',
      'Tennessee Titans': 'Nissan Stadium',
      'Washington Commanders': 'Northwest Stadium'
    };
    
    // Set venue from our own data (reliable) - use home team's stadium
    const homeVenue = nflStadiums[homeTeam];
    if (homeVenue) {
      game.venue = homeVenue;
      console.log(`[Scout Report] ✓ NFL Venue (from mapping): ${homeVenue}`);
    }
    // Game context (TNF/SNF/MNF, divisional, playoff implications) now handled by Gemini Grounding
    console.log(`[Scout Report] NFL context will be fetched via Gemini Grounding`);
  }
  
  // For NFL/NCAAF, fetch starting QBs (pass injuries to filter out IR/Out players)
  let startingQBs = null;
  if (sportKey === 'NFL' || sportKey === 'NCAAF') {
    startingQBs = await fetchStartingQBs(homeTeam, awayTeam, sportKey, injuries);
  }
  
  // For NFL, fetch key players (roster + stats) to prevent hallucinations
  let keyPlayers = null;
  if (sportKey === 'NFL') {
    keyPlayers = await fetchKeyPlayers(homeTeam, awayTeam, sportKey);
  }
  
  // For NBA, fetch key players (roster + stats) to prevent hallucinations
  // CRITICAL: Without this, LLM may hallucinate players who were traded (e.g., Luka Doncic)
  // ENHANCED: Now includes injuries to filter OUT players and show lineup like Rotowire
  let nbaKeyPlayers = null;
  if (sportKey === 'NBA') {
    nbaKeyPlayers = await fetchNbaKeyPlayers(homeTeam, awayTeam, sportKey, injuries);
  }
  
  // For NHL, fetch key players (roster + stats) to prevent hallucinations
  // ENHANCED: Now includes injuries and Rotowire-style lineup (Lines, D-pairs, Goalies)
  let nhlKeyPlayers = null;
  if (sportKey === 'NHL') {
    nhlKeyPlayers = await fetchNhlKeyPlayers(homeTeam, awayTeam, sportKey, injuries);
    
    // For NHL regular season, determine actual game significance based on standings
    const significance = await determineGameSignificance(homeTeam, awayTeam, 'NHL', rawStandings);
    game.tournamentContext = significance;
    console.log(`[Scout Report] NHL game significance: ${significance}`);
  }
  
  // For NCAAF, fetch key players (roster + stats) to prevent hallucinations
  let ncaafKeyPlayers = null;
  if (sportKey === 'NCAAF') {
    ncaafKeyPlayers = await fetchNcaafKeyPlayers(homeTeam, awayTeam, sportKey);
  }
  
  // For NCAAB, fetch key players (roster + stats) to prevent hallucinations
  // CRITICAL: College basketball has frequent transfers - this prevents referencing players who transferred
  // ENHANCED: Now includes injuries and Rotowire-style lineup (PG, SG, SF, PF, C)
  let ncaabKeyPlayers = null;
  if (sportKey === 'NCAAB') {
    ncaabKeyPlayers = await fetchNcaabKeyPlayers(homeTeam, awayTeam, sportKey, injuries);
  }
  
  // For EPL, fetch key players (roster + stats) to prevent hallucinations
  // CRITICAL: EPL has January transfer window - prevents referencing transferred players
  let eplKeyPlayers = null;
  if (sportKey === 'EPL') {
    eplKeyPlayers = await fetchEplKeyPlayers(homeTeam, awayTeam, sportKey);
  }
  
  // For NCAAF/NCAAB, fetch conference tier context
  let conferenceTierSection = '';
  if (sportKey === 'NCAAF') {
    conferenceTierSection = await formatConferenceTierSection(homeTeam, awayTeam, sportKey);
  } else if (sportKey === 'NCAAB') {
    conferenceTierSection = await formatNcaabConferenceTierSection(homeTeam, awayTeam);
  }
  
  // For NCAAF, fetch bowl game context if applicable (December-January games are likely bowls)
  let bowlGameContext = '';
  if (sportKey === 'NCAAF') {
    bowlGameContext = await fetchBowlGameContext(homeTeam, awayTeam, game, injuries?.narrativeContext);
  }
  
  // For NCAAB, fetch NET rankings and Quad records (critical for tournament context)
  let ncaabTournamentContext = '';
  if (sportKey === 'NCAAB') {
    ncaabTournamentContext = await fetchNcaabTournamentContext(homeTeam, awayTeam);
  }

  // NFL: Set tournamentContext for primetime, divisional, or regular season games
  if (sportKey === 'NFL') {
    const gameDate = new Date(game.commence_time);
    const day = gameDate.getUTCDay(); // 0=Sun, 1=Mon, 4=Thu
    const hour = gameDate.getUTCHours(); // UTC hours
    
    // Check for playoffs first (from game name)
    const lowerName = (game.name || '').toLowerCase();
    if (lowerName.includes('divisional')) game.tournamentContext = 'Divisional Round';
    else if (lowerName.includes('wild card')) game.tournamentContext = 'Wild Card';
    else if (lowerName.includes('championship')) game.tournamentContext = 'Conference Championship';
    else if (lowerName.includes('super bowl')) game.tournamentContext = 'Super Bowl';
    // Then check for primetime (regular season special games)
    else if (day === 1 && hour >= 0) game.tournamentContext = 'Monday Night Football';
    else if (day === 4 && hour >= 0) game.tournamentContext = 'Thursday Night Football';
    else if (day === 0 && hour >= 23) game.tournamentContext = 'Sunday Night Football';
    // Default to "Week X" for regular season
    else {
      // Calculate NFL week from date
      const weekNum = game.week || calculateNFLWeek(gameDate);
      game.tournamentContext = weekNum ? `Week ${weekNum}` : 'Regular Season';
    }
    
    // Fetch NFL game significance (playoff implications, division clinching, etc.)
    try {
      const dateStr = game.commence_time 
        ? new Date(game.commence_time).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
        : new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
      
      const significancePrompt = `For the NFL game ${awayTeam} @ ${homeTeam} on ${dateStr}, what are the playoff implications? 
Be VERY concise (one short phrase). Examples:
- "Winner Wins AFC North"
- "Loser Eliminated from Playoffs"
- "Winner Clinches #1 Seed"
- "Divisional Matchup" (if no major implications)
- "Regular Season" (if truly meaningless game)

Only respond with the single most important implication, nothing else.`;
      
      const significanceResult = await geminiGroundingSearch(significancePrompt, { temperature: 0.1, maxTokens: 50 });
      if (significanceResult.success && significanceResult.data && significanceResult.data.length > 5 && significanceResult.data.length < 100) {
        game.gameSignificance = significanceResult.data.trim().replace(/^["']|["']$/g, '');
        console.log(`[Scout Report] ✓ NFL Game Significance: ${game.gameSignificance}`);
      } else {
        game.gameSignificance = 'Regular Season';
      }
    } catch (error) {
      console.warn(`[Scout Report] NFL significance fetch failed: ${error.message}`);
      game.gameSignificance = 'Regular Season';
    }
  }

  // NCAAB: Fetch AP Top 25 rankings, game significance, venue, and CONFERENCES (for app filtering)
  if (sportKey === 'NCAAB') {
    try {
      const ncaabContext = await fetchNcaabRankingsAndSignificance(homeTeam, awayTeam, game);
      game.homeRanking = ncaabContext.homeRanking;
      game.awayRanking = ncaabContext.awayRanking;
      game.gameSignificance = ncaabContext.gameSignificance;
      game.tournamentContext = ncaabContext.tournamentContext || 'Regular Season';
      // Set venue from grounding (NCAAB has 350+ teams, no static mapping)
      if (ncaabContext.venue && !game.venue) {
        game.venue = ncaabContext.venue;
      }
      console.log(`[Scout Report] ✓ NCAAB Rankings: ${awayTeam} ${game.awayRanking ? `#${game.awayRanking}` : '(unranked)'} @ ${homeTeam} ${game.homeRanking ? `#${game.homeRanking}` : '(unranked)'}`);
      console.log(`[Scout Report] ✓ NCAAB Game Significance: ${game.gameSignificance}`);
      if (game.venue) console.log(`[Scout Report] ✓ NCAAB Venue: ${game.venue}`);
    } catch (error) {
      console.warn(`[Scout Report] NCAAB rankings fetch failed: ${error.message}`);
      game.homeRanking = null;
      game.awayRanking = null;
      game.gameSignificance = 'Conference Game';
    }
    
    // Fetch NCAAB conference data for app filtering
    try {
      const ncaabTeams = await ballDontLieService.getTeams('basketball_ncaab');
      const homeTeamData = findTeam(ncaabTeams, homeTeam);
      const awayTeamData = findTeam(ncaabTeams, awayTeam);
      
      // Get conference names from ID mapping
      const getConferenceName = (confId) => {
        if (confId && NCAAB_CONFERENCE_ID_TIERS[confId]) {
          return NCAAB_CONFERENCE_ID_TIERS[confId].name;
        }
        return null;
      };
      
      game.homeConference = getConferenceName(homeTeamData?.conference_id);
      game.awayConference = getConferenceName(awayTeamData?.conference_id);
      
      console.log(`[Scout Report] ✓ NCAAB Conferences: ${homeTeam} (${game.homeConference || 'Unknown'}), ${awayTeam} (${game.awayConference || 'Unknown'})`);
    } catch (error) {
      console.warn(`[Scout Report] NCAAB conference fetch failed: ${error.message}`);
      game.homeConference = null;
      game.awayConference = null;
    }
  }

  // BILATERAL CONTEXT: Fetch deep dive for BOTH teams (ALL major sports)
  // This ensures Gary sees each team's story as equals before analysis
  let bilateralContext = null;
  if (sportKey === 'NFL' || sportKey === 'NBA' || sportKey === 'NHL' || sportKey === 'NCAAB' || sportKey === 'NCAAF') {
    try {
      const dateStr = game.commence_time 
        ? new Date(game.commence_time).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
        : new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
      
      bilateralContext = await fetchBilateralContext(homeTeam, awayTeam, sportKey, dateStr, { useFlash: false });
      
      if (bilateralContext?.homeContext && bilateralContext?.awayContext) {
        console.log(`[Scout Report] ✓ Bilateral context fetched (${bilateralContext.meta?.homeDuration + bilateralContext.meta?.awayDuration}ms total)`);
        console.log(`[Scout Report] ✓ Generated ${bilateralContext.keyQuestions?.length || 0} investigation questions`);
      }
    } catch (error) {
      console.warn(`[Scout Report] Bilateral context fetch failed: ${error.message}`);
    }
  }
  
  // Format injuries for display
  const formatInjuriesForStorage = (injuries) => {
    // Common word fragments that indicate parsing errors (not real first names)
    const invalidFirstNamePatterns = /^(th|nd|rd|st|with|for|and|the|or|by|to|in|on|at|of|is|as|a|an)\s/i;
    
    const formatList = (list) => list.map(i => {
      // Build and sanitize player name - remove newlines, extra spaces
      const firstName = (i.player?.first_name || '').trim();
      const lastName = (i.player?.last_name || '').trim();
      let name = `${firstName} ${lastName}`.trim() || i.name || 'Unknown';
      name = name.replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim();

      // Skip malformed entries:
      // 1. Total name too short (less than 5 chars like "A B")
      // 2. First name too short (less than 2 chars) 
      // 3. Last name too short (less than 2 chars)
      // 4. Name starts with common word fragments (parsing errors)
      const nameParts = name.split(' ');
      const isValidName = (
        name.length >= 5 &&
        nameParts.length >= 2 &&
        nameParts[0].length >= 2 &&
        nameParts[nameParts.length - 1].length >= 2 &&
        !invalidFirstNamePatterns.test(name)
      );
      
      if (!isValidName) {
        console.log(`[Scout Report] Skipping malformed injury entry: "${name}"`);
        name = 'Unknown';
      }

      return {
        name,
        status: (i.status || 'Unknown').replace(/[\r\n]+/g, '').trim(),
        description: (i.description || i.comment || i.injury || '').replace(/[\r\n]+/g, ' ').trim()
      };
    }).filter(i => i.name !== 'Unknown'); // Filter out unknown entries

    return {
      home: formatList(injuries.home || []),
      away: formatList(injuries.away || [])
    };
  };
  
  const injuriesForStorage = formatInjuriesForStorage(injuries);
  
  // Extract narrative context from Gemini Grounding (valuable even if injury parsing returned 0)
  const narrativeContext = injuries?.narrativeContext || null;
  
  // Build the scout report
  const matchupLabel = game.isNeutralSite ? `${awayTeam} vs ${homeTeam}` : `${awayTeam} @ ${homeTeam}`;
  const venueLabel = game.venue || (game.isNeutralSite ? 'Neutral Site' : `${homeTeam} Home`);
  const tournamentLabel = game.tournamentContext ? `🏆 ${game.tournamentContext}` : '';
  
  // Build game context section if we have special context (NBA Cup, playoffs, etc.)
  let gameContextSection = '';
  if (game.gameSignificance && game.tournamentContext) {
    gameContextSection = `
🎯 GAME CONTEXT & SIGNIFICANCE (READ THIS - IMPORTANT)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${game.gameSignificance}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

⚠️ NOTE: This is NOT a regular season game. Factor in the tournament context,
neutral site, and what's at stake when making your analysis.

`;
  }
  
  const report = `
══════════════════════════════════════════════════════════════════════
MATCHUP: ${matchupLabel}
Sport: ${sportKey} | ${game.commence_time ? formatGameTime(game.commence_time) : 'Time TBD'}
${game.venue ? `Venue: ${venueLabel}` : ''}${tournamentLabel ? `\n${tournamentLabel}` : ''}
══════════════════════════════════════════════════════════════════════
${gameContextSection}${bowlGameContext}
⚠️⚠️⚠️ INJURY REPORT (READ THIS FIRST - CRITICAL) ⚠️⚠️⚠️
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${formatInjuryReport(homeTeam, awayTeam, injuries)}

🚨 INJURY CONTEXT:
1. Do NOT mention any player listed as OUT/DOUBTFUL/IR as if they are playing.
2. RECENT injuries = Team is still adjusting to the absence.
3. SEASON-LONG injuries = Team stats ALREADY reflect their absence - NOT a betting edge.
4. QB on IR = Past records may be irrelevant if the QB changed mid-season.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${narrativeContext ? `
🔍 LIVE CONTEXT FROM GOOGLE SEARCH (Gemini Grounding)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${narrativeContext}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

💡 NOTE: This is live context from real-time Google searches about this matchup.
Use this to inform your analysis about player significance, narratives, and trends
that might not be captured by raw statistics alone.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
` : ''}${bilateralContext?.homeContext ? `
🏠 ${homeTeam.toUpperCase()} SITUATION (HOME TEAM DEEP DIVE)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${bilateralContext.homeContext}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
` : ''}${bilateralContext?.awayContext ? `
✈️ ${awayTeam.toUpperCase()} SITUATION (AWAY TEAM DEEP DIVE)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${bilateralContext.awayContext}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
` : ''}${bilateralContext?.keyQuestions?.length > 0 ? `
❓ KEY QUESTIONS TO INVESTIGATE (Consider both sides before deciding)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${bilateralContext.keyQuestions.map((q, i) => `${i + 1}. ${q}`).join('\n')}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

⚠️ These questions are based on the context above. Investigate BOTH teams'
perspectives before forming your thesis. The answers aren't given - find them.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
` : ''}
🏃 REST & SCHEDULE SPOT (CRITICAL FOR BETTING)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${formatRestSituation(homeTeam, awayTeam, calculateRestSituation(recentHome, game.commence_time), calculateRestSituation(recentAway, game.commence_time))}

⚠️ SCHEDULE CONTEXT: Note any back-to-backs, heavy schedules, or travel. 
INVESTIGATE whether this matters for THIS team - some teams handle B2Bs well, others don't.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

${nbaKeyPlayers ? formatNbaKeyPlayers(homeTeam, awayTeam, nbaKeyPlayers) : ''}${ncaabKeyPlayers ? formatNcaabKeyPlayers(homeTeam, awayTeam, ncaabKeyPlayers) : ''}${nhlKeyPlayers ? formatNhlKeyPlayers(homeTeam, awayTeam, nhlKeyPlayers) : ''}${eplKeyPlayers ? formatEplKeyPlayers(homeTeam, awayTeam, eplKeyPlayers) : ''}${keyPlayers ? formatKeyPlayers(homeTeam, awayTeam, keyPlayers) : ''}${startingQBs ? formatStartingQBs(homeTeam, awayTeam, startingQBs) : ''}${ncaafKeyPlayers ? formatNcaafKeyPlayers(homeTeam, awayTeam, ncaafKeyPlayers) : ''}

TEAM IDENTITIES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${formatTeamIdentity(homeTeam, homeProfile, 'Home')}
${formatTeamIdentity(awayTeam, awayProfile, 'Away')}
${conferenceTierSection}${ncaabTournamentContext}
RECENT FORM (Last 5 Games)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${formatRecentForm(homeTeam, recentHome)}
${formatRecentForm(awayTeam, recentAway)}

KEY SITUATIONAL FACTORS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${formatSituationalFactors(game, injuries, sportKey)}

BETTING CONTEXT (For Reference Only - Do NOT base pick on these)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${formatOdds(game)}

⚠️ IMPORTANT: Odds are shown for value assessment AFTER you form your 
statistical conclusion. Your analysis must be independently justified 
by stats. Do NOT use "big spread" or "expensive ML" as reasoning.

══════════════════════════════════════════════════════════════════════
AVAILABLE STAT CATEGORIES (use fetch_stats tool to request):
${formatTokenMenu(sportKey)}
══════════════════════════════════════════════════════════════════════
`.trim();

  // Return both the report text, structured injuries data, and venue/game context
  return {
    text: report,
    injuries: injuriesForStorage,
    // Venue context for NBA Cup, neutral site games, CFP games, etc.
    venue: game.venue || null,
    isNeutralSite: game.isNeutralSite || false,
    tournamentContext: game.tournamentContext || null,
    // Game significance/context (from Gemini Grounding for NBA Cup, playoffs, CFP, etc.)
    gameSignificance: game.gameSignificance || null,
    // CFP-specific fields for NCAAF
    cfpRound: game.cfpRound || null,
    homeSeed: game.homeSeed || null,
    awaySeed: game.awaySeed || null,
    // NCAAB AP Top 25 rankings
    homeRanking: game.homeRanking || null,
    awayRanking: game.awayRanking || null,
    // NCAAB conference data for app filtering
    homeConference: game.homeConference || null,
    awayConference: game.awayConference || null
  };
}

/**
 * Normalize sport key to standard format
 */
function normalizeSport(sport) {
  const mapping = {
    'basketball_nba': 'NBA',
    'americanfootball_nfl': 'NFL',
    'basketball_ncaab': 'NCAAB',
    'americanfootball_ncaaf': 'NCAAF',
    'icehockey_nhl': 'NHL',
    'soccer_epl': 'EPL',
    'nba': 'NBA',
    'nfl': 'NFL',
    'ncaab': 'NCAAB',
    'ncaaf': 'NCAAF',
    'nhl': 'NHL',
    'epl': 'EPL'
  };
  return mapping[sport?.toLowerCase()] || sport?.toUpperCase() || 'UNKNOWN';
}

/**
 * Format game time
 */
function formatGameTime(timeString) {
  try {
    const date = new Date(timeString);
    return date.toLocaleString('en-US', {
      weekday: 'long',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      timeZoneName: 'short'
    });
  } catch {
    return timeString;
  }
}

/**
 * Generate dynamic season string for Gemini Grounding queries
 * Returns format like "2025-26" for academic year sports (college, NBA, NHL)
 * @returns {string} - Season string like "2025-26"
 */
function getCurrentSeasonString() {
  const month = new Date().getMonth() + 1; // 1-indexed
  const year = new Date().getFullYear();
  // Academic year: Aug-Dec = year-(year+1), Jan-Jul = (year-1)-year
  const startYear = month >= 8 ? year : year - 1;
  const endYear = startYear + 1;
  return `${startYear}-${String(endYear).slice(-2)}`;
}

/**
 * Fetch team profile (record, key metrics, identity)
 */
async function fetchTeamProfile(teamName, sport) {
  try {
    const bdlSport = sportToBdlKey(sport);
    if (!bdlSport) return createEmptyProfile(teamName);
    
    // Get team data
    const teams = await ballDontLieService.getTeams(bdlSport);
    const team = findTeam(teams, teamName);
    if (!team) return createEmptyProfile(teamName);
    
    // Calculate current season dynamically
    const currentMonth = new Date().getMonth() + 1;
    const currentYear = new Date().getFullYear();
    const currentSeason = currentMonth <= 6 ? currentYear - 1 : currentYear;
    
    // Get season stats
    const seasonStats = await ballDontLieService.getTeamSeasonStats(bdlSport, { teamId: team.id, season: currentSeason, postseason: false });
    
    // NCAAF/NCAAB standings require conference_id - skip to avoid 400 errors
    // For college sports, we use recent game record from BDL instead
    let standings = [];
    let teamStanding = null;
    if (bdlSport !== 'americanfootball_ncaaf' && bdlSport !== 'basketball_ncaab') {
      standings = await ballDontLieService.getStandingsGeneric(bdlSport, { season: currentSeason });
      teamStanding = standings?.find(s => s.team?.id === team.id || s.team?.name === teamName);
    }
    
    return {
      name: teamName,
      record: teamStanding?.overall_record || calculateRecord(seasonStats),
      homeRecord: teamStanding?.home_record || 'N/A',
      awayRecord: teamStanding?.road_record || 'N/A',
      streak: formatStreak(teamStanding),
      seasonStats: seasonStats,
      standing: teamStanding,
      identity: buildTeamIdentity(seasonStats, sport)
    };
  } catch (error) {
    console.warn(`[Scout Report] Error fetching profile for ${teamName}:`, error.message);
    return createEmptyProfile(teamName);
  }
}

/**
 * Build team identity string from stats
 */
function buildTeamIdentity(stats, sport) {
  if (!stats) return 'Profile unavailable';
  
  const parts = [];
  
  if (sport === 'NBA' || sport === 'NCAAB') {
    // Basketball identity
    if (stats.points_per_game) {
      const ppg = parseFloat(stats.points_per_game);
      if (ppg > 115) parts.push('high-scoring');
      else if (ppg < 105) parts.push('defensive-minded');
    }
    if (stats.pace) {
      const pace = parseFloat(stats.pace);
      if (pace > 100) parts.push('fast-paced');
      else if (pace < 96) parts.push('slow/methodical');
    }
    if (stats.three_point_pct && parseFloat(stats.three_point_pct) > 0.37) {
      parts.push('3PT-heavy');
    }
    if (stats.offensive_rating) {
      const ortg = parseFloat(stats.offensive_rating);
      if (ortg > 115) parts.push(`elite offense (#${stats.offensive_rating_rank || '?'})`);
    }
    if (stats.defensive_rating) {
      const drtg = parseFloat(stats.defensive_rating);
      if (drtg < 108) parts.push(`strong defense (#${stats.defensive_rating_rank || '?'})`);
      else if (drtg > 115) parts.push('leaky defense');
    }
  } else if (sport === 'NFL' || sport === 'NCAAF') {
    // Football identity
    if (stats.total_points_per_game) {
      const ppg = parseFloat(stats.total_points_per_game);
      if (ppg > 28) parts.push('high-powered offense');
      else if (ppg < 18) parts.push('struggling offense');
    }
    if (stats.rushing_yards_per_game && stats.net_passing_yards_per_game) {
      const rush = parseFloat(stats.rushing_yards_per_game);
      const pass = parseFloat(stats.net_passing_yards_per_game);
      if (rush > pass) parts.push('run-heavy');
      else if (pass > rush * 1.5) parts.push('pass-first');
      else parts.push('balanced attack');
    }
    if (stats.opp_total_points_per_game) {
      const oppPpg = parseFloat(stats.opp_total_points_per_game);
      if (oppPpg < 18) parts.push('elite defense');
      else if (oppPpg > 28) parts.push('porous defense');
    }
  } else if (sport === 'NHL') {
    // Hockey identity
    if (stats.goals_for_per_game) {
      const gpg = parseFloat(stats.goals_for_per_game);
      if (gpg > 3.5) parts.push('high-scoring');
      else if (gpg < 2.5) parts.push('struggling offensively');
    }
    if (stats.goals_against_per_game) {
      const gaa = parseFloat(stats.goals_against_per_game);
      if (gaa < 2.5) parts.push('stingy defense');
      else if (gaa > 3.5) parts.push('leaky defense');
    }
    if (stats.power_play_percentage) {
      const pp = parseFloat(stats.power_play_percentage);
      if (pp > 0.24) parts.push('elite PP');
      else if (pp < 0.17) parts.push('weak PP');
    }
    if (stats.penalty_kill_percentage) {
      const pk = parseFloat(stats.penalty_kill_percentage);
      if (pk > 0.82) parts.push('elite PK');
      else if (pk < 0.76) parts.push('vulnerable PK');
    }
    if (stats.shots_for_per_game && stats.shots_against_per_game) {
      const sf = parseFloat(stats.shots_for_per_game);
      const sa = parseFloat(stats.shots_against_per_game);
      if (sf > sa + 5) parts.push('possession-heavy');
      else if (sa > sf + 5) parts.push('outshot regularly');
    }
  } else if (sport === 'EPL') {
    // Soccer/EPL identity
    if (stats.goals) {
      const gpg = parseFloat(stats.goals) / (stats.wins + stats.losses + stats.draws || 1);
      if (gpg > 2.0) parts.push('high-scoring');
      else if (gpg < 1.0) parts.push('struggling in attack');
    }
    if (stats.goals_conceded) {
      const gaa = parseFloat(stats.goals_conceded) / (stats.wins + stats.losses + stats.draws || 1);
      if (gaa < 1.0) parts.push('solid defense');
      else if (gaa > 1.5) parts.push('leaky defense');
    }
    if (stats.clean_sheet) {
      const cs = parseFloat(stats.clean_sheet);
      if (cs > 5) parts.push('keeps clean sheets');
    }
    if (stats.total_pass && stats.accurate_pass) {
      const passAcc = (parseFloat(stats.accurate_pass) / parseFloat(stats.total_pass)) * 100;
      if (passAcc > 85) parts.push('possession-based');
      else if (passAcc < 75) parts.push('direct style');
    }
    if (stats.total_scoring_att) {
      const shots = parseFloat(stats.total_scoring_att);
      if (shots > 200) parts.push('creates chances');
    }
  }

  return parts.length > 0 ? parts.join(', ') : 'Profile building...';
}

/**
 * Create empty profile for missing data
 */
function createEmptyProfile(teamName) {
  return {
    name: teamName,
    record: 'N/A',
    homeRecord: 'N/A',
    awayRecord: 'N/A',
    streak: 'N/A',
    seasonStats: null,
    standing: null,
    identity: 'Profile unavailable'
  };
}

/**
 * Format team identity for display
 */
function formatTeamIdentity(teamName, profile, homeAway) {
  const record = profile.record !== 'N/A' ? `(${profile.record})` : '';
  return `• ${teamName} ${record} [${homeAway}]: ${profile.identity}
  Home: ${profile.homeRecord} | Away: ${profile.awayRecord} | Streak: ${profile.streak}`;
}

/**
 * Fetch recent games for a team
 */
async function fetchRecentGames(teamName, sport, count = 5) {
  try {
    const bdlSport = sportToBdlKey(sport);
    if (!bdlSport) return [];
    
    const teams = await ballDontLieService.getTeams(bdlSport);
    const team = findTeam(teams, teamName);
    if (!team) return [];
    
    // Build params based on sport - NFL/NCAAF use seasons[], other sports use date range
    // Per BDL API docs: NFL games endpoint does NOT support start_date/end_date
    const isFootball = bdlSport === 'americanfootball_nfl' || bdlSport === 'americanfootball_ncaaf';
    
    let params;
    if (isFootball) {
      // NFL/NCAAF: Use seasons parameter - calculate dynamically
      const fbMonth = new Date().getMonth() + 1;
      const fbYear = new Date().getFullYear();
      const fbSeason = fbMonth <= 7 ? fbYear - 1 : fbYear;
      params = {
        team_ids: [team.id],
        seasons: [fbSeason],
        per_page: 20
      };
    } else {
      // NBA/NHL/etc: Use date range filtering
      const today = new Date();
      const thirtyDaysAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);
      params = {
        team_ids: [team.id],
        start_date: thirtyDaysAgo.toISOString().split('T')[0],
        end_date: today.toISOString().split('T')[0],
        per_page: 20
      };
    }
    
    const recentGames = await ballDontLieService.getGames(bdlSport, params);
    
    // Sort by date descending and return the requested count
    // For football, also filter to only completed games
    const today = new Date();
    const sorted = (recentGames || [])
      .filter(g => {
        const hasDate = g.date || g.datetime;
        const gameDate = new Date(g.date || g.datetime);
        const isPast = gameDate < today;
        // For football, also check status is Final
        if (isFootball) {
          return hasDate && isPast && (g.status === 'Final' || g.status === 'post');
        }
        return hasDate;
      })
      .sort((a, b) => {
        const dateA = new Date(a.date || a.datetime);
        const dateB = new Date(b.date || b.datetime);
        return dateB - dateA; // Descending (most recent first)
      })
      .slice(0, count);
    
    return sorted;
  } catch (error) {
    console.warn(`[Scout Report] Error fetching recent games for ${teamName}:`, error.message);
    return [];
  }
}

/**
 * Calculate rest situation for a team based on recent games
 * Returns object with days rest and back-to-back status
 */
function calculateRestSituation(recentGames, gameDate) {
  if (!recentGames || recentGames.length === 0) {
    console.log('[Rest Calc] No recent games available');
    return { daysRest: null, isBackToBack: false, lastGameDate: null };
  }
  
  // Parse the game date (the upcoming game) - use US Eastern time for NBA games
  const upcoming = gameDate ? new Date(gameDate) : new Date();
  // Convert to Eastern time to get correct date (avoids UTC midnight rollover issues)
  const upcomingDateStr = upcoming.toLocaleDateString('en-CA', { timeZone: 'America/New_York' }); // YYYY-MM-DD format
  
  // Parse games and their dates
  // NOTE: BDL stores game dates in UTC, so late-night EST games (7:30PM+) may be stored as the NEXT day
  // Example: Dec 18 7:30PM EST = Dec 19 12:30AM UTC = stored as "2025-12-19"
  // We need to include completed games from "today" that actually happened last night
  const gamesWithDates = recentGames
    .filter(g => g.date || g.datetime)
    .map(g => {
      // BDL may return date as full ISO timestamp (e.g., "2025-12-20T05:00:00.000Z") or just "YYYY-MM-DD"
      // Extract just the date portion (YYYY-MM-DD) from either format
      let rawDate = g.date || g.datetime;
      const dateStr = rawDate ? rawDate.split('T')[0] : null;
      // Check if game has completed (has scores)
      const homeScore = g.home_team_score || g.home_score || 0;
      const awayScore = g.visitor_team_score || g.away_score || g.visitor_score || 0;
      const hasCompleted = homeScore > 0 || awayScore > 0;
      return {
        ...g,
        dateStr,
        gameDate: new Date(dateStr + 'T12:00:00'), // Noon to avoid timezone issues
        hasCompleted
      };
    })
    .filter(g => {
      if (!g.dateStr) return false;
      // Include games from dates strictly before today
      if (g.dateStr < upcomingDateStr) return true;
      // Also include completed games from "today" (these are actually last night's late games in EST)
      if (g.dateStr === upcomingDateStr && g.hasCompleted) {
        console.log(`[Rest Calc] Including completed game from ${g.dateStr} (late-night EST game stored in UTC)`);
        return true;
      }
      return false;
    })
    .sort((a, b) => b.gameDate - a.gameDate); // Most recent first
  
  if (gamesWithDates.length === 0) {
    console.log('[Rest Calc] No completed games found before', upcomingDateStr);
    return { daysRest: null, isBackToBack: false, lastGameDate: null };
  }
  
  const lastGame = gamesWithDates[0];
  console.log(`[Rest Calc] Last game: ${lastGame.dateStr}, Upcoming: ${upcomingDateStr}`);
  
  // Calculate days between using date strings to avoid timezone issues
  const lastDate = new Date(lastGame.dateStr + 'T12:00:00');
  const upcomingDate = new Date(upcomingDateStr + 'T12:00:00');
  const diffTime = upcomingDate.getTime() - lastDate.getTime();
  const daysRest = Math.round(diffTime / (1000 * 60 * 60 * 24));
  
  // Back-to-back = played yesterday (1 day gap)
  const isBackToBack = daysRest <= 1;
  
  // Check for 3 games in 4 days
  const fourDaysAgo = new Date(upcomingDate);
  fourDaysAgo.setDate(fourDaysAgo.getDate() - 4);
  const gamesInLast4Days = gamesWithDates.filter(g => g.gameDate >= fourDaysAgo).length;
  const isHeavySchedule = gamesInLast4Days >= 3;
  
  console.log(`[Rest Calc] Days rest: ${daysRest}, Back-to-back: ${isBackToBack}`);
  
  return {
    daysRest,
    isBackToBack,
    isHeavySchedule,
    gamesInLast4Days,
    lastGameDate: lastGame.gameDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  };
}

/**
 * Format rest situation for scout report
 */
function formatRestSituation(homeTeam, awayTeam, homeRest, awayRest) {
  const formatTeamRest = (team, rest) => {
    if (!rest || rest.daysRest === null) {
      return `${team}: Rest data unavailable`;
    }
    
    let status = '';
    if (rest.isBackToBack) {
      status = `⚠️ BACK-TO-BACK (played ${rest.lastGameDate})`;
    } else if (rest.isHeavySchedule) {
      status = `⚠️ Heavy schedule (${rest.gamesInLast4Days} games in 4 days)`;
    } else if (rest.daysRest >= 3) {
      status = `✅ Well-rested (${rest.daysRest} days)`;
    } else {
      status = `${rest.daysRest} day(s) rest`;
    }
    
    return `• ${team}: ${status}`;
  };
  
  return `${formatTeamRest(homeTeam, homeRest)}
${formatTeamRest(awayTeam, awayRest)}`;
}

/**
 * Format recent form
 */
function formatRecentForm(teamName, recentGames) {
  if (!recentGames || recentGames.length === 0) {
    return `• ${teamName}: Recent games unavailable`;
  }
  
  let wins = 0, losses = 0;
  
  // Filter to only completed games (have scores > 0)
  const completedGames = recentGames.filter(game => {
    const homeScore = game.home_team_score || 0;
    const awayScore = game.visitor_team_score || 0;
    return homeScore > 0 || awayScore > 0; // At least one team scored
  });
  
  if (completedGames.length === 0) {
    return `• ${teamName}: No recent completed games`;
  }
  
  const results = completedGames.slice(0, 5).map(game => {
    // Determine if this team was home or away
    const homeTeamName = game.home_team?.name || game.home_team?.full_name || '';
    const awayTeamName = game.visitor_team?.name || game.visitor_team?.full_name || '';
    const isHome = homeTeamName.toLowerCase().includes(teamName.toLowerCase().split(' ').pop()) ||
                   teamName.toLowerCase().includes(homeTeamName.toLowerCase().split(' ').pop());
    
    const teamScore = isHome ? game.home_team_score : game.visitor_team_score;
    const oppScore = isHome ? game.visitor_team_score : game.home_team_score;
    const oppName = isHome ? awayTeamName : homeTeamName;
    
    // Skip if opponent name is empty or same as team
    if (!oppName || oppName.toLowerCase().includes(teamName.toLowerCase().split(' ').pop())) {
      return null;
    }
    
    if (teamScore > oppScore) {
      wins++;
      return `W vs ${oppName} (${teamScore}-${oppScore})`;
    } else {
      losses++;
      return `L vs ${oppName} (${teamScore}-${oppScore})`;
    }
  }).filter(r => r !== null);
  
  return `• ${teamName}: ${wins}-${losses} last ${completedGames.length > 5 ? 5 : completedGames.length}
  ${results.slice(0, 3).join(' | ')}`;
}

/**
 * Fetch injuries for both teams
 * - NBA/NFL/NHL: BDL is single source of truth (reliable, no hallucinations)
 * - NCAAF/NCAAB: Gemini Grounding (BDL doesn't have injury endpoints for these)
 */
async function fetchInjuries(homeTeam, awayTeam, sport) {
  try {
    const bdlSport = sportToBdlKey(sport);
    
    // Sports where BDL has injury endpoints (verified working)
    const bdlInjurySports = ['basketball_nba', 'americanfootball_nfl', 'icehockey_nhl'];
    const hasBdlInjuries = bdlInjurySports.includes(bdlSport);
    
    // Fetch from BDL
    let bdlInjuries = { home: [], away: [] };
    if (bdlSport) {
      const teams = await ballDontLieService.getTeams(bdlSport);
      const home = findTeam(teams, homeTeam);
      const away = findTeam(teams, awayTeam);
      
      console.log(`[Scout Report] Looking for injuries - Home: ${homeTeam} (ID: ${home?.id}), Away: ${awayTeam} (ID: ${away?.id})`);
      
      const teamIds = [];
      if (home) teamIds.push(home.id);
      if (away) teamIds.push(away.id);
      
      if (teamIds.length > 0) {
        const injuries = await ballDontLieService.getInjuriesGeneric(bdlSport, { team_ids: teamIds });
        console.log(`[Scout Report] BDL returned ${injuries?.length || 0} total injuries for teams ${teamIds.join(', ')}`);

        // Filter by team and fix statuses
        // Note: NHL uses i.player.teams[0].id, NBA/NFL use i.player.team.id
        const getPlayerTeamId = (injury) => {
          // NHL format: player.teams[0].id
          if (injury?.player?.teams?.[0]?.id) {
            return injury.player.teams[0].id;
          }
          // NBA/NFL format: player.team.id or player.team_id
          return injury?.player?.team?.id || injury?.player?.team_id || injury?.team_id;
        };
        
        bdlInjuries = {
          home: injuries?.filter(i => getPlayerTeamId(i) === home?.id).map(fixBdlInjuryStatus) || [],
          away: injuries?.filter(i => getPlayerTeamId(i) === away?.id).map(fixBdlInjuryStatus) || []
        };

        console.log(`[Scout Report] BDL injuries filtered - Home: ${bdlInjuries.home.length}, Away: ${bdlInjuries.away.length}`);
        if (bdlInjuries.home.length > 0) {
          console.log(`[Scout Report] Home injuries:`, bdlInjuries.home.map(i => `${i.player?.first_name} ${i.player?.last_name} (${i.status})`));
        }
        if (bdlInjuries.away.length > 0) {
          console.log(`[Scout Report] Away injuries:`, bdlInjuries.away.map(i => `${i.player?.first_name} ${i.player?.last_name} (${i.status})`));
        }
      }
    }
    
    // Fetch Gemini Grounding for narrative context (and injuries for sports without BDL support)
    let liveContextInjuries = await fetchGroundedContext(homeTeam, awayTeam, sport);
    
    // ALWAYS preserve the raw grounding context for Gary's organic reading
    const narrativeContext = liveContextInjuries?.groundedRaw || null;
    
    if (!liveContextInjuries) {
      liveContextInjuries = { home: [], away: [] };
    }
    
    // DECISION: Use BDL injuries for NBA/NFL, Gemini Grounding for NHL/NCAAF/NCAAB
    if (hasBdlInjuries) {
      // NBA/NFL: Use BDL as single source of truth (reliable, no hallucinations)
      console.log(`[Scout Report] Using BDL injuries for ${sport} (${bdlInjuries.home?.length || 0} home, ${bdlInjuries.away?.length || 0} away)`);
      return {
        home: bdlInjuries.home || [],
        away: bdlInjuries.away || [],
        narrativeContext
      };
    } else {
      // NCAAF/NCAAB: Use Gemini Grounding (BDL doesn't have injury endpoints for college sports)
      // Parse injuries from the grounding context
      const groundingInjuries = await fetchGroundingInjuries(homeTeam, awayTeam, sport);
      console.log(`[Scout Report] Using Gemini Grounding injuries for ${sport} (BDL has no endpoint)`);
      console.log(`[Scout Report] Grounding injuries: ${groundingInjuries.home?.length || 0} home, ${groundingInjuries.away?.length || 0} away`);
      return {
        home: groundingInjuries.home || [],
        away: groundingInjuries.away || [],
        narrativeContext
      };
    }
    
  } catch (error) {
    console.warn(`[Scout Report] Error fetching injuries:`, error.message);
    return { home: [], away: [], narrativeContext: null };
  }
}

/**
 * Fetch live context using Gemini 3 with Google Search Grounding
 * This is the PRIMARY source for live context
 * @param {string} homeTeam - Home team name
 * @param {string} awayTeam - Away team name
 * @param {string} sport - Sport key (NFL, NBA, NHL, etc.)
 * @param {string} gameDate - Game date string
 * @param {object} options - Optional configuration
 * @param {boolean} options.useFlash - Use Flash model instead of Pro (for props to avoid quota)
 */
async function fetchGroundedContext(homeTeam, awayTeam, sport, gameDate, options = {}) {
  const genAI = getGeminiClient();
  if (!genAI) {
    console.log('[Scout Report] Gemini not available');
    return null;
  }
  
  try {
    const today = gameDate || new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
    
    // Use Flash for props (high volume, avoid quota issues), NCAAB (quota management), or Pro for regular picks (deep reasoning)
    const isNCAAB = sport === 'basketball_ncaab' || sport === 'NCAAB';
    const modelName = options.useFlash || isNCAAB
      ? (process.env.GEMINI_FLASH_MODEL || 'gemini-3-flash-preview')
      : (process.env.GEMINI_MODEL || 'gemini-3-flash-preview');
    
    // Configure model with Google Search Grounding
    const model = genAI.getGenerativeModel({
      model: modelName,
      tools: [{
        google_search: {}  // Gemini 3 uses simplified google_search tool
      }],
      safetySettings: [
        { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
        { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
        { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
        { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
      ]
    });
    
    // Sport-specific context queries
    let prompt;
    if (sport === 'NFL' || sport === 'americanfootball_nfl') {
      prompt = `For the NFL game ${awayTeam} @ ${homeTeam} on ${today}:

1. INJURIES (CRITICAL - INCLUDE GAMES MISSED):
   List ALL players OUT, QUESTIONABLE, DOUBTFUL, or on IR for each team:
   - Player name, position, injury type
   - GAMES MISSED: How many games has this player missed this season?
   - INJURY DATE: When did they get injured? (Week # and approximate date)
   - Duration: RECENT (1-2 weeks), MID-SEASON (3-6 weeks), or SEASON-LONG (7+ weeks / most of season)
   - For SEASON-LONG injuries: Team stats ALREADY reflect their absence - NOT a betting edge
   
   Format example: "Jayden Daniels (QB) - IR - rib/knee - MISSED 8 GAMES (since Week 7) - SEASON-LONG"

2. QB SITUATION: 
   - Who is the STARTING QB for ${homeTeam}?
   - Who is the STARTING QB for ${awayTeam}?
   - Are any QBs on IR? When did they get injured and how many games missed?
   - Did either team change QBs mid-season? Who was the previous starter?
   - If a backup/3rd-string QB is starting, what is their experience level?

3. WEATHER: Current forecast for game time at the stadium

4. DYNAMIC MATCHUP NARRATIVES & NEWS:
   - Any breaking team news, drama, or major storylines?
   - Key player significance: Are any stars or high-impact rookies reaching milestones, returning from injury, or on a "hot streak"?
   - Matchup specific context: Is this a "revenge spot", a rivalry, or a game with unique psychological factors?
   - Narrative momentum: Does either team have a storyline edge not captured by raw season stats?

5. GAME CONTEXT (CRITICAL):
   - GAME TYPE: Is this Thursday Night Football (TNF), Sunday Night Football (SNF), Monday Night Football (MNF), Saturday game, or regular Sunday?
   - DIVISIONAL: Are ${homeTeam} and ${awayTeam} in the same NFL division? If yes, which division (NFC East, AFC North, etc.)?
   - PLAYOFF IMPLICATIONS: What are the current playoff standings for both teams? Is either team fighting for a playoff spot, division title, or first-round bye?

6. HEAD-TO-HEAD HISTORY (2025-26 NFL SEASON ONLY - NO GUESSING):
   - Have ${homeTeam} and ${awayTeam} played each other in the 2025 NFL season? 
   - If yes, when did they play and what was the score?
   - CRITICAL: Who was OUT for each team in that previous meeting?
   - Example: "Cowboys beat Eagles 28-17 in Week 4 - but Eagles were without Hurts"
   - If this is a divisional matchup, they may have played earlier in the season
   ⚠️ ONLY cite games from the 2025 NFL season that you can verify with dates and scores.
   ⚠️ If you cannot find data, say "No 2025 H2H found" - DO NOT GUESS or claim historical streaks.

7. RECENT FORM (LAST 5 GAMES - CRITICAL):
   - ${homeTeam}: List their LAST 5 GAMES from the 2025 season with Week #, opponent, score, and W/L
   - ${awayTeam}: List their LAST 5 GAMES from the 2025 season with Week #, opponent, score, and W/L
   - What is each team's record in their last 5 games? (e.g., "3-2" or "1-4")
   ⚠️ Be PRECISE. Include Week numbers and exact scores. If unsure, say "unable to verify" - DO NOT GUESS.

8. ROSTER MOVES (CRITICAL FOR PLAYER PROPS - 2025 SEASON):
   List ANY players who changed teams in 2025 via trade, free agency, or waiver:
   - For ${homeTeam}: List players acquired AND players who left (with destination team)
   - For ${awayTeam}: List players acquired AND players who left (with destination team)
   - Include position and when the move happened (month/date if available)
   - ⚠️ This is CRITICAL - player prop odds often show outdated team assignments
   
   Format example: "George Pickens (WR) - Traded from Steelers to Cowboys (May 2025)"
   Format example: "Javonte Williams (RB) - Signed with Cowboys as FA (March 2025)"

9. KEY PLAYER STATS (LAST 5 GAMES - CRITICAL FOR PROPS):
   For EACH team, provide game-by-game stats for the last 5 games for these key players:
   
   ${homeTeam} KEY PLAYERS:
   - Starting QB: Pass yards per game for last 5 games (list each game: Week X vs OPP: XXX yards)
   - RB1 (lead back): Rush yards per game for last 5 games (list each game)
   - WR1: Receiving yards per game for last 5 games (list each game)
   - TE1 (if relevant): Receiving yards per game for last 5 games
   
   ${awayTeam} KEY PLAYERS:
   - Starting QB: Pass yards per game for last 5 games (list each game: Week X vs OPP: XXX yards)
   - RB1 (lead back): Rush yards per game for last 5 games (list each game)
   - WR1: Receiving yards per game for last 5 games (list each game)
   - TE1 (if relevant): Receiving yards per game for last 5 games
   
   ⚠️ CRITICAL: List ACTUAL verified stats only. If you cannot find exact game-by-game data, say "Stats unavailable" - DO NOT GUESS or invent numbers.
   
   Format example:
   "George Pickens (DAL WR) - Last 5 games receiving yards:
    Week 12 vs NYG: 130 yds | Week 13 vs WAS: 33 yds | Week 14 vs CIN: 37 yds | Week 15 vs CAR: 88 yds | Week 16 vs TB: 146 yds
    5-game average: 86.8 yards"

10. RECENT FORM CONTEXT (L5 ROSTER - CRITICAL FOR INTERPRETATION):
   - For ${homeTeam}: Who was OUT during their last 5 games? Who is BACK this week?
   - For ${awayTeam}: Who was OUT during their last 5 games? Who is BACK this week?
   - Example: "Cowboys went 3-2 in L5, but Dak was out for 3 games. Dak plays this week."
   - If a key player missed most of L5 but plays tonight → L5 UNDERSTATES the team

11. 📊 RAW CONTEXT FOR GARY (DATA, NOT CONCLUSIONS):
   
   QB SITUATION:
   - ${homeTeam} QB: [Name], Season stats: [Comp% / TD / INT / Rating]
   - ${awayTeam} QB: [Name], Season stats: [Comp% / TD / INT / Rating]
   - Any QB change this season? [Yes/No - if yes, who replaced whom]
   - (Gary evaluates the QB matchup - you're providing the personnel)
   
   OFFENSIVE/DEFENSIVE PROFILES:
   - ${homeTeam} Offense: [Rank], Run/Pass ratio: [X%/Y%], Key players: [names]
   - ${homeTeam} Defense: [Rank], Style: [aggressive/bend-don't-break/etc]
   - ${awayTeam} Offense: [Rank], Run/Pass ratio: [X%/Y%], Key players: [names]
   - ${awayTeam} Defense: [Rank], Style: [aggressive/bend-don't-break/etc]
   
   SCHEDULE CONTEXT:
   - Days since last game: ${homeTeam} [X days], ${awayTeam} [Y days]
   - Any short week (TNF after Sunday)? [Team if applicable]
   
   PERSONNEL NOTES:
   - Player vs former team? Name: [X], Team: [Y]
   - Star returning from injury? Name: [X], Games missed: [Y]
   - L5 roster different from this week? [Player X] missed L5 but plays this week
   - Divisional rematch? First meeting result: [X], who was out: [Y]
   
   ENVIRONMENT:
   - Weather: [Dome / Outdoor - forecast if outdoor]
   - Venue: [Stadium name] - Home crowd factor

Be factual. Do NOT include any betting picks or predictions.

🚫 CRITICAL ANTI-OPINION RULES:
1. FACTS ONLY - Do NOT include any betting predictions, picks, or analysis from articles
2. NO OPINIONS - If an article says "Cowboys will win by 10" - IGNORE that, only extract FACTS
3. YOUR OWN WORDS - Synthesize facts, do NOT plagiarize text from articles
4. VERIFY STATS - Only include stats you can verify. Say "unable to verify" rather than guessing.
5. NO BETTING ADVICE - Gary makes his own picks - you just provide CONTEXT`;
    } else if (sport === 'NBA' || sport === 'basketball_nba') {
      prompt = `⚠️ CRITICAL: Today is ${today}. We are in the 2025-26 NBA SEASON.

For the NBA game ${awayTeam} @ ${homeTeam} on ${today}:

🚨 ROSTER VERIFICATION RULE (READ THIS FIRST):
- ONLY include players who are CURRENTLY on the team's 2025-26 roster
- If a player was TRADED, RELEASED, or LEFT in the offseason (summer 2025), they are NOT relevant
- "Player X left Team Y" = Player is NOT on Team Y's roster = DO NOT MENTION THEM
- Example: If you find "Myles Turner left Indiana" - that means Turner is NOT a Pacer, so do NOT list him as injured/out
- ONLY list players who are ACTUALLY on the current roster but cannot play due to injury

1. INJURIES (OUT): List players who ARE on the 2025-26 roster but cannot play
   - ⚠️ ONLY players currently signed to the team
   - Include player name and position (G, F, C)
   - Mark if RECENT injury (last 2 weeks) or SEASON-LONG (out most of season)
   - Note any INDEFINITE absences (no timetable)
   - For SEASON-LONG injuries, team stats already reflect their absence

2. PLAYERS RETURNING FROM INJURY (CRITICAL):
   - List any players who are RETURNING to action after missing games
   - A star player back from injury can completely change a team's ceiling
   - Even role players returning can shift rotation depth and matchups
   - Include: Player name, position, how many games missed, when they last played

3. DEPTH CHART / STARTING LINEUP (2025-26 ROSTER ONLY):
   - Who is the CURRENT starting 5 for ${homeTeam}? (PG, SG, SF, PF, C)
   - Who is the CURRENT starting 5 for ${awayTeam}? (PG, SG, SF, PF, C)
   - Any rotation changes due to injuries?
   - Who are the key bench players seeing minutes?
   - ⚠️ If a player left in the offseason, they are NOT on the roster - do not include them

4. KEY PLAYERS & NARRATIVE CONTEXT:
   - Who are the top scorers/stars CONFIRMED playing tonight?
   - PLAYER SIGNIFICANCE: Any players whose role/impact has recently changed? (breakout performers, players stepping up due to injuries, hot streaks, cold slumps, returning stars)
   - STORYLINES: Any recent performance milestones, "revenge games", or player momentum shifts?
   - LOAD MANAGEMENT: Any concerns about stars resting?
   - TRADES: Any players recently traded or released from either team? (note: summer moves are OLD NEWS)

5. DYNAMIC MATCHUP FACTORS:
   - Any back-to-back situations?
   - Team drama, coaching changes, or locker room energy?
   - Playoff race implications or "must-win" narratives?
   - Any game-specific context not reflected in season averages?

6. RECENT FORM CONTEXT (L5/L10 - CRITICAL FOR INTERPRETATION):
   - For ${homeTeam}: Who was OUT during their last 5 games? Who is BACK tonight?
   - For ${awayTeam}: Who was OUT during their last 5 games? Who is BACK tonight?
   - Example: "Lakers went 4-1 in L5, but AD sat 3 of those games. AD plays tonight."
   - This helps interpret whether L5 stats apply to TONIGHT's lineup.
   - If a star missed most of L5 but plays tonight → L5 UNDERSTATES the team
   - If a star played L5 but is OUT tonight → L5 OVERSTATES the team

7. HEAD-TO-HEAD CONTEXT (2025-26 SEASON ONLY):
   - Have ${homeTeam} and ${awayTeam} played this season?
   - If yes: Date, score, margin, and WHO WAS OUT for each team in that game
   - Example: "Kings beat Lakers 115-102 on Nov 15 - but Lakers were without AD"
   - This context helps Gary interpret H2H stats correctly

8. 📊 RAW CONTEXT FOR GARY (DATA, NOT CONCLUSIONS):
   
   PACE PROFILE:
   - ${homeTeam} pace: [Rank] (X possessions/game)
   - ${awayTeam} pace: [Rank] (X possessions/game)
   - Rest situation: ${homeTeam} [X days rest], ${awayTeam} [Y days rest]
   - (Gary decides if pace matters - you're providing the data)
   
   EFFICIENCY SNAPSHOT:
   - ${homeTeam} Off Rating: [X] (Rank), Def Rating: [Y] (Rank), Net: [Z]
   - ${awayTeam} Off Rating: [X] (Rank), Def Rating: [Y] (Rank), Net: [Z]
   - (Gary evaluates who has the edge - you're providing the numbers)
   
   PERSONNEL NOTES:
   - High-usage rookie playing away? Name: [X], Road splits: [Y PPG / Z FG%]
   - Star returning from injury? Name: [X], Games missed: [Y]
   - Player vs former team? Name: [X], Team: [Y], Career stats vs them: [Z]
   - L5 roster different from tonight? [Player X] missed L5 but plays tonight
   
   ENVIRONMENT:
   - Venue: [Arena name] - Crowd factor: [sellout expected / neutral / sparse]
   - Any NBA Cup / In-Season Tournament / rivalry context

Be factual. Do NOT include any betting picks or predictions.

🚫 CRITICAL RULES:
1. FACTS ONLY - Do NOT include betting predictions or analysis from articles
2. NO OPINIONS - Extract FACTS only, ignore any betting advice you find
3. CURRENT ROSTER ONLY - Do NOT mention players who left/traded in the offseason
4. 2025-26 SEASON ONLY - Ignore articles from 2024 or earlier
5. NO BETTING ADVICE - Gary makes his own picks - you provide CONTEXT only`;
    } else if (sport === 'NHL' || sport === 'icehockey_nhl') {
      prompt = `⚠️ CRITICAL: Today is ${today}. We are in the 2025-26 NHL SEASON.

For the NHL game ${awayTeam} @ ${homeTeam} on ${today}:

🚨 ROSTER VERIFICATION RULE (READ THIS FIRST):
- ONLY include players who are CURRENTLY on the team's 2025-26 roster
- If a player was TRADED or LEFT in the offseason (summer 2025), they are NOT relevant
- "Player X left Team Y" = Player is NOT on Team Y = DO NOT MENTION THEM
- ONLY list players who are ACTUALLY on the current roster but cannot play due to injury

1. INJURIES (OUT): List players who ARE on the 2025-26 roster but cannot play
   - ⚠️ ONLY players currently signed to the team
   - Include player name, position (C, W, D, G)
   - Mark if RECENT (last 2 weeks) or SEASON-LONG
   - Note any players on LTIR (Long-Term Injured Reserve)

2. PLAYERS RETURNING FROM INJURY (CRITICAL):
   - List any players who are RETURNING to action after missing games
   - A top-6 forward or top-4 defenseman returning is HUGE
   - Include: Player name, position, how many games missed
   - Note: Even depth players returning can change line combinations

3. GOALIE SITUATION - CRITICAL:
   - Who is the CONFIRMED starting goalie for ${homeTeam}?
   - Who is the CONFIRMED starting goalie for ${awayTeam}?
   - Include their current season save percentage if available
   - Is either team on a back-to-back? (affects goalie choice)

4. LINE COMBINATIONS & STORYLINES (2025-26 ROSTER ONLY):
   - Who are the top-line forwards for each team?
   - Any recent line changes or call-ups from AHL?
   - NARRATIVES: Any "revenge spots" for traded players, milestones, or team momentum shifts?
   - ROOKIE IMPACT: Any young players making a sudden impact?
   - ⚠️ If a player left in the offseason, they are NOT on the roster - do not include them

5. RECENT NEWS & DYNAMIC FACTORS:
   - Any trades, waiver claims, or roster moves?
   - Team drama, coaching hot seat, or playoff race?
   - Is this a rivalry or divisional game?
   - Narrative context not captured by BDL stats?

6. RECENT FORM CONTEXT (L5/L10 - CRITICAL FOR INTERPRETATION):
   - For ${homeTeam}: Who was OUT during their last 5 games? Who is BACK tonight?
   - For ${awayTeam}: Who was OUT during their last 5 games? Who is BACK tonight?
   - Example: "Oilers went 4-1 in L5, but McDavid sat 2 games. McDavid plays tonight."
   - If a key player missed most of L5 but plays tonight → L5 UNDERSTATES the team

7. HEAD-TO-HEAD CONTEXT (2025-26 SEASON ONLY):
   - Have ${homeTeam} and ${awayTeam} played this season?
   - If yes: Date, score, and WHO WAS OUT for each team in that game
   - Example: "Bruins beat Leafs 4-2 on Nov 10 - but Leafs were without Matthews"

8. 🚨 INVESTIGATION TRIGGERS (AUTO-FLAGS FOR GARY):
   ⚠️ GOALIE MISMATCH: If one team has a significantly better/worse goalie starting
      → Flag: "[Goalie] (.XXX SV%) vs [Goalie] (.XXX SV%) - INVESTIGATE goalie impact"
   
   ⚠️ BACK-TO-BACK: If either team is on a B2B, especially the road team
      → Flag: "[Team] on back-to-back - INVESTIGATE backup goalie likelihood"
   
   ⚠️ STAR RETURNING: If a top-6 forward or top-4 D returns after 3+ games
      → Flag: "[Player] returns after X games - INVESTIGATE team record without them"
   
   ⚠️ REVENGE GAME: If a player faces their former team
      → Flag: "[Player] faces former team [Team] - INVESTIGATE motivation factor"
   
   ⚠️ L5 ROSTER MISMATCH: If L5 roster differs from tonight's roster
      → Flag: "[Team] L5 was WITHOUT [Player] who plays tonight"
   
   List all applicable triggers. If none apply, say "No triggers flagged."

Be factual. Do NOT include any betting picks or predictions.

🚫 CRITICAL RULES:
1. FACTS ONLY - Do NOT include betting predictions or analysis from articles
2. NO OPINIONS - Extract FACTS only, ignore any betting advice
3. CURRENT ROSTER ONLY - Do NOT mention players who left/traded in the offseason
4. 2025-26 SEASON ONLY - Ignore articles from 2024 or earlier
5. NO BETTING ADVICE - Gary makes his own picks`;
    } else if (sport === 'NCAAB' || sport === 'basketball_ncaab') {
      prompt = `CURRENT DATE: ${today}
For the college basketball game ${awayTeam} @ ${homeTeam} on ${today}, provide UP-TO-DATE information:

1. INJURIES (OUT) (as of ${today}):
   - List ALL players OUT, QUESTIONABLE, or DAY-TO-DAY for each team
   - Include player name and position (G, F, C)
   - Mark if RECENT (last 2 weeks) or SEASON-LONG
   - College has fewer roster spots - each injury matters more

2. PLAYERS RETURNING FROM INJURY (CRITICAL):
   - List any players who are RETURNING to action after missing games
   - In college hoops, a starter returning can completely change a team
   - Even key rotation players (6th man, backup point) returning matters
   - Include: Player name, position, how many games missed

3. STARTING LINEUP & ROSTER CONTINUITY:
   - Who are the expected starting 5 for ${homeTeam}?
   - Who are the expected starting 5 for ${awayTeam}?
   - ROSTER CONTINUITY: What % of minutes/scoring is returning from last season for each team?
   - Are they a "veteran core" (3+ upperclassmen starters) or a "portal-heavy" new roster?
   - Any freshmen or key transfers making major impact this season?

4. COACHING & TACTICAL STYLE:
   - Who are the head coaches for ${homeTeam} and ${awayTeam}?
   - What is each coach's "signature" defensive style? (e.g., Pack-line, 2-3 Zone, Press, Man-to-man)
   - What is each team's offensive identity? (e.g., Post-heavy, 3PT reliant, Transition-focused, Motion offense)
   - Any notable coaching experience gaps or tournament pedigree differences?

5. KEY PLAYERS:
   - Who are the leading scorers/stars for each team?
   - Any players considering NBA draft (potential load management)?
   - Any recent transfer portal entries/commitments affecting the roster?

6. ADVANCED ANALYTICS (CRITICAL - current as of ${today}):
   - KenPom rankings and ratings for both teams (AdjEM, AdjO, AdjD, Tempo)
   - NET rankings for both teams
   - Strength of Schedule (SOS) rankings
   - Quad 1/2/3/4 records if available
   - Any notable efficiency metrics or statistical edges

7. VENUE & ENVIRONMENT:
   - Where is this game being played? (Arena name and capacity)
   - Is this venue known for being particularly hostile? (e.g., Student section proximity, altitude, noise level)
   - What is ${homeTeam}'s record AT HOME this season, specifically in conference play?
   - Any unique venue factors? (e.g., Denver altitude, small gym, historic arena)

8. GAME CONTEXT:
   - Is this a conference or non-conference game?
   - Tournament/conference tournament implications?
   - Any revenge angle from earlier this season or last season?
   - Is this a rivalry game?
   - Any scheduling quirks? (e.g., first game back from break, end of road trip)

9. RECENT FORM CONTEXT (L5 ROSTER - CRITICAL FOR INTERPRETATION):
   - For ${homeTeam}: Who was OUT during their last 5 games? Who is BACK tonight?
   - For ${awayTeam}: Who was OUT during their last 5 games? Who is BACK tonight?
   - Example: "Duke went 4-1 in L5, but star guard missed 3 games. He plays tonight."
   - If a key player missed most of L5 but plays tonight → L5 UNDERSTATES the team

10. HEAD-TO-HEAD CONTEXT (2025-26 SEASON ONLY):
   - Have ${homeTeam} and ${awayTeam} played this season?
   - If yes: Date, score, and WHO WAS OUT for each team in that game
   - Example: "Duke beat UNC 85-77 on Jan 5 - but UNC was without their starting PG"

11. 📊 RAW CONTEXT FOR GARY (DATA, NOT CONCLUSIONS):
   
   TEMPO PROFILE:
   - ${homeTeam} tempo: [Rank] (X possessions/game) - Style: [transition-heavy / half-court / balanced]
   - ${awayTeam} tempo: [Rank] (X possessions/game) - Style: [transition-heavy / half-court / balanced]
   - (Gary decides if this matters - you're providing the data)
   
   INTERIOR PERSONNEL:
   - ${homeTeam} frontcourt: [Key bigs names], Off. Reb Rate: [X%] (Rank)
   - ${awayTeam} frontcourt: [Key bigs names], Off. Reb Rate: [X%] (Rank)
   - (Gary evaluates the matchup - you're providing who's in the paint)
   
   PERIMETER CONTEXT:
   - ${homeTeam} 3PT%: [X%] (Rank), Key shooters: [names]
   - ${awayTeam} 3PT Defense: [X%] allowed (Rank)
   - (Gary evaluates if the shooting matchup matters)
   
   ENVIRONMENT (Environmental facts Gary can't calculate):
   - Venue: [Arena name] - Capacity: [X], Known for: [student section proximity / altitude / historic home edge / neutral site]
   - Example: "Hinkle Fieldhouse - 10,000 capacity, historic venue, rowdy student section behind basket"
   
   PERSONNEL NOTES:
   - High-usage freshman/transfer playing away? Name: [X], Road PPG: [Y] vs Home PPG: [Z]
   - Key player returning from injury? Name: [X], Games missed: [Y]
   - Conference rematch? First meeting result: [X], who was out that game: [Y]

Be factual. Do NOT include any betting picks or predictions.

🚫 CRITICAL ANTI-OPINION RULES:
1. FACTS ONLY - Do NOT include betting predictions or analysis
2. NO OPINIONS - Extract FACTS only, ignore betting advice
3. YOUR OWN WORDS - Synthesize facts, do NOT plagiarize
4. NO BETTING ADVICE - Gary makes his own picks`;
    } else if (sport === 'NCAAF' || sport === 'americanfootball_ncaaf') {
      // Detect if this is bowl season (Dec 14 - Jan 15)
      // Use 'today' which is the parsed date string passed to this function
      const parsedDate = new Date(today);
      const month = parsedDate.getMonth ? parsedDate.getMonth() : 11; // Default to December
      const day = parsedDate.getDate ? parsedDate.getDate() : 20;
      const isBowlSeason = (month === 11 && day >= 14) || (month === 0 && day <= 15);
      
      if (isBowlSeason) {
        // BOWL GAME PROMPT - Emphasize player opt-outs AND returning players
        prompt = `For the college football BOWL/CFP GAME ${awayTeam} @ ${homeTeam} on ${today}:

⚠️ CRITICAL: PLAYER OPT-OUTS FOR NFL DRAFT PREPARATION
This is a BOWL/CFP GAME. Many top players sit out to prepare for NFL Draft/Combine.
1. LIST ALL CONFIRMED PLAYER OPT-OUTS for both teams:
   - Include player name, position, and NFL draft projection (if known)
   - Star players who declared for NFL Draft and are NOT playing
   - Key playmakers who announced they are skipping the bowl
   - CRITICAL: These opt-outs DRASTICALLY change team capability

2. 🔄 PLAYERS RETURNING FROM INJURY (EQUALLY CRITICAL):
   - List any players who are RETURNING from injury for this game
   - Include players who missed time earlier this season but are NOW healthy
   - POSITION GROUPS matter: Getting 3-4 OL or DL players back is significant
   - For each: Name, position, when they last played, impact on team
   - Example: "RB John Smith returns after missing 3 games - had 800 yards before injury"

3. QB SITUATION - CRITICAL:
   - Is the STARTING QB playing or has he opted out?
   - Who is the STARTING QB for ${homeTeam}?
   - Who is the STARTING QB for ${awayTeam}?
   - Backup QB experience level if starter opted out?

4. INJURIES: List ALL players still OUT, QUESTIONABLE, or DOUBTFUL
   - Include player name, position
   - These are SEPARATE from opt-outs

5. 📅 PREVIOUS MATCHUP (IF APPLICABLE):
   - Did these teams play earlier this season?
   - If yes: What was the score? Who won? What were the key storylines?
   - REMATCH FACTOR: What might the losing team do differently?

6. KEY REMAINING PLAYERS:
   - Top RBs, WRs, and defensive playmakers who ARE playing
   - Transfer portal entries who may have reduced motivation

7. COACHING STATUS:
   - Has either coach accepted a new job? (MAJOR distraction)
   - Any coordinator departures?
   - Team motivation level for this game?

8. BOWL/CFP CONTEXT:
   - Bowl name and location (CFP Semifinal? Championship?)
   - Is this a neutral site or at one team's home stadium?
   - Historical significance of this matchup

9. WEATHER (if outdoor venue): Forecast for game time

10. HEAD-TO-HEAD CONTEXT (2025-26 SEASON ONLY):
   - Have ${homeTeam} and ${awayTeam} played this season (unlikely but check)?
   - If yes: Date, score, and WHO WAS OUT for each team in that game
   - Any recent historical context between these programs?

11. 🚨 INVESTIGATION TRIGGERS (AUTO-FLAGS FOR GARY):
   ⚠️ MASS OPT-OUTS: If 3+ starters have opted out
      → Flag: "[Team] has X confirmed opt-outs - INVESTIGATE depth impact"
   
   ⚠️ REVENGE/REMATCH: If teams played earlier in the season
      → Flag: "These teams met in [Game] - INVESTIGATE adjustment factor"
   
   ⚠️ COACHING DEPARTURE: If a coach has accepted a new job
      → Flag: "[Coach] leaving for [School] - INVESTIGATE team motivation"
   
   ⚠️ RETURNING STARS: If key players are returning from injury for the bowl
      → Flag: "[Player] returns after X games - MASSIVE for bowl game"
   
   ⚠️ TRAVEL MISMATCH: If one team is playing near their campus
      → Flag: "[Team] playing close to home - INVESTIGATE crowd factor"
   
   List all applicable triggers. If none apply, say "No triggers flagged."

REMINDER: Player availability (both OPT-OUTS and RETURNING from injury) can completely change a team. A team getting 4 defensive starters back is NOT the same team as 3 weeks ago.`;
      } else {
        // Regular season prompt
        prompt = `For the college football game ${awayTeam} @ ${homeTeam} on ${today}:

1. INJURIES: List ALL players OUT, QUESTIONABLE, or DOUBTFUL for each team
   - Include player name, position
   - Mark if RECENT (last 2 weeks) or SEASON-LONG

2. QB SITUATION - CRITICAL:
   - Who is the STARTING QB for ${homeTeam}?
   - Who is the STARTING QB for ${awayTeam}?
   - Any QB controversies or recent changes?
   - Backup QB experience level?

3. KEY PLAYER STATUS:
   - Top RBs, WRs, and defensive playmakers
   - Any NFL draft prospects sitting out?
   - Transfer portal impacts?

4. GAME CONTEXT:
   - Bowl game, conference championship, or CFP game?
   - Conference or non-conference matchup?
   - Rivalry significance?
   - Coaching changes or hot seats?
   - Is either team on upset alert?

5. WEATHER (if applicable): Forecast for game time

6. RECENT FORM CONTEXT (L5 ROSTER - CRITICAL FOR INTERPRETATION):
   - For ${homeTeam}: Who was OUT during their last 5 games? Who is BACK this week?
   - For ${awayTeam}: Who was OUT during their last 5 games? Who is BACK this week?
   - If key players missed most of L5 but play tonight → L5 UNDERSTATES the team

7. HEAD-TO-HEAD CONTEXT (2025-26 SEASON ONLY):
   - Have ${homeTeam} and ${awayTeam} played this season?
   - If yes: Date, score, and WHO WAS OUT for each team in that game

8. 🚨 INVESTIGATION TRIGGERS (AUTO-FLAGS FOR GARY):
   ⚠️ QB CHANGE: If a team has changed QBs or is starting a backup
      → Flag: "[Team] starting [QB] - INVESTIGATE QB splits"
   
   ⚠️ REVENGE GAME: If teams played earlier this season
      → Flag: "[Team] lost first meeting - INVESTIGATE adjustment factor"
   
   ⚠️ STAR RETURNING: If a key player returns after 3+ games missed
      → Flag: "[Player] returns after X games - INVESTIGATE team record without them"
   
   ⚠️ HOSTILE VENUE: If game is at a historically hostile home field
      → Flag: "[Venue] is known hostile environment - INVESTIGATE home field impact"
   
   List all applicable triggers. If none apply, say "No triggers flagged."

Be factual. Do NOT include any betting picks or predictions.

🚫 CRITICAL ANTI-OPINION RULES:
1. FACTS ONLY - Do NOT include betting predictions from articles
2. NO OPINIONS - Extract FACTS only, ignore betting advice
3. YOUR OWN WORDS - Synthesize facts, do NOT plagiarize
4. NO BETTING ADVICE - Gary makes his own picks`;
      }
    } else if (sportKey === 'NHL') {
      prompt = `For the NHL game ${awayTeam} @ ${homeTeam} on ${today}:

1. STARTING GOALIES - CRITICAL:
   - Who is the CONFIRMED or PROJECTED starting goalie for each team?
   - What are their recent stats (SV%, GAA)?

2. INJURIES - List SEPARATELY for each team:
   
   ${awayTeam} Injuries:
   - List each player: "Player Name (POS) - Status - Injury details"
   - Mark if RECENT (last 2 weeks) or SEASON-LONG (LTIR)
   
   ${homeTeam} Injuries:
   - List each player: "Player Name (POS) - Status - Injury details"
   - Mark if RECENT (last 2 weeks) or SEASON-LONG (LTIR)

3. LINE COMBINATIONS:
   - Current top 6 forwards for each team
   - Any AHL call-ups or recent trades?

4. KEY STORYLINES: Playoff positioning, recent form, back-to-back fatigue, revenge games.

Be factual. Format injuries clearly with player names, positions, and status.

🚫 CRITICAL: FACTS ONLY - No betting predictions or opinions from articles.`;
    } else if (sportKey === 'NBA') {
      prompt = `For the NBA game ${awayTeam} @ ${homeTeam} on ${today}:

1. STARTING LINEUP:
   - Who is the projected STARTING 5 for each team?
2. INJURIES: Who is OUT, QUESTIONABLE, or DOUBTFUL for each team?
   - Mark if RECENT (last 2 weeks) or SEASON-LONG (team stats already reflect absence)
3. KEY PLAYER STATUS (Depth Chart):
   - Status of top 3 scorers for each team.
   - Any recent rotation changes or trades?
4. GAME CONTEXT: Revenge games, rest situation (B2B), or playoff implications.

Be factual. Do NOT include any betting picks or predictions.

🚫 CRITICAL ANTI-OPINION RULES:
1. FACTS ONLY - Do NOT include betting predictions from articles
2. NO OPINIONS - Extract FACTS only, ignore betting advice
3. YOUR OWN WORDS - Synthesize facts, do NOT plagiarize
4. NO BETTING ADVICE - Gary makes his own picks`;
    } else {
    }
    
    console.log(`[Scout Report] 🔍 Using Gemini Grounding for live context: ${awayTeam} @ ${homeTeam}`);
    const startTime = Date.now();
    
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();
    
    const duration = Date.now() - startTime;
    console.log(`[Scout Report] ✅ Gemini Grounding response in ${duration}ms`);
    
    // Debug log: Show first 500 chars of raw response to verify content is being retrieved
    if (text) {
      const preview = text.substring(0, 500).replace(/\n/g, ' ');
      console.log(`[Scout Report] 📄 Grounding raw preview: ${preview}...`);
    }
    
    // Log grounding metadata if available
    const candidate = response.candidates?.[0];
    const groundingMetadata = candidate?.groundingMetadata;
    if (groundingMetadata?.webSearchQueries?.length > 0) {
      console.log(`[Scout Report] 🔍 Grounded searches: "${groundingMetadata.webSearchQueries.join('", "')}"`);
    }
    
    // Parse the response to extract injury information
    const groundedInjuries = parseGroundedInjuries(text, homeTeam, awayTeam);
    
    // Create an enhanced object that includes the raw text for Gary's organic reading
    return {
      home: groundedInjuries.home,
      away: groundedInjuries.away,
      groundedRaw: text, // Gary gets the FULL text of the search results
      groundingUsed: !!groundingMetadata?.webSearchQueries?.length
    };
    
  } catch (error) {
    console.warn(`[Scout Report] Gemini Grounding failed: ${error.message}`);
    return null;
  }
}

/**
 * Fetch a deep dive context for a SINGLE team
 * This allows bilateral analysis where each team gets equal investigation
 * @param {string} teamName - The team to investigate
 * @param {string} opponent - The opposing team (for context)
 * @param {string} sport - Sport key (NFL, NBA, etc.)
 * @param {string} gameDate - Game date string
 * @param {object} options - Configuration options
 * @returns {object} - Team-specific context
 */
async function fetchTeamDeepDive(teamName, opponent, sport, gameDate, options = {}) {
  const genAI = getGeminiClient();
  if (!genAI) {
    console.log('[Scout Report] Gemini not available for team deep dive');
    return null;
  }

  // Retry helper with exponential backoff and Flash fallback
  const MAX_RETRIES = 3;
  const callWithRetry = async (modelName, prompt, attempt = 1) => {
    try {
      const model = genAI.getGenerativeModel({
        model: modelName,
        tools: [{ google_search: {} }],
        safetySettings: [
          { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
          { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
          { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
          { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
        ]
      });
      return await model.generateContent(prompt);
    } catch (error) {
      const is429 = error.message?.includes('429') || error.message?.includes('quota') || error.message?.includes('Too Many Requests');
      const is500 = error.message?.includes('500') || error.message?.includes('503');
      
      if (is429 && attempt < MAX_RETRIES) {
        // 429: First try backoff, then fallback to Flash
        const delay = Math.pow(2, attempt) * 1000; // 2s, 4s, 8s
        console.log(`[Scout Report] ⚠️ 429 quota error, waiting ${delay/1000}s before retry ${attempt + 1}/${MAX_RETRIES}...`);
        await new Promise(r => setTimeout(r, delay));
        
        // On second retry, switch to Flash model
        if (attempt >= 2 && !modelName.includes('flash')) {
          const flashModel = process.env.GEMINI_FLASH_MODEL || 'gemini-3-flash-preview';
          console.log(`[Scout Report] ⚡ Falling back to Flash model: ${flashModel}`);
          return callWithRetry(flashModel, prompt, attempt + 1);
        }
        return callWithRetry(modelName, prompt, attempt + 1);
      }
      
      if (is500 && attempt < MAX_RETRIES) {
        // 500/503: Server error, retry with backoff
        const delay = Math.pow(2, attempt) * 1000;
        console.log(`[Scout Report] ⚠️ Server error (${error.message}), waiting ${delay/1000}s before retry...`);
        await new Promise(r => setTimeout(r, delay));
        return callWithRetry(modelName, prompt, attempt + 1);
      }
      
      throw error;
    }
  };

  try {
    const today = gameDate || new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
    // NCAAB ALWAYS uses Flash (per user policy + quota management)
    const isNCAAB = sport === 'basketball_ncaab' || sport === 'NCAAB';
    const modelName = (options.useFlash || isNCAAB)
      ? (process.env.GEMINI_FLASH_MODEL || 'gemini-3-flash-preview')
      : (process.env.GEMINI_MODEL || 'gemini-3-flash-preview');

    // Sport-specific deep dive queries
    let prompt;
    if (sport === 'NFL' || sport === 'americanfootball_nfl') {
      prompt = `Tell me everything about the ${teamName} heading into their game vs ${opponent} on ${today}:

1. QB SITUATION (CRITICAL):
   - Who is the STARTING QB right now?
   - If there was a QB change this season, who was the previous starter and why did they change?
   - How has the offense looked with the current QB?

2. TEAM STORY THIS SEASON:
   - What's their overall narrative? (playoff contender, fighting for wildcard, eliminated, surging, collapsing?)
   - Have they exceeded or fallen short of expectations?

3. KEY PLAYERS RIGHT NOW:
   - Who are the 3-4 most impactful players currently? (Not just stars, but who's playing well RIGHT NOW)
   - Any players on hot streaks or cold streaks?

4. MOTIVATION FOR THIS GAME:
   - What are they playing for specifically? (Division title, wildcard, draft position, pride?)
   - Is this a "must-win" situation?

5. RECENT ADJUSTMENTS:
   - After their last game, were there any coaching comments about adjustments?
   - Any scheme changes, lineup changes, or strategic shifts?

6. INJURY IMPACT (NUANCED - BOTH DIRECTIONS):
   **Players OUT:**
   - Who are the key players OUT and how long have they been out?
   - CRITICAL: For players out 2+ weeks, HOW HAS THE TEAM PERFORMED WITHOUT THEM?
   - If they've gone 3-1 without their starting RB, that's who they are now
   - Their recent form IS the baseline - not "they're missing X"
   
   🔄 **Players RETURNING from injury:**
   - Any players COMING BACK from injury who missed time earlier?
   - Getting multiple players back at a position group (3 OL, 4 DBs) is SIGNIFICANT
   - When did they last play? How much rust should we expect?
   - ⚠️ NFL NUANCE: Returning players usually help more than NBA (less chemistry-dependent)
   - But practice participation matters - "limited all week" vs "full participant"

7. 🔥 THE FAN'S CASE - WHY ${teamName.toUpperCase()} WINS TODAY (REQUIRED):
   Even if this team is struggling, their fans still believe. Find the REAL reasons for optimism:
   - What matchup advantage do they have against ${opponent} specifically?
   - Which player could have a breakout game?
   - Is there any "trap game" or "letdown" potential for the opponent?
   - Do they have any historical edge against ${opponent} (divisional rivalry, revenge factor, etc.)?
   - What's one thing that could go RIGHT for them in this specific game?

Be factual. No predictions. Tell me the ${teamName}'s current situation AND the genuine case for why they could win today.`;
    } else if (sport === 'NBA' || sport === 'basketball_nba') {
      prompt = `Tell me everything about the ${teamName} heading into their game vs ${opponent} on ${today}:

1. CURRENT ROTATION:
   - Who is the starting 5 right now?
   - Any recent rotation changes?

2. TEAM STORY:
   - What's their narrative this season? (contender, play-in team, tanking, surging?)
   - Recent trajectory (hot, cold, inconsistent?)

3. KEY PLAYERS RIGHT NOW:
   - Who are the 3-4 most impactful players currently?
   - Any stars on hot streaks or struggling?

4. MOTIVATION:
   - What are they playing for? (Playoff seeding, play-in, draft lottery?)

5. INJURY IMPACT (NUANCED - BOTH DIRECTIONS):
   **Players OUT:**
   - Key players OUT and for how long?
   - CRITICAL: How has the team performed WITHOUT this player?
   - If they've been out 2+ weeks, their recent form IS the baseline (not "missing X")
   - Example: If Star X has been out 2 weeks and team went 4-2, that's who they ARE now
   
   🔄 **Players RETURNING from injury:**
   - Who is coming BACK from injury after missing games?
   - ⚠️ CHEMISTRY RISK: Return can DISRUPT rhythm team built without them
   - The team might actually be WORSE short-term as they re-integrate
   - How many games missed? More games = more rust AND more chemistry disruption
   - Did the team find something good without them? (Breakout role player, new rotations?)

6. RECENT FORM CONTEXT:
   - Quality of recent opponents (tough schedule or easy?)
   - Close games or blowouts?

7. 🔥 THE FAN'S CASE - WHY ${teamName.toUpperCase()} WINS TODAY (REQUIRED):
   Even if this team is struggling, their fans still believe. Find the REAL reasons for optimism:
   - What matchup advantage do they have against ${opponent} specifically?
   - Which player is due for a big game?
   - Is there any "trap game" or "letdown" potential for the opponent?
   - Do they have any edge against ${opponent} (recent series history, coaching matchup, etc.)?
   - What's one thing that could go RIGHT for them in this specific game?

Be factual. No predictions. Tell me the ${teamName}'s current situation AND the genuine case for why they could win today.`;
    } else if (sport === 'NHL' || sport === 'icehockey_nhl') {
      // NHL-specific deep dive with goaltending, lines, and fatigue focus
      prompt = `Tell me everything about the ${teamName} heading into their game vs ${opponent} on ${today}:

1. 🥅 GOALTENDING SITUATION (CRITICAL - THIS IS THE #1 FACTOR):
   - Who is the CONFIRMED or PROJECTED starting goalie tonight?
   - What is their current season save percentage (SV%)?
   - How have they performed in their last 3-5 starts?
   - Is this a back-to-back situation? If so, is the backup likely starting?
   - Any goalie injuries or controversies?

2. 🏒 LINE COMBINATIONS & TOP PLAYERS:
   - Who is on the current top line (1st line forwards)?
   - Who is the #1 center and #1 defenseman right now?
   - Any recent line shuffles, call-ups from AHL, or trades?

3. 🏥 INJURY IMPACT (BOTH DIRECTIONS):
   - Key forwards or defensemen OUT with injuries?

   🔄 PLAYERS RETURNING FROM INJURY (CRITICAL):
   - Who is coming BACK from injury after missing games?
   - A top-6 forward or top-4 D returning is HUGE
   - Even bottom-6 depth returning can change line combinations
   - How many games did they miss? Rust factor?

4. 📊 RECENT FORM & TRAJECTORY:
   - What's their record in the last 5-10 games?
   - Are they scoring well or struggling offensively?
   - Is their goaltending carrying them or costing them games?
   - Home vs road performance difference?

5. 🎯 WHAT THEY'RE PLAYING FOR:
   - Playoff positioning? Wild card race? Division lead?
   - Already clinched/eliminated? Playing for pride or draft lottery?

6. ⏰ SCHEDULE & FATIGUE:
   - Is this a back-to-back game?
   - Have they played 3+ games in the last 5 days?
   - Any recent long road trips or time zone travel?
   - When was their last day off?

7. 💥 SPECIAL TEAMS STATUS:
   - How is their power play performing lately?
   - How is their penalty kill?
   - Any key PP/PK players injured?

8. 🔥 THE FAN'S CASE - WHY ${teamName.toUpperCase()} WINS TODAY (REQUIRED):
   Even if this team is struggling, their fans still believe. Find the REAL reasons for optimism:
   - What matchup advantage do they have against ${opponent} specifically?
   - Which player (forward, defenseman, or goalie) could steal the game?
   - Is there any "trap game" or "letdown" potential for the opponent?
   - Do they have any historical edge against ${opponent} (divisional rivalry, goalie dominance, etc.)?
   - Is ${opponent} on a back-to-back or fatigued?
   - What's one thing that could go RIGHT for them in this specific game?

Be factual. No predictions. Tell me the ${teamName}'s current situation AND the genuine case for why they could win today.`;
    } else if (sport === 'NCAAB' || sport === 'basketball_ncaab') {
      // NCAAB-specific deep dive - college basketball has unique dynamics
      prompt = `Tell me everything about ${teamName} heading into their game vs ${opponent} on ${today}:

1. 🏀 CURRENT ROSTER & KEY PLAYERS:
   - Who are the starting 5 right now?
   - Who is the GO-TO SCORER (leading scorer and their role)?
   - Any key rotation players? Who is the 6th man?
   - ROSTER CONTINUITY: Are they mostly returning players or transfer-heavy?
   - Any freshmen making an immediate impact?

2. 📊 EFFICIENCY PROFILE (KenPom-style):
   - What is their offensive identity? (Post-up heavy? 3PT reliant? Transition team?)
   - What is their defensive identity? (Pack-line? 2-3 zone? Pressure/press?)
   - Are they a FAST-TEMPO team or SLOW GRIND team?
   - How do they rank in 3PT shooting and 3PT defense?

3. 📍 HOME/AWAY PERFORMANCE:
   - How have they performed at HOME vs on the ROAD this season?
   - Is their arena known for being hostile? (Student section, small gym, altitude?)
   - What's their conference record at home vs away?

4. 🎯 WHAT THEY'RE PLAYING FOR:
   - Conference tournament seeding? Regular season title?
   - NCAA Tournament bubble team? Safely in? Out?
   - What's their current NET ranking and Quad 1/2 record?

5. 🏥 INJURIES & AVAILABILITY (BOTH DIRECTIONS):
   - Any key players OUT or QUESTIONABLE?
   - For college, even ONE starter out can be massive
   - Any players dealing with nagging injuries or load management?
   
   🔄 PLAYERS RETURNING FROM INJURY (CRITICAL):
   - Who is coming BACK from injury after missing games?
   - A starter returning after 2+ weeks can completely change the team
   - Even a key rotation player (6th man, backup point guard) returning matters
   - When did they last play? How much rust should we expect?

6. 📈 RECENT TRAJECTORY:
   - What's their record in the last 5 games?
   - Quality of recent opponents (gauntlet vs cupcakes)?
   - Close games or blowouts?
   - Any concerning trends (offensive struggles, defensive lapses)?

7. 👨‍🏫 COACHING FACTOR:
   - Who is the head coach and what's their tournament pedigree?
   - Any in-season coaching adjustments or lineup changes?
   - How does the coach typically perform in big games/pressure spots?

8. 🔥 THE FAN'S CASE - WHY ${teamName.toUpperCase()} WINS TODAY (REQUIRED):
   Even if this team is struggling, their fans still believe. Find the REAL reasons for optimism:
   - What SPECIFIC matchup advantage do they have against ${opponent}?
   - Which player could have a breakout game against ${opponent}'s defense?
   - Is ${opponent} in a potential "trap game" or "letdown" spot?
   - Does ${teamName} have any edge in tempo, style, or coaching matchup?
   - If at home: How hostile is this venue and how does ${opponent} perform on the road?
   - What's one thing that could go RIGHT for them in this specific game?

Be factual. No predictions. Tell me the ${teamName}'s current situation AND the genuine case for why they could win today.`;
    } else if (sport === 'NCAAF' || sport === 'americanfootball_ncaaf') {
      // NCAAF-specific deep dive with CFP/bowl context and returning players
      prompt = `Tell me everything about the ${teamName} heading into their CFP/Bowl game vs ${opponent} on ${today}:

1. 🏈 QB SITUATION (CRITICAL):
   - Who is the STARTING QB for ${teamName}?
   - Is the starting QB healthy and confirmed to play?
   - If backup QB is starting, what is their experience level?
   - Has there been any QB change this season? If so, how did the team adapt?

2. 🔄 PLAYERS RETURNING FROM INJURY (CRITICAL FOR BOWL GAMES):
   - Are there any players RETURNING from injury who were out earlier in the season?
   - Specifically check: OL, DL, LBs, DBs returning - even "role players" matter
   - If multiple players at a position group are back healthy, this is SIGNIFICANT
   - Example: "Getting 3 DL back gives their defensive line rotation a huge boost"
   - When did each returning player last play?

3. 🚫 PLAYERS OUT (Opt-outs, Injuries, Suspensions):
   - List ALL confirmed opt-outs for NFL Draft preparation
   - List injured players who will NOT play
   - For each: Name, Position, NFL Draft projection (if applicable)
   - How has the team performed WITHOUT these players?

4. 📅 PREVIOUS MATCHUP vs ${opponent} (CRITICAL):
   - Did these teams play earlier THIS SEASON? If yes:
     * What was the score and margin?
     * What were the key storylines from that game?
     * Did either team have key players out in that game who are NOW available?
     * What adjustments might the LOSING team make?
   - This is a REMATCH FACTOR that matters for game script

5. 🔥 KEY OFFENSIVE PLAYMAKERS:
   - Top RBs and their rushing stats
   - Top WRs/TEs and their receiving production
   - O-Line quality and health

6. 🛡️ DEFENSIVE STANDOUTS:
   - Key pass rushers (sacks, pressures)
   - Best coverage players
   - Turnover creators

7. 👨‍🏫 COACHING FACTOR:
   - Head coach's bowl/CFP record and big game experience
   - Any coaching staff changes (OC/DC departures for new jobs)?
   - Team motivation level heading into this game

8. 🔥 THE FAN'S CASE - WHY ${teamName.toUpperCase()} WINS (REQUIRED):
   Even if ${teamName} is the underdog, find REAL reasons for optimism:
   - What SPECIFIC matchup advantage do they have against ${opponent}?
   - Which player could have a breakout game?
   - Is there any "revenge" angle from the previous matchup?
   - What could go RIGHT for them in this specific game?
   - Are they getting any key players BACK that changes the equation?

Be factual. No predictions. Include the genuine case for why ${teamName} could win.`;
    } else {
      // Generic prompt for other sports
      prompt = `Tell me the current situation for ${teamName} heading into their game vs ${opponent} on ${today}:

1. Key players available/unavailable
2. Recent form and trajectory
3. What they're playing for
4. Any recent news or storylines

5. 🔥 THE FAN'S CASE - WHY ${teamName.toUpperCase()} WINS TODAY:
   Even if this team is struggling, find REAL reasons for optimism:
   - What matchup advantage do they have against ${opponent}?
   - Which player could have a breakout game?
   - Is there any "trap game" potential for the opponent?
   - What could go RIGHT for them in this specific game?

Be factual, no predictions. Include the genuine case for why they could win.`;
    }

    console.log(`[Scout Report] 🔍 Deep dive for ${teamName} using ${modelName}...`);
    const startTime = Date.now();
    
    // Use retry wrapper with automatic Flash fallback on quota errors
    const result = await callWithRetry(modelName, prompt);
    const response = await result.response;
    const text = response.text();
    
    const duration = Date.now() - startTime;
    console.log(`[Scout Report] ✅ ${teamName} deep dive in ${duration}ms`);

    return {
      team: teamName,
      context: text,
      duration
    };
  } catch (error) {
    console.warn(`[Scout Report] Team deep dive failed for ${teamName}: ${error.message}`);
    return { team: teamName, context: null, error: error.message };
  }
}

/**
 * Fetch bilateral context - deep dives for BOTH teams in parallel
 * Also generates key investigation questions based on what's found
 * @param {string} homeTeam - Home team name
 * @param {string} awayTeam - Away team name
 * @param {string} sport - Sport key
 * @param {string} gameDate - Game date string
 * @param {object} options - Configuration options
 * @returns {object} - { homeContext, awayContext, keyQuestions }
 */
async function fetchBilateralContext(homeTeam, awayTeam, sport, gameDate, options = {}) {
  console.log(`[Scout Report] 🎯 Fetching BILATERAL context for ${awayTeam} @ ${homeTeam}`);
  
  // Fetch both teams in parallel
  const [homeDeepDive, awayDeepDive] = await Promise.all([
    fetchTeamDeepDive(homeTeam, awayTeam, sport, gameDate, options),
    fetchTeamDeepDive(awayTeam, homeTeam, sport, gameDate, options)
  ]);

  // Generate key questions based on what we found
  const keyQuestions = generateKeyQuestions(homeDeepDive, awayDeepDive, sport);

  return {
    homeContext: homeDeepDive?.context || null,
    awayContext: awayDeepDive?.context || null,
    keyQuestions,
    meta: {
      homeDuration: homeDeepDive?.duration || 0,
      awayDuration: awayDeepDive?.duration || 0
    }
  };
}

/**
 * Auto-generate investigation questions based on team contexts
 * These questions guide Gary to think about both sides WITHOUT prescribing answers
 */
function generateKeyQuestions(homeDeepDive, awayDeepDive, sport) {
  const questions = [];
  const homeContext = (homeDeepDive?.context || '').toLowerCase();
  const awayContext = (awayDeepDive?.context || '').toLowerCase();
  const homeName = homeDeepDive?.team || 'Home Team';
  const awayName = awayDeepDive?.team || 'Away Team';

  // QB/Key Player Changes
  if (homeContext.includes('backup') || homeContext.includes('replaced') || homeContext.includes('changed qb') || homeContext.includes('new starter')) {
    questions.push(`How has ${homeName}'s offense adapted since their QB/key player change?`);
  }
  if (awayContext.includes('backup') || awayContext.includes('replaced') || awayContext.includes('changed qb') || awayContext.includes('new starter')) {
    questions.push(`How has ${awayName}'s offense adapted since their QB/key player change?`);
  }

  // Motivation/Desperation
  if (homeContext.includes('must-win') || homeContext.includes('playoff') || homeContext.includes('fighting for')) {
    questions.push(`How does ${homeName}'s desperation/motivation affect their performance at home?`);
  }
  if (awayContext.includes('must-win') || awayContext.includes('playoff') || awayContext.includes('fighting for')) {
    questions.push(`Can ${awayName}'s urgency translate to success on the road?`);
  }

  // Recent poor performance (counter-narrative opportunity)
  if (homeContext.includes('struggled') || homeContext.includes('lost') || homeContext.includes('poor') || homeContext.includes('bad')) {
    questions.push(`After recent struggles, how might ${homeName} adjust their gameplan?`);
  }
  if (awayContext.includes('struggled') || awayContext.includes('lost') || awayContext.includes('poor') || awayContext.includes('bad')) {
    questions.push(`After recent struggles, how might ${awayName} adjust their gameplan?`);
  }

  // Hot streaks (investigate sustainability)
  if (homeContext.includes('hot streak') || homeContext.includes('winning streak') || homeContext.includes('surging')) {
    questions.push(`Is ${homeName}'s hot streak sustainable? Investigate the quality of opponents and win margins.`);
  }
  if (awayContext.includes('hot streak') || awayContext.includes('winning streak') || awayContext.includes('surging')) {
    questions.push(`Is ${awayName}'s hot streak sustainable? Investigate the quality of opponents and win margins.`);
  }

  // Key player out - ask about performance WITHOUT them
  if (homeContext.includes('out') || homeContext.includes('injured') || homeContext.includes('suspended')) {
    questions.push(`How has ${homeName} performed WITHOUT their injured/suspended player(s)? (Check L5/L10)`);
  }
  if (awayContext.includes('out') || awayContext.includes('injured') || awayContext.includes('suspended')) {
    questions.push(`How has ${awayName} performed WITHOUT their injured/suspended player(s)? (Check L5/L10)`);
  }

  // Player RETURNING - chemistry concern (especially NBA)
  if (homeContext.includes('return') || homeContext.includes('back from') || homeContext.includes('coming back')) {
    questions.push(`Will ${homeName}'s returning player help or DISRUPT the chemistry they've built?`);
  }
  if (awayContext.includes('return') || awayContext.includes('back from') || awayContext.includes('coming back')) {
    questions.push(`Will ${awayName}'s returning player help or DISRUPT the chemistry they've built?`);
  }

  // Always add some universal questions for balanced analysis
  questions.push(`What's the BEST case scenario for ${homeName} in this game?`);
  questions.push(`What's the BEST case scenario for ${awayName} in this game?`);
  
  // Sport-specific questions
  if (sport === 'NFL' || sport === 'americanfootball_nfl') {
    questions.push(`If this is a divisional game, how does familiarity affect the likely margin?`);
  }
  
  if (sport === 'NBA' || sport === 'basketball_nba') {
    questions.push(`What are the key pace and rest factors that could swing this game?`);
    
    // NBA-specific injury nuance
    if (homeContext.includes('out') || homeContext.includes('injured') || awayContext.includes('out') || awayContext.includes('injured')) {
      questions.push(`If key players have been out 2+ weeks, has the team ADJUSTED? (Their recent form is their baseline)`);
    }
    if (homeContext.includes('return') || homeContext.includes('coming back') || awayContext.includes('return') || awayContext.includes('coming back')) {
      questions.push(`NBA chemistry: Could the returning player actually HURT short-term performance as they re-integrate?`);
    }
  }
  
  if (sport === 'NHL' || sport === 'icehockey_nhl') {
    // Goaltending is THE critical factor in NHL
    questions.push(`Who is the CONFIRMED starting goalie for each team, and how have they performed in their last 5 starts?`);
    
    // Back-to-back specific
    if (homeContext.includes('back-to-back') || homeContext.includes('b2b') || awayContext.includes('back-to-back') || awayContext.includes('b2b')) {
      questions.push(`Which team is on a back-to-back, and does that mean a backup goalie starts?`);
    }
    
    // Schedule/fatigue
    if (homeContext.includes('tired') || homeContext.includes('fatigue') || homeContext.includes('3 games') ||
        awayContext.includes('tired') || awayContext.includes('fatigue') || awayContext.includes('3 games')) {
      questions.push(`How does schedule fatigue (3 games in 4 nights, road travel) affect the matchup?`);
    }
    
    // Special teams
    if (homeContext.includes('power play') || awayContext.includes('power play') || 
        homeContext.includes('penalty kill') || awayContext.includes('penalty kill')) {
      questions.push(`How do the special teams matchups favor one side? (Compare PP% vs opponent PK%)`);
    }
    
    // Hot players/lines
    if (homeContext.includes('hot') || homeContext.includes('point per game') || homeContext.includes('scoring streak') ||
        awayContext.includes('hot') || awayContext.includes('point per game') || awayContext.includes('scoring streak')) {
      questions.push(`Which top-line player is hottest right now, and can they tilt this game?`);
    }
    
    // Divisional rivalry
    if (homeContext.includes('division') || awayContext.includes('division') ||
        homeContext.includes('rival') || awayContext.includes('rival')) {
      questions.push(`Is this a divisional matchup where familiarity keeps games tighter than talent suggests?`);
    }
  }
  
  if (sport === 'NCAAB' || sport === 'basketball_ncaab') {
    // Home court is MASSIVE in college basketball
    questions.push(`How does the venue (home court, neutral site) and crowd factor affect this matchup?`);
    
    // Tempo/pace matchup
    if (homeContext.includes('tempo') || homeContext.includes('pace') || homeContext.includes('fast') || homeContext.includes('slow') ||
        awayContext.includes('tempo') || awayContext.includes('pace') || awayContext.includes('fast') || awayContext.includes('slow')) {
      questions.push(`Which team controls tempo, and does the pace favor one side?`);
    }
    
    // Conference familiarity
    if (homeContext.includes('conference') || awayContext.includes('conference') ||
        homeContext.includes('rematch') || awayContext.includes('rematch')) {
      questions.push(`Is this a conference game where familiarity might keep it closer than talent suggests?`);
    }
    
    // Experience/youth factor
    if (homeContext.includes('freshman') || homeContext.includes('transfer') || homeContext.includes('young') ||
        awayContext.includes('freshman') || awayContext.includes('transfer') || awayContext.includes('young')) {
      questions.push(`How does roster experience (upperclassmen vs freshmen/transfers) factor into this matchup?`);
    }
    
    // 3PT variance
    if (homeContext.includes('three') || homeContext.includes('3-point') || homeContext.includes('shooting') ||
        awayContext.includes('three') || awayContext.includes('3-point') || awayContext.includes('shooting')) {
      questions.push(`Is one team overly reliant on 3PT shooting, creating high variance?`);
    }
    
    // Tournament/bubble implications
    if (homeContext.includes('tournament') || awayContext.includes('tournament') ||
        homeContext.includes('march') || awayContext.includes('march') ||
        homeContext.includes('bubble') || awayContext.includes('bubble') ||
        homeContext.includes('NET') || awayContext.includes('NET')) {
      questions.push(`Is either team more tournament-tested or fighting for NCAA Tournament positioning?`);
    }
    
    // Coaching matchup
    if (homeContext.includes('coach') || awayContext.includes('coach')) {
      questions.push(`How do the coaching styles and tournament experience compare?`);
    }
  }
  
  if (sport === 'NCAAF' || sport === 'americanfootball_ncaaf') {
    questions.push(`What's the talent/depth disparity, and can scheme overcome the gap?`);
    
    // Bowl/CFP specific
    if (homeContext.includes('bowl') || awayContext.includes('bowl') ||
        homeContext.includes('playoff') || awayContext.includes('playoff') ||
        homeContext.includes('cfp') || awayContext.includes('cfp')) {
      questions.push(`How do bowl/CFP preparation time and motivation affect each team?`);
      questions.push(`Which team has more opt-outs/NFL Draft declarations, and how does that change the matchup?`);
    }
    
    // Rematch detection - CRITICAL for CFP
    if (homeContext.includes('rematch') || awayContext.includes('rematch') ||
        homeContext.includes('beat') || awayContext.includes('beat') ||
        homeContext.includes('earlier this season') || awayContext.includes('earlier this season') ||
        homeContext.includes('regular season') || awayContext.includes('regular season')) {
      questions.push(`This is a REMATCH - what adjustments might the team that lost make?`);
      questions.push(`In the previous meeting, were any key players out who are NOW available?`);
    }
    
    // Returning players - can change the equation entirely
    if (homeContext.includes('return') || awayContext.includes('return') ||
        homeContext.includes('back from') || awayContext.includes('back from') ||
        homeContext.includes('healthy') || awayContext.includes('healthy') ||
        homeContext.includes('coming back') || awayContext.includes('coming back')) {
      questions.push(`Which team is getting key players BACK, and how does that change their ceiling?`);
    }
    
    // QB factor
    if (homeContext.includes('qb') || homeContext.includes('quarterback') ||
        awayContext.includes('qb') || awayContext.includes('quarterback')) {
      questions.push(`How do the QB matchups compare, especially under pressure in a big game?`);
    }
    
    // Coaching experience
    if (homeContext.includes('coach') || awayContext.includes('coach') ||
        homeContext.includes('experience') || awayContext.includes('experience')) {
      questions.push(`How do the coaches' CFP/big game resumes compare?`);
    }
  }

  // Limit to 5-6 most relevant questions
  return questions.slice(0, 6);
}

/**
 * Parse Gemini Grounded response to extract injuries
 * Uses multiple flexible patterns to catch natural language descriptions
 */
function parseGroundedInjuries(content, homeTeam, awayTeam) {
  const injuries = { home: [], away: [] };
  const addedPlayers = new Set(); // Prevent duplicates
  
  if (!content) return injuries;
  
  // CRITICAL: Strip markdown formatting before parsing
  // Gemini often returns **bold** and *italic* which breaks regex patterns
  let cleanContent = content
    .replace(/\*\*/g, '')   // Remove bold markdown
    .replace(/\*/g, '')     // Remove italic markdown
    .replace(/#{1,6}\s*/g, '')  // Remove headers
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');  // [text](url) -> text
  
  const homeTeamBase = homeTeam.toLowerCase();
  const homeMascot = homeTeam.split(' ').pop().toLowerCase();
  const awayTeamBase = awayTeam.toLowerCase();
  const awayMascot = awayTeam.split(' ').pop().toLowerCase();
  
  // Also create city-only versions for better matching
  // "Tampa Bay Lightning" -> "tampa bay", "St. Louis Blues" -> "st. louis"
  const homeCity = homeTeam.split(' ').slice(0, -1).join(' ').toLowerCase();
  const awayCity = awayTeam.split(' ').slice(0, -1).join(' ').toLowerCase();
  
  // Helper to add an injury if not duplicate
  const addInjury = (team, playerName, position, status, line) => {
    const key = `${team}-${playerName.toLowerCase()}`;
    if (addedPlayers.has(key)) return;
    
    // Prevent adding team names as players
    if (playerName.toLowerCase().includes(homeTeamBase) || 
        playerName.toLowerCase().includes(awayTeamBase) ||
        playerName.toLowerCase().includes(homeMascot) ||
        playerName.toLowerCase().includes(awayMascot)) {
      return;
    }
    
    // Skip if name is too short or looks like a position
    if (playerName.length < 4 || /^[A-Z]{1,3}$/.test(playerName)) return;
    
    // CRITICAL: Skip if name looks like duration/date text instead of a player name
    // This prevents "until Feb", "Reserve Dec", "at least Dec" from being stored as player names
    const lowerName = playerName.toLowerCase();
    const durationPatterns = [
      'until', 'reserve', 'at least', 'through', 'expected', 'return',
      'january', 'february', 'march', 'april', 'may', 'june', 'july', 
      'august', 'september', 'october', 'november', 'december',
      'jan', 'feb', 'mar', 'apr', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec',
      'week', 'weeks', 'month', 'day', 'days', 'indefinitely', 'tbd',
      ' and ', 'with ', 'note:', 'context:'
    ];
    if (durationPatterns.some(pattern => lowerName.includes(pattern))) {
      console.log(`[Scout Report] Parser: Skipping invalid player name (looks like duration): "${playerName}"`);
      return;
    }
    
    // Skip if name doesn't look like a real name (should have at least first + last name pattern)
    // Valid: "Victor Hedman", "Jordan Kyrou", "Zach Werenski"
    // Invalid: "until Feb", "Reserve Dec"
    if (!/^[A-Z][a-z]+(\s+[A-Z][a-z'-]+)+$/.test(playerName.trim())) {
      // Allow some flexibility for names with special chars like O'Brien, but reject obvious non-names
      if (!/[A-Z][a-z]+/.test(playerName)) {
        console.log(`[Scout Report] Parser: Skipping invalid player name (bad format): "${playerName}"`);
        return;
      }
    }
    
    addedPlayers.add(key);
    
    // Check for duration context
    const lowerLine = line.toLowerCase();
    let duration = 'UNKNOWN';
    if (lowerLine.includes('season-long') || lowerLine.includes('all season') || lowerLine.includes('since week 1') ||
        lowerLine.includes('indefinitely') || lowerLine.includes('no timetable') || lowerLine.includes('no return') ||
        lowerLine.includes('season-ending') || lowerLine.includes('out for season') || 
        lowerLine.includes('since october') || lowerLine.includes('since november') ||
        lowerLine.includes('sidelined') || lowerLine.includes('surgery') || lowerLine.includes('acl') ||
        lowerLine.includes('achilles') || lowerLine.includes('torn')) {
      duration = 'SEASON-LONG';
    } else if (lowerLine.includes('mid-season') || lowerLine.includes('several weeks') || 
               lowerLine.includes('extended') || lowerLine.includes('multiple weeks')) {
      duration = 'MID-SEASON';
    } else if (lowerLine.includes('recent') || lowerLine.includes('this week') || lowerLine.includes('last week') ||
               lowerLine.includes('day-to-day') || lowerLine.includes('questionable') || lowerLine.includes('game-time')) {
      duration = 'RECENT';
    }
    
    const nameParts = playerName.trim().split(' ');
    injuries[team].push({
      player: {
        first_name: nameParts[0],
        last_name: nameParts.slice(1).join(' '),
        position: position || ''
      },
      status: status.toLowerCase().includes('ir') || status.toLowerCase().includes('ltir') ? 'IR' : 
              status.toLowerCase().includes('out') ? 'Out' :
              status.toLowerCase().includes('doubtful') ? 'Doubtful' : 'Questionable',
      duration: duration,
      isEdge: duration === 'RECENT',
      source: 'gemini_grounding'
    });
  };
  
  // Multiple parsing patterns for flexibility
  const patterns = [
    // Pattern 1: "- Player Name (POS) - Status" or "Player Name (POS): Status"
    /(?:[-•*]\s*)?([A-Z][a-z]+(?:\s+[A-Z][a-z']+)+)\s*(?:\(([A-Z0-9\/]+)\))?\s*[-–:]+\s*(OUT|Out|IR|LTIR|Doubtful|Questionable|injured reserve|Day-To-Day|DTD|questionable|out|doubtful)/i,
    // Pattern 2: "Player Name is out/questionable" (natural language)
    /([A-Z][a-z]+(?:\s+[A-Z][a-z']+)+)\s+(?:is|was|remains|listed as|currently)\s+(out|questionable|doubtful|day-to-day|injured|sidelined)/i,
    // Pattern 3: "OUT: Player Name" or "Questionable: Player Name"
    /(OUT|Questionable|Doubtful|Day-To-Day|Injured)[\s:]+([A-Z][a-z]+(?:\s+[A-Z][a-z']+)+)/i,
    // Pattern 4: "Player Name - knee/ankle/etc - out"
    /([A-Z][a-z]+(?:\s+[A-Z][a-z']+)+)\s*[-–]\s*(?:knee|ankle|shoulder|back|hamstring|calf|foot|wrist|hand|hip|groin|quad|illness|personal|rest|concussion|thumb|finger|toe|neck|oblique|ribs|elbow|forearm|thigh|shin|achilles|acl|mcl)[^-]*[-–]\s*(out|questionable|doubtful|day-to-day)/i,
    // Pattern 5: "Player Name will not play" / "Player Name expected to miss"
    /([A-Z][a-z]+(?:\s+[A-Z][a-z']+)+)\s+(?:will not play|won't play|expected to miss|ruled out|has been ruled out|will miss|is expected to sit)/i,
    // Pattern 6: Simpler "Player Name out" at end of sentence
    /([A-Z][a-z]+(?:\s+[A-Z][a-z']+)+)\s*(?:\([^)]+\))?\s*(?:is\s+)?(out|questionable|doubtful)\s*(?:\.|,|$)/i
  ];
  
  const lines = cleanContent.split('\n');
  let currentTeam = null;
  
  for (const line of lines) {
    const lower = line.toLowerCase();
    
    // Detect team context - look for team name, city, or mascot
    // Be more flexible with context detection for NHL teams like "St. Louis Blues"
    const isHomeTeam = lower.includes(homeTeamBase) || 
                       (homeMascot.length > 3 && lower.includes(homeMascot)) ||
                       (homeCity.length > 3 && lower.includes(homeCity));
    const isAwayTeam = lower.includes(awayTeamBase) || 
                       (awayMascot.length > 3 && lower.includes(awayMascot)) ||
                       (awayCity.length > 3 && lower.includes(awayCity));
    
    // Only switch team if we explicitly see a team header (to avoid false switches)
    if (isHomeTeam && !isAwayTeam) {
      currentTeam = 'home';
      console.log(`[Scout Report] Parser: Detected home team context (${homeTeam}) in: "${line.substring(0, 60)}..."`);
    } else if (isAwayTeam && !isHomeTeam) {
      currentTeam = 'away';
      console.log(`[Scout Report] Parser: Detected away team context (${awayTeam}) in: "${line.substring(0, 60)}..."`);
    }
    
    // Skip lines that are just headers or don't have player info
    if (line.trim().length < 5) continue;
    
    // Try each pattern
    for (const pattern of patterns) {
      const match = line.match(pattern);
      if (match && currentTeam) {
        // Different patterns capture in different orders
        let playerName, status, position = '';
        
        if (pattern === patterns[2]) {
          // Pattern 3: status comes first
          status = match[1];
          playerName = match[2];
        } else if (pattern === patterns[4]) {
          // Pattern 5: "will not play" style - status is implicit "Out"
          playerName = match[1];
          status = 'Out';
        } else {
          // Most patterns: player name first
          playerName = match[1];
          position = match[2] || '';
          status = match[3] || match[2] || 'Out';
        }
        
        if (playerName) {
          addInjury(currentTeam, playerName, position, status, line);
          break; // Only use first matching pattern per line
        }
      }
    }
  }
  
  console.log(`[Scout Report] Parsed grounded injuries: Home=${injuries.home.length}, Away=${injuries.away.length}`);
  return injuries;
}

/**
 * Fetch injuries using Gemini Grounding
 * Uses Gemini 3 Flash with Google Search for real-time injury data
 */
async function fetchGroundingInjuries(homeTeam, awayTeam, sport) {
  try {
    const today = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

    // Sport-specific queries for Gemini Grounding
    let query;
    if (sport === 'NHL' || sport === 'icehockey_nhl') {
      query = `Current NHL injuries and starting goalies for ${homeTeam} vs ${awayTeam} as of ${today}:

1. INJURIES (OUT): List ALL players OUT, DAY-TO-DAY, or on LTIR for each team
   Format: "PLAYER NAME (POSITION) - STATUS - INJURY - DURATION"
   Duration: RECENT (1-2 weeks) or SEASON-LONG

2. PLAYERS RETURNING FROM INJURY: Any players coming BACK from injury tonight?
   - Include how many games they missed
   - Top-6 forward or top-4 D returning is significant

3. STARTING GOALIES: Confirmed starters for tonight with save % this season

4. TOP LINE COMBINATIONS: 1st line forwards for each team

${homeTeam} injuries:
${awayTeam} injuries:`;

    } else if (sport === 'NCAAB' || sport === 'basketball_ncaab') {
      query = `For the college basketball game ${awayTeam} @ ${homeTeam} on ${today} (Current ${getCurrentSeasonString()} Season):

1. INJURIES & ROSTER UPDATES - CRITICAL:
   - List ALL players OUT, QUESTIONABLE, or DOUBTFUL for each team.
   - Include player name, position, and impact (e.g., "Starting PG", "Leading Rebounder").
   - Mark if RECENT (last 2 weeks) or SEASON-LONG.
   - Any transfer portal impacts or recent suspensions?
   
2. STARTING 5: Expected starters for both teams.

3. ADVANCED ANALYTICS (KenPom/NET):
   - What are the current KenPom rankings and Adjusted Efficiency Margins (AdjEM) for both teams?
   - What are the current NCAA NET rankings?
   - What are their records in Quad 1 and Quad 2 games?
   - Strength of Schedule (SOS) rankings?

4. TEAM IDENTITY & TRENDS:
   - Pace/Tempo: Does one team prefer a fast-paced game vs a slow grind?
   - Shooting: How do they rank in 3PT% and defensive 3PT%?
   - Home Court: Is ${homeTeam} particularly dominant at home?

5. GAME CONTEXT:
   - Conference opener or mid-season clash?
   - Tournament implications?

Be factual. Format injuries clearly. NO betting predictions.

🚫 CRITICAL ANTI-OPINION RULES:
1. FACTS ONLY - Do NOT include betting predictions from articles
2. NO OPINIONS - Extract FACTS only, ignore betting advice
3. YOUR OWN WORDS - Synthesize facts, do NOT plagiarize
4. NO BETTING ADVICE - Gary makes his own picks`;
    } else if (sport === 'NFL' || sport === 'americanfootball_nfl') {
    } else if (sport === 'NCAAF' || sport === 'americanfootball_ncaaf') {
      query = `For the college football game ${awayTeam} @ ${homeTeam} on ${today} (2025-26 Bowl Season):

1. INJURIES & ROSTER ATTRITION - CRITICAL:
   - List ALL players OUT, DOUBTFUL, or QUESTIONABLE for each team.
   - Include player name, position, and impact (e.g., "Starting LT", "Leading Tackler").
   - ⚠️ MUST IDENTIFY: NFL Draft Opt-outs, Transfer Portal entries, and Academically Ineligible players.
   - For bowl games, distinguish between "Regular Season Starters" and "Bowl Game Starters".

2. QB SITUATION: 
   - Who is the confirmed starting QB for each team? 
   - If the regular starter is out (portal/opt-out), describe the backup's experience and style.
   - Any QB controversies or split-snap situations?

3. COACHING & MOTIVATION:
   - Are there any coaching changes? (Head Coach, OC, or DC leaving for other jobs/fired).
   - Who is calling the plays for the bowl game?
   - Motivation context: Is one team "happy to be there" vs. "disappointed to miss the playoff"? 
   - Is this a "home" bowl for one team?

4. WEATHER & VENUE:
   - Current weather forecast for kickoff (Temp, Rain/Snow, Wind Speed).
   - Is the game in a dome or outdoors?

5. ADVANCED ANALYTICS (if found):
   - Current FPI (Football Power Index) or S&P+ rankings for both teams.
   - Strength of Schedule (SOS) and recent margin of victory/loss.

Be factual and concise. Format injuries clearly. NO betting predictions.

🚫 CRITICAL ANTI-OPINION RULES:
1. FACTS ONLY - Do NOT include betting predictions from articles.
2. NO OPINIONS - Extract FACTS only, ignore betting advice.
3. YOUR OWN WORDS - Synthesize facts, do NOT plagiarize.
4. NO BETTING ADVICE - Gary makes his own picks.`;
    } else {
      query = `Current injuries for ${sport} game ${awayTeam} vs ${homeTeam} as of ${today}. 
      
1. PLAYERS OUT: List all players OUT, DOUBTFUL, or QUESTIONABLE with their status and injury type.
2. PLAYERS RETURNING: List any players who are RETURNING from injury for this game - this is equally important!`;
    }
    
    console.log(`[Scout Report] Using Gemini Grounding for injury data: ${homeTeam} vs ${awayTeam}`);
    
    const response = await geminiGroundingSearch(query, { temperature: 0.1, maxTokens: 1200 });
    
    if (!response?.success || !response?.data) {
      console.log('[Scout Report] Gemini Grounding returned no injury data');
      return { home: [], away: [], groundingRaw: null };
    }
    
    // Parse the grounding response to extract injuries
    const parsed = parseGroundingInjuries(response.data, homeTeam, awayTeam, sport);
    parsed.groundingRaw = response.data; // Keep raw for display
    
    console.log(`[Scout Report] Grounding injuries: ${parsed.home.length} for ${homeTeam}, ${parsed.away.length} for ${awayTeam}`);
    
    return parsed;
    
  } catch (error) {
    console.warn(`[Scout Report] Grounding injury check failed:`, error.message);
    return { home: [], away: [], groundingRaw: null };
  }
}

/**
 * Parse Gemini Grounding response to extract injury information
 */
function parseGroundingInjuries(content, homeTeam, awayTeam, sport = '') {
  const injuries = { home: [], away: [] };
  const foundPlayers = new Set(); // Prevent duplicates
  
  // Normalize status to standard format
  const normalizeStatus = (status) => {
    const s = status.toLowerCase().trim();
    if (s.includes('ltir') || s.includes('long-term') || s.includes('long term')) return 'LTIR';
    if (s === 'ir' || s.includes('injured reserve')) return 'IR';
    if (s.includes('out') || s.includes('ruled out')) return 'Out';
    if (s.includes('doubtful')) return 'Doubtful';
    if (s.includes('questionable') || s.includes('gtd') || s.includes('game-time') || s.includes('day-to-day')) return 'Questionable';
    return 'Out'; // Default to Out for unknown statuses
  };
  
  // Extract duration context from injury text
  const extractDuration = (text) => {
    const t = text.toLowerCase();
    // SEASON-LONG indicators - team stats already reflect their absence
    if (t.includes('season-long') || t.includes('all season') || t.includes('since week 1') || 
        t.includes('since week 2') || t.includes('since week 3') || t.includes('most of the season') ||
        t.includes('out for the year') || t.includes('out all year') ||
        t.includes('indefinitely') || t.includes('no timetable') || t.includes('no return') ||
        t.includes('season-ending') || t.includes('out for season') ||
        t.includes('won\'t return') || t.includes('will not return') ||
        t.includes('since october') || t.includes('since november') || t.includes('since the start')) {
      return { duration: 'SEASON-LONG', isEdge: false, note: '' };
    }
    if (t.includes('mid-season') || t.includes('since week 4') || t.includes('since week 5') ||
        t.includes('since week 6') || t.includes('since week 7') || t.includes('since week 8') ||
        t.includes('since week 9') || t.includes('since week 10') || t.includes('since week 11') ||
        t.includes('several weeks') || t.includes('multiple weeks') || t.includes('month') ||
        t.includes('extended') || t.includes('prolonged')) {
      return { duration: 'MID-SEASON', isEdge: false, note: '' };
    }
    if (t.includes('recent') || t.includes('last week') || t.includes('this week') || 
        t.includes('just') || t.includes('new') || t.includes('since week 14') || 
        t.includes('since week 15') || t.includes('since week 16') ||
        t.includes('day-to-day') || t.includes('game-time')) {
      return { duration: 'RECENT', isEdge: true, note: '' };
    }
    // Default: check if IR (usually long-term)
    return { duration: 'UNKNOWN', isEdge: null, note: '' };
  };
  
  // Split content into sections by team (rough heuristic)
  const homeSection = extractTeamSection(content, homeTeam);
  const awaySection = extractTeamSection(content, awayTeam);
  
  // Extract injuries from each section with multiple pattern types
  const extractFromSection = (section, team) => {
    const found = [];
    
    // Patterns to match various injury formats
    const patterns = [
      // "Player Name - OUT - injury type" or "Player Name - IR - upper body"
      /([A-Z][a-z]+(?:\s+[A-Z][a-z']+)+)\s*[-–:]\s*(OUT|Out|IR|LTIR|Doubtful|Questionable|GTD|Day-to-Day)/gi,
      // "OUT: Player Name" or "IR: Player Name"
      /(OUT|IR|LTIR|Doubtful|Questionable|GTD)\s*[-–:]\s*([A-Z][a-z]+(?:\s+[A-Z][a-z']+)+)/gi,
      // "Player Name (OUT)" or "Player Name (IR)"
      /([A-Z][a-z]+(?:\s+[A-Z][a-z']+)+)\s*\((OUT|Out|IR|LTIR|Doubtful|Questionable|GTD|Day-to-Day|injured reserve)\)/gi,
      // "Player Name is out" or "Player Name remains out"  
      /([A-Z][a-z]+(?:\s+[A-Z][a-z']+)+)\s+(?:is|remains|was|has been)\s+(out|on IR|on LTIR|doubtful|questionable)/gi,
      // Bullet point format: "• Player Name - Status"
      /[•\-\*]\s*([A-Z][a-z]+(?:\s+[A-Z][a-z']+)+)\s*[-–:]\s*(OUT|Out|IR|LTIR|Doubtful|Questionable|GTD)/gi,
      // NHL specific: "Player Name (upper body)" implies IR/Out
      /([A-Z][a-z]+(?:\s+[A-Z][a-z']+)+)\s*\((upper body|lower body|illness|undisclosed)\)/gi
    ];
    
    for (const pattern of patterns) {
      let match;
      pattern.lastIndex = 0; // Reset regex state
      
      while ((match = pattern.exec(section)) !== null) {
        let playerName, status;
        
        // Handle different capture group orders
        if (match[1] && /^(OUT|IR|LTIR|Doubtful|Questionable|GTD)$/i.test(match[1])) {
          // Status first, then name
          status = match[1];
          playerName = match[2];
        } else {
          // Name first, then status
          playerName = match[1];
          status = match[2] || 'Out';
        }
        
        // Clean up player name
        playerName = playerName?.trim();
        if (!playerName || playerName.length < 3) continue;
        
        // Skip common false positives
        const skipWords = ['injuries', 'injury', 'team', 'roster', 'report', 'status', 'update'];
        if (skipWords.some(w => playerName.toLowerCase().includes(w))) continue;
        
        // Prevent duplicates
        const playerKey = playerName.toLowerCase();
        if (foundPlayers.has(playerKey)) continue;
        foundPlayers.add(playerKey);
        
        const nameParts = playerName.split(' ');
        // Get surrounding context to extract duration
        const matchStart = Math.max(0, match.index - 50);
        const matchEnd = Math.min(section.length, match.index + match[0].length + 100);
        const contextText = section.substring(matchStart, matchEnd);
        const durationInfo = extractDuration(contextText);
        
        // IR status usually means long-term unless marked recent
        const normalizedStatus = normalizeStatus(status);
        if ((normalizedStatus === 'IR' || normalizedStatus === 'LTIR') && durationInfo.duration === 'UNKNOWN') {
          durationInfo.duration = 'SEASON-LONG';
          durationInfo.isEdge = false;
          durationInfo.note = 'IR = typically season-long, team adjusted';
        }
        
        found.push({
          player: { 
            first_name: nameParts[0], 
            last_name: nameParts.slice(1).join(' '), 
            position: '' 
          },
          status: normalizedStatus,
          injuryType: status.toLowerCase().includes('body') || status.toLowerCase().includes('illness') ? status : '',
          duration: durationInfo.duration,
          isEdge: durationInfo.isEdge,
          durationNote: durationInfo.note,
          source: 'gemini_grounding'
        });
      }
    }
    
    return found;
  };
  
  injuries.home = extractFromSection(homeSection, homeTeam);
  injuries.away = extractFromSection(awaySection, awayTeam);
  
  // If we still have no injuries, try a more aggressive whole-content search
  if (injuries.home.length === 0 && injuries.away.length === 0) {
    console.log('[Scout Report] No injuries found with section parsing, trying whole-content search');
    
    // Try to find ANY player-status pairs in the whole content
    const wholeContentPatterns = [
      /([A-Z][a-z]+\s+[A-Z][a-z']+(?:\s+[A-Z][a-z']+)?)\s*[-–:]\s*(OUT|IR|LTIR)/gi,
      /([A-Z][a-z]+\s+[A-Z][a-z']+)\s+(?:is|remains)\s+(out|on IR)/gi
    ];
    
    for (const pattern of wholeContentPatterns) {
      let match;
      pattern.lastIndex = 0;
      
      while ((match = pattern.exec(content)) !== null) {
        const playerName = match[1]?.trim();
        const status = match[2];
        
        if (!playerName || playerName.length < 3) continue;
        const playerKey = playerName.toLowerCase();
        if (foundPlayers.has(playerKey)) continue;
        foundPlayers.add(playerKey);
        
        // Try to determine which team based on context
        const contextStart = Math.max(0, match.index - 100);
        const context = content.substring(contextStart, match.index + match[0].length + 50).toLowerCase();
        
        const nameParts = playerName.split(' ');
        const injury = {
          player: { first_name: nameParts[0], last_name: nameParts.slice(1).join(' '), position: '' },
          status: normalizeStatus(status),
          source: 'gemini_grounding'
        };
        
        if (context.includes(homeTeam.toLowerCase()) || context.includes(homeTeam.split(' ').pop().toLowerCase())) {
          injuries.home.push(injury);
        } else if (context.includes(awayTeam.toLowerCase()) || context.includes(awayTeam.split(' ').pop().toLowerCase())) {
          injuries.away.push(injury);
        }
      }
    }
  }
  
  return injuries;
}

/**
 * Extract section of text related to a team
 */
function extractTeamSection(content, teamName) {
  // Try to find the team name and extract surrounding context
  const teamLower = teamName.toLowerCase();
  const idx = content.toLowerCase().indexOf(teamLower);
  if (idx === -1) return content; // Return full content if team not found
  
  // Get 500 chars after team mention
  return content.substring(Math.max(0, idx - 50), idx + 500);
}

/**
 * Validate that a player is actually on the specified team by searching BDL
 * This catches Gemini hallucinations (e.g., waived players like Damian Lillard)
 * @param {string} playerName - Full player name
 * @param {string} teamName - Expected team name
 * @returns {Promise<boolean>} - True if player is on the team, false otherwise
 */
async function validatePlayerOnTeam(playerName, teamName) {
  try {
    // Search by last name for better matching
    const lastName = playerName.split(' ').pop();
    const searchResults = await ballDontLieService.getPlayersGeneric({
      search: lastName,
      per_page: 10
    });
    
    if (!searchResults || searchResults.length === 0) return true; // Can't verify, allow it
    
    // Find exact match
    const lowerName = playerName.toLowerCase();
    const player = searchResults.find(p => 
      `${p.first_name} ${p.last_name}`.toLowerCase() === lowerName
    );
    
    if (!player) return true; // Can't find player, allow it
    
    // Check if player's current team matches
    const playerTeam = player.team?.full_name?.toLowerCase() || '';
    const expectedTeam = teamName.toLowerCase();
    
    // Check for team name match (partial matching for variations like "Los Angeles Lakers" vs "Lakers")
    const isOnTeam = playerTeam.includes(expectedTeam) || 
                     expectedTeam.includes(playerTeam) ||
                     playerTeam.split(' ').pop() === expectedTeam.split(' ').pop(); // Match mascot
    
    if (!isOnTeam) {
      console.log(`[Scout Report] ⚠️ BDL says ${playerName} is on ${player.team?.full_name || 'Unknown'}, NOT ${teamName}`);
    }
    
    return isOnTeam;
  } catch (e) {
    console.warn(`[Scout Report] Could not validate ${playerName} team: ${e.message}`);
    return true; // Error - allow it to be safe
  }
}

/**
 * Merge BDL and Grounding injuries - Grounding takes priority for status updates
 * (Gemini Grounding is real-time, BDL can be stale)
 * Also validates that players are assigned to the correct team
 */
async function mergeInjuries(bdlInjuries, groundingInjuries, homeTeamName, awayTeamName) {
  // Build a set of ALL player names from both teams' BDL data for cross-validation
  const allBdlHomeNames = new Set((bdlInjuries.home || []).map(i => 
    `${i.player?.first_name} ${i.player?.last_name}`.toLowerCase().trim()
  ));
  const allBdlAwayNames = new Set((bdlInjuries.away || []).map(i => 
    `${i.player?.first_name} ${i.player?.last_name}`.toLowerCase().trim()
  ));
  
  const mergeTeam = async (bdl, perp, isHome) => {
    // Create a map of BDL injuries by player name for easy lookup
    const bdlMap = new Map();
    bdl.forEach(i => {
      const name = `${i.player?.first_name} ${i.player?.last_name}`.toLowerCase();
      bdlMap.set(name, i);
    });

    // Start with BDL injuries, but let Grounding override statuses
    const merged = bdl.map(bdlInjury => {
      const name = `${bdlInjury.player?.first_name} ${bdlInjury.player?.last_name}`.toLowerCase();
      
      // Check if Grounding has different status for this player
      const perpMatch = perp.find(p => 
        `${p.player?.first_name} ${p.player?.last_name}`.toLowerCase() === name
      );
      
      if (perpMatch && perpMatch.status !== bdlInjury.status) {
        console.log(`[Scout Report] Grounding override: ${name} - ${bdlInjury.status} → ${perpMatch.status} (Grounding is more current)`);
        return { ...bdlInjury, status: perpMatch.status, source: 'grounding_override' };
      }
      
      return bdlInjury;
    });

    // Add Grounding-only injuries that aren't in BDL
    const existingNames = new Set(bdl.map(i =>
      `${i.player?.first_name} ${i.player?.last_name}`.toLowerCase()
    ));
    
    // Get the OTHER team's BDL names to check for misassignment
    const otherTeamBdlNames = isHome ? allBdlAwayNames : allBdlHomeNames;
    
    // Track which Gemini injuries need validation
    const teamName = isHome ? homeTeamName : awayTeamName;
    const geminiInjuriesToValidate = [];

    for (const injury of perp) {
      const name = `${injury.player?.first_name} ${injury.player?.last_name}`.toLowerCase().trim();
      
      // Skip if already exists in this team's list
      if (existingNames.has(name)) continue;
      
      // CRITICAL: Check if this player is actually on the OTHER team's roster
      // This catches cases where Gemini assigns a player to the wrong team
      if (otherTeamBdlNames.has(name)) {
        console.log(`[Scout Report] ⚠️ Skipping ${name} - assigned to wrong team by Gemini (belongs to opponent)`);
        continue;
      }
      
      // Queue for validation against BDL player search
      geminiInjuriesToValidate.push({ injury, name, teamName });
    }
    
    // Validate Gemini injuries against BDL player search (in parallel)
    const validationResults = await Promise.all(
      geminiInjuriesToValidate.map(async ({ injury, name, teamName }) => {
        const fullName = `${injury.player?.first_name} ${injury.player?.last_name}`.trim();
        const isValid = await validatePlayerOnTeam(fullName, teamName);
        if (!isValid) {
          console.log(`[Scout Report] ⚠️ Skipping ${name} - Gemini hallucination: player NOT on ${teamName}`);
        } else {
          console.log(`[Scout Report] ✓ Validated & added Gemini injury: ${name} (${injury.status})`);
        }
        return { injury, isValid };
      })
    );
    
    // Add validated injuries
    for (const { injury, isValid } of validationResults) {
      if (isValid) {
        merged.push(injury);
      }
    }

    return merged;
  };
  
  // Process both teams in parallel
  const [home, away] = await Promise.all([
    mergeTeam(bdlInjuries.home || [], groundingInjuries.home || [], true),
    mergeTeam(bdlInjuries.away || [], groundingInjuries.away || [], false)
  ]);
  
  return {
    home,
    away,
    groundingRaw: groundingInjuries.groundingRaw
  };
}

/**
 * Format comprehensive injury report - this goes at the TOP of the scout report
 * Now includes duration context to distinguish RECENT vs MID-SEASON vs SEASON-LONG
 */
function formatInjuryReport(homeTeam, awayTeam, injuries) {
  const lines = [];
  
  // Categorize injuries by importance/duration
  const categorize = (teamInjuries) => {
    const critical = teamInjuries.filter(i => (i.duration === 'RECENT' || i.isEdge === true) && i.status !== 'Out');
    const out = teamInjuries.filter(i => i.status === 'Out' || i.status === 'IR' || i.status === 'LTIR' || i.status === 'Injured Reserve');
    const seasonal = teamInjuries.filter(i => i.duration === 'SEASON-LONG' && i.status !== 'Out' && i.status !== 'IR');
    const others = teamInjuries.filter(i => 
      !critical.includes(i) && !out.includes(i) && !seasonal.includes(i)
    );
    return { critical, out, seasonal, others };
  };

  const homeCats = categorize(injuries.home || []);
  const awayCats = categorize(injuries.away || []);
  
  const formatPlayer = (i) => {
    const name = `${i.player?.first_name || i.firstName || ''} ${i.player?.last_name || i.lastName || ''}`.trim() || i.name || 'Unknown';
    const pos = i.player?.position_abbreviation || i.player?.position || i.position || '';
    const reason = i.description || i.comment || i.injury || '';
    const shortReason = reason ? ` - ${reason.split('.')[0].substring(0, 60)}` : '';
    
    // Build duration tag with actual days/weeks for clarity
    let durationTag = '';
    const days = i.daysSinceReport;
    const daysText = days !== null && days !== undefined ? ` (${days}d ago)` : '';
    
    if (i.duration === 'SEASON-LONG' || i.status === 'Injured Reserve' || i.status === 'IR' || i.status === 'LTIR') {
      durationTag = ` [SEASON-LONG${daysText} - team stats already reflect absence]`;
    } else if (i.duration === 'MID-SEASON') {
      durationTag = ` [MID-SEASON${daysText}]`;
    } else if (i.duration === 'RECENT' || i.isEdge === true) {
      durationTag = ` [RECENT${daysText}]`;
    } else if (i.duration === 'UNKNOWN') {
      durationTag = ` [UNKNOWN DURATION]`;
    }
    
    if (!durationTag && (i.status === 'IR' || i.status === 'Injured Reserve' || i.status === 'LTIR' || 
        (i.description && i.description.toLowerCase().includes('injured reserve')))) {
      durationTag = ' [IR - SEASON-LONG - team stats already reflect absence]';
    }
    
    return `  • ${name}${pos ? ` (${pos})` : ''} (${i.status || 'Unknown'})${shortReason}${durationTag}`;
  };
  
  const renderTeam = (teamName, cats, emoji) => {
    lines.push(`${emoji} ${teamName}:`);
    
    if (cats.critical.length > 0) {
      lines.push(`  🚨 RECENT/CRITICAL:`);
      cats.critical.forEach(i => lines.push(formatPlayer(i)));
    }
    
    if (cats.out.length > 0) {
      lines.push(`  ❌ OUT / IR:`);
      cats.out.forEach(i => lines.push(formatPlayer(i)));
  }
    
    if (cats.others.length > 0) {
      lines.push(`  ⚠️ OTHER (Doubtful/Questionable):`);
      cats.others.forEach(i => lines.push(formatPlayer(i)));
  }

    if (cats.seasonal.length > 0) {
      lines.push(`  ℹ️ SEASON-LONG (team stats already reflect absence):`);
      cats.seasonal.forEach(i => lines.push(formatPlayer(i)));
  }

    if (!cats.critical.length && !cats.out.length && !cats.others.length && !cats.seasonal.length) {
    lines.push(`  ✅ No significant injuries reported`);
  }
    lines.push('');
  };

  renderTeam(homeTeam, homeCats, '🏠');
  renderTeam(awayTeam, awayCats, '✈️');
  
  return lines.join('\n');
}

/**
 * Format situational factors with sport-specific nuances
 */
function formatSituationalFactors(game, injuries, sport) {
  const factors = [];
  const sportKey = normalizeSport(sport);
  
  // Injuries
  const homeInjuries = injuries.home?.filter(i => ['Out', 'Doubtful', 'Questionable'].includes(i.status));
  const awayInjuries = injuries.away?.filter(i => ['Out', 'Doubtful', 'Questionable'].includes(i.status));
  
  if (homeInjuries?.length > 0) {
    const injuryList = homeInjuries.slice(0, 3).map(i => {
      let tag = '';
      if (i.duration === 'SEASON-LONG' || i.status === 'IR' || i.status === 'LTIR') {
        tag = ' [SEASON-LONG]';
      } else if (i.duration === 'RECENT' || i.isEdge) {
        tag = ' [RECENT]';
      }
      return `${i.player?.first_name} ${i.player?.last_name}: ${i.status}${tag}`;
    }).join(', ');
    factors.push(`• ${game.home_team} Injuries: ${injuryList}`);
  }
  
  if (awayInjuries?.length > 0) {
    const injuryList = awayInjuries.slice(0, 3).map(i => {
      let tag = '';
      if (i.duration === 'SEASON-LONG' || i.status === 'IR' || i.status === 'LTIR') {
        tag = ' [SEASON-LONG]';
      } else if (i.duration === 'RECENT' || i.isEdge) {
        tag = ' [RECENT]';
      }
      return `${i.player?.first_name} ${i.player?.last_name}: ${i.status}${tag}`;
    }).join(', ');
    factors.push(`• ${game.away_team} Injuries: ${injuryList}`);
  }
  
  // Rest situation (if available)
  if (game.home_rest_days !== undefined) {
    factors.push(`• Rest: ${game.home_team} (${game.home_rest_days} days) vs ${game.away_team} (${game.away_rest_days} days)`);
  }
  
  // Week info for NFL/NCAAF
  if (game.week && (sport === 'NFL' || sport === 'NCAAF' || sportKey === 'americanfootball_nfl' || sportKey === 'americanfootball_ncaaf')) {
    // Calculate dynamic season fallback: NFL/NCAAF Aug-Feb spans years
    const fallbackSeason = (() => {
      const month = new Date().getMonth() + 1;
      const year = new Date().getFullYear();
      return month <= 7 ? year - 1 : year;
    })();
    factors.push(`• Week ${game.week} of the ${game.season || fallbackSeason} season`);
  }
  
  // Venue
  if (game.venue) {
    factors.push(`• Venue: ${game.venue}`);
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // SPORT-SPECIFIC SHARP FACTORS
  // ═══════════════════════════════════════════════════════════════════════════
  
  // NCAAF: CFP & Rematch factors
  if (sportKey === 'americanfootball_ncaaf') {
    factors.push('');
    factors.push('🏈 NCAAF SHARP NOTES:');
    factors.push('• QB STATUS IS CRITICAL: If starting QB is OUT/DOUBTFUL, the game is essentially unpredictable');
    
    // CFP-specific context (Dec-Jan games)
    const currentMonth = new Date().getMonth(); // 0-indexed
    const isCFPSeason = currentMonth === 11 || currentMonth === 0; // Dec or Jan
    if (isCFPSeason) {
      factors.push('');
      factors.push('🏆 CFP PLAYOFF CONTEXT (12-TEAM ERA):');
      factors.push('• FIRST ROUND (Seeds 5-12): On-campus game at higher seed - consider home field impact');
      factors.push('• RANKED vs RANKED: High-stakes games often become conservative, grinding affairs');
      factors.push('• REMATCH AWARENESS: If teams played earlier, investigate what adjustments the losing team might make');
      factors.push('• REST vs MOMENTUM: Bye teams are rested but may lack game rhythm - weigh both factors');
      factors.push('• COACHING SITUATION: Check if any coach has accepted another job (potential distraction)');
      factors.push('• G5 IN CFP: Consider talent gap vs competitive margins');
    } else {
      factors.push('• REMATCH AWARENESS: If teams played earlier this season, investigate how the first game went and what adjustments are likely');
    }
    
    factors.push('• PORTAL DEPTH: Teams with strong transfer portal classes hold up better in 4th quarter');
  }
  
  // NHL: Goalie & fatigue factors
  if (sportKey === 'icehockey_nhl') {
    factors.push('');
    factors.push('🏒 NHL SHARP NOTES:');
    factors.push('• GOALIE TANDEM ERA: Check if starter or backup is playing - backup goalie with sub-.900 SV% significantly changes the game');
    factors.push('• BACK-TO-BACK: Check how each team performs on second game of B2B - impact varies by team and travel');
    factors.push('• HIGH-DANGER CHANCES (HDC): Teams creating lots of HDC will eventually convert - process matters more than short-term results');
    factors.push('• GSAx (Goals Saved Above Expected): Better indicator than raw save percentage');
    
    // Check for goalie injuries
    const goalieInjuries = [...(homeInjuries || []), ...(awayInjuries || [])].filter(i => 
      i.player?.position?.toLowerCase() === 'g' || i.player?.position?.toLowerCase() === 'goalie'
    );
    if (goalieInjuries.length > 0) {
      factors.push(`• ⚠️ GOALIE ALERT: ${goalieInjuries.map(i => `${i.player?.last_name} (${i.status})`).join(', ')}`);
    }
  }
  
  // NCAAB: Efficiency & luck factors
  if (sportKey === 'basketball_ncaab') {
    factors.push('');
    factors.push('🏀 NCAAB CONTEXT NOTES:');
    factors.push('• KENPOM EFFICIENCY: Consider both offensive and defensive efficiency when evaluating teams');
    factors.push('• RECORD vs METRICS: Teams with great records but mediocre Net Rating may be winning close games - investigate sustainability');
    factors.push('• HIGH-STAKES MATCHUPS: Top 25 vs Top 25 games often become conservative, grinding affairs');
    factors.push('• ALTITUDE FACTOR: Games in Denver/Salt Lake can affect sea-level teams - consider adjustment period');
    factors.push('• FATIGUE CONTEXT: Check recent schedule intensity (back-to-backs, overtime games)');
    factors.push('• TRANSFER ADJUSTMENT: Transfer-heavy rosters may take time to gel - check when they hit their stride');
    factors.push('• RANKING CHANGES: Teams recently dropped from rankings may have extra motivation');
    factors.push('• FREE THROW RATE (FTR): Underdogs with high FTR win close games - upset potential');
  }
  
  // NFL: Rest & EPA factors
  if (sportKey === 'americanfootball_nfl') {
    factors.push('');
    factors.push('🏈 NFL SHARP NOTES:');
    factors.push('• REST DISPARITY: Significant rest advantages can matter - investigate how each team performs with extra rest');
    factors.push('• EPA vs RECORD: Teams with high EPA but bad record may have been unlucky - investigate why performance differs from results');
    factors.push('• 4TH QUARTER DEPTH: Teams with shallow benches often see performance drop in late game situations');
    factors.push('• WIND >15 MPH: High wind affects passing games significantly - consider the impact');
  }
  
  if (factors.length === 0) {
    factors.push('• No significant situational factors identified');
  }
  
  return factors.join('\n');
}

/**
 * Format odds for display
 */
function formatOdds(game) {
  const lines = [];
  
  // Spread
  let spreadValue = null;
  let spreadOdds = -110;
  if (game.spread_home !== undefined && game.spread_home !== null) {
    const homeSpread = parseFloat(game.spread_home);
    const awaySpread = -homeSpread;
    spreadValue = homeSpread;
    spreadOdds = game.spread_home_odds || game.spread_odds || -110;
    lines.push(`Spread: ${game.away_team} ${awaySpread > 0 ? '+' : ''}${awaySpread.toFixed(1)} | ${game.home_team} ${homeSpread > 0 ? '+' : ''}${homeSpread.toFixed(1)} (${spreadOdds})`);
  } else if (game.spreads) {
    lines.push(`Spread: ${game.spreads}`);
  } else {
    lines.push('Spread: Not available');
  }
  
  // Moneyline
  let mlHome = null;
  let mlAway = null;
  if (game.moneyline_home !== undefined && game.moneyline_away !== undefined) {
    mlHome = game.moneyline_home;
    mlAway = game.moneyline_away;
    lines.push(`Moneyline: ${game.away_team} ${formatMoneyline(mlAway)} | ${game.home_team} ${formatMoneyline(mlHome)}`);
  } else if (game.h2h) {
    lines.push(`Moneyline: ${game.h2h}`);
  }
  
  // Total
  let totalValue = null;
  if (game.total !== undefined && game.total !== null) {
    totalValue = parseFloat(game.total);
    lines.push(`Total: O/U ${totalValue}`);
  } else if (game.totals) {
    lines.push(`Total: ${game.totals}`);
  }
  
  // Add raw values for Gary to include in JSON output
  lines.push('');
  lines.push('📊 RAW ODDS VALUES (copy these to your JSON output):');
  lines.push(`  spread: ${spreadValue !== null ? spreadValue : 'null'}`);
  lines.push(`  spreadOdds: ${spreadOdds}`);
  lines.push(`  moneylineHome: ${mlHome !== null ? mlHome : 'null'}`);
  lines.push(`  moneylineAway: ${mlAway !== null ? mlAway : 'null'}`);
  lines.push(`  total: ${totalValue !== null ? totalValue : 'null'}`);
  
  return lines.join('\n') || 'Odds not available';
}

/**
 * Format moneyline number
 */
function formatMoneyline(ml) {
  const num = parseFloat(ml);
  return num > 0 ? `+${num}` : num.toString();
}

/**
 * Convert sport to BDL API key
 */
function sportToBdlKey(sport) {
  const mapping = {
    'NBA': 'basketball_nba',
    'NFL': 'americanfootball_nfl',
    'NCAAB': 'basketball_ncaab',
    'NCAAF': 'americanfootball_ncaaf',
    'NHL': 'icehockey_nhl',
    'EPL': 'soccer_epl',
    'basketball_nba': 'basketball_nba',
    'americanfootball_nfl': 'americanfootball_nfl',
    'basketball_ncaab': 'basketball_ncaab',
    'americanfootball_ncaaf': 'americanfootball_ncaaf',
    'icehockey_nhl': 'icehockey_nhl',
    'soccer_epl': 'soccer_epl'
  };
  return mapping[sport] || null;
}

/**
 * Find team by name in teams array
 * Prioritizes exact matches to avoid USC Trojans vs Troy Trojans confusion
 */
function findTeam(teams, teamName) {
  if (!teams || !teamName) return null;

  // Team name aliases - The Odds API uses different names than BDL
  const TEAM_ALIASES = {
    'los angeles clippers': 'la clippers',  // BDL uses "LA Clippers"
    'la clippers': 'la clippers',
    'vegas golden knights': 'vegas',
    'montreal canadiens': 'montréal canadiens',
    'montréal canadiens': 'montréal canadiens',
    'utah hockey club': 'utah',
    'utah mammoth': 'utah',
    // Add more as needed
  };

  let normalized = teamName.toLowerCase().trim();
  
  // Apply alias if exists
  if (TEAM_ALIASES[normalized]) {
    normalized = TEAM_ALIASES[normalized];
  }
  
  // 1. Exact full_name match (highest priority)
  let match = teams.find(t => t.full_name?.toLowerCase() === normalized);
  if (match) return match;
  
  // 2. Exact college + mascot match (e.g., "Troy" college + "Trojans" mascot)
  const parts = normalized.split(/\s+/);
  if (parts.length >= 2) {
    match = teams.find(t => {
      const college = t.college?.toLowerCase() || '';
      const mascot = t.name?.toLowerCase() || '';
      // Both college and mascot must match parts of the search
      return parts.some(p => college.includes(p)) && parts.some(p => mascot.includes(p));
    });
    if (match) return match;
  }
  
  // 3. full_name contains entire search term
  match = teams.find(t => t.full_name?.toLowerCase().includes(normalized));
  if (match) return match;
  
  // 4. Search term contains entire full_name
  match = teams.find(t => normalized.includes(t.full_name?.toLowerCase()));
  if (match) return match;
  
  // 5. Abbreviation match
  match = teams.find(t => t.abbreviation?.toLowerCase() === normalized);
  if (match) return match;
  
  // 6. Mascot-only match (last resort for cases like "Clippers" matching "LA Clippers")
  const lastWord = parts[parts.length - 1];
  match = teams.find(t => t.name?.toLowerCase() === lastWord);
  if (match) return match;
  
  return null;
}

/**
 * Calculate record from season stats
 */
function calculateRecord(stats) {
  if (!stats) return 'N/A';
  if (stats.wins !== undefined && stats.losses !== undefined) {
    return `${stats.wins}-${stats.losses}`;
  }
  return 'N/A';
}

/**
 * Format streak
 */
function formatStreak(standing) {
  if (!standing) return 'N/A';
  if (standing.win_streak && standing.win_streak > 0) {
    return `W${standing.win_streak}`;
  }
  if (standing.loss_streak && standing.loss_streak > 0) {
    return `L${standing.loss_streak}`;
  }
  return standing.streak || 'N/A';
}

/**
 * Fetch stats for a specific QB by name from BDL
 * This is called AFTER we know who the starting QB is (from Gemini Grounding)
 */
async function fetchQBStatsByName(qbName, teamName) {
  try {
    const bdlSport = 'americanfootball_nfl';
    const teams = await ballDontLieService.getTeams(bdlSport);
    const team = findTeam(teams, teamName);
    if (!team) {
      console.log(`[Scout Report] Could not find team ${teamName} for QB stats lookup`);
      return { name: qbName, team: teamName, passingYards: 0, passingTds: 0, gamesPlayed: 0 };
    }

    // Get API key and base URL
    const API_KEY = 
      (typeof process !== 'undefined' && process?.env?.BALLDONTLIE_API_KEY) ||
      (typeof process !== 'undefined' && process?.env?.VITE_BALLDONTLIE_API_KEY) ||
      (typeof process !== 'undefined' && process?.env?.NEXT_PUBLIC_BALLDONTLIE_API_KEY) ||
      (typeof import.meta !== 'undefined' && import.meta?.env?.VITE_BALLDONTLIE_API_KEY) ||
      '';
    const BALLDONTLIE_API_BASE_URL = 'https://api.balldontlie.io';

    // Calculate NFL season dynamically
    const nflMonth = new Date().getMonth() + 1;
    const nflYear = new Date().getFullYear();
    const nflSeason = nflMonth <= 7 ? nflYear - 1 : nflYear;
    
    // Fetch all player stats for the team
    const url = `${BALLDONTLIE_API_BASE_URL}/nfl/v1/season_stats?season=${nflSeason}&team_id=${team.id}&per_page=100`;
    const response = await axios.get(url, { headers: { 'Authorization': API_KEY } });
    const allStats = response.data?.data || [];
    
    // Find this specific QB by name (fuzzy match)
    const searchName = qbName.toLowerCase().trim();
    const searchParts = searchName.split(' ');
    
    const qbStats = allStats.filter(p => {
      const isQB = p.player?.position === 'Quarterback' || 
                   p.player?.position_abbreviation === 'QB' ||
                   p.player?.position?.toLowerCase() === 'qb';
      if (!isQB) return false;
      
      const firstName = (p.player?.first_name || '').toLowerCase();
      const lastName = (p.player?.last_name || '').toLowerCase();
      const fullName = `${firstName} ${lastName}`.trim();
      
      // Match by full name, or by last name if first name is initial
      if (fullName.includes(searchName) || searchName.includes(fullName)) return true;
      if (searchParts.length >= 2 && lastName === searchParts[searchParts.length - 1]) return true;
      
      return false;
    });

    if (qbStats.length === 0) {
      console.log(`[Scout Report] ⚠️ No BDL stats found for QB "${qbName}" on ${teamName} - may be new/backup`);
      // Return QB info without stats (they might be a new backup)
      return { 
        name: qbName, 
        team: teamName,
        teamAbbr: team.abbreviation,
        passingYards: 0, 
        passingTds: 0, 
        gamesPlayed: 0,
        isBackup: true,
        note: 'New/backup QB - limited season stats'
      };
    }

    const qb = qbStats[0];
    const gamesPlayed = qb.games_played || 0;
    const passingYards = qb.passing_yards || 0;
    
    // Flag rookie/inexperienced QB situations - this is CRITICAL betting context
    const isRookie = gamesPlayed <= 2;
    const isInexperienced = gamesPlayed <= 4;
    let experienceNote = null;
    
    if (gamesPlayed === 0) {
      experienceNote = '🚨 MAKING NFL DEBUT - No NFL game experience';
      console.log(`[Scout Report] 🚨 ${qbName} is making their NFL DEBUT (0 GP)`);
    } else if (gamesPlayed === 1) {
      experienceNote = `🚨 SECOND CAREER START - Only 1 NFL game (${passingYards} yds)`;
      console.log(`[Scout Report] 🚨 ${qbName} is making SECOND CAREER START (1 GP, ${passingYards} yds)`);
    } else if (isRookie) {
      experienceNote = `⚠️ ROOKIE QB - Only ${gamesPlayed} career starts`;
      console.log(`[Scout Report] ⚠️ ${qbName} is a ROOKIE QB (${gamesPlayed} GP)`);
    } else if (isInexperienced) {
      experienceNote = `Limited experience - ${gamesPlayed} career starts`;
      console.log(`[Scout Report] ${qbName} has LIMITED EXPERIENCE (${gamesPlayed} GP)`);
    } else {
      console.log(`[Scout Report] ✓ Found BDL stats for ${qbName}: ${passingYards} yds, ${qb.passing_touchdowns || 0} TDs, ${gamesPlayed} GP`);
    }
    
    return {
      id: qb.player?.id,
      firstName: qb.player?.first_name,
      lastName: qb.player?.last_name,
      name: `${qb.player?.first_name} ${qb.player?.last_name}`,
      position: qb.player?.position,
      team: qb.player?.team?.full_name || qb.player?.team?.name,
      teamAbbr: qb.player?.team?.abbreviation,
      jerseyNumber: qb.player?.jersey_number,
      passingYards: passingYards,
      passingTds: qb.passing_touchdowns || 0,
      passingInterceptions: qb.passing_interceptions || 0,
      passingCompletionPct: qb.passing_completion_pct,
      qbRating: qb.qbr || qb.qb_rating,
      gamesPlayed: gamesPlayed,
      isRookie: isRookie,
      isInexperienced: isInexperienced,
      experienceNote: experienceNote
    };
  } catch (error) {
    console.warn(`[Scout Report] Error fetching stats for QB "${qbName}": ${error.message}`);
    return { name: qbName, team: teamName, passingYards: 0, passingTds: 0, gamesPlayed: 0 };
  }
}

/**
 * Fetch starting QBs for both teams (NFL/NCAAF only)
 * 
 * APPROACH: Use BDL's Team Roster with Depth Chart (most reliable)
 * 1. Get roster with depth chart positions (depth=1 is starter)
 * 2. Check injury_status - if starter is out, use backup (depth=2)
 * 3. Then fetch season stats for the actual starter
 * 
 * This is more reliable than:
 * - Season stat leaders (returns inactive players like Joe Flacco)
 * - Fallback sources (can be wrong/outdated)
 */
async function fetchStartingQBs(homeTeam, awayTeam, sport, injuries = null) {
  try {
    const bdlSport = sportToBdlKey(sport);
    if (!bdlSport || (bdlSport !== 'americanfootball_nfl' && bdlSport !== 'americanfootball_ncaaf')) {
      return null;
    }
    
    const sportLabel = bdlSport === 'americanfootball_ncaaf' ? 'NCAAF' : 'NFL';
    const isNCAAF = bdlSport === 'americanfootball_ncaaf';
    
    // Get team IDs
    const teams = await ballDontLieService.getTeams(bdlSport);
    const homeTeamData = findTeam(teams, homeTeam);
    const awayTeamData = findTeam(teams, awayTeam);
    
    if (!homeTeamData && !awayTeamData) {
      console.warn('[Scout Report] Could not find team IDs for QB lookup');
      return null;
    }
    
    console.log(`[Scout Report] 🏈 Fetching ${sportLabel} starting QBs from depth chart: ${awayTeam} @ ${homeTeam}`);
    
    // STEP 1: Get starting QBs from depth chart (handles injuries automatically)
    // Pass the sport key so NCAAF uses NCAAF roster, NFL uses NFL roster
    const [homeQBDepth, awayQBDepth] = await Promise.all([
      homeTeamData ? ballDontLieService.getStartingQBFromDepthChart(homeTeamData.id, 2025, bdlSport) : null,
      awayTeamData ? ballDontLieService.getStartingQBFromDepthChart(awayTeamData.id, 2025, bdlSport) : null
    ]);
    
    // STEP 2: Fetch season stats for these specific QBs
    // The depth chart tells us WHO is starting, now get their stats
    let homeQB = homeQBDepth;
    let awayQB = awayQBDepth;
    
    if (homeQBDepth) {
      const stats = await fetchQBStatsByName(homeQBDepth.name, homeTeam);
      if (stats) {
        homeQB = { ...homeQBDepth, ...stats, isBackup: homeQBDepth.isBackup };
      }
    }
    
    if (awayQBDepth) {
      const stats = await fetchQBStatsByName(awayQBDepth.name, awayTeam);
      if (stats) {
        awayQB = { ...awayQBDepth, ...stats, isBackup: awayQBDepth.isBackup };
      }
    }
    
    // NCAAF FALLBACK: If BDL depth chart failed (common for college), extract QB names from player season stats
    // This is more reliable than Grounding since BDL has actual passing stats
    if (isNCAAF) {
      if (!homeQB || homeQB.name === 'undefined undefined') {
        console.log(`[Scout Report] NCAAF fallback: Getting QB from season stats for ${homeTeam}`);
        const fallbackQB = await fetchNCAAFStartingQBFromStats(homeTeamData?.id, homeTeam);
        if (fallbackQB) {
          homeQB = fallbackQB;
        } else {
          // Last resort: create placeholder that Gemini Grounding already populated
          homeQB = { name: 'See grounded context', source: 'grounding' };
        }
      }
      if (!awayQB || awayQB.name === 'undefined undefined') {
        console.log(`[Scout Report] NCAAF fallback: Getting QB from season stats for ${awayTeam}`);
        const fallbackQB = await fetchNCAAFStartingQBFromStats(awayTeamData?.id, awayTeam);
        if (fallbackQB) {
          awayQB = fallbackQB;
        } else {
          awayQB = { name: 'See grounded context', source: 'grounding' };
        }
      }
    }
    
    // Log results
    if (homeQB && homeQB.name !== 'See grounded context') {
      const backupNote = homeQB.isBackup ? ' [BACKUP - starter injured]' : '';
      const injuryNote = homeQB.injuryStatus ? ` (${homeQB.injuryStatus})` : '';
      console.log(`[Scout Report] ✅ Home QB: ${homeQB.name} (${homeQB.passingYards || 0} yds, ${homeQB.passingTds || 0} TDs, ${homeQB.gamesPlayed || 0} GP)${backupNote}${injuryNote}`);
    } else if (isNCAAF) {
      console.log(`[Scout Report] ℹ️ Home QB: Retrieved via Gemini Grounding (BDL depth chart unavailable)`);
    }
    if (awayQB && awayQB.name !== 'See grounded context') {
      const backupNote = awayQB.isBackup ? ' [BACKUP - starter injured]' : '';
      const injuryNote = awayQB.injuryStatus ? ` (${awayQB.injuryStatus})` : '';
      console.log(`[Scout Report] ✅ Away QB: ${awayQB.name} (${awayQB.passingYards || 0} yds, ${awayQB.passingTds || 0} TDs, ${awayQB.gamesPlayed || 0} GP)${backupNote}${injuryNote}`);
    } else if (isNCAAF) {
      console.log(`[Scout Report] ℹ️ Away QB: Retrieved via Gemini Grounding (BDL depth chart unavailable)`);
    }
    
    return { home: homeQB, away: awayQB };
  } catch (error) {
    console.error('[Scout Report] Error fetching starting QBs:', error.message);
    return null;
  }
}

/**
 * NCAAF Fallback: Get starting QB from player season stats (by most passing yards)
 * BDL depth chart is sparse for college - this uses actual season stats instead
 * Falls back to Gemini Grounding if BDL has no data
 */
async function fetchNCAAFStartingQBFromStats(teamId, teamName) {
  try {
    if (!teamId) return null;
    
    // Fetch player season stats for the team
    const stats = await ballDontLieService.getNcaafPlayerSeasonStats(teamId, 2025);
    if (stats && stats.length > 0) {
      // Filter to QBs and sort by passing yards
      const qbStats = stats.filter(p => 
        (p.player?.position === 'Quarterback' || p.player?.position === 'QB') &&
        (p.passing_yards || 0) > 0
      ).sort((a, b) => (b.passing_yards || 0) - (a.passing_yards || 0));
      
      if (qbStats.length > 0) {
        const startingQB = qbStats[0];
        const qbName = `${startingQB.player?.first_name || ''} ${startingQB.player?.last_name || ''}`.trim();
        
        return {
          name: qbName,
          passingYards: startingQB.passing_yards || 0,
          passingTds: startingQB.passing_touchdowns || 0,
          gamesPlayed: startingQB.games_played || 0,
          source: 'bdl_stats'
        };
      }
    }
    
    // BDL returned empty - use Gemini Grounding to get QB info
    console.log(`[Scout Report] BDL empty for ${teamName} - using Gemini Grounding for QB verification`);
    const qbFromGrounding = await fetchNCAAFQBFromGrounding(teamName);
    return qbFromGrounding;
    
  } catch (e) {
    console.warn(`[Scout Report] NCAAF QB stats fallback failed for ${teamName}:`, e.message);
    return null;
  }
}

/**
 * NCAAF: Get QB info from Gemini Grounding when BDL has no data
 * This provides QB name and basic context even for lower-tier teams
 */
async function fetchNCAAFQBFromGrounding(teamName) {
  try {
    const query = `Who is the starting quarterback for ${teamName} college football team in the 2025 season? 
Answer with ONLY the QB's full name first (e.g., "Owen McCown" or "Keyone Jenkins"), then their class year and stats.`;

    const result = await geminiGroundingSearch(query, { temperature: 0.1, maxTokens: 500 });
    
    if (result?.success && result?.data) {
      const responseText = result.data;
      
      // Try multiple patterns to extract QB name
      // Pattern 1: Name at the very start of response
      let name = null;
      const startMatch = responseText.match(/^([A-Z][a-z]+(?:\s+[A-Z][a-zA-Z'-]+)+)/);
      if (startMatch) {
        name = startMatch[1].trim();
      }
      
      // Pattern 2: "quarterback is [Name]" or "QB is [Name]"
      if (!name) {
        const isMatch = responseText.match(/(?:quarterback|QB|starter)\s+is\s+([A-Z][a-z]+\s+[A-Z][a-zA-Z'-]+)/i);
        if (isMatch) name = isMatch[1].trim();
      }
      
      // Pattern 3: "[Name] is the starting quarterback"
      if (!name) {
        const reverseMatch = responseText.match(/([A-Z][a-z]+\s+[A-Z][a-zA-Z'-]+)\s+is\s+the\s+(?:starting\s+)?(?:quarterback|QB)/i);
        if (reverseMatch) name = reverseMatch[1].trim();
      }
      
      // Pattern 4: Just find the first proper name (First Last format) in the response
      if (!name) {
        const namePattern = responseText.match(/\b([A-Z][a-z]{2,})\s+([A-Z][a-zA-Z'-]{2,})\b/);
        if (namePattern) name = `${namePattern[1]} ${namePattern[2]}`.trim();
      }
      
      // Try to extract stats
      const yardsMatch = responseText.match(/(\d{1,4})\s*(?:passing\s*)?yards/i);
      const tdsMatch = responseText.match(/(\d{1,2})\s*(?:passing\s*)?(?:touchdowns?|TDs?)/i);
      
      if (name && name.length > 4 && !name.includes('the ')) {
        console.log(`[Scout Report] ✅ NCAAF QB from Grounding: ${name} for ${teamName}`);
        return {
          name: name,
          passingYards: yardsMatch ? parseInt(yardsMatch[1]) : 0,
          passingTds: tdsMatch ? parseInt(tdsMatch[1]) : 0,
          gamesPlayed: 0,
          source: 'grounding',
          rawContext: responseText.substring(0, 200)
        };
      }
    }
    
    console.log(`[Scout Report] Could not extract NCAAF QB from Grounding for ${teamName}`);
    return null;
  } catch (e) {
    console.warn(`[Scout Report] NCAAF QB Grounding failed for ${teamName}:`, e.message);
    return null;
  }
}

/**
 * Fetch key players (starters) for both NFL teams
 * Uses roster depth chart + season stats to show who actually plays
 * This prevents hallucinations about players who've been traded/cut
 */
async function fetchKeyPlayers(homeTeam, awayTeam, sport) {
  try {
    const bdlSport = sportToBdlKey(sport);
    if (bdlSport !== 'americanfootball_nfl') {
      return null; // Only NFL for now
    }
    
    const teams = await ballDontLieService.getTeams(bdlSport);
    const homeTeamData = findTeam(teams, homeTeam);
    const awayTeamData = findTeam(teams, awayTeam);
    
    if (!homeTeamData && !awayTeamData) {
      console.warn('[Scout Report] Could not find team IDs for roster lookup');
      return null;
    }
    
    console.log(`[Scout Report] Fetching NFL rosters for ${homeTeam} (ID: ${homeTeamData?.id}) and ${awayTeam} (ID: ${awayTeamData?.id})`);
    
    // Fetch rosters and season stats in parallel
    const [homeRoster, awayRoster, homeStats, awayStats] = await Promise.all([
      homeTeamData ? ballDontLieService.getNflTeamRoster(homeTeamData.id, 2025) : [],
      awayTeamData ? ballDontLieService.getNflTeamRoster(awayTeamData.id, 2025) : [],
      homeTeamData ? ballDontLieService.getNflSeasonStatsByTeam(homeTeamData.id, 2025) : [],
      awayTeamData ? ballDontLieService.getNflSeasonStatsByTeam(awayTeamData.id, 2025) : []
    ]);
    
    // Process each team's roster to get key starters
    const processTeamRoster = (roster, stats) => {
      if (!roster || roster.length === 0) return null;
      
      // Create a map of player ID to season stats
      const statsMap = new Map();
      (stats || []).forEach(s => {
        if (s.player?.id) {
          statsMap.set(s.player.id, s);
        }
      });
      
      // Filter to starters (depth = 1) and key positions
      const keyPositions = {
        offense: ['QB', 'RB', 'WR', 'TE', 'LT', 'LG', 'C', 'RG', 'RT'],
        defense: ['EDGE', 'DE', 'DT', 'NT', 'OLB', 'ILB', 'MLB', 'CB', 'FS', 'SS', 'S']
      };
      
      const starters = {
        offense: [],
        defense: []
      };
      
      // Track positions we've filled to avoid duplicates
      const filledOffense = new Set();
      const filledDefense = new Set();
      
      // Sort by depth to prioritize starters
      const sortedRoster = [...roster].sort((a, b) => (a.depth || 99) - (b.depth || 99));
      
      for (const entry of sortedRoster) {
        const pos = entry.position?.toUpperCase() || entry.player?.position_abbreviation?.toUpperCase() || '';
        const player = entry.player || {};
        const playerId = player.id;
        const playerStats = statsMap.get(playerId) || {};
        
        // Only take depth 1-2 players (starters and key backups)
        if ((entry.depth || 1) > 2) continue;
        
        const playerInfo = {
          name: entry.player_name || `${player.first_name || ''} ${player.last_name || ''}`.trim(),
          position: pos,
          jerseyNumber: player.jersey_number || '',
          depth: entry.depth || 1,
          injuryStatus: entry.injury_status || null,
          // Stats
          passingYards: playerStats.passing_yards || null,
          passingTds: playerStats.passing_touchdowns || null,
          passingInts: playerStats.passing_interceptions || null,
          rushingYards: playerStats.rushing_yards || null,
          rushingTds: playerStats.rushing_touchdowns || null,
          receivingYards: playerStats.receiving_yards || null,
          receivingTds: playerStats.receiving_touchdowns || null,
          receptions: playerStats.receptions || null,
          sacks: playerStats.defensive_sacks || null,
          tackles: playerStats.total_tackles || null,
          interceptions: playerStats.defensive_interceptions || null,
          gamesPlayed: playerStats.games_played || null
        };
        
        // Categorize into offense or defense
        const isOffense = keyPositions.offense.includes(pos) || 
                          ['QUARTERBACK', 'RUNNING BACK', 'WIDE RECEIVER', 'TIGHT END'].some(p => 
                            (player.position || '').toUpperCase().includes(p));
        const isDefense = keyPositions.defense.includes(pos) ||
                          ['LINEBACKER', 'CORNERBACK', 'SAFETY', 'DEFENSIVE'].some(p => 
                            (player.position || '').toUpperCase().includes(p));
        
        // Limit offense to key skill positions + OL representation
        if (isOffense && !filledOffense.has(pos)) {
          // For WR, allow up to 3
          if (pos === 'WR' && starters.offense.filter(p => p.position === 'WR').length >= 3) continue;
          // For RB, allow up to 2
          if (pos === 'RB' && starters.offense.filter(p => p.position === 'RB').length >= 2) continue;
          // For other positions, only take 1
          if (!['WR', 'RB'].includes(pos)) filledOffense.add(pos);
          
          starters.offense.push(playerInfo);
        }
        
        // Limit defense to key playmakers
        if (isDefense && !filledDefense.has(pos)) {
          // For CB, allow up to 2
          if (pos === 'CB' && starters.defense.filter(p => p.position === 'CB').length >= 2) continue;
          // For EDGE/DE, allow up to 2
          if (['EDGE', 'DE'].includes(pos) && starters.defense.filter(p => ['EDGE', 'DE'].includes(p.position)).length >= 2) continue;
          // For LB positions, allow up to 2
          if (['OLB', 'ILB', 'MLB', 'LB'].includes(pos) && starters.defense.filter(p => ['OLB', 'ILB', 'MLB', 'LB'].includes(p.position)).length >= 2) continue;
          // For other positions, only take 1
          if (!['CB', 'EDGE', 'DE', 'OLB', 'ILB', 'MLB', 'LB'].includes(pos)) filledDefense.add(pos);
          
          starters.defense.push(playerInfo);
        }
      }
      
      // Sort offense: QB first, then by production
      starters.offense.sort((a, b) => {
        if (a.position === 'QB') return -1;
        if (b.position === 'QB') return 1;
        const aYards = (a.rushingYards || 0) + (a.receivingYards || 0);
        const bYards = (b.rushingYards || 0) + (b.receivingYards || 0);
        return bYards - aYards;
      });
      
      // Sort defense by impact (sacks + tackles)
      starters.defense.sort((a, b) => {
        const aImpact = (a.sacks || 0) * 3 + (a.tackles || 0) + (a.interceptions || 0) * 5;
        const bImpact = (b.sacks || 0) * 3 + (b.tackles || 0) + (b.interceptions || 0) * 5;
        return bImpact - aImpact;
      });
      
      // Limit to reasonable counts
      return {
        offense: starters.offense.slice(0, 8), // QB, 2 RB, 3 WR, TE, maybe 1 OL
        defense: starters.defense.slice(0, 5)  // Top 5 defenders
      };
    };
    
    const homeKeyPlayers = processTeamRoster(homeRoster, homeStats);
    const awayKeyPlayers = processTeamRoster(awayRoster, awayStats);
    
    console.log(`[Scout Report] ✓ Key players: ${homeTeam} (${homeKeyPlayers?.offense?.length || 0} OFF, ${homeKeyPlayers?.defense?.length || 0} DEF), ${awayTeam} (${awayKeyPlayers?.offense?.length || 0} OFF, ${awayKeyPlayers?.defense?.length || 0} DEF)`);
    
    return {
      home: homeKeyPlayers,
      away: awayKeyPlayers
    };
  } catch (error) {
    console.error('[Scout Report] Error fetching key players:', error.message);
    return null;
  }
}

/**
 * Format key players section for display
 * ENHANCED: Now includes "TOP RECEIVING TARGETS" section like NBA shows top scorers by PPG
 */
function formatKeyPlayers(homeTeam, awayTeam, keyPlayers) {
  if (!keyPlayers || (!keyPlayers.home && !keyPlayers.away)) {
    return '';
  }
  
  const formatPlayerLine = (player) => {
    const injury = player.injuryStatus ? ` ⚠️${player.injuryStatus}` : '';
    const jersey = player.jerseyNumber ? ` #${player.jerseyNumber}` : '';
    
    // Format stats based on position
    let stats = '';
    if (player.position === 'QB' && player.passingYards) {
      stats = ` - ${player.passingYards} yds, ${player.passingTds || 0} TD, ${player.passingInts || 0} INT`;
    } else if (['RB'].includes(player.position) && (player.rushingYards || player.receivingYards)) {
      const parts = [];
      if (player.rushingYards) parts.push(`${player.rushingYards} rush`);
      if (player.receivingYards) parts.push(`${player.receivingYards} rec`);
      if (player.rushingTds || player.receivingTds) parts.push(`${(player.rushingTds || 0) + (player.receivingTds || 0)} TD`);
      stats = parts.length ? ` - ${parts.join(', ')}` : '';
    } else if (['WR', 'TE'].includes(player.position) && player.receivingYards) {
      stats = ` - ${player.receptions || 0} rec, ${player.receivingYards} yds, ${player.receivingTds || 0} TD`;
    } else if (player.sacks || player.tackles || player.interceptions) {
      const parts = [];
      if (player.tackles) parts.push(`${player.tackles} tkl`);
      if (player.sacks) parts.push(`${player.sacks} sacks`);
      if (player.interceptions) parts.push(`${player.interceptions} INT`);
      stats = parts.length ? ` - ${parts.join(', ')}` : '';
    }
    
    return `  • ${player.position}: ${player.name}${jersey}${stats}${injury}`;
  };
  
  // NEW: Extract and format TOP RECEIVING TARGETS (like NBA shows top scorers by PPG)
  // This is critical for backup QB situations - shows who the reliable targets are
  const getTopReceivers = (players) => {
    if (!players?.offense) return [];
    
    // Get all WR and TE, sort by receiving yards (like NBA sorts by PPG)
    const receivers = players.offense
      .filter(p => ['WR', 'TE'].includes(p.position) && p.receivingYards > 0)
      .sort((a, b) => (b.receivingYards || 0) - (a.receivingYards || 0))
      .slice(0, 3); // Top 3
    
    return receivers;
  };
  
  const formatReceiverLine = (player) => {
    const injury = player.injuryStatus ? ` ⚠️${player.injuryStatus}` : '';
    return `  ${player.name} (${player.position}) - ${player.receptions || 0} rec, ${player.receivingYards} yds, ${player.receivingTds || 0} TD${injury}`;
  };
  
  const homeReceivers = getTopReceivers(keyPlayers.home);
  const awayReceivers = getTopReceivers(keyPlayers.away);
  
  // Format top receiving targets section (critical for backup QB analysis)
  let topReceiversSection = '';
  if (homeReceivers.length > 0 || awayReceivers.length > 0) {
    topReceiversSection = `
🎯 TOP RECEIVING TARGETS (by receiving yards - CRITICAL FOR QB CHANGES)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🏠 ${homeTeam}:
${homeReceivers.length > 0 ? homeReceivers.map(formatReceiverLine).join('\n') : '  (No receiving data available)'}

✈️ ${awayTeam}:
${awayReceivers.length > 0 ? awayReceivers.map(formatReceiverLine).join('\n') : '  (No receiving data available)'}

⚠️ For backup/3rd-string QB situations: These are the reliable targets who can help
an inexperienced QB. Volume receivers with high catch counts = safety blankets.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`;
  }
  
  const formatTeamSection = (teamName, players, isHome) => {
    if (!players) return `${isHome ? '🏠' : '✈️'} ${teamName}: Roster unavailable`;
    
    const lines = [`${isHome ? '🏠' : '✈️'} ${teamName}:`];
    
    if (players.offense && players.offense.length > 0) {
      lines.push('  OFFENSE:');
      players.offense.forEach(p => lines.push(formatPlayerLine(p)));
    }
    
    if (players.defense && players.defense.length > 0) {
      lines.push('  DEFENSE:');
      players.defense.forEach(p => lines.push(formatPlayerLine(p)));
    }
    
    return lines.join('\n');
  };
  
  const homeSection = formatTeamSection(homeTeam, keyPlayers.home, true);
  const awaySection = formatTeamSection(awayTeam, keyPlayers.away, false);
  
  return `${topReceiversSection}
🏈 KEY PLAYERS (CURRENT ROSTER - USE THESE NAMES)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${homeSection}

${awaySection}

⚠️ CRITICAL: Only reference players listed above. Do NOT mention players
not on this roster - they may have been traded, cut, or injured.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`;
}

/**
 * Fetch key players for both NHL teams
 * Uses roster + individual player stats to show who's on the team
 * This prevents hallucinations about players who've been traded
 */
/**
 * Fetch key players for NHL teams - ROTOWIRE STYLE
 * Based on https://www.rotowire.com/hockey/nhl-lineups.php format
 * Shows: Forward Lines (1-4), Defense Pairs (1-3), Goalies (Starter/Backup), Scratches/IR
 */
async function fetchNhlKeyPlayers(homeTeam, awayTeam, sport, injuries = null) {
  try {
    const bdlSport = sportToBdlKey(sport);
    if (bdlSport !== 'icehockey_nhl') {
      return null;
    }
    
    const teams = await ballDontLieService.getTeams(bdlSport);
    const homeTeamData = findTeam(teams, homeTeam);
    const awayTeamData = findTeam(teams, awayTeam);
    
    if (!homeTeamData && !awayTeamData) {
      console.warn('[Scout Report] Could not find team IDs for NHL roster lookup');
      return null;
    }
    
    console.log(`[Scout Report] Fetching NHL rosters for ${homeTeam} (ID: ${homeTeamData?.id}) and ${awayTeam} (ID: ${awayTeamData?.id})`);

    // NHL season starts in October: Oct(10)-Dec = currentYear, Jan-Sep = previousYear
    const nhlMonth = new Date().getMonth() + 1;
    const nhlYear = new Date().getFullYear();
    const season = nhlMonth >= 10 ? nhlYear : nhlYear - 1;

    // Rely on improved BDL data for NHL rosters
    let groundingRosterData = null;
    console.log(`[Scout Report] Using BDL roster data with improved filtering for NHL: ${homeTeam} vs ${awayTeam}`);

    // Fetch rosters from BDL as backup/supplement
    const [homePlayers, awayPlayers] = await Promise.all([
      homeTeamData ? ballDontLieService.getNhlTeamPlayers(homeTeamData.id, season) : [],
      awayTeamData ? ballDontLieService.getNhlTeamPlayers(awayTeamData.id, season) : []
    ]);

    // Debug: Log some player info to verify we're getting correct data
    console.log(`[Scout Report] ${homeTeam}: ${homePlayers.length} players found (BDL)`);
    if (homePlayers.length > 0) {
      const samplePlayers = homePlayers.slice(0, 3).map(p => `${p.full_name} (${p.position_code})`);
      console.log(`[Scout Report] Sample ${homeTeam} players: ${samplePlayers.join(', ')}`);
    }
    console.log(`[Scout Report] ${awayTeam}: ${awayPlayers.length} players found (BDL)`);
    if (awayPlayers.length > 0) {
      const samplePlayers = awayPlayers.slice(0, 3).map(p => `${p.full_name} (${p.position_code})`);
      console.log(`[Scout Report] Sample ${awayTeam} players: ${samplePlayers.join(', ')}`);
    }
    
    // Process each team's roster to get key players with stats
    const processTeamRoster = async (players, teamName) => {
      if (!players || players.length === 0) return null;
      
      // Group by position
      const forwards = players.filter(p => ['C', 'L', 'R', 'LW', 'RW', 'F'].includes(p.position_code?.toUpperCase()));
      const defensemen = players.filter(p => ['D'].includes(p.position_code?.toUpperCase()));
      const goalies = players.filter(p => ['G'].includes(p.position_code?.toUpperCase()));
      
      // Get stats for key players (top forwards, defensemen, and goalies)
      // Limit to avoid too many API calls
      const keyForwards = forwards.slice(0, 6);
      const keyDefensemen = defensemen.slice(0, 4);
      const keyGoalies = goalies.slice(0, 2);
      
      const allKeyPlayers = [...keyForwards, ...keyDefensemen, ...keyGoalies];
      
      // Fetch stats for each key player in parallel (batch of 5 at a time)
      const playersWithStats = [];
      for (let i = 0; i < allKeyPlayers.length; i += 5) {
        const batch = allKeyPlayers.slice(i, i + 5);
        const statsPromises = batch.map(async (player) => {
          try {
            const stats = await ballDontLieService.getNhlPlayerSeasonStats(player.id, season);
            // Convert array of {name, value} to object
            const statsObj = {};
            (stats || []).forEach(s => {
              statsObj[s.name] = s.value;
            });
            return { ...player, seasonStats: statsObj };
          } catch (e) {
            return { ...player, seasonStats: {} };
          }
        });
        const results = await Promise.all(statsPromises);
        playersWithStats.push(...results);
      }
      
      // Sort forwards by points (goals + assists)
      const sortedForwards = playersWithStats
        .filter(p => ['C', 'L', 'R', 'LW', 'RW', 'F'].includes(p.position_code?.toUpperCase()))
        .sort((a, b) => {
          const aPoints = (a.seasonStats?.points || 0);
          const bPoints = (b.seasonStats?.points || 0);
          return bPoints - aPoints;
        })
        .slice(0, 5); // Top 5 forwards
      
      // Sort defensemen by points
      const sortedDefensemen = playersWithStats
        .filter(p => ['D'].includes(p.position_code?.toUpperCase()))
        .sort((a, b) => {
          const aPoints = (a.seasonStats?.points || 0);
          const bPoints = (b.seasonStats?.points || 0);
          return bPoints - aPoints;
        })
        .slice(0, 3); // Top 3 defensemen
      
      // Sort goalies by games played (starter indication)
      const sortedGoalies = playersWithStats
        .filter(p => ['G'].includes(p.position_code?.toUpperCase()))
        .sort((a, b) => {
          const aGames = (a.seasonStats?.games_played || 0);
          const bGames = (b.seasonStats?.games_played || 0);
          return bGames - aGames;
        })
        .slice(0, 2); // Top 2 goalies
      
      return {
        forwards: sortedForwards.map(p => ({
          name: p.full_name || `${p.first_name} ${p.last_name}`,
          position: p.position_code,
          goals: p.seasonStats?.goals || 0,
          assists: p.seasonStats?.assists || 0,
          points: p.seasonStats?.points || 0,
          plusMinus: p.seasonStats?.plus_minus || 0,
          gamesPlayed: p.seasonStats?.games_played || 0
        })),
        defensemen: sortedDefensemen.map(p => ({
          name: p.full_name || `${p.first_name} ${p.last_name}`,
          position: 'D',
          goals: p.seasonStats?.goals || 0,
          assists: p.seasonStats?.assists || 0,
          points: p.seasonStats?.points || 0,
          plusMinus: p.seasonStats?.plus_minus || 0,
          gamesPlayed: p.seasonStats?.games_played || 0
        })),
        goalies: sortedGoalies.map(p => ({
          name: p.full_name || `${p.first_name} ${p.last_name}`,
          position: 'G',
          gamesPlayed: p.seasonStats?.games_played || 0,
          wins: p.seasonStats?.wins || 0,
          losses: p.seasonStats?.losses || 0,
          savePct: p.seasonStats?.save_pct ? (p.seasonStats.save_pct * 100).toFixed(1) : null,
          gaa: p.seasonStats?.goals_against_average?.toFixed(2) || null,
          shutouts: p.seasonStats?.shutouts || 0
        }))
      };
    };
    
    const [homeKeyPlayers, awayKeyPlayers] = await Promise.all([
      processTeamRoster(homePlayers, homeTeam),
      processTeamRoster(awayPlayers, awayTeam)
    ]);
    
    // NOTE: Roster verification now handled by Gemini Grounding in injury/context fetching
    // BDL API provides accurate roster data, so explicit verification is rarely needed
    
    const homeCount = (homeKeyPlayers?.forwards?.length || 0) + (homeKeyPlayers?.defensemen?.length || 0) + (homeKeyPlayers?.goalies?.length || 0);
    const awayCount = (awayKeyPlayers?.forwards?.length || 0) + (awayKeyPlayers?.defensemen?.length || 0) + (awayKeyPlayers?.goalies?.length || 0);
    
    console.log(`[Scout Report] ✓ NHL Key players: ${homeTeam} (${homeCount} players), ${awayTeam} (${awayCount} players)`);
    
    return {
      home: homeKeyPlayers,
      away: awayKeyPlayers
    };
  } catch (error) {
    console.error('[Scout Report] Error fetching NHL key players:', error.message);
    return null;
  }
}

/**
 * Fetch key players for both NBA teams - ROTOWIRE STYLE
 * Uses active roster + season stats + Gemini grounding for starting lineup
 * CRITICAL: Prevents hallucinations about traded players (e.g., Luka Doncic)
 * ENHANCED: Now shows Starting 5 (by position) + 3 Bench + May Not Play (like Rotowire)
 * @param {string} homeTeam - Home team name
 * @param {string} awayTeam - Away team name  
 * @param {string} sport - Sport key (NBA)
 * @param {object} injuries - Injury data to filter OUT players
 */
async function fetchNbaKeyPlayers(homeTeam, awayTeam, sport, injuries = null) {
  try {
    const bdlSport = sportToBdlKey(sport);
    if (bdlSport !== 'basketball_nba') {
      return null;
    }
    
    const teams = await ballDontLieService.getTeams(bdlSport);
    const homeTeamData = findTeam(teams, homeTeam);
    const awayTeamData = findTeam(teams, awayTeam);
    
    if (!homeTeamData && !awayTeamData) {
      console.warn('[Scout Report] Could not find team IDs for NBA roster lookup');
      return null;
    }
    
    console.log(`[Scout Report] Fetching NBA rosters (Rotowire-style) for ${homeTeam} and ${awayTeam}`);

    // Fetch active players for each team
    const [homePlayersRaw, awayPlayersRaw] = await Promise.all([
      homeTeamData ? ballDontLieService.getPlayersActive(bdlSport, { team_ids: [homeTeamData.id], per_page: 20 }) : [],
      awayTeamData ? ballDontLieService.getPlayersActive(bdlSport, { team_ids: [awayTeamData.id], per_page: 20 }) : []
    ]);
    
    // Handle both array and {data: [...]} response formats
    const homePlayers = Array.isArray(homePlayersRaw) ? homePlayersRaw : (homePlayersRaw?.data || []);
    const awayPlayers = Array.isArray(awayPlayersRaw) ? awayPlayersRaw : (awayPlayersRaw?.data || []);
    
    console.log(`[Scout Report] NBA roster: ${homeTeam} (${homePlayers.length} players), ${awayTeam} (${awayPlayers.length} players)`);
    
    // Get current season for stats lookup
    const currentYear = new Date().getFullYear();
    const currentMonth = new Date().getMonth() + 1;
    const season = currentMonth >= 10 ? currentYear : currentYear - 1;
    
    // Collect all player IDs to fetch stats
    const allPlayerIds = [
      ...homePlayers.map(p => p.id),
      ...awayPlayers.map(p => p.id)
    ].filter(id => id);
    
    // Fetch season stats for all players
    let playerStats = {};
    if (allPlayerIds.length > 0) {
      try {
        playerStats = await ballDontLieService.getNbaPlayerSeasonStatsForProps(allPlayerIds, season);
        console.log(`[Scout Report] Fetched stats for ${Object.keys(playerStats).length} NBA players`);
      } catch (e) {
        console.warn('[Scout Report] Could not fetch player stats:', e.message);
      }
    }
    
    // Use Gemini Grounding to get ACTUAL STARTING LINEUP by position (like Rotowire)
    const startingLineups = await fetchNbaStartingLineups(homeTeam, awayTeam);
    
    // Build injury map from passed injuries parameter
    const injuryMap = new Map();
    if (injuries) {
      const allInjuries = [...(injuries.home || []), ...(injuries.away || [])];
      allInjuries.forEach(inj => {
        // Handle different injury object formats:
        // - inj.player could be a string "LaMelo Ball" or object {first_name, last_name}
        // - inj.name could also be the player name
        let name = '';
        if (typeof inj.player === 'string') {
          name = inj.player.toLowerCase();
        } else if (inj.player?.first_name && inj.player?.last_name) {
          name = `${inj.player.first_name} ${inj.player.last_name}`.toLowerCase();
        } else if (inj.player?.name) {
          name = inj.player.name.toLowerCase();
        } else if (typeof inj.name === 'string') {
          name = inj.name.toLowerCase();
        }
        
        if (name) {
          injuryMap.set(name, {
            status: inj.status || inj.game_status || 'Unknown',
            injury: inj.injury || inj.description || ''
          });
        }
      });
    }
    
    // Process roster to get: 5 STARTERS + 3 BENCH + MAY NOT PLAY
    const processRoster = (players, teamName, startingFive = []) => {
      if (!players || players.length === 0) return null;
      
      // Map players with their stats and injury status
      const playersWithStats = players.map(p => {
        const fullName = `${p.first_name} ${p.last_name}`;
        const stats = playerStats[p.id] || {};
        const injuryInfo = injuryMap.get(fullName.toLowerCase());
        
        // Determine injury status
        let injuryStatus = null;
        if (injuryInfo) {
          injuryStatus = injuryInfo.status;
        }
        
        return {
          name: fullName,
          position: p.position || 'N/A',
          jerseyNumber: p.jersey_number,
          id: p.id,
          // Core stats
          ppg: parseFloat(stats.ppg) || 0,
          mpg: parseFloat(stats.mpg) || 0,
          rpg: parseFloat(stats.rpg) || 0,
          apg: parseFloat(stats.apg) || 0,
          // Additional stats for deeper analysis
          spg: parseFloat(stats.spg) || 0,  // steals
          bpg: parseFloat(stats.bpg) || 0,  // blocks
          tpg: parseFloat(stats.tpg) || 0,  // 3-pointers made
          fgPct: parseFloat(stats.fgPct) || 0,
          fg3Pct: parseFloat(stats.fg3Pct) || 0,
          ftPct: parseFloat(stats.ftPct) || 0,
          injuryStatus: injuryStatus
        };
      });
      
      // Separate by injury status
      const OUT_STATUSES = ['OUT', 'OFS', 'IR', 'SUSPENDED', 'G-LEAGUE'];
      const QUESTIONABLE_STATUSES = ['QUESTIONABLE', 'DOUBTFUL', 'GTD', 'GAME-TIME DECISION'];
      
      const outPlayers = playersWithStats.filter(p => 
        p.injuryStatus && OUT_STATUSES.some(s => p.injuryStatus.toUpperCase().includes(s))
      );
      
      const questionablePlayers = playersWithStats.filter(p => 
        p.injuryStatus && QUESTIONABLE_STATUSES.some(s => p.injuryStatus.toUpperCase().includes(s))
      );
      
      const availablePlayers = playersWithStats.filter(p => 
        !p.injuryStatus || 
        (!OUT_STATUSES.some(s => p.injuryStatus.toUpperCase().includes(s)) &&
         !QUESTIONABLE_STATUSES.some(s => p.injuryStatus.toUpperCase().includes(s)))
      );
      
      // Sort available by MPG (minutes per game = who actually plays)
      availablePlayers.sort((a, b) => b.mpg - a.mpg);
      
      // Try to match starting lineup from Gemini Grounding
      let starters = [];
      if (startingFive && startingFive.length > 0) {
        // Match grounded starters to roster
        startingFive.forEach(grounded => {
          const match = availablePlayers.find(p => 
            p.name.toLowerCase().includes(grounded.name?.toLowerCase() || '') ||
            (grounded.name && grounded.name.toLowerCase().includes(p.name.split(' ')[1]?.toLowerCase() || ''))
          );
          if (match && !starters.find(s => s.id === match.id)) {
            match.starterPosition = grounded.position; // PG, SG, SF, PF, C
            starters.push(match);
          }
        });
      }
      
      // If we couldn't match all 5 starters, fill with top MPG players
      if (starters.length < 5) {
        const unmatched = availablePlayers.filter(p => !starters.find(s => s.id === p.id));
        const needed = 5 - starters.length;
        starters = [...starters, ...unmatched.slice(0, needed)];
      }
      
      // Get top 3 bench players (by MPG, excluding starters and OUT players)
      const starterIds = new Set(starters.map(s => s.id));
      const benchPlayers = availablePlayers
        .filter(p => !starterIds.has(p.id))
        .slice(0, 3);
      
      // Combine out and questionable for "May Not Play"
      const mayNotPlay = [...outPlayers, ...questionablePlayers];
      
      // Log the lineup
      console.log(`[Scout Report] ${teamName} STARTERS (${starters.length}): ${starters.map(s => s.name).join(', ')}`);
      console.log(`[Scout Report] ${teamName} BENCH (${benchPlayers.length}): ${benchPlayers.map(b => b.name).join(', ')}`);
      if (mayNotPlay.length > 0) {
        console.log(`[Scout Report] ${teamName} MAY NOT PLAY (${mayNotPlay.length}): ${mayNotPlay.map(m => `${m.name} (${m.injuryStatus})`).join(', ')}`);
      }
      
      return {
        starters: starters,
        bench: benchPlayers,
        mayNotPlay: mayNotPlay
      };
    };
    
    const homeKeyPlayers = processRoster(homePlayers, homeTeam, startingLineups?.home);
    const awayKeyPlayers = processRoster(awayPlayers, awayTeam, startingLineups?.away);
    
    return {
      home: homeKeyPlayers,
      away: awayKeyPlayers,
      homeTeamName: homeTeam,
      awayTeamName: awayTeam
    };
  } catch (error) {
    console.error('[Scout Report] Error fetching NBA key players:', error.message);
    return null;
  }
}

/**
 * Fetch NBA starting lineups using Gemini Grounding (like Rotowire)
 * Gets the PROJECTED STARTING 5 by position (PG, SG, SF, PF, C) for each team
 */
async function fetchNbaStartingLineups(homeTeam, awayTeam) {
  const genAI = getGeminiClient();
  if (!genAI) {
    console.log('[Scout Report] Gemini not available for starting lineup lookup');
    return null;
  }
  
  try {
    const today = new Date().toLocaleDateString('en-US', { 
      month: 'long', day: 'numeric', year: 'numeric' 
    });
    
    const model = genAI.getGenerativeModel({
      model: 'gemini-3-flash-preview',
      tools: [{ google_search: {} }],
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 1024
      }
    });
    
    const prompt = `For the NBA game ${awayTeam} @ ${homeTeam} on ${today}:

List the PROJECTED STARTING 5 for each team by position.
Format EXACTLY like this:

${homeTeam} STARTERS:
PG: [Player Name]
SG: [Player Name]
SF: [Player Name]
PF: [Player Name]
C: [Player Name]

${awayTeam} STARTERS:
PG: [Player Name]
SG: [Player Name]
SF: [Player Name]
PF: [Player Name]
C: [Player Name]

Use today's lineup data from Rotowire, ESPN, or team beat reporters.
If a player is OUT, list who is EXPECTED TO START in their place.`;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();
    
    console.log('[Scout Report] 🏀 Fetched starting lineups via Gemini Grounding');
    
    // Parse the response to extract starting lineups
    const parseLineup = (teamName) => {
      const positions = ['PG', 'SG', 'SF', 'PF', 'C'];
      const starters = [];
      
      // Find the section for this team
      const teamSection = text.split(teamName)?.[1]?.split(/\n\n/)?.[0] || '';
      
      positions.forEach(pos => {
        const regex = new RegExp(`${pos}[:\\s]+([A-Za-z\\s\\.\\-']+)`, 'i');
        const match = teamSection.match(regex);
        if (match && match[1]) {
          const playerName = match[1].trim().replace(/[\n\r]/g, '').split(/[,\n]/)[0].trim();
          if (playerName && playerName.length > 2) {
            starters.push({ position: pos, name: playerName });
          }
        }
      });
      
      return starters;
    };
    
    const homeStarters = parseLineup(homeTeam);
    const awayStarters = parseLineup(awayTeam);
    
    if (homeStarters.length > 0) {
      console.log(`[Scout Report] ${homeTeam} starting 5: ${homeStarters.map(s => `${s.position}: ${s.name}`).join(', ')}`);
    }
    if (awayStarters.length > 0) {
      console.log(`[Scout Report] ${awayTeam} starting 5: ${awayStarters.map(s => `${s.position}: ${s.name}`).join(', ')}`);
    }
    
    return {
      home: homeStarters,
      away: awayStarters
    };
  } catch (error) {
    console.warn('[Scout Report] Could not fetch starting lineups:', error.message);
    return null;
  }
}

/**
 * Format NBA key players section for display - ROTOWIRE STYLE
 * Shows: STARTING 5 (by position) + KEY BENCH (3) + MAY NOT PLAY
 * INCLUDES: Full stat line for each player (PPG/RPG/APG/FG%/3P%)
 * CRITICAL: This tells the LLM who ACTUALLY plays for each team tonight
 */
function formatNbaKeyPlayers(homeTeam, awayTeam, keyPlayers) {
  if (!keyPlayers || (!keyPlayers.home && !keyPlayers.away)) {
    return '';
  }
  
  const formatStarter = (player) => {
    const pos = player.starterPosition || player.position || 'N/A';
    const jersey = player.jerseyNumber ? ` #${player.jerseyNumber}` : '';
    // Full stat line: PPG/RPG/APG | FG%/3P% | MPG
    const mainStats = `${player.ppg?.toFixed(1) || '0'} PPG / ${player.rpg?.toFixed(1) || '0'} RPG / ${player.apg?.toFixed(1) || '0'} APG`;
    const shootingStats = player.fgPct > 0 ? ` | ${player.fgPct.toFixed(1)}% FG` : '';
    const threeStats = player.fg3Pct > 0 ? ` / ${player.fg3Pct.toFixed(1)}% 3P` : '';
    const mpg = player.mpg > 0 ? ` | ${player.mpg.toFixed(1)} MPG` : '';
    const injury = player.injuryStatus ? ` ⚠️${player.injuryStatus}` : '';
    return `  ${pos}: ${player.name}${jersey}\n       📊 ${mainStats}${shootingStats}${threeStats}${mpg}${injury}`;
  };
  
  const formatBench = (player) => {
    const jersey = player.jerseyNumber ? ` #${player.jerseyNumber}` : '';
    const stats = `${player.ppg?.toFixed(1) || '0'}/${player.rpg?.toFixed(1) || '0'}/${player.apg?.toFixed(1) || '0'}`;
    const mpg = player.mpg > 0 ? `, ${player.mpg.toFixed(1)} MPG` : '';
    return `  • ${player.position}: ${player.name}${jersey} (${stats}${mpg})`;
  };
  
  const formatInjured = (player) => {
    const status = player.injuryStatus || 'Unknown';
    const stats = player.ppg > 0 ? ` - was averaging ${player.ppg.toFixed(1)} PPG` : '';
    return `  🚫 ${player.position}: ${player.name} - ${status}${stats}`;
  };
  
  const formatTeamSection = (teamName, teamData, isHome) => {
    if (!teamData) return '';
    
    const lines = [];
    const emoji = isHome ? '🏠' : '✈️';
    lines.push(`${emoji} ${teamName}`);
    
    // EXPECTED STARTING LINEUP (5 players by position)
    if (teamData.starters && teamData.starters.length > 0) {
      lines.push('  📋 EXPECTED STARTING LINEUP:');
      teamData.starters.forEach(player => {
        lines.push(formatStarter(player));
      });
    }
    
    // KEY BENCH PLAYERS (3 players)
    if (teamData.bench && teamData.bench.length > 0) {
      lines.push('  🔄 KEY BENCH:');
      teamData.bench.forEach(player => {
        lines.push(formatBench(player));
      });
    }
    
    // MAY NOT PLAY (OUT, QUESTIONABLE, DOUBTFUL)
    if (teamData.mayNotPlay && teamData.mayNotPlay.length > 0) {
      lines.push('  ⚠️ MAY NOT PLAY:');
      teamData.mayNotPlay.forEach(player => {
        lines.push(formatInjured(player));
      });
    }
    
    return lines.join('\n');
  };
  
  const output = [
    '🏀 TONIGHT\'S LINEUPS (ROTOWIRE-STYLE)',
    '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
    '⚠️ CRITICAL: This shows WHO IS ACTUALLY PLAYING tonight.',
    '   Players in "MAY NOT PLAY" should NOT be factored into your analysis.',
    '   Use this to understand the ACTUAL matchups on the court.',
    '',
    formatTeamSection(homeTeam, keyPlayers.home, true),
    '',
    formatTeamSection(awayTeam, keyPlayers.away, false),
    '',
    '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
    ''
  ];
  
  return output.join('\n');
}

/**
 * Fetch key players for NCAAB teams
 * CRITICAL: Prevents hallucinations about transferred players (transfer portal is huge in college basketball)
 */
/**
 * Fetch key players for NCAAB teams - ROTOWIRE STYLE
 * Based on https://www.rotowire.com/daily/ncaab/lineups.php format
 * Shows: Starting 5 (by position) + Key Bench (3) + May Not Play
 * CRITICAL: College basketball has massive transfer portal activity
 */
async function fetchNcaabKeyPlayers(homeTeam, awayTeam, sport, injuries = null) {
  try {
    const bdlSport = sportToBdlKey(sport);
    if (bdlSport !== 'basketball_ncaab') {
      return null;
    }
    
    const teams = await ballDontLieService.getTeams(bdlSport);
    const homeTeamData = findTeam(teams, homeTeam);
    const awayTeamData = findTeam(teams, awayTeam);
    
    if (!homeTeamData && !awayTeamData) {
      console.warn('[Scout Report] Could not find team IDs for NCAAB roster lookup');
      return null;
    }
    
    console.log(`[Scout Report] Fetching NCAAB rosters (Rotowire-style) for ${homeTeam} and ${awayTeam}`);

    // Fetch active players for each team
    const [homePlayersRaw, awayPlayersRaw] = await Promise.all([
      homeTeamData ? ballDontLieService.getPlayersActive(bdlSport, { team_ids: [homeTeamData.id], per_page: 20 }) : [],
      awayTeamData ? ballDontLieService.getPlayersActive(bdlSport, { team_ids: [awayTeamData.id], per_page: 20 }) : []
    ]);
    
    const homePlayers = Array.isArray(homePlayersRaw) ? homePlayersRaw : (homePlayersRaw?.data || []);
    const awayPlayers = Array.isArray(awayPlayersRaw) ? awayPlayersRaw : (awayPlayersRaw?.data || []);
    
    console.log(`[Scout Report] NCAAB roster: ${homeTeam} (${homePlayers.length} players), ${awayTeam} (${awayPlayers.length} players)`);
    
    // Get current college basketball season
    const currentYear = new Date().getFullYear();
    const currentMonth = new Date().getMonth() + 1;
    const season = currentMonth >= 11 ? currentYear : currentYear - 1;
    
    // Fetch season stats for all players
    let homeStats = [];
    let awayStats = [];
    try {
      const [homeStatsResult, awayStatsResult] = await Promise.all([
        homeTeamData ? ballDontLieService.getNcaabPlayerSeasonStats({ teamId: homeTeamData.id, season }) : [],
        awayTeamData ? ballDontLieService.getNcaabPlayerSeasonStats({ teamId: awayTeamData.id, season }) : []
      ]);
      homeStats = homeStatsResult || [];
      awayStats = awayStatsResult || [];
    } catch (e) {
      console.warn('[Scout Report] Could not fetch NCAAB player stats:', e.message);
    }
    
    // Use Gemini Grounding to get ACTUAL STARTING LINEUP by position (like Rotowire)
    const startingLineups = await fetchNcaabStartingLineups(homeTeam, awayTeam);
    
    // Build injury map (handle different injury object formats)
    const injuryMap = new Map();
    if (injuries) {
      const allInjuries = [...(injuries.home || []), ...(injuries.away || [])];
      allInjuries.forEach(inj => {
        let name = '';
        if (typeof inj.player === 'string') {
          name = inj.player.toLowerCase();
        } else if (inj.player?.first_name && inj.player?.last_name) {
          name = `${inj.player.first_name} ${inj.player.last_name}`.toLowerCase();
        } else if (inj.player?.name) {
          name = inj.player.name.toLowerCase();
        } else if (typeof inj.name === 'string') {
          name = inj.name.toLowerCase();
        }
        
        if (name) {
          injuryMap.set(name, {
            status: inj.status || inj.game_status || 'Unknown',
            injury: inj.injury || inj.description || ''
          });
        }
      });
    }
    
    // Process roster: 5 STARTERS + 3 BENCH + MAY NOT PLAY
    const processRoster = (players, stats, teamName, startingFive = []) => {
      if (!players || players.length === 0) return null;
      
      // Create stats lookup
      const statsById = {};
      stats.forEach(s => {
        if (s.player?.id) {
          statsById[s.player.id] = s;
        }
      });
      
      // Map players with stats and injury status
      const playersWithStats = players.map(p => {
        const fullName = `${p.first_name} ${p.last_name}`;
        const playerStats = statsById[p.id] || {};
        const gamesPlayed = parseInt(playerStats.games_played) || 1;
        const injuryInfo = injuryMap.get(fullName.toLowerCase());
        
        return {
          name: fullName,
          position: p.position || 'N/A',
          jerseyNumber: p.jersey_number,
          id: p.id,
          ppg: (parseFloat(playerStats.pts) || 0) / gamesPlayed,
          rpg: (parseFloat(playerStats.reb) || 0) / gamesPlayed,
          apg: (parseFloat(playerStats.ast) || 0) / gamesPlayed,
          mpg: (parseFloat(playerStats.min) || 0) / gamesPlayed,
          fgPct: parseFloat(playerStats.fg_pct) || 0,
          threePct: parseFloat(playerStats.fg3_pct) || 0,
          gamesPlayed: gamesPlayed,
          injuryStatus: injuryInfo?.status || null
        };
      });
      
      // Separate by injury status
      const OUT_STATUSES = ['OUT', 'OFS', 'SUSPENDED', 'INELIGIBLE'];
      const QUESTIONABLE_STATUSES = ['GTD', 'QUESTIONABLE', 'DOUBTFUL', 'GAME-TIME'];
      
      const outPlayers = playersWithStats.filter(p => 
        p.injuryStatus && OUT_STATUSES.some(s => p.injuryStatus.toUpperCase().includes(s))
      );
      
      const questionablePlayers = playersWithStats.filter(p => 
        p.injuryStatus && QUESTIONABLE_STATUSES.some(s => p.injuryStatus.toUpperCase().includes(s))
      );
      
      const availablePlayers = playersWithStats.filter(p => 
        !p.injuryStatus || 
        (!OUT_STATUSES.some(s => p.injuryStatus.toUpperCase().includes(s)) &&
         !QUESTIONABLE_STATUSES.some(s => p.injuryStatus.toUpperCase().includes(s)))
      );
      
      // Sort available by PPG (primary rotation indicator in college)
      availablePlayers.sort((a, b) => b.ppg - a.ppg);
      
      // Try to match starting lineup from Gemini Grounding
      let starters = [];
      if (startingFive && startingFive.length > 0) {
        startingFive.forEach(grounded => {
          const match = availablePlayers.find(p => 
            p.name.toLowerCase().includes(grounded.name?.toLowerCase() || '') ||
            (grounded.name && grounded.name.toLowerCase().includes(p.name.split(' ')[1]?.toLowerCase() || ''))
          );
          if (match && !starters.find(s => s.id === match.id)) {
            match.starterPosition = grounded.position;
            starters.push(match);
          }
        });
      }
      
      // Fill remaining starters with top PPG players
      if (starters.length < 5) {
        const unmatched = availablePlayers.filter(p => !starters.find(s => s.id === p.id));
        const needed = 5 - starters.length;
        starters = [...starters, ...unmatched.slice(0, needed)];
      }
      
      // Get top 3 bench players
      const starterIds = new Set(starters.map(s => s.id));
      const benchPlayers = availablePlayers
        .filter(p => !starterIds.has(p.id))
        .slice(0, 3);
      
      const mayNotPlay = [...outPlayers, ...questionablePlayers];
      
      console.log(`[Scout Report] ${teamName} NCAAB STARTERS: ${starters.map(s => s.name).join(', ')}`);
      if (mayNotPlay.length > 0) {
        console.log(`[Scout Report] ${teamName} NCAAB MAY NOT PLAY: ${mayNotPlay.map(m => `${m.name} (${m.injuryStatus})`).join(', ')}`);
      }
      
      return { starters, bench: benchPlayers, mayNotPlay };
    };
    
    const homeKeyPlayers = processRoster(homePlayers, homeStats, homeTeam, startingLineups?.home);
    const awayKeyPlayers = processRoster(awayPlayers, awayStats, awayTeam, startingLineups?.away);
    
    return {
      home: homeKeyPlayers,
      away: awayKeyPlayers,
      homeTeamName: homeTeam,
      awayTeamName: awayTeam
    };
  } catch (error) {
    console.error('[Scout Report] Error fetching NCAAB key players:', error.message);
    return null;
  }
}

/**
 * Fetch NCAAB starting lineups using Gemini Grounding (like Rotowire)
 * Based on https://www.rotowire.com/daily/ncaab/lineups.php format
 */
async function fetchNcaabStartingLineups(homeTeam, awayTeam) {
  const genAI = getGeminiClient();
  if (!genAI) return null;
  
  try {
    const today = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
    
    const model = genAI.getGenerativeModel({
      model: 'gemini-3-flash-preview',
      tools: [{ google_search: {} }],
      generationConfig: { temperature: 0.1, maxOutputTokens: 1024 }
    });
    
    const prompt = `For the college basketball game ${awayTeam} @ ${homeTeam} on ${today}:

List the EXPECTED STARTING 5 for each team by position.
Format EXACTLY like this:

${homeTeam} STARTERS:
PG: [Player Name]
SG: [Player Name]
SF: [Player Name]
PF: [Player Name]
C: [Player Name]

${awayTeam} STARTERS:
PG: [Player Name]
SG: [Player Name]
SF: [Player Name]
PF: [Player Name]
C: [Player Name]

Also note any players who are OUT or GTD (game-time decision).
Use Rotowire, ESPN, or team beat reporters for lineup info.`;

    const result = await model.generateContent(prompt);
    const text = result.response.text();
    
    console.log('[Scout Report] 🏀 Fetched NCAAB starting lineups via Gemini Grounding');
    
    const parseLineup = (teamName) => {
      const positions = ['PG', 'SG', 'SF', 'PF', 'C'];
      const starters = [];
      const teamSection = text.split(teamName)?.[1]?.split(/\n\n/)?.[0] || '';
      
      positions.forEach(pos => {
        const regex = new RegExp(`${pos}[:\\s]+([A-Za-z\\s\\.\\-']+)`, 'i');
        const match = teamSection.match(regex);
        if (match && match[1]) {
          const playerName = match[1].trim().replace(/[\n\r]/g, '').split(/[,\n]/)[0].trim();
          if (playerName && playerName.length > 2) {
            starters.push({ position: pos, name: playerName });
          }
        }
      });
      
      return starters;
    };
    
    return { home: parseLineup(homeTeam), away: parseLineup(awayTeam) };
  } catch (error) {
    console.warn('[Scout Report] Could not fetch NCAAB starting lineups:', error.message);
    return null;
  }
}

/**
 * Format NCAAB key players section - ROTOWIRE STYLE
 * Based on https://www.rotowire.com/daily/ncaab/lineups.php format
 */
function formatNcaabKeyPlayers(homeTeam, awayTeam, keyPlayers) {
  if (!keyPlayers || (!keyPlayers.home && !keyPlayers.away)) {
    return '';
  }
  
  const formatStarter = (player) => {
    const pos = player.starterPosition || player.position || 'N/A';
    const jersey = player.jerseyNumber ? ` #${player.jerseyNumber}` : '';
    const stats = `${player.ppg?.toFixed(1) || '0'} PPG / ${player.rpg?.toFixed(1) || '0'} RPG / ${player.apg?.toFixed(1) || '0'} APG`;
    const shooting = player.fgPct > 0 ? ` | ${(player.fgPct * 100).toFixed(1)}% FG` : '';
    const injury = player.injuryStatus ? ` ⚠️${player.injuryStatus}` : '';
    return `  ${pos}: ${player.name}${jersey}\n       📊 ${stats}${shooting}${injury}`;
  };
  
  const formatBench = (player) => {
    const stats = `${player.ppg?.toFixed(1) || '0'}/${player.rpg?.toFixed(1) || '0'}/${player.apg?.toFixed(1) || '0'}`;
    return `  • ${player.position}: ${player.name} (${stats})`;
  };
  
  const formatInjured = (player) => {
    const stats = player.ppg > 0 ? ` - was averaging ${player.ppg.toFixed(1)} PPG` : '';
    return `  🚫 ${player.position}: ${player.name} - ${player.injuryStatus}${stats}`;
  };
  
  const formatTeamSection = (teamName, teamData, isHome) => {
    if (!teamData) return '';
    const lines = [];
    const emoji = isHome ? '🏠' : '✈️';
    lines.push(`${emoji} ${teamName}`);
    
    if (teamData.starters?.length > 0) {
      lines.push('  📋 EXPECTED STARTING LINEUP:');
      teamData.starters.forEach(p => lines.push(formatStarter(p)));
    }
    
    if (teamData.bench?.length > 0) {
      lines.push('  🔄 KEY BENCH:');
      teamData.bench.forEach(p => lines.push(formatBench(p)));
    }
    
    if (teamData.mayNotPlay?.length > 0) {
      lines.push('  ⚠️ MAY NOT PLAY:');
      teamData.mayNotPlay.forEach(p => lines.push(formatInjured(p)));
    }
    
    return lines.join('\n');
  };
  
  return [
    '🏀 TONIGHT\'S LINEUPS (ROTOWIRE-STYLE)',
    '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
    '⚠️ CRITICAL: College basketball has massive transfer portal activity.',
    '   Players in "MAY NOT PLAY" should NOT factor into your analysis.',
    '',
    formatTeamSection(homeTeam, keyPlayers.home, true),
    '',
    formatTeamSection(awayTeam, keyPlayers.away, false),
    '',
    '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
    ''
  ].join('\n');
}

/**
 * Fetch key players for EPL teams
 * CRITICAL: Prevents hallucinations about transferred players (January window, summer window)
 */
async function fetchEplKeyPlayers(homeTeam, awayTeam, sport) {
  try {
    const bdlSport = sportToBdlKey(sport);
    if (bdlSport !== 'soccer_epl') {
      return null;
    }
    
    const teams = await ballDontLieService.getTeams(bdlSport);
    const homeTeamData = findTeam(teams, homeTeam);
    const awayTeamData = findTeam(teams, awayTeam);
    
    if (!homeTeamData && !awayTeamData) {
      console.warn('[Scout Report] Could not find team IDs for EPL roster lookup');
      return null;
    }
    
    console.log(`[Scout Report] Fetching EPL rosters for ${homeTeam} (ID: ${homeTeamData?.id}) and ${awayTeam} (ID: ${awayTeamData?.id})`);

    // EPL season runs August to May, so use current year for Aug-Dec, previous for Jan-May
    const currentYear = new Date().getFullYear();
    const currentMonth = new Date().getMonth() + 1; // 1-indexed for consistency
    // EPL: Aug(8)-Dec(12) = current year, Jan(1)-Jul(7) = previous year
    const season = currentMonth >= 8 ? currentYear : currentYear - 1;

    // Fetch active players for each team
    const [homePlayers, awayPlayers] = await Promise.all([
      homeTeamData ? ballDontLieService.getPlayersActive(bdlSport, { team_ids: [homeTeamData.id], per_page: 30 }) : [],
      awayTeamData ? ballDontLieService.getPlayersActive(bdlSport, { team_ids: [awayTeamData.id], per_page: 30 }) : []
    ]);
    
    console.log(`[Scout Report] EPL roster: ${homeTeam} (${homePlayers.length} players), ${awayTeam} (${awayPlayers.length} players)`);
    
    // Try to get stats leaders for context
    let statsLeaders = [];
    try {
      statsLeaders = await ballDontLieService.getStatsLeadersGeneric(bdlSport, { season, type: 'goals' });
    } catch (e) {
      console.warn('[Scout Report] Could not fetch EPL stats leaders:', e.message);
    }
    
    // Create a set of top scorers for highlighting
    const topScorerIds = new Set(statsLeaders.slice(0, 20).map(l => l.player?.id).filter(Boolean));
    
    // Process roster
    const processRoster = (players, teamName) => {
      if (!players || players.length === 0) return null;
      
      // Map players with position info
      const playersWithInfo = players.map(p => ({
        name: `${p.first_name} ${p.last_name}`,
        position: p.position || 'N/A',
        jerseyNumber: p.jersey_number,
        id: p.id,
        isTopScorer: topScorerIds.has(p.id)
      }));
      
      // Sort goalkeepers first, then by position, then top scorers
      const positionOrder = { 'Goalkeeper': 1, 'Defender': 2, 'Midfielder': 3, 'Forward': 4 };
      playersWithInfo.sort((a, b) => {
        const posA = positionOrder[a.position] || 5;
        const posB = positionOrder[b.position] || 5;
        if (posA !== posB) return posA - posB;
        if (a.isTopScorer !== b.isTopScorer) return a.isTopScorer ? -1 : 1;
        return 0;
      });
      
      // Take key players by position (GK, defenders, midfielders, forwards)
      const keyPlayers = playersWithInfo.slice(0, 15);
      
      console.log(`[Scout Report] ${teamName} EPL key players: ${keyPlayers.slice(0, 5).map(p => p.name).join(', ')}`);
      
      return keyPlayers;
    };
    
    const homeKeyPlayers = processRoster(homePlayers, homeTeam);
    const awayKeyPlayers = processRoster(awayPlayers, awayTeam);
    
    return {
      home: homeKeyPlayers,
      away: awayKeyPlayers,
      homeTeamName: homeTeam,
      awayTeamName: awayTeam
    };
  } catch (error) {
    console.error('[Scout Report] Error fetching EPL key players:', error.message);
    return null;
  }
}

/**
 * Format EPL key players section for display
 * CRITICAL: Tells the LLM who ACTUALLY plays for each team (transfer windows are big)
 */
function formatEplKeyPlayers(homeTeam, awayTeam, keyPlayers) {
  if (!keyPlayers || (!keyPlayers.home && !keyPlayers.away)) {
    return '';
  }
  
  const formatPlayer = (player) => {
    const jersey = player.jerseyNumber ? ` #${player.jerseyNumber}` : '';
    const topScorer = player.isTopScorer ? ' ⭐' : '';
    return `  • ${player.position}: ${player.name}${jersey}${topScorer}`;
  };
  
  const lines = [
    '⚽ CURRENT SQUADS (WHO ACTUALLY PLAYS FOR EACH TEAM)',
    '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
    '⚠️ CRITICAL: EPL has January and summer transfer windows.',
    '   Only mention players listed below - others may have been transferred/loaned.',
    ''
  ];
  
  if (keyPlayers.home && keyPlayers.home.length > 0) {
    lines.push(`${homeTeam}:`);
    keyPlayers.home.forEach(player => {
      lines.push(formatPlayer(player));
    });
    lines.push('');
  }
  
  if (keyPlayers.away && keyPlayers.away.length > 0) {
    lines.push(`${awayTeam}:`);
    keyPlayers.away.forEach(player => {
      lines.push(formatPlayer(player));
    });
    lines.push('');
  }
  
  lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  lines.push('');
  
  return lines.join('\n');
}

/**
 * Format NHL key players section for display
 */
/**
 * Format NHL key players section - ROTOWIRE STYLE
 * Based on https://www.rotowire.com/hockey/nhl-lineups.php format
 * Shows: Forward Lines (sorted by points), Defense Pairs, Goalies (with stats)
 */
function formatNhlKeyPlayers(homeTeam, awayTeam, keyPlayers) {
  if (!keyPlayers || (!keyPlayers.home && !keyPlayers.away)) {
    return '';
  }
  
  const formatForward = (player, lineNum) => {
    const stats = player.gamesPlayed > 0 
      ? `${player.goals}G / ${player.assists}A / ${player.points}P | ${player.plusMinus >= 0 ? '+' : ''}${player.plusMinus}`
      : 'No stats';
    return `       ${player.position || 'F'}: ${player.name}\n          📊 ${stats}`;
  };
  
  const formatDefenseman = (player) => {
    const stats = player.gamesPlayed > 0 
      ? `${player.goals}G / ${player.assists}A / ${player.points}P | ${player.plusMinus >= 0 ? '+' : ''}${player.plusMinus}`
      : 'No stats';
    return `       D: ${player.name}\n          📊 ${stats}`;
  };
  
  const formatGoalie = (player, isStarter) => {
    const role = isStarter ? '🥅 PROJECTED STARTER' : '🪑 BACKUP';
    if (player.gamesPlayed > 0) {
      const record = `${player.wins}W-${player.losses}L`;
      const savePct = player.savePct ? `${player.savePct}% SV` : '?% SV';
      const gaa = player.gaa ? `${player.gaa} GAA` : '? GAA';
      const shutouts = player.shutouts > 0 ? ` | ${player.shutouts} SO` : '';
      return `  ${role}: ${player.name}\n       📊 ${record} | ${savePct} | ${gaa}${shutouts}`;
    }
    return `  ${role}: ${player.name} (No stats)`;
  };
  
  const formatTeamSection = (teamName, players, isHome) => {
    if (!players) return `${isHome ? '🏠' : '✈️'} ${teamName}: Roster unavailable`;
    
    const lines = [];
    const emoji = isHome ? '🏠' : '✈️';
    lines.push(`${emoji} ${teamName}`);
    
    // GOALIES FIRST (most important for betting)
    if (players.goalies && players.goalies.length > 0) {
      lines.push('  🎯 GOALTENDERS:');
      players.goalies.forEach((g, i) => lines.push(formatGoalie(g, i === 0)));
    }
    
    // TOP FORWARDS (by points)
    if (players.forwards && players.forwards.length > 0) {
      lines.push('  ⚡ TOP FORWARDS (by points):');
      players.forwards.forEach((f, i) => {
        lines.push(`    Line ${i + 1}:`);
        lines.push(formatForward(f, i + 1));
      });
    }
    
    // TOP DEFENSEMEN (by points)
    if (players.defensemen && players.defensemen.length > 0) {
      lines.push('  🛡️ TOP DEFENSEMEN:');
      players.defensemen.forEach((d, i) => {
        lines.push(`    Pair ${Math.ceil((i + 1) / 2)}:`);
        lines.push(formatDefenseman(d));
      });
    }
    
    return lines.join('\n');
  };
  
  const homeSection = formatTeamSection(homeTeam, keyPlayers.home, true);
  const awaySection = formatTeamSection(awayTeam, keyPlayers.away, false);

  return `
🏒 TONIGHT'S LINEUPS (ROTOWIRE-STYLE)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚠️ CRITICAL: Goalie confirmation is CRUCIAL for NHL betting.
   The projected starter may change - verify via Gemini Grounding context.

${homeSection}

${awaySection}

🚨 ROSTER RULES:
• ONLY mention players listed above
• Goalie matchup is often the most important factor
• Check injury context for any last-minute scratches
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`;
}

/**
 * Parse injuries from Grounding response
 * ENHANCED: Now handles multiple formats:
 * - "Player Name - Status - Injury - Return"
 * - "Player Name (Position): Status (Injury)"
 * - "• Player Name: OUT - injury description"
 */
function parseInjuriesFromGrounding(content, homeTeam, awayTeam) {
  const homeInjuries = [];
  const awayInjuries = [];

  if (!content) return { home: homeInjuries, away: awayInjuries };

  const lines = content.split('\n').map(line => line.trim()).filter(line => line);
  
  // Status keywords to detect in various formats
  const statusKeywords = ['OUT', 'DOUBTFUL', 'QUESTIONABLE', 'PROBABLE', 'GTD', 'DAY-TO-DAY', 'IR', 'DNP'];
  const statusRegex = new RegExp(`\\b(${statusKeywords.join('|')})\\b`, 'i');

  let currentTeam = null;
  for (const line of lines) {
    // Check for team name mentions
    const homeLower = homeTeam.toLowerCase();
    const awayLower = awayTeam.toLowerCase();
    const lineLower = line.toLowerCase();
    
    if (lineLower.includes(homeLower) || lineLower.includes(homeLower.split(' ')[0])) {
      currentTeam = 'home';
      continue; // Skip team header lines
    } else if (lineLower.includes(awayLower) || lineLower.includes(awayLower.split(' ')[0])) {
      currentTeam = 'away';
      continue; // Skip team header lines
    }
    
    // Skip lines that are just team names or headers
    if (!currentTeam) continue;
    
    // Check if this line contains an injury status
    const hasStatus = statusRegex.test(line);
    if (!hasStatus) continue;
    
    // Try multiple parsing patterns:
    let injuryObj = null;
    
    // Pattern 1: "Player Name (Position): STATUS (injury description)"
    const pattern1 = line.match(/^[•\-\*]?\s*([A-Za-z\.\'\-\s]+?)(?:\s*\([A-Z]{1,3}\))?\s*[:;]\s*(\w+(?:[-\s]\w+)?)\s*(?:\(([^)]+)\))?/i);
    if (pattern1) {
      injuryObj = {
        name: pattern1[1].trim(),
        status: pattern1[2].toUpperCase(),
        description: pattern1[3] || ''
      };
    }
    
    // Pattern 2: "Player Name - Status - Injury - Return"
    if (!injuryObj) {
      const parts = line.split(/\s*[-–—]\s*/).map(p => p.trim());
      if (parts.length >= 2) {
        // Find which part contains the status
        const statusIdx = parts.findIndex(p => statusRegex.test(p));
        if (statusIdx > 0) {
          injuryObj = {
            name: parts.slice(0, statusIdx).join(' ').replace(/^[•\-\*]\s*/, ''),
            status: parts[statusIdx].toUpperCase(),
            description: parts.slice(statusIdx + 1).join(' - ')
          };
        } else if (statusIdx === 0 && parts.length >= 2) {
          // Status first: "OUT - Player Name - injury"
          injuryObj = {
            name: parts[1],
            status: parts[0].toUpperCase(),
            description: parts.slice(2).join(' - ')
          };
        }
      }
    }
    
    // Pattern 3: Just look for "Name ... STATUS ... injury" anywhere
    if (!injuryObj) {
      const statusMatch = line.match(statusRegex);
      if (statusMatch) {
        const beforeStatus = line.substring(0, statusMatch.index).replace(/^[•\-\*\s]+/, '').trim();
        const afterStatus = line.substring(statusMatch.index + statusMatch[0].length).replace(/^[\s\-:]+/, '').trim();
        if (beforeStatus) {
          injuryObj = {
            name: beforeStatus.replace(/[:\-]+$/, '').trim(),
            status: statusMatch[1].toUpperCase(),
            description: afterStatus
          };
        }
      }
    }
    
    // Add to appropriate team if we parsed something
    if (injuryObj && injuryObj.name && injuryObj.name.length > 2) {
      if (currentTeam === 'home') {
        homeInjuries.push(injuryObj);
      } else if (currentTeam === 'away') {
        awayInjuries.push(injuryObj);
      }
    }
  }

  return { home: homeInjuries, away: awayInjuries };
}

/**
 * 2025-26 College Football Playoff Seeding (12-team bracket)
 * Hardcoded for the CURRENT 2025-26 season only.
 */
const CFP_2025_26_SEEDING = {
  // 4 Byes (seeds 1-4) - Conference Champions
  'Indiana Hoosiers': 1,
  'Indiana': 1,
  'Ohio State Buckeyes': 2,
  'Ohio State': 2,
  'Georgia Bulldogs': 3,
  'Georgia': 3,
  'Texas Tech Red Raiders': 4,
  'Texas Tech': 4,
  // First Round Hosts (seeds 5-8)
  'Oregon Ducks': 5,
  'Oregon': 5,
  'Ole Miss Rebels': 6,
  'Ole Miss': 6,
  'Texas A&M Aggies': 7,
  'Texas A&M': 7,
  'Oklahoma Sooners': 8,
  'Oklahoma': 8,
  // Remaining At-Large / G5 (seeds 9-12)
  'Alabama Crimson Tide': 9,
  'Alabama': 9,
  'Miami Hurricanes': 10,
  'Miami': 10,
  'Miami (FL)': 10,
  'Tulane Green Wave': 11,
  'Tulane': 11,
  'James Madison Dukes': 12,
  'James Madison': 12,
  'JMU': 12
};

/**
 * Get CFP seeding from hardcoded bracket
 */
function getCfpSeedingFromBracket(teamName) {
  if (!teamName) return null;
  
  // Direct match
  if (CFP_2025_26_SEEDING[teamName]) {
    return CFP_2025_26_SEEDING[teamName];
  }
  
  // Try partial match (school name only)
  const teamLower = teamName.toLowerCase();
  for (const [key, seed] of Object.entries(CFP_2025_26_SEEDING)) {
    if (teamLower.includes(key.toLowerCase()) || key.toLowerCase().includes(teamLower.split(' ')[0])) {
      return seed;
    }
  }
  
  return null;
}

/**
 * Parse CFP seeding from text response
 * Looks for patterns like "#8 Oklahoma", "#9 seed Alabama", "(8) Oklahoma", "8-seed Oklahoma"
 * Also handles "Ole Miss is the higher seed (No. 6)" style from search results
 */
function parseCfpSeeding(text, teamName) {
  if (!text || !teamName) return getCfpSeedingFromBracket(teamName);
  
  const schoolName = teamName.split(' ')[0]; // e.g., "Alabama" from "Alabama Crimson Tide"
  const schoolNames = [teamName, schoolName];
  
  // Add variations for common schools
  if (schoolName === 'Ole') schoolNames.push('Ole Miss');
  if (schoolName === 'Texas' && teamName.includes('A&M')) schoolNames.push('Texas A&M', 'A&M');
  if (schoolName === 'James' && teamName.includes('Madison')) schoolNames.push('JMU', 'James Madison');
  
  const patterns = [];
  
  for (const name of schoolNames) {
    const escapedName = escapeRegex(name);
    patterns.push(
      // #8 Oklahoma, #9 Alabama
      new RegExp(`#(\\d+)\\s*(?:seed\\s+)?${escapedName}`, 'i'),
      // Oklahoma (8), Miami (10)
      new RegExp(`${escapedName}\\s*\\(#?(\\d+)\\)`, 'i'),
      // (8) Oklahoma
      new RegExp(`\\((\\d+)\\)\\s*${escapedName}`, 'i'),
      // 8-seed Oklahoma, 9 seed Alabama
      new RegExp(`(\\d+)[-\\s]seed\\s+${escapedName}`, 'i'),
      // No. 8 Oklahoma
      new RegExp(`no\\.?\\s*(\\d+)\\s+${escapedName}`, 'i'),
      // Oklahoma #8
      new RegExp(`${escapedName}\\s+#(\\d+)`, 'i'),
      // "Ole Miss is ... (No. 6)" style from search results
      new RegExp(`${escapedName}\\s+is\\s+.*?\\(no\\.?\\s*(\\d+)\\)`, 'i'),
      new RegExp(`${escapedName}\\s+is\\s+.*?no\\.?\\s*(\\d+)\\s+seed`, 'i'),
      new RegExp(`${escapedName}\\s+is\\s+the\\s+(?:higher|lower)?\\s*seed\\s*\\(no\\.?\\s*(\\d+)\\)`, 'i'),
      // "No. 6 seed Ole Miss" or "the No. 11 seed, Tulane"
      new RegExp(`no\\.?\\s*(\\d+)\\s+seed[,\\s]+${escapedName}`, 'i'),
      new RegExp(`the\\s+no\\.?\\s*(\\d+)\\s+seed[,\\s]+${escapedName}`, 'i'),
      // Handle "Tulane is No. 11"
      new RegExp(`${escapedName}\\s+is\\s+no\\.?\\s*(\\d+)`, 'i')
    );
  }
  
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match && match[1]) {
      const seed = parseInt(match[1], 10);
      if (seed >= 1 && seed <= 16) {  // Valid CFP seeds are 1-12, but allow some buffer
        return seed;
      }
    }
  }
  
  // Fallback to hardcoded bracket if regex fails
  return getCfpSeedingFromBracket(teamName);
}

/**
 * Escape special regex characters in a string
 */
function escapeRegex(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Parse venue from CFP context text
 */
function parseCfpVenue(text) {
  if (!text) return null;
  
  // Common CFP venue patterns
  const venuePatterns = [
    // Stadium names
    /(?:at|in)\s+([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)*\s+Stadium)/i,
    /([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)*\s+Stadium)(?:\s+in\s+[A-Z][a-zA-Z]+)?/i,
    // Bowl game venues
    /(Rose\s+Bowl)/i,
    /(Sugar\s+Bowl)/i,
    /(Orange\s+Bowl)/i,
    /(Cotton\s+Bowl)/i,
    /(Peach\s+Bowl)/i,
    /(Fiesta\s+Bowl)/i,
    // Arena/Field names
    /(?:at|in)\s+([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)*\s+(?:Field|Arena|Dome|Center))/i,
    // Specific stadiums
    /(Hard\s+Rock\s+Stadium)/i,
    /(AT&T\s+Stadium)/i,
    /(Mercedes-Benz\s+Stadium)/i,
    /(Superdome)/i,
    /(State\s+Farm\s+Stadium)/i,
    /(Raymond\s+James\s+Stadium)/i,
    /(Lucas\s+Oil\s+Stadium)/i,
    /(SoFi\s+Stadium)/i,
    /(Allegiant\s+Stadium)/i,
    // University stadiums - common CFP first round venues
    /(Bryant-Denny\s+Stadium)/i,
    /(Ohio\s+Stadium)/i,
    /(Beaver\s+Stadium)/i,
    /(Kyle\s+Field)/i,
    /(Sanford\s+Stadium)/i,
    /(Tiger\s+Stadium)/i,
    /(Neyland\s+Stadium)/i,
    /(Memorial\s+Stadium)/i,
    /(DKR.*?Stadium)/i,
    /(Gaylord\s+Family.*?Stadium)/i,
    /(Oklahoma\s+Memorial\s+Stadium)/i,
    // Additional CFP venues
    /(Autzen\s+Stadium)/i,
    /(Vaught.?Hemingway\s+Stadium)/i,
    /(Doak\s+Campbell\s+Stadium)/i,
    /(Williams-Brice\s+Stadium)/i,
    /(Camp\s+Randall\s+Stadium)/i,
    /(Michigan\s+Stadium)/i,
    /(Notre\s+Dame\s+Stadium)/i,
    /(Ross-Ade\s+Stadium)/i,
    /(Kinnick\s+Stadium)/i,
    /(Spartan\s+Stadium)/i,
    /(Albertsons\s+Stadium)/i,
    /(Sun\s+Devil\s+Stadium)/i,
    /(Death\s+Valley)/i,
    /(The\s+Swamp)/i,
    /(Ben\s+Hill\s+Griffin\s+Stadium)/i
  ];
  
  for (const pattern of venuePatterns) {
    const match = text.match(pattern);
    if (match && match[1]) {
      return match[1].trim();
    }
  }
  
  return null;
}

/**
 * CFP team to home stadium mapping (fallback for venue extraction)
 * Updated for 2025-26 CFP bracket
 */
const CFP_HOME_STADIUMS = {
  // 2025-26 CFP First Round hosts (seeds 5-8)
  'Oregon Ducks': 'Autzen Stadium',
  'Oregon': 'Autzen Stadium',
  'Ole Miss Rebels': 'Vaught-Hemingway Stadium',
  'Ole Miss': 'Vaught-Hemingway Stadium',
  'Texas A&M Aggies': 'Kyle Field',
  'Texas A&M': 'Kyle Field',
  'Oklahoma Sooners': 'Gaylord Family Oklahoma Memorial Stadium',
  'Oklahoma': 'Gaylord Family Oklahoma Memorial Stadium',
  // Bye teams (seeds 1-4)
  'Indiana Hoosiers': 'Memorial Stadium',
  'Indiana': 'Memorial Stadium',
  'Ohio State Buckeyes': 'Ohio Stadium',
  'Ohio State': 'Ohio Stadium',
  'Georgia Bulldogs': 'Sanford Stadium',
  'Georgia': 'Sanford Stadium',
  'Texas Tech Red Raiders': 'Jones AT&T Stadium',
  'Texas Tech': 'Jones AT&T Stadium',
  // Away teams in First Round (seeds 9-12)
  'Alabama Crimson Tide': 'Bryant-Denny Stadium',
  'Alabama': 'Bryant-Denny Stadium',
  'Miami Hurricanes': 'Hard Rock Stadium',
  'Miami': 'Hard Rock Stadium',
  'Tulane Green Wave': 'Yulman Stadium',
  'Tulane': 'Yulman Stadium',
  'James Madison Dukes': 'Bridgeforth Stadium',
  'James Madison': 'Bridgeforth Stadium',
  'JMU Dukes': 'Bridgeforth Stadium',
  'JMU': 'Bridgeforth Stadium'
};

/**
 * Get CFP home stadium for a team (fallback)
 */
function getCfpHomeStadium(teamName) {
  if (!teamName) return null;
  
  // Direct match
  if (CFP_HOME_STADIUMS[teamName]) {
    return CFP_HOME_STADIUMS[teamName];
  }
  
  // Partial match
  const teamLower = teamName.toLowerCase();
  for (const [key, stadium] of Object.entries(CFP_HOME_STADIUMS)) {
    if (teamLower.includes(key.toLowerCase()) || key.toLowerCase().includes(teamLower.split(' ')[0])) {
      return stadium;
    }
  }
  
  return null;
}

/**
 * Detect CFP round from text
 * Order matters - check specific rounds before generic terms
 */
function detectCfpRound(text) {
  if (!text) return null;
  
  const lowerText = text.toLowerCase();
  
  // Check First Round FIRST - most common for Dec 20-21 CFP games
  if (lowerText.includes('first round') || lowerText.includes('first-round') || lowerText.includes('opening round')) {
    return 'CFP First Round';
  }
  // Quarterfinal (Jan 1)
  if (lowerText.includes('quarterfinal') || lowerText.includes('quarter-final')) {
    return 'CFP Quarterfinal';
  }
  // Semifinal
  if (lowerText.includes('semifinal') || lowerText.includes('semi-final')) {
    return 'CFP Semifinal';
  }
  // Championship - be more specific to avoid false matches
  if (lowerText.includes('national championship') || lowerText.includes('cfp championship') || 
      (lowerText.includes('championship game') && !lowerText.includes('first round'))) {
    return 'CFP Championship';
  }
  // Generic CFP fallback
  if (lowerText.includes('playoff') || lowerText.includes('cfp')) {
    return 'CFP Playoff';
  }
  
  return null;
}

/**
 * BOWL GAME TIER SYSTEM
 * Determines the tier of a bowl game and its motivation implications
 * 
 * TIER 1 (Both teams highly motivated):
 * - CFP Playoff games (all rounds)
 * - NY6 Bowls (Rose, Sugar, Orange, Cotton, Peach, Fiesta)
 * 
 * TIER 2 (Generally motivated, some opt-outs possible):
 * - Major conference bowls (Citrus, Music City, Gator, etc.)
 * - Premium mid-tier bowls with good payouts
 * 
 * TIER 3 (Motivation asymmetry common):
 * - Lower-tier bowls (First Responder, Gasparilla, etc.)
 * - Transfer portal window creates opt-out risk
 * - One team often "wants it more"
 * 
 * TIER 4 (High variance, significant opt-out risk):
 * - Minor bowls with low payouts
 * - Both teams may have significant roster attrition
 */
function determineBowlTier(game, homeTeam, awayTeam) {
  // Get bowl name from game data
  const bowlName = (game.name || game.title || game.bowl_name || '').toLowerCase();
  const venue = (game.venue || '').toLowerCase();
  
  // TIER 1: CFP and NY6 Bowls - Maximum motivation
  const tier1Bowls = [
    'cfp', 'playoff', 'national championship', 'championship game',
    'rose bowl', 'sugar bowl', 'orange bowl', 'cotton bowl', 'peach bowl', 'fiesta bowl'
  ];
  
  // Check if both teams are in the CFP bracket - strongly suggests a TIER 1 game during bowl season
  const isCfpMatchup = getCfpSeedingFromBracket(homeTeam) !== null && getCfpSeedingFromBracket(awayTeam) !== null;
  const gameDate = new Date(game.commence_time || game.date);
  const month = gameDate.getMonth();
  const day = gameDate.getDate();
  const isBowlSeason = (month === 11 && day >= 14) || (month === 0 && day <= 15);

  let tier = 3; // Default to tier 3 (common bowl game)
  let tierName = '';
  let motivationContext = '';
  
  // Force TIER 1 if it's a CFP matchup during bowl season
  let identifiedAsTier1 = false;
  for (const bowl of tier1Bowls) {
    if (bowlName.includes(bowl) || venue.includes(bowl)) {
      identifiedAsTier1 = true;
      break;
    }
  }
  
  if (identifiedAsTier1 || (isCfpMatchup && isBowlSeason)) {
    tier = 1;
    tierName = 'TIER 1 (CFP/NY6)';
    motivationContext = `
⚡ TIER 1 BOWL - HIGH STAKES
• Both teams are highly motivated - significant program accomplishment at stake
• Minimal opt-outs expected - players want to compete for major prizes
• Transfer portal has limited impact - stars want to showcase on this stage
• BETTING IMPLICATION: Base analysis on season-long metrics; rosters likely intact`;
  }
  
  // Check for tier 2 if not already tier 1
  if (tier !== 1) {
    for (const bowl of tier2Bowls) {
      if (bowlName.includes(bowl) || venue.includes(bowl)) {
        tier = 2;
        tierName = 'TIER 2 (Major Conference)';
        motivationContext = `
⚡ TIER 2 BOWL - MODERATE STAKES
• Generally motivated teams with some NFL-bound opt-outs possible
• Top draft prospects may sit; depth players want to showcase
• Check for specific opt-out announcements in Grounded Context above
• BETTING IMPLICATION: Verify star players are playing; slight edge to "hungrier" team`;
        break;
      }
    }
  }
  
  // Check for tier 3
  if (tier !== 1 && tier !== 2) {
    for (const bowl of tier3Bowls) {
      if (bowlName.includes(bowl) || venue.includes(bowl)) {
        tier = 3;
        tierName = 'TIER 3 (Lower-Tier)';
        break;
      }
    }
  }
  
  // Default tier 3 message for lower-tier bowls
  if (tier === 3) {
    tierName = 'TIER 3 (Lower-Tier)';
    motivationContext = `
⚠️ TIER 3 BOWL - MOTIVATION ASYMMETRY LIKELY
• Transfer portal window is OPEN - expect significant roster attrition
• Coach statements about "10-15 missing players" are common at this tier
• One team often "wants it more" - look for team entering with momentum
• Teams with losing records may have lower buy-in
• BETTING IMPLICATION: Heavily weight Grounded Context about opt-outs/motivation
• EDGE OPPORTUNITY: The underdog is often the more motivated team at this tier`;
  }
  
  // Build the section
  const section = `Bowl Tier: ${tierName}
${motivationContext}`;
  
  console.log(`[Scout Report] Bowl tier determined: ${tierName}`);
  
  return {
    tier,
    tierName,
    motivationContext,
    section
  };
}

/**
 * Fetch bowl game / CFP context for NCAAF games
 * Determines if this is a CFP game or bowl game and gets context
 * Also extracts and sets CFP seeding, venue, and round on the game object
 */
async function fetchBowlGameContext(homeTeam, awayTeam, game, groundingText = null) {
  try {
    // Check if this is likely a bowl/CFP game (December 14 - January 15)
    const gameDate = new Date(game.commence_time || game.date);
    const month = gameDate.getMonth(); // 0-indexed
    const day = gameDate.getDate();
    
    // Bowl/CFP season: Dec 14 - Jan 15 (month 11 = December, month 0 = January)
    const isBowlSeason = (month === 11 && day >= 14) || (month === 0 && day <= 15);
    
    if (!isBowlSeason) {
      return '';
    }
    
    console.log(`[Scout Report] Fetching bowl/CFP context for ${awayTeam} vs ${homeTeam}`);
    
    // Determine bowl tier and motivation context
    const bowlTierInfo = determineBowlTier(game, homeTeam, awayTeam);
    
    // Set tournament context and CFP info on the game object for storage
    if (bowlTierInfo) {
      // Normalize bowl name for the badge
      let bowlName = (game.name || game.title || game.bowl_name || '').trim();
      
      // If BDL name is missing, try to extract from grounding text
      if (!bowlName && groundingText) {
        const bowlNames = ['Rose Bowl', 'Sugar Bowl', 'Orange Bowl', 'Cotton Bowl', 'Peach Bowl', 'Fiesta Bowl', 
                          'Citrus Bowl', 'ReliaQuest Bowl', 'Alamo Bowl', 'Sun Bowl', 'Music City Bowl', 'Gator Bowl'];
        for (const name of bowlNames) {
          if (groundingText.includes(name)) {
            bowlName = name;
            break;
          }
        }
      }
      
      // Fallback to Tier Name if still no specific bowl name
      game.tournamentContext = bowlName || bowlTierInfo.tierName;
      
      if (bowlTierInfo.tier === 1) {
        // Use grounding text if available for more accurate round detection
        const textForRoundDetection = (groundingText || '') + (game.name || '') + (game.title || '');
        game.cfpRound = detectCfpRound(textForRoundDetection);
        game.homeSeed = getCfpSeedingFromBracket(homeTeam);
        game.awaySeed = getCfpSeedingFromBracket(awayTeam);
      }
    }
    
    // Bowl context now provided by Gemini Grounding
    // Bowl/CFP context is captured in the main Gemini Grounding search
    // which provides coaching changes, opt-outs, injuries, venue info, etc.
    console.log('[Scout Report] Using Gemini Grounding for bowl context');
    
    // Return bowl tier context section
    if (bowlTierInfo) {
      return `
🏈 BOWL GAME TIER & MOTIVATION CONTEXT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${bowlTierInfo.section}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

`;
    }
    return '';
  } catch (error) {
    console.error('[Scout Report] Error fetching bowl/CFP context:', error.message);
    return '';
  }
}

/**
 * Fetch key players for both NCAAF teams
 * Uses roster + season stats to show who's on the team
 * This prevents hallucinations about players who've transferred
 */
async function fetchNcaafKeyPlayers(homeTeam, awayTeam, sport) {
  try {
    const bdlSport = sportToBdlKey(sport);
    if (bdlSport !== 'americanfootball_ncaaf') {
      return null;
    }
    
    const teams = await ballDontLieService.getTeams(bdlSport);
    const homeTeamData = findTeam(teams, homeTeam);
    const awayTeamData = findTeam(teams, awayTeam);
    
    if (!homeTeamData && !awayTeamData) {
      console.warn('[Scout Report] Could not find team IDs for NCAAF roster lookup');
      return null;
    }
    
    console.log(`[Scout Report] Fetching NCAAF rosters for ${homeTeam} (ID: ${homeTeamData?.id}) and ${awayTeam} (ID: ${awayTeamData?.id})`);
    
    // NCAAF season: Calculate dynamically - Aug-Dec = current year, Jan-Jul = previous year
    const ncaafMonth = new Date().getMonth() + 1;
    const ncaafYear = new Date().getFullYear();
    const season = ncaafMonth <= 7 ? ncaafYear - 1 : ncaafYear;
    
    // Fetch rosters and season stats for both teams in parallel
    const [homePlayers, awayPlayers, homeStats, awayStats] = await Promise.all([
      homeTeamData ? ballDontLieService.getNcaafTeamPlayers(homeTeamData.id) : [],
      awayTeamData ? ballDontLieService.getNcaafTeamPlayers(awayTeamData.id) : [],
      homeTeamData ? ballDontLieService.getNcaafPlayerSeasonStats(homeTeamData.id, season) : [],
      awayTeamData ? ballDontLieService.getNcaafPlayerSeasonStats(awayTeamData.id, season) : []
    ]);
    
    // Process each team's roster to get key players with stats
    const processTeamRoster = (players, seasonStats, teamName) => {
      if (!players || players.length === 0) return null;
      
      // Create a map of player stats by player ID
      const statsMap = {};
      (seasonStats || []).forEach(stat => {
        if (stat.player?.id) {
          // Only keep most recent season stats if multiple entries
          if (!statsMap[stat.player.id] || stat.season > (statsMap[stat.player.id].season || 0)) {
            statsMap[stat.player.id] = stat;
          }
        }
      });
      
      // Group by position
      const qbs = players.filter(p => ['QB'].includes(p.position_abbreviation?.toUpperCase()));
      const rbs = players.filter(p => ['RB', 'FB'].includes(p.position_abbreviation?.toUpperCase()));
      const wrs = players.filter(p => ['WR'].includes(p.position_abbreviation?.toUpperCase()));
      const tes = players.filter(p => ['TE'].includes(p.position_abbreviation?.toUpperCase()));
      const defensePlayers = players.filter(p => ['LB', 'DE', 'DT', 'CB', 'S', 'DB', 'DL', 'EDGE', 'NT', 'OLB', 'ILB', 'MLB', 'FS', 'SS'].includes(p.position_abbreviation?.toUpperCase()));
      
      // Enrich with stats and sort by production
      const enrichPlayer = (player) => {
        const stats = statsMap[player.id] || {};
        return {
          ...player,
          seasonStats: stats
        };
      };
      
      // Sort QBs by passing yards
      const sortedQBs = qbs.map(enrichPlayer)
        .sort((a, b) => (b.seasonStats.passing_yards || 0) - (a.seasonStats.passing_yards || 0))
        .slice(0, 2);
      
      // Sort RBs by rushing yards
      const sortedRBs = rbs.map(enrichPlayer)
        .sort((a, b) => (b.seasonStats.rushing_yards || 0) - (a.seasonStats.rushing_yards || 0))
        .slice(0, 2);
      
      // Sort WRs by receiving yards
      const sortedWRs = wrs.map(enrichPlayer)
        .sort((a, b) => (b.seasonStats.receiving_yards || 0) - (a.seasonStats.receiving_yards || 0))
        .slice(0, 3);
      
      // Sort TEs by receiving yards
      const sortedTEs = tes.map(enrichPlayer)
        .sort((a, b) => (b.seasonStats.receiving_yards || 0) - (a.seasonStats.receiving_yards || 0))
        .slice(0, 1);
      
      // Sort defense by tackles
      const sortedDefense = defensePlayers.map(enrichPlayer)
        .sort((a, b) => (b.seasonStats.total_tackles || 0) - (a.seasonStats.total_tackles || 0))
        .slice(0, 4);
      
      return {
        qbs: sortedQBs.map(p => ({
          name: `${p.first_name} ${p.last_name}`,
          position: 'QB',
          jersey: p.jersey_number,
          passingYards: p.seasonStats.passing_yards || 0,
          passingTDs: p.seasonStats.passing_touchdowns || 0,
          passingINTs: p.seasonStats.passing_interceptions || 0,
          rushingYards: p.seasonStats.rushing_yards || 0,
          rushingTDs: p.seasonStats.rushing_touchdowns || 0,
          qbRating: p.seasonStats.passing_rating?.toFixed(1) || null
        })),
        rbs: sortedRBs.map(p => ({
          name: `${p.first_name} ${p.last_name}`,
          position: 'RB',
          jersey: p.jersey_number,
          rushingYards: p.seasonStats.rushing_yards || 0,
          rushingTDs: p.seasonStats.rushing_touchdowns || 0,
          rushingAvg: p.seasonStats.rushing_avg?.toFixed(1) || null,
          receptions: p.seasonStats.receptions || 0,
          receivingYards: p.seasonStats.receiving_yards || 0
        })),
        wrs: sortedWRs.map(p => ({
          name: `${p.first_name} ${p.last_name}`,
          position: 'WR',
          jersey: p.jersey_number,
          receptions: p.seasonStats.receptions || 0,
          receivingYards: p.seasonStats.receiving_yards || 0,
          receivingTDs: p.seasonStats.receiving_touchdowns || 0,
          receivingAvg: p.seasonStats.receiving_avg?.toFixed(1) || null
        })),
        tes: sortedTEs.map(p => ({
          name: `${p.first_name} ${p.last_name}`,
          position: 'TE',
          jersey: p.jersey_number,
          receptions: p.seasonStats.receptions || 0,
          receivingYards: p.seasonStats.receiving_yards || 0,
          receivingTDs: p.seasonStats.receiving_touchdowns || 0
        })),
        defense: sortedDefense.map(p => ({
          name: `${p.first_name} ${p.last_name}`,
          position: p.position_abbreviation,
          jersey: p.jersey_number,
          tackles: p.seasonStats.total_tackles || 0,
          sacks: p.seasonStats.sacks || 0,
          interceptions: p.seasonStats.interceptions || 0,
          tacklesForLoss: p.seasonStats.tackles_for_loss || 0
        }))
      };
    };
    
    const homeKeyPlayers = processTeamRoster(homePlayers, homeStats, homeTeam);
    const awayKeyPlayers = processTeamRoster(awayPlayers, awayStats, awayTeam);
    
    const homeCount = (homeKeyPlayers?.qbs?.length || 0) + (homeKeyPlayers?.rbs?.length || 0) + 
                      (homeKeyPlayers?.wrs?.length || 0) + (homeKeyPlayers?.tes?.length || 0) + 
                      (homeKeyPlayers?.defense?.length || 0);
    const awayCount = (awayKeyPlayers?.qbs?.length || 0) + (awayKeyPlayers?.rbs?.length || 0) + 
                      (awayKeyPlayers?.wrs?.length || 0) + (awayKeyPlayers?.tes?.length || 0) + 
                      (awayKeyPlayers?.defense?.length || 0);
    
    console.log(`[Scout Report] ✓ NCAAF Key players: ${homeTeam} (${homeCount} players), ${awayTeam} (${awayCount} players)`);
    
    return {
      home: homeKeyPlayers,
      away: awayKeyPlayers
    };
  } catch (error) {
    console.error('[Scout Report] Error fetching NCAAF key players:', error.message);
    return null;
  }
}

/**
 * Format NCAAF key players section for display
 */
function formatNcaafKeyPlayers(homeTeam, awayTeam, keyPlayers) {
  if (!keyPlayers || (!keyPlayers.home && !keyPlayers.away)) {
    return '';
  }
  
  const formatQB = (player) => {
    const stats = player.passingYards > 0 
      ? ` - ${player.passingYards} yds, ${player.passingTDs} TD, ${player.passingINTs} INT${player.qbRating ? `, ${player.qbRating} QBR` : ''}`
      : '';
    return `  • QB: #${player.jersey || '?'} ${player.name}${stats}`;
  };
  
  const formatRB = (player) => {
    const stats = player.rushingYards > 0 
      ? ` - ${player.rushingYards} rush yds, ${player.rushingTDs} TD${player.rushingAvg ? ` (${player.rushingAvg} avg)` : ''}`
      : '';
    return `  • RB: #${player.jersey || '?'} ${player.name}${stats}`;
  };
  
  const formatWR = (player) => {
    const stats = player.receivingYards > 0 
      ? ` - ${player.receptions} rec, ${player.receivingYards} yds, ${player.receivingTDs} TD`
      : '';
    return `  • WR: #${player.jersey || '?'} ${player.name}${stats}`;
  };
  
  const formatTE = (player) => {
    const stats = player.receivingYards > 0 
      ? ` - ${player.receptions} rec, ${player.receivingYards} yds, ${player.receivingTDs} TD`
      : '';
    return `  • TE: #${player.jersey || '?'} ${player.name}${stats}`;
  };
  
  const formatDefense = (player) => {
    const stats = player.tackles > 0 
      ? ` - ${player.tackles} tkl${player.sacks ? `, ${player.sacks} sck` : ''}${player.interceptions ? `, ${player.interceptions} INT` : ''}`
      : '';
    return `  • ${player.position}: #${player.jersey || '?'} ${player.name}${stats}`;
  };
  
  const formatTeamSection = (teamName, players, isHome) => {
    if (!players) return `${isHome ? '🏠' : '✈️'} ${teamName}: Roster unavailable`;
    
    const lines = [`${isHome ? '🏠' : '✈️'} ${teamName}:`];
    
    if (players.qbs && players.qbs.length > 0) {
      lines.push('  QUARTERBACK:');
      players.qbs.forEach(p => lines.push(formatQB(p)));
    }
    
    if (players.rbs && players.rbs.length > 0) {
      lines.push('  RUNNING BACKS:');
      players.rbs.forEach(p => lines.push(formatRB(p)));
    }
    
    if (players.wrs && players.wrs.length > 0) {
      lines.push('  WIDE RECEIVERS:');
      players.wrs.forEach(p => lines.push(formatWR(p)));
    }
    
    if (players.tes && players.tes.length > 0) {
      lines.push('  TIGHT ENDS:');
      players.tes.forEach(p => lines.push(formatTE(p)));
    }
    
    if (players.defense && players.defense.length > 0) {
      lines.push('  KEY DEFENDERS:');
      players.defense.forEach(p => lines.push(formatDefense(p)));
    }
    
    return lines.join('\n');
  };
  
  const homeSection = formatTeamSection(homeTeam, keyPlayers.home, true);
  const awaySection = formatTeamSection(awayTeam, keyPlayers.away, false);
  
  return `
🏈 KEY PLAYERS (CURRENT ROSTER - USE THESE NAMES)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${homeSection}

${awaySection}

⚠️ CRITICAL: Only reference players listed above. Do NOT mention players
not on this roster - they may have transferred, entered the draft, or are injured.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`;
}

/**
 * NCAAF Conference Tier Mapping
 * Uses BDL conference IDs (from /ncaaf/v1/conferences)
 * Tiers reflect typical talent/resources, NOT current performance
 */

// BDL Conference ID to Tier Mapping
const CONFERENCE_ID_TIERS = {
  // Tier 1: Elite Power 4
  10: { tier: 1, name: 'SEC', label: 'Elite Power 4' },
  4: { tier: 1, name: 'Big Ten', label: 'Elite Power 4' },
  // Tier 2: Power 4
  1: { tier: 2, name: 'ACC', label: 'Power 4' },
  3: { tier: 2, name: 'Big 12', label: 'Power 4' },
  9: { tier: 2, name: 'Pac-12', label: 'Power 4' },
  6: { tier: 2, name: 'FBS Indep.', label: 'FBS Independent' },
  // Tier 3: Upper G5
  2: { tier: 3, name: 'American', label: 'Upper G5' },
  8: { tier: 3, name: 'Mountain West', label: 'Upper G5' },
  // Tier 4: Lower G5
  5: { tier: 4, name: 'CUSA', label: 'Lower G5' },
  7: { tier: 4, name: 'MAC', label: 'Lower G5' },
  11: { tier: 4, name: 'Sun Belt', label: 'Lower G5' },
};

// Fallback by name
const NCAAF_CONFERENCE_TIERS = {
  'SEC': { tier: 1, label: 'Elite Power 4' },
  'Big Ten': { tier: 1, label: 'Elite Power 4' },
  'Big 12': { tier: 2, label: 'Power 4' },
  'ACC': { tier: 2, label: 'Power 4' },
  'American': { tier: 3, label: 'Upper G5' },
  'Mountain West': { tier: 3, label: 'Upper G5' },
  'CUSA': { tier: 4, label: 'Lower G5' },
  'MAC': { tier: 4, label: 'Lower G5' },
  'Sun Belt': { tier: 4, label: 'Lower G5' },
  'FBS Indep.': { tier: 2, label: 'FBS Independent' },
};

const TEAM_TIER_OVERRIDES = {
  'Notre Dame Fighting Irish': { tier: 1, label: 'Elite Independent', conference: 'FBS Indep.' },
  'Notre Dame': { tier: 1, label: 'Elite Independent', conference: 'FBS Indep.' },
  'Army Black Knights': { tier: 3, label: 'Upper Independent', conference: 'FBS Indep.' },
  'Navy Midshipmen': { tier: 3, label: 'Upper Independent', conference: 'FBS Indep.' },
  'UConn Huskies': { tier: 4, label: 'Lower Independent', conference: 'FBS Indep.' },
  'UMass Minutemen': { tier: 4, label: 'Lower Independent', conference: 'FBS Indep.' },
};

// ===== NCAAB CONFERENCE TIERS =====
// Tier 1: ELITE - Power conferences with consistent NBA talent
// Tier 2: STRONG - Major mid-major conferences, tournament staples
// Tier 3: MID - Smaller mid-majors, one-bid leagues
// Note: Data quality is best for ELITE, lower for MID tier

const NCAAB_CONFERENCE_ID_TIERS = {
  // Tier 1: ELITE
  10: { tier: 1, name: 'Big Ten', label: 'ELITE' },
  24: { tier: 1, name: 'SEC', label: 'ELITE' },
  6: { tier: 1, name: 'Big 12', label: 'ELITE' },
  7: { tier: 1, name: 'Big East', label: 'ELITE' },
  1: { tier: 1, name: 'ACC', label: 'ELITE' },
  33: { tier: 1, name: 'Pac-12', label: 'ELITE' },
  // Tier 2: STRONG
  20: { tier: 2, name: 'Mountain West', label: 'STRONG' },
  31: { tier: 2, name: 'WCC', label: 'STRONG' },
  4: { tier: 2, name: 'American', label: 'STRONG' },
  5: { tier: 2, name: 'Atlantic 10', label: 'STRONG' },
  19: { tier: 2, name: 'Missouri Valley', label: 'STRONG' },
  13: { tier: 2, name: 'CUSA', label: 'STRONG' },
  18: { tier: 2, name: 'MAC', label: 'STRONG' },
  // Tier 3: MID (smaller conferences, one-bid leagues)
  30: { tier: 3, name: 'WAC', label: 'MID' },
  11: { tier: 3, name: 'Big West', label: 'MID' },
  14: { tier: 3, name: 'Horizon', label: 'MID' },
  12: { tier: 3, name: 'CAA', label: 'MID' },
  26: { tier: 3, name: 'Southern', label: 'MID' },
  15: { tier: 3, name: 'Ivy', label: 'MID' },
  16: { tier: 3, name: 'MAAC', label: 'MID' },
  3: { tier: 3, name: 'America East', label: 'MID' },
  2: { tier: 3, name: 'ASUN', label: 'MID' },
  8: { tier: 3, name: 'Big Sky', label: 'MID' },
  9: { tier: 3, name: 'Big South', label: 'MID' },
  21: { tier: 3, name: 'Northeast', label: 'MID' },
  22: { tier: 3, name: 'Ohio Valley', label: 'MID' },
  23: { tier: 3, name: 'Patriot', label: 'MID' },
  27: { tier: 3, name: 'Southland', label: 'MID' },
  28: { tier: 3, name: 'Summit', label: 'MID' },
  29: { tier: 3, name: 'Sun Belt', label: 'MID' },
  17: { tier: 3, name: 'MEAC', label: 'MID' },
  25: { tier: 3, name: 'SWAC', label: 'MID' },
};

const NCAAB_CONFERENCE_NAME_TIERS = {
  // Tier 1: ELITE
  'Big Ten': { tier: 1, label: 'ELITE' },
  'SEC': { tier: 1, label: 'ELITE' },
  'Big 12': { tier: 1, label: 'ELITE' },
  'Big East': { tier: 1, label: 'ELITE' },
  'ACC': { tier: 1, label: 'ELITE' },
  'Pac-12': { tier: 1, label: 'ELITE' },
  // Tier 2: STRONG
  'Mountain West': { tier: 2, label: 'STRONG' },
  'WCC': { tier: 2, label: 'STRONG' },
  'West Coast': { tier: 2, label: 'STRONG' },
  'American': { tier: 2, label: 'STRONG' },
  'Atlantic 10': { tier: 2, label: 'STRONG' },
  'A-10': { tier: 2, label: 'STRONG' },
  'Missouri Valley': { tier: 2, label: 'STRONG' },
  'MVC': { tier: 2, label: 'STRONG' },
  'CUSA': { tier: 2, label: 'STRONG' },
  'Conference USA': { tier: 2, label: 'STRONG' },
  'MAC': { tier: 2, label: 'STRONG' },
  // Tier 3: MID
  'WAC': { tier: 3, label: 'MID' },
  'Big West': { tier: 3, label: 'MID' },
  'Horizon': { tier: 3, label: 'MID' },
  'CAA': { tier: 3, label: 'MID' },
  'Southern': { tier: 3, label: 'MID' },
  'Ivy': { tier: 3, label: 'MID' },
  'Ivy League': { tier: 3, label: 'MID' },
  'MAAC': { tier: 3, label: 'MID' },
  'MEAC': { tier: 3, label: 'MID' },
  'SWAC': { tier: 3, label: 'MID' },
};

/**
 * Format conference tier section for NCAAF games
 */
async function formatConferenceTierSection(homeTeam, awayTeam, sport) {
  try {
    const bdlSport = sportToBdlKey(sport);
    if (!bdlSport || bdlSport !== 'americanfootball_ncaaf') return '';
    
    const teams = await ballDontLieService.getTeams(bdlSport);
    const homeTeamData = findTeam(teams, homeTeam);
    const awayTeamData = findTeam(teams, awayTeam);
    
    const getTeamTier = (team, teamName) => {
      // Check team overrides first (for independents like Notre Dame)
      if (TEAM_TIER_OVERRIDES[teamName]) return TEAM_TIER_OVERRIDES[teamName];
      if (team && TEAM_TIER_OVERRIDES[team.full_name]) return TEAM_TIER_OVERRIDES[team.full_name];
      
      // Try conference ID first (most reliable from BDL)
      const confId = parseInt(team?.conference, 10);
      if (!isNaN(confId) && CONFERENCE_ID_TIERS[confId]) {
        const tierInfo = CONFERENCE_ID_TIERS[confId];
        return { tier: tierInfo.tier, label: tierInfo.label, conference: tierInfo.name };
      }
      
      // Fallback to conference name matching
      const confName = team?.conference || team?.division || '';
      if (NCAAF_CONFERENCE_TIERS[confName]) {
        return { ...NCAAF_CONFERENCE_TIERS[confName], conference: confName };
      }
      
      return { tier: 3, label: 'Unknown', conference: confName || 'Unknown' };
    };
    
    const homeTier = getTeamTier(homeTeamData, homeTeam);
    const awayTier = getTeamTier(awayTeamData, awayTeam);
    const tierGap = Math.abs(homeTier.tier - awayTier.tier);
    
    const homeConf = homeTier.conference || homeTeamData?.conference || 'Unknown';
    const awayConf = awayTier.conference || awayTeamData?.conference || 'Unknown';
    
    console.log(`[Scout Report] NCAAF Tiers: ${homeTeam} (${homeConf}, Tier ${homeTier.tier}) vs ${awayTeam} (${awayConf}, Tier ${awayTier.tier})`);
    
    let gapAnalysis = '';
    if (tierGap === 0) {
      gapAnalysis = 'Same tier - even playing field. Focus on current form and matchup specifics.';
    } else if (tierGap === 1) {
      gapAnalysis = 'One tier gap - slight edge to higher tier, but very beatable.';
    } else if (tierGap === 2) {
      gapAnalysis = 'Two tier gap - noticeable talent disparity. Look for situational edges.';
    } else {
      gapAnalysis = 'THREE+ TIER GAP - significant mismatch ON PAPER. Focus on spread value.';
    }
    
    return `
CONFERENCE TIER CONTEXT (NCAAF)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🏠 ${homeTeam}: ${homeConf} (Tier ${homeTier.tier} - ${homeTier.label})
✈️ ${awayTeam}: ${awayConf} (Tier ${awayTier.tier} - ${awayTier.label})

📊 TIER GAP: ${tierGap} level${tierGap !== 1 ? 's' : ''}
   ${gapAnalysis}

💡 Conference tiers reflect recruiting power and quality of opponents.
   Stats can look different across conferences - putting up 30 PPG in the
   MAC is different than doing so in the SEC. Consider this context.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

`;
  } catch (error) {
    console.warn('[Scout Report] Error fetching conference tiers:', error.message);
    return '';
  }
}

/**
 * Format conference tier section for NCAAB games
 * Critical context: ELITE conferences have reliable data, MID tier conferences have higher variance
 */
async function formatNcaabConferenceTierSection(homeTeam, awayTeam) {
  try {
    const bdlSport = 'basketball_ncaab';
    
    const teams = await ballDontLieService.getTeams(bdlSport);
    const homeTeamData = findTeam(teams, homeTeam);
    const awayTeamData = findTeam(teams, awayTeam);
    
    const getTeamTier = (team, teamName) => {
      // Try conference ID first (most reliable from BDL)
      const confId = team?.conference_id;
      if (confId && NCAAB_CONFERENCE_ID_TIERS[confId]) {
        const tierInfo = NCAAB_CONFERENCE_ID_TIERS[confId];
        return { tier: tierInfo.tier, label: tierInfo.label, conference: tierInfo.name };
      }
      
      // Fallback to conference name matching
      // BDL NCAAB teams have conference_id, but we can try to match by name if needed
      return { tier: 3, label: 'MID', conference: 'Unknown' };
    };
    
    // BDL NCAAB also has conferences endpoint - fetch for more info
    let conferences = [];
    try {
      conferences = await ballDontLieService.getConferencesGeneric?.(bdlSport) || [];
    } catch (e) {
      // Ignore - conferences endpoint may not exist
    }
    
    const getConferenceName = (confId) => {
      const conf = conferences.find(c => c.id === confId);
      if (conf) return conf.short_name || conf.name;
      if (NCAAB_CONFERENCE_ID_TIERS[confId]) return NCAAB_CONFERENCE_ID_TIERS[confId].name;
      return 'Unknown';
    };
    
    const homeTier = getTeamTier(homeTeamData, homeTeam);
    const awayTier = getTeamTier(awayTeamData, awayTeam);
    const tierGap = Math.abs(homeTier.tier - awayTier.tier);
    
    const homeConf = homeTier.conference || getConferenceName(homeTeamData?.conference_id) || 'Unknown';
    const awayConf = awayTier.conference || getConferenceName(awayTeamData?.conference_id) || 'Unknown';
    
    console.log(`[Scout Report] NCAAB Tiers: ${homeTeam} (${homeConf}, Tier ${homeTier.tier}) vs ${awayTeam} (${awayConf}, Tier ${awayTier.tier})`);
    
    let matchupType = '';
    let gapAnalysis = '';
    if (homeTier.tier === 1 && awayTier.tier === 1) {
      matchupType = 'ELITE vs ELITE';
      gapAnalysis = 'Top-tier matchup. KenPom/efficiency metrics most reliable. Depth and coaching matter.';
    } else if (homeTier.tier === 1 && awayTier.tier === 2) {
      matchupType = 'ELITE vs STRONG';
      gapAnalysis = 'Watch for "Super Bowl" effect if Strong team at home. Look for star power on the mid-major.';
    } else if (homeTier.tier === 2 && awayTier.tier === 1) {
      matchupType = 'STRONG vs ELITE (HOME UPSET POTENTIAL)';
      gapAnalysis = '⚠️ Mid-major at home vs elite program - investigate how home environment affects this matchup.';
    } else if (homeTier.tier === 1 && awayTier.tier === 3) {
      matchupType = 'ELITE vs MID';
      gapAnalysis = 'Large talent gap. Watch for garbage time variance. Is elite team focused or looking ahead?';
    } else if (tierGap === 0) {
      matchupType = `${homeTier.label} vs ${awayTier.label}`;
      gapAnalysis = 'Same tier - even playing field. Focus on current form and venue.';
    } else {
      matchupType = `${homeTier.label} vs ${awayTier.label}`;
      gapAnalysis = tierGap === 1 
        ? 'One tier gap - slight edge to higher tier, but very beatable.'
        : 'Two tier gap - noticeable talent disparity. Look for situational edges.';
    }
    
    return `
CONFERENCE TIER CONTEXT (NCAAB)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🏠 ${homeTeam}: ${homeConf} (${homeTier.label})
✈️ ${awayTeam}: ${awayConf} (${awayTier.label})

📊 MATCHUP TYPE: ${matchupType}
   ${gapAnalysis}

💡 TIER GUIDE:
   ELITE (Big Ten, SEC, Big 12, Big East, ACC): NBA talent, reliable data
   STRONG (MWC, WCC, AAC, A-10): Tournament contenders, star-dependent
   MID (smaller conferences): High variance, venue-sensitive
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

`;
  } catch (error) {
    console.warn('[Scout Report] Error fetching NCAAB conference tiers:', error.message);
    return '';
  }
}

/**
 * Fetch NCAAB NCAA Tournament Context (NET Rankings + Quad Records)
 * This is critical for understanding team quality and tournament positioning
 * 
 * NOTE: Now provided by Gemini Grounding
 * The NCAAB Gemini Grounding prompt includes KenPom, NET, SOS, and Quad records
 */
async function fetchNcaabTournamentContext(homeTeam, awayTeam) {
  try {
    // Tournament context now provided by Gemini Grounding
    // The NCAAB Gemini Grounding prompt includes:
    // - KenPom rankings and ratings (AdjEM, AdjO, AdjD, Tempo)
    // - NET rankings
    // - Strength of Schedule (SOS)
    // - Quad 1/2/3/4 records
    // This context is already captured in the main scout report
    console.log(`[Scout Report] NCAAB Tournament context - using Gemini Grounding`);
    return '';
  } catch (error) {
    console.warn('[Scout Report] NCAAB tournament context fetch failed:', error.message);
    return '';
  }
}

/**
 * Fetch NCAAB AP Top 25 rankings, game significance, and venue
 * Uses Gemini Grounding to get current rankings and determine game context
 * 
 * @returns {Object} { homeRanking, awayRanking, gameSignificance, tournamentContext, venue }
 */
async function fetchNcaabRankingsAndSignificance(homeTeam, awayTeam, game) {
  try {
    const today = game.commence_time 
      ? new Date(game.commence_time).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
      : new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
    
    // Use Gemini Flash for quota management
    const modelName = process.env.GEMINI_FLASH_MODEL || 'gemini-3-flash-preview';
    
    const prompt = `For the college basketball game ${awayTeam} @ ${homeTeam} on ${today}:

1. AP TOP 25 RANKING (current week):
   - ${homeTeam} ranking: (number 1-25 or "unranked")
   - ${awayTeam} ranking: (number 1-25 or "unranked")

2. GAME SIGNIFICANCE (one short phrase):
   Choose the MOST significant tag:
   - "#X vs #Y" (if both teams ranked, e.g., "#5 vs #12")
   - "Top 25 Matchup" (if one team is ranked Top 25)
   - "Conference Opener" (first conference game)
   - "Rivalry Game" (traditional rivalry)
   - "Revenge Game" (if recent upset or big loss)
   - "Conference Game" (default for conference games)
   - "Non-Conference" (out of conference game)

3. HOME ARENA:
   - What is the name of ${homeTeam}'s home arena?

RESPOND IN THIS EXACT FORMAT (JSON):
{
  "homeRanking": null or number,
  "awayRanking": null or number,
  "gameSignificance": "string",
  "isConferenceGame": true/false,
  "venue": "arena name"
}

Only respond with the JSON, nothing else.`;

    const result = await geminiGroundingSearch(prompt, { 
      temperature: 0.1, 
      maxTokens: 150,
      modelName 
    });
    
    if (result.success && result.data) {
      try {
        // Parse JSON from response
        const jsonMatch = result.data.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          
          // Validate rankings (must be 1-25 or null)
          const homeRank = parsed.homeRanking;
          const awayRank = parsed.awayRanking;
          const validHomeRank = (typeof homeRank === 'number' && homeRank >= 1 && homeRank <= 25) ? homeRank : null;
          const validAwayRank = (typeof awayRank === 'number' && awayRank >= 1 && awayRank <= 25) ? awayRank : null;
          
          // Build game significance with rankings if applicable
          let significance = parsed.gameSignificance || 'Conference Game';
          
          // If both ranked, make it "#X vs #Y" format
          if (validHomeRank && validAwayRank) {
            significance = `#${validAwayRank} vs #${validHomeRank}`;
          } else if (validHomeRank || validAwayRank) {
            // One ranked team
            const rankedTeam = validHomeRank ? homeTeam : awayTeam;
            const rank = validHomeRank || validAwayRank;
            if (!significance.includes('#')) {
              significance = `#${rank} ${rankedTeam.split(' ').pop()} ${parsed.isConferenceGame ? 'Conference Game' : 'Non-Conference'}`;
            }
          }
          
          return {
            homeRanking: validHomeRank,
            awayRanking: validAwayRank,
            gameSignificance: significance,
            tournamentContext: parsed.isConferenceGame ? 'Conference Play' : 'Non-Conference',
            venue: parsed.venue || null
          };
        }
      } catch (parseError) {
        console.warn(`[Scout Report] NCAAB rankings parse error: ${parseError.message}`);
      }
    }
    
    // Fallback: Try to extract rankings from text
    const text = result.data || '';
    const homeRankMatch = text.match(new RegExp(`${homeTeam.split(' ').pop()}.*?#?(\\d{1,2})`, 'i')) ||
                          text.match(new RegExp(`#(\\d{1,2}).*?${homeTeam.split(' ').pop()}`, 'i'));
    const awayRankMatch = text.match(new RegExp(`${awayTeam.split(' ').pop()}.*?#?(\\d{1,2})`, 'i')) ||
                          text.match(new RegExp(`#(\\d{1,2}).*?${awayTeam.split(' ').pop()}`, 'i'));
    
    const homeRanking = homeRankMatch ? parseInt(homeRankMatch[1]) : null;
    const awayRanking = awayRankMatch ? parseInt(awayRankMatch[1]) : null;
    
    // Determine significance
    let gameSignificance = 'Conference Game';
    if (homeRanking && awayRanking) {
      gameSignificance = `#${awayRanking} vs #${homeRanking}`;
    } else if (homeRanking || awayRanking) {
      gameSignificance = 'Top 25 Matchup';
    }
    
    return {
      homeRanking: (homeRanking && homeRanking <= 25) ? homeRanking : null,
      awayRanking: (awayRanking && awayRanking <= 25) ? awayRanking : null,
      gameSignificance,
      tournamentContext: 'Conference Play',
      venue: null // Fallback has no venue data
    };
    
  } catch (error) {
    console.warn(`[Scout Report] NCAAB rankings fetch failed: ${error.message}`);
    return {
      homeRanking: null,
      awayRanking: null,
      gameSignificance: 'Conference Game',
      tournamentContext: 'Regular Season',
      venue: null
    };
  }
}

/**
 * Format starting QBs section for display
 * Now includes QB CHANGE IMPACT section when there's a backup/inexperienced QB
 */
function formatStartingQBs(homeTeam, awayTeam, qbs) {
  if (!qbs || (!qbs.home && !qbs.away)) {
    return '';
  }
  
  const lines = [
    '',
    '🎯 STARTING QUARTERBACKS THIS WEEK',
    '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'
  ];
  
  // Track if there's a QB situation that affects historical records
  let homeQbChangeSituation = null;
  let awayQbChangeSituation = null;
  
  if (qbs.home) {
    const qb = qbs.home;
    const backupLabel = qb.isBackup ? ' 🚨 BACKUP STARTING (starter injured)' : '';
    lines.push(`🏠 ${homeTeam}: ${qb.name} (#${qb.jerseyNumber || '?'})${backupLabel}`);
    lines.push(`   ${qb.gamesPlayed || '?'} GP | ${qb.passingYards || 0} yds | ${qb.passingTds || 0} TD / ${qb.passingInterceptions || 0} INT | ${qb.passingCompletionPct ? qb.passingCompletionPct.toFixed(1) : '?'}% | Rating: ${qb.qbRating ? qb.qbRating.toFixed(1) : '?'}`);
    // Add experience warning for rookie/inexperienced QBs
    if (qb.experienceNote) {
      lines.push(`   ${qb.experienceNote}`);
      lines.push(`   ⚠️ SIGNIFICANT: Factor this inexperience into your analysis - expect nerves, mistakes, and unpredictability.`);
      homeQbChangeSituation = { name: qb.name, gamesPlayed: qb.gamesPlayed || 0, isBackup: qb.isBackup };
    } else if (qb.isBackup) {
      lines.push(`   ⚠️ SIGNIFICANT: This is a backup QB - team stats may not reflect backup QB performance.`);
      lines.push(`   Consider: limited experience, chemistry issues, possible game plan adjustments.`);
      homeQbChangeSituation = { name: qb.name, gamesPlayed: qb.gamesPlayed || 0, isBackup: true };
    } else if ((qb.gamesPlayed || 0) <= 5) {
      // Even if not flagged as backup, very few games = new starter this season
      homeQbChangeSituation = { name: qb.name, gamesPlayed: qb.gamesPlayed || 0, isBackup: false };
    }
  } else {
    lines.push(`🏠 ${homeTeam}: QB data unavailable`);
  }
  
  if (qbs.away) {
    const qb = qbs.away;
    const backupLabel = qb.isBackup ? ' 🚨 BACKUP STARTING (starter injured)' : '';
    lines.push(`✈️ ${awayTeam}: ${qb.name} (#${qb.jerseyNumber || '?'})${backupLabel}`);
    lines.push(`   ${qb.gamesPlayed || '?'} GP | ${qb.passingYards || 0} yds | ${qb.passingTds || 0} TD / ${qb.passingInterceptions || 0} INT | ${qb.passingCompletionPct ? qb.passingCompletionPct.toFixed(1) : '?'}% | Rating: ${qb.qbRating ? qb.qbRating.toFixed(1) : '?'}`);
    // Add experience warning for rookie/inexperienced QBs
    if (qb.experienceNote) {
      lines.push(`   ${qb.experienceNote}`);
      lines.push(`   ⚠️ SIGNIFICANT: Factor this inexperience into your analysis - expect nerves, mistakes, and unpredictability.`);
      awayQbChangeSituation = { name: qb.name, gamesPlayed: qb.gamesPlayed || 0, isBackup: qb.isBackup };
    } else if (qb.isBackup) {
      lines.push(`   ⚠️ SIGNIFICANT: This is a backup QB - team stats may not reflect backup QB performance.`);
      lines.push(`   Consider: limited experience, chemistry issues, possible game plan adjustments.`);
      awayQbChangeSituation = { name: qb.name, gamesPlayed: qb.gamesPlayed || 0, isBackup: true };
    } else if ((qb.gamesPlayed || 0) <= 5) {
      // Even if not flagged as backup, very few games = new starter this season
      awayQbChangeSituation = { name: qb.name, gamesPlayed: qb.gamesPlayed || 0, isBackup: false };
    }
  } else {
    lines.push(`✈️ ${awayTeam}: QB data unavailable`);
  }
  
  lines.push('');
  
  // Add QB CHANGE IMPACT section if either team has a new/backup QB
  if (homeQbChangeSituation || awayQbChangeSituation) {
    lines.push('');
    lines.push('🚨 QB CHANGE IMPACT ON HISTORICAL RECORDS');
    lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    if (homeQbChangeSituation) {
      const qb = homeQbChangeSituation;
      lines.push(`⚠️ ${homeTeam}:`);
      lines.push(`   Current QB: ${qb.name} (${qb.gamesPlayed} career starts)`);
      if (qb.gamesPlayed <= 2) {
        lines.push(`   📊 CRITICAL: This team's HOME RECORD and HISTORICAL STATS were built`);
        lines.push(`      with a DIFFERENT quarterback. Those records are NOT relevant.`);
        lines.push(`   🎯 IGNORE their past home/away splits - this is essentially a NEW team.`);
      } else if (qb.gamesPlayed <= 5) {
        lines.push(`   📊 NOTE: Limited sample size with this QB - historical trends may not apply.`);
      }
    }
    
    if (awayQbChangeSituation) {
      const qb = awayQbChangeSituation;
      lines.push(`⚠️ ${awayTeam}:`);
      lines.push(`   Current QB: ${qb.name} (${qb.gamesPlayed} career starts)`);
      if (qb.gamesPlayed <= 2) {
        lines.push(`   📊 CRITICAL: This team's ROAD RECORD and HISTORICAL STATS were built`);
        lines.push(`      with a DIFFERENT quarterback. Those records are NOT relevant.`);
        lines.push(`   🎯 IGNORE their past home/away splits - this is essentially a NEW team.`);
      } else if (qb.gamesPlayed <= 5) {
        lines.push(`   📊 NOTE: Limited sample size with this QB - historical trends may not apply.`);
      }
    }
    
    lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    lines.push('');
  }
  
  lines.push('⚠️ CRITICAL: Use the QB names above when discussing quarterbacks.');
  lines.push('   Do NOT guess or use outdated QB information.');
  lines.push('');
  
  return lines.join('\n');
}

/**
 * Generic Gemini Grounding Search
 * Uses Gemini 3 Flash with Google Search Grounding for real-time information
 * @param {string} query - The search query
 * @param {Object} options - Options for the search
 * @param {number} options.temperature - Temperature for generation (default 0.2)
 * @param {number} options.maxTokens - Max tokens for response (default 1000)
 * @returns {Object} - { success: boolean, data: string, raw: string }
 */
// ═══════════════════════════════════════════════════════════════════════════
// GEMINI MODEL POLICY (HARDCODED - DO NOT CHANGE)
// ONLY Gemini 3 Flash allowed for grounding. NEVER use Gemini 1.x or 2.x.
// ═══════════════════════════════════════════════════════════════════════════
const ALLOWED_GROUNDING_MODELS = ['gemini-3-flash-preview', 'gemini-3-pro-preview'];

function validateGroundingModel(model) {
  if (!ALLOWED_GROUNDING_MODELS.includes(model)) {
    console.error(`[GROUNDING MODEL POLICY VIOLATION] Attempted to use "${model}" - ONLY Gemini 3 allowed!`);
    return 'gemini-3-flash-preview'; // Always fall back to Gemini 3 Flash
  }
  return model;
}

export async function geminiGroundingSearch(query, options = {}) {
  const genAI = getGeminiClient();
  if (!genAI) {
    console.warn('[Grounding Search] Gemini not available');
    return { success: false, data: null, error: 'Gemini API not configured' };
  }
  
  try {
    // POLICY: Only Gemini 3 Flash for grounding (never 1.x or 2.x)
    const requestedModel = process.env.GEMINI_FLASH_MODEL || 'gemini-3-flash-preview';
    const modelName = validateGroundingModel(requestedModel);
    
    const model = genAI.getGenerativeModel({
      model: modelName,
      tools: [{
        google_search: {}
      }],
      generationConfig: {
        temperature: options.temperature ?? 0.2,
        maxOutputTokens: options.maxTokens ?? 1000
      },
      safetySettings: [
        { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
        { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
        { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
        { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
      ]
    });
    
    const result = await model.generateContent(query);
    const response = await result.response;
    const text = response.text();
    
    // Debug log: Show first 200 chars of grounding response
    if (text) {
      console.log(`[Grounding Search] ✅ Response received (${text.length} chars). Preview: ${text.substring(0, 200).replace(/\n/g, ' ')}...`);
    }
    
    return {
      success: true,
      data: text,
      raw: text
    };
  } catch (error) {
    console.error('[Grounding Search] Error:', error.message);
    
    // Handle aborted request error gracefully
    if (error.message?.includes('USER_ABORTED') || error.message?.includes('aborted')) {
      console.warn('[Grounding Search] Request was aborted. Returning graceful error state.');
      return { success: false, data: null, error: 'Request aborted' };
    }
    
    return { success: false, data: null, error: error.message };
  }
}

/**
 * Get rich game context using Gemini Grounding
 * @param {string} homeTeam - Home team name
 * @param {string} awayTeam - Away team name
 * @param {string} sport - Sport key (nba, nfl, nhl, ncaab, ncaaf)
 * @param {string} dateStr - Game date string
 * @returns {Object} - Rich context object
 */
export async function getGroundedRichContext(homeTeam, awayTeam, sport, dateStr) {
  const query = `For the ${sport.toUpperCase()} game ${awayTeam} @ ${homeTeam} on ${dateStr}:

1. GAME TYPE & SIGNIFICANCE:
   - Is this a playoff game, tournament game, rivalry, or regular season?
   - What are the stakes (playoff implications, standings, etc.)?

2. VENUE:
   - What arena/venue is this game being played at?
   - Location (city)?

3. KEY NARRATIVES:
   - Any breaking news, drama, or storylines?
   - Star player matchups or milestones?
   - Momentum shifts or "hot streak" teams?

4. TOURNAMENT/PLAYOFF CONTEXT (if applicable):
   - Current round, bracket position
   - Path to this game

Be factual and concise. No betting picks or predictions.`;

  const result = await geminiGroundingSearch(query, { temperature: 0.1, maxTokens: 1500 });
  
  if (result.success && result.data) {
    return {
      summary: result.data,
      venue: extractVenue(result.data),
      gameType: extractGameType(result.data, sport),
      narratives: result.data,
      _source: 'gemini_grounding'
    };
  }
  
  return null;
}

// Helper to extract venue from grounded response
function extractVenue(text) {
  const venuePatterns = [
    /(?:played at|venue is|arena[:\s]+)([A-Z][^,.\n]+)/i,
    /(?:at the|at\s+)([A-Z][^,.\n]*(?:Arena|Center|Stadium|Garden|Dome|Field|Coliseum))/i
  ];
  
  for (const pattern of venuePatterns) {
    const match = text.match(pattern);
    if (match) return match[1].trim();
  }
  return null;
}

// Helper to extract game type from grounded response
function extractGameType(text, sport) {
  const lower = text.toLowerCase();
  
  if (sport === 'nba' || sport === 'basketball_nba') {
    if (lower.includes('nba cup') || lower.includes('in-season tournament')) return 'NBA Cup';
    if (lower.includes('playoff')) return 'Playoffs';
    return 'Regular Season';
  }
  
  if (sport === 'nfl' || sport === 'americanfootball_nfl') {
    if (lower.includes('playoff')) return 'Playoffs';
    if (lower.includes('super bowl')) return 'Super Bowl';
    if (lower.includes('christmas')) return 'Christmas Day';
    return 'Regular Season';
  }
  
  if (sport === 'nhl' || sport === 'icehockey_nhl') {
    if (lower.includes('playoff') || lower.includes('stanley cup')) return 'Playoffs';
    return 'Regular Season';
  }
  
  if (sport === 'ncaab' || sport === 'basketball_ncaab') {
    if (lower.includes('march madness') || lower.includes('ncaa tournament')) return 'NCAA Tournament';
    if (lower.includes('conference tournament')) return 'Conference Tournament';
    return 'Regular Season';
  }
  
  if (sport === 'ncaaf' || sport === 'americanfootball_ncaaf') {
    if (lower.includes('playoff') || lower.includes('cfp')) return 'CFP';
    if (lower.includes('bowl game')) return 'Bowl Game';
    return 'Regular Season';
  }
  
  return 'Regular Season';
}

/**
 * Get advanced stats using Gemini Grounding
 * @param {string} homeTeam - Home team name
 * @param {string} awayTeam - Away team name
 * @param {string} sport - Sport key
 * @param {string} dateStr - Game date string
 * @returns {Object} - Advanced stats object
 */
export async function getGroundedAdvancedStats(homeTeam, awayTeam, sport, dateStr) {
  let query;
  
  if (sport === 'nhl' || sport === 'icehockey_nhl') {
    query = `For the NHL game ${awayTeam} @ ${homeTeam} on ${dateStr}:

CRITICAL - Provide these SPECIFIC current stats (use MoneyPuck, Natural Stat Trick, or official NHL sources):

**${homeTeam}:**
- Corsi For % (CF%) at 5v5 (Season vs Last 10): ____% / ____%
- Expected Goals For % (xGF%) at 5v5 (Season vs Last 10): ____% / ____%
- High-Danger Chances For % (HDCF%) at 5v5: ____%
- PDO (shooting% + save%): _____
- Power Play %: ____%
- Penalty Kill %: ____%
- Goals For/Against per game: ___ / ___
- Last 5 games record: ___
- CONFIRMED starting goalie for this game: [NAME] (Season SV%: ____, GSAx: ____)

**${awayTeam}:**
- Corsi For % (CF%) at 5v5 (Season vs Last 10): ____% / ____%
- Expected Goals For % (xGF%) at 5v5 (Season vs Last 10): ____% / ____%
- High-Danger Chances For % (HDCF%) at 5v5: ____%
- PDO (shooting% + save%): _____
- Power Play %: ____%
- Penalty Kill %: ____%
- Goals For/Against per game: ___ / ___
- Last 5 games record: ___
- CONFIRMED starting goalie for this game: [NAME] (Season SV%: ____, GSAx: ____)

**Key Context:**
- Is either team on a back-to-back?
- Any significant RECENT injuries (last 14 days) affecting the top 6 forwards or top 4 defensemen?
- Goalie matchup breakdown (Starter vs Backup if unconfirmed)?

Use the most recent available data. If goalie is unconfirmed, state "UNCONFIRMED" and provide both potential starters.`;
    } else if (sport === 'ncaab' || sport === 'basketball_ncaab') {
    query = `For the college basketball game ${awayTeam} @ ${homeTeam} on ${dateStr}:

Provide current advanced analytics for both teams:
1. KenPom rating and ranking (if available)
2. NET ranking
3. Offensive and defensive efficiency
4. Strength of schedule ranking
5. Quad 1/2/3/4 records

Format as structured data. Use current ${getCurrentSeasonString()} season data.`;
  } else if (sport === 'ncaaf' || sport === 'americanfootball_ncaaf') {
    query = `For the college football game ${awayTeam} @ ${homeTeam} on ${dateStr}:

Provide current advanced analytics for both teams:
1. SP+ rating and ranking
2. FPI (Football Power Index)
3. Offensive and defensive EPA per play
4. Strength of schedule ranking
5. Power 4 vs Group of 5 context

Format as structured data. Use current ${getCurrentSeasonString()} season data.`;
  } else {
    return null;
  }
  
  const result = await geminiGroundingSearch(query, { temperature: 0.2, maxTokens: 1000 });
  
  if (result.success && result.data) {
    const parsed = parseNhlAdvancedStats(result.data, homeTeam, awayTeam);
    return {
      ...parsed,
      raw: result.data,
      _source: 'gemini_grounding'
    };
  }
  
  return null;
}

/**
 * Get game weather using Gemini Grounding
 * @param {string} homeTeam - Home team name
 * @param {string} awayTeam - Away team name  
 * @param {string} dateStr - Game date string
 * @returns {Object} - Weather object
 */
export async function getGroundedWeather(homeTeam, awayTeam, dateStr) {
  const query = `What is the weather forecast for the NFL game ${awayTeam} @ ${homeTeam} on ${dateStr}?
Include:
1. Temperature (in Fahrenheit)
2. Conditions (sunny, cloudy, rain, snow)
3. Wind speed and direction
4. Is this a dome/indoor stadium? (if so, weather is controlled)

Be specific and factual.`;

  const result = await geminiGroundingSearch(query, { temperature: 0.1, maxTokens: 1200 });
  
  if (result.success && result.data) {
    return parseWeatherFromText(result.data);
  }
  
  return null;
}

// Helper to parse weather from grounded text
function parseWeatherFromText(text) {
  const lower = text.toLowerCase();
  
  // Check for dome/indoor
  if (lower.includes('dome') || lower.includes('indoor') || lower.includes('retractable roof')) {
    return {
      temperature: 72,
      conditions: 'Indoor/Dome',
      wind: 'N/A',
      isDome: true
    };
  }
  
  // Extract temperature
  const tempMatch = text.match(/(\d{1,3})\s*(?:°|degrees?\s*)?F/i) || 
                    text.match(/temperature[:\s]+(\d{1,3})/i) ||
                    text.match(/(\d{1,3})\s*degrees/i);
  const temperature = tempMatch ? parseInt(tempMatch[1], 10) : null;
  
  // Extract conditions
  let conditions = 'Clear';
  if (lower.includes('rain')) conditions = 'Rain';
  else if (lower.includes('snow')) conditions = 'Snow';
  else if (lower.includes('cloud')) conditions = 'Cloudy';
  else if (lower.includes('partly cloudy')) conditions = 'Partly Cloudy';
  else if (lower.includes('sunny') || lower.includes('clear')) conditions = 'Clear';
  else if (lower.includes('overcast')) conditions = 'Overcast';
  
  // Extract wind
  const windMatch = text.match(/wind[:\s]+(\d+)\s*(?:mph|miles)/i) ||
                    text.match(/(\d+)\s*mph\s*wind/i);
  const wind = windMatch ? `${windMatch[1]} mph` : null;
  
  return {
    temperature,
    conditions,
    wind,
    isDome: false
  };
}

/**
 * COMPREHENSIVE PROPS NARRATIVE CONTEXT
 * 
 * Fetches ALL narrative factors that BDL cannot provide BEFORE Gary's iterations.
 * This gives Gary complete context upfront so he knows which stats to investigate.
 * 
 * Categories fetched:
 * 1. Breaking News & Situational (last-minute scratches, trade rumors, coaching changes)
 * 2. Motivation Factors (revenge games, milestones, contract years, playoff implications)
 * 3. Schedule & Travel (B2B fatigue, trap games, altitude, rest advantage)
 * 4. Player-Specific (load management, matchup history, quotes, role changes)
 * 5. Team Trends (streaks, home/road context, rivalries)
 * 6. Betting Signals (public % only - to know if Gary is with/against public) - MINOR DATA ONLY
 */
async function fetchComprehensivePropsNarrative(homeTeam, awayTeam, sport, gameDate, options = {}) {
  const genAI = getGeminiClient();
  if (!genAI) {
    console.log('[Props Narrative] Gemini not available');
    return null;
  }
  
  try {
    const today = gameDate || new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
    
    // Use Flash for props to avoid quota issues (includes NCAAB for high volume)
    const isNCAAB = sport === 'basketball_ncaab' || sport === 'NCAAB';
    const modelName = options.useFlash || isNCAAB
      ? (process.env.GEMINI_FLASH_MODEL || 'gemini-3-flash-preview')
      : (process.env.GEMINI_MODEL || 'gemini-3-flash-preview');
    
    const model = genAI.getGenerativeModel({
      model: modelName,
      tools: [{ google_search: {} }],
      safetySettings: [
        { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
        { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
        { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
        { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
      ]
    });
    
    // Sport-specific comprehensive prompts
    let prompt;
    
    if (sport === 'NBA' || sport === 'basketball_nba') {
      prompt = `For the NBA game ${awayTeam} @ ${homeTeam} on ${today}, provide COMPREHENSIVE narrative context for player prop analysis:

== SECTION 1: BREAKING NEWS & SITUATIONAL ==
Search for the ABSOLUTE LATEST news (within 24 hours):
- LAST-MINUTE SCRATCHES: Any players ruled OUT after the official injury report?
- TRADE RUMORS: Any active trade talks involving players on either team?
- COACHING CHANGES: Any recent firings, interim coaches, or system changes?
- LOCKER ROOM DRAMA: Any reported chemistry issues, player feuds, or team meetings?
- ROSTER MOVES: Any recent signings, waivers, or 10-day contracts?

== SECTION 2: MOTIVATION FACTORS ==
Search for context that affects player effort/focus:
- REVENGE GAMES: Is any player facing their FORMER TEAM? (e.g., traded in past 2 years)
  * List player name, when they were traded, and any reported comments
- MILESTONE CHASING: Is any player close to a career milestone? (e.g., 20k points, triple-double streak)
- CONTRACT YEAR: Which players are in a contract year (expiring contract) and might be extra motivated?
- JERSEY RETIREMENT / TRIBUTE: Any special ceremony or tribute night?
- RETURN FROM INJURY: Any star returning after missing 3+ games?
- PLAYOFF IMPLICATIONS: Are either team fighting for playoff position, play-in, or seeding?

== SECTION 3: SCHEDULE & TRAVEL CONTEXT ==
- BACK-TO-BACK: Is either team on the 2nd night of a back-to-back?
- 3-IN-4 / 4-IN-5: Is either team in a compressed schedule?
- TRAVEL FATIGUE: Did either team just travel cross-country (e.g., East to West coast)?
- TRAP GAME SPOT: Is a good team playing a lottery team right BEFORE a big rivalry game?
- ALTITUDE FACTOR: Is this game in Denver (elevation affects visiting teams)?
- REST ADVANTAGE: How many days rest does each team have?
- ROAD TRIP: Is either team on an extended road trip (4+ games)?

== SECTION 4: STARTING LINEUP (ROTOWIRE-STYLE) ==
List the PROJECTED STARTING 5 for each team BY POSITION:

${homeTeam} EXPECTED STARTERS:
- PG: [Name] (PPG/RPG/APG avg this season)
- SG: [Name] (PPG/RPG/APG avg this season)
- SF: [Name] (PPG/RPG/APG avg this season)
- PF: [Name] (PPG/RPG/APG avg this season)
- C:  [Name] (PPG/RPG/APG avg this season)
- KEY BENCH: Top 2-3 rotation players

${awayTeam} EXPECTED STARTERS:
- PG: [Name] (PPG/RPG/APG avg this season)
- SG: [Name] (PPG/RPG/APG avg this season)
- SF: [Name] (PPG/RPG/APG avg this season)
- PF: [Name] (PPG/RPG/APG avg this season)
- C:  [Name] (PPG/RPG/APG avg this season)
- KEY BENCH: Top 2-3 rotation players

⚠️ MAY NOT PLAY: List players who are OUT, QUESTIONABLE, or GTD for each team

== SECTION 5: PLAYER-SPECIFIC CONTEXT ==
For the TOP PLAYERS on each team:
- LOAD MANAGEMENT RISK: Which stars typically rest on B2Bs or vs bad teams?
- MATCHUP HISTORY: Any notable player-vs-player history? (e.g., Tatum vs Butler)
- RECENT QUOTES: Any notable coach or player comments about tonight's game?
- OFF-COURT ISSUES: Any reported personal matters affecting a player?
- MINUTES RESTRICTION: Any player returning on a minutes limit?
- ROLE CHANGE: Any player recently moved to starter or bench?

== SECTION 5: TEAM TRENDS & CONTEXT ==
- WIN/LOSE STREAKS: Current streak for each team and context (e.g., "Won 5 straight by avg 15 pts")
- HOME/ROAD SPLITS: Is either team significantly better at home? MSG effect? Denver altitude?
- DIVISION RIVALRY: Are these division rivals? Conference rivals?
- REVENGE SPOT: Did these teams play recently with a controversial ending?

== SECTION 6: GAME ENVIRONMENT (AFFECTS PROP CEILINGS) ==
- GAME TOTAL (O/U): What is the over/under? (High O/U like 235+ = more scoring opportunities)
- SPREAD & BLOWOUT RISK: What is the spread? (Large spread -9+ = starters may rest in 4th quarter)
- PACE OF PLAY: Which team plays faster/slower? (Fast pace = more possessions = higher stat ceilings)
- CLOSE GAME EXPECTED: Is the spread within 5 points? (Starters play 36+ minutes)

== SECTION 7: HISTORICAL PATTERNS (PLAYER-SPECIFIC) ==
- PLAYER VS OPPONENT: Any notable player vs this specific team history? (e.g., "Trae Young averages 28 PPG vs Miami career")
- PRIMETIME PERFORMANCE: Is this a nationally televised game (ESPN/TNT)? Some players elevate on big stages.
- CONSISTENCY/FLOOR-CEILING: Which players have high variance (boom-or-bust) vs consistent outputs?

== SECTION 8: PUBLIC PERCEPTION (TRAP AWARENESS) ==
⚠️ This section helps identify when Gary might be aligned with "public bettor logic."
- OBVIOUS NARRATIVE: What is the FIRST storyline a casual fan would see? (B2B, rest, injuries, etc.)
- PUBLIC LEAN: Which side would a casual bettor immediately favor? Why?
- COUNTER-NARRATIVE: What would the OTHER side argue? What are the public MISSING?
- TRAP INDICATORS: Do ALL obvious factors (rest, injuries, stats) align the SAME direction? (If yes, flag as potential trap)

FORMAT YOUR RESPONSE with clear section headers. Be FACTUAL - if you can't find info, say "No data found" rather than guessing.

🚫 CRITICAL RULES:
1. **ACCURACY IS PARAMOUNT**: Double-check all stats, scoring streaks, and injury updates from the last 24-48 hours. If a player had a game yesterday, ENSURE you have those stats.
2. **NO HALLUCINATIONS**: Do NOT repeat narrative "streaks" (e.g., "11 straight games with 30 pts") unless you are 100% certain. If in doubt, stick to general trends.
3. FACTS ONLY - Do NOT include any betting predictions, picks, or analysis from articles
4. NO OPINIONS - Do NOT copy predictions like "The Hawks will win because..." from any source
5. YOUR OWN WORDS - Synthesize facts, do NOT plagiarize text from articles
6. VERIFY STATS - Only include stats you can verify from official sources
7. NO BETTING ADVICE - Gary will make his own decision - you just provide CONTEXT`;
    }
    else if (sport === 'NHL' || sport === 'icehockey_nhl') {
      prompt = `For the NHL game ${awayTeam} @ ${homeTeam} on ${today}, provide COMPREHENSIVE narrative context for player prop analysis:

== SECTION 1: BREAKING NEWS & SITUATIONAL ==
- LAST-MINUTE SCRATCHES: Any players ruled OUT after morning skate?
- TRADE RUMORS: Any active trade talks? (especially before trade deadline)
- COACHING CHANGES: Any recent firings or interim coaches?
- ROSTER MOVES: Any recent call-ups from AHL or waivers?

== SECTION 2: MOTIVATION FACTORS ==
- REVENGE GAMES: Is any player facing their FORMER TEAM?
- MILESTONE CHASING: Any player close to career milestone? (e.g., 500 goals)
- CONTRACT YEAR: Which players have expiring contracts?
- RETURN FROM INJURY: Any star returning from LTIR?
- PLAYOFF IMPLICATIONS: Playoff race standings for both teams?

== SECTION 3: GOALIE SITUATION (CRITICAL FOR PROPS) ==
- WHO IS STARTING for ${homeTeam}? (confirmed or expected)
- WHO IS STARTING for ${awayTeam}? (confirmed or expected)
- Is either goalie on a B2B (likely to rest)?
- Any goalie controversies or platoon situations?

== SECTION 4: SCHEDULE & TRAVEL CONTEXT ==
- BACK-TO-BACK: Is either team on 2nd night of B2B?
- ROAD TRIP LENGTH: Is either team on an extended road trip?
- REST ADVANTAGE: Days rest for each team?
- TRAVEL FATIGUE: Cross-country travel?

== SECTION 5: STARTING LINEUP (ROTOWIRE-STYLE) ==
List the PROJECTED LINEUP for each team:

${homeTeam} EXPECTED LINEUP:
- STARTING GOALIE: [Name] (W-L record, SV%, GAA)
- TOP LINE (LW-C-RW): [Names with this season's G/A/PTS each]
- 2ND LINE: [Names with this season's G/A/PTS each]
- TOP D-PAIR: [Names with this season's G/A/PTS each]
- PP1 UNIT: Key players on first power play unit

${awayTeam} EXPECTED LINEUP:
- STARTING GOALIE: [Name] (W-L record, SV%, GAA)
- TOP LINE (LW-C-RW): [Names with this season's G/A/PTS each]
- 2ND LINE: [Names with this season's G/A/PTS each]
- TOP D-PAIR: [Names with this season's G/A/PTS each]
- PP1 UNIT: Key players on first power play unit

⚠️ SCRATCHES/IR: List players who are OUT or scratched for each team

== SECTION 6: PLAYER-SPECIFIC CONTEXT ==
For top scorers/players:
- LOAD MANAGEMENT: Any stars likely to rest?
- LINE CHANGES: Any recent line combination changes?
- HOT/COLD STREAKS: Any player on a notable scoring streak or slump?
- RECENT QUOTES: Coach comments about specific players?

== SECTION 6: TEAM TRENDS ==
- WIN/LOSE STREAKS: Current streak and context
- DIVISION RIVALRY: Are these division rivals?
- RECENT H2H: Did these teams play recently?

== SECTION 7: GAME ENVIRONMENT ==
- GAME TOTAL (O/U): What is the over/under? (High O/U 6.5+ = more scoring expected)
- SPREAD & GAME SCRIPT: What is the spread? Trailing team may pull goalie late.
- CONSISTENCY: Which players have high floor vs boom-or-bust tendencies?

FORMAT with clear section headers. Be FACTUAL - say "No data found" if unsure.

🚫 CRITICAL RULES:
1. FACTS ONLY - Do NOT include any betting predictions, picks, or analysis from articles
2. NO OPINIONS - Do NOT copy predictions from any source
3. YOUR OWN WORDS - Synthesize facts, do NOT plagiarize
4. NO BETTING ADVICE - Gary will make his own decision - you just provide CONTEXT`;
    }
    else if (sport === 'NFL' || sport === 'americanfootball_nfl') {
      prompt = `For the NFL game ${awayTeam} @ ${homeTeam} on ${today}, provide COMPREHENSIVE narrative context for player prop analysis:

== SECTION 1: BREAKING NEWS & SITUATIONAL ==
- GAMEDAY INACTIVES: Any surprise inactives announced today?
- TRADE RUMORS: Any active trade talks?
- COACHING CHANGES: Any coordinator changes or interim situations?
- LOCKER ROOM DRAMA: Any reported chemistry issues?
- ROSTER MOVES: Any recent signings off practice squad?

== SECTION 2: QB SITUATION (CRITICAL) ==
- STARTING QB for ${homeTeam}: Name, status, any concerns?
- STARTING QB for ${awayTeam}: Name, status, any concerns?
- Any QB injuries or changes from last week?
- Backup QB situation if relevant?

== SECTION 3: MOTIVATION FACTORS ==
- REVENGE GAMES: Any player facing former team? (trades in past 2 years)
- MILESTONE CHASING: Any player close to career milestone?
- CONTRACT YEAR: Which skill players are in contract year?
- PLAYOFF IMPLICATIONS: Playoff standings, division race, seeding implications?

== SECTION 4: SCHEDULE & GAME CONTEXT ==
- GAME TYPE: Is this TNF, SNF, MNF, Saturday, or Sunday?
- SHORT WEEK: Did either team play on Thursday/Monday last week?
- TRAVEL: Cross-country travel or timezone changes?
- DIVISIONAL: Are these division rivals?

== SECTION 5: WEATHER IMPACT (CRITICAL FOR OUTDOOR GAMES) ==
- STADIUM TYPE: Is this a dome or outdoor stadium?
- FORECAST: Temperature, wind speed, precipitation chance at game time
- WIND IMPACT: Is wind 15+ mph? (affects passing, FG accuracy)
- COLD WEATHER: Is it below 35°F? (affects grip, passing games)
- RAIN/SNOW: Any precipitation expected? (favors run game)
- PLAYER WEATHER HISTORY: How do the QBs perform in similar conditions?
  * ${homeTeam} QB: Career stats in cold/wind/rain if relevant
  * ${awayTeam} QB: Career stats in cold/wind/rain if relevant
- WEATHER EDGE: Does either team have a significant weather advantage? (dome team in cold, etc.)

== SECTION 6: PLAYER-SPECIFIC CONTEXT ==
For TOP skill players (QB, RB1, WR1, TE1):
- TARGET SHARE TRENDS: Any recent usage changes?
- SNAP COUNTS: Any player on limited snaps?
- MATCHUP HISTORY: Notable player-vs-defense history?
- RECENT QUOTES: Coach comments about game plan or player usage?
- WEATHER PERFORMANCE: Any players known to struggle/excel in expected conditions?

== SECTION 7: INJURY CONTEXT (BEYOND REPORT) ==
- Players returning from multi-week absences?
- Players "questionable" who are expected to play?
- Any injuries that affect other players' usage (e.g., WR1 out = WR2 boost)?

== SECTION 8: TEAM TRENDS ==
- WIN/LOSE STREAKS: Current streak with context
- HOME/ROAD SPLITS: Significant home/road performance difference?
- DIVISION RIVALRY: Are these division rivals?

== SECTION 9: GAME ENVIRONMENT (AFFECTS PROP CEILINGS) ==
- GAME TOTAL (O/U): What is the over/under? (High O/U 48+ = shootout, more pass yards)
- SPREAD & GAME SCRIPT: What is the spread? Large favorites (-10+) may run clock late, affecting pass yards.
- PROJECTED GAME FLOW: Will trailing team need to throw more? (Good for pass/receiving props)
- PRIMETIME FACTOR: Is this SNF/MNF/TNF? National TV can affect player performance.

== SECTION 10: HISTORICAL PATTERNS (PLAYER-SPECIFIC) ==
- PLAYER VS OPPONENT: Any notable player vs this defense history?
- CONSISTENCY: Which players have high floor (reliable) vs boom-or-bust (high variance)?

FORMAT with clear section headers. Be FACTUAL - say "No data found" if unsure.

🚫 CRITICAL RULES:
1. FACTS ONLY - Do NOT include any betting predictions, picks, or analysis from articles
2. NO OPINIONS - Do NOT copy predictions like "The Cowboys will cover because..." from any source
3. YOUR OWN WORDS - Synthesize facts, do NOT plagiarize text from articles
4. VERIFY STATS - Only include stats you can verify from official sources
5. NO BETTING ADVICE - Gary will make his own decision - you just provide CONTEXT`;
    }
    else if (sport === 'NHL' || sport === 'icehockey_nhl') {
      prompt = `For the NHL game ${awayTeam} @ ${homeTeam} on ${today}, provide COMPREHENSIVE narrative context for player prop analysis:

== SECTION 1: BREAKING NEWS & GOALIE SITUATION ==
Search for the ABSOLUTE LATEST news (within 24 hours):
- STARTING GOALIES: Who are the confirmed or likely starters for BOTH teams?
- GOALIE STATUS: Any last-minute changes or rest for Igor Shesterkin, Connor Hellebuyck, etc.?
- LAST-MINUTE SCRATCHES: Any players ruled OUT after the official injury report?
- ROSTER MOVES: Any recent call-ups from AHL or trades (e.g., players moving teams in 2025-26)?

== SECTION 2: MOTIVATION & SEASON CONTEXT ==
Search for context that affects player effort:
- REVENGE GAMES: Is any player facing their FORMER TEAM? (e.g., traded in 2025 or 2026)
- MILESTONE CHASING: Is any player close to a career milestone? (e.g., 500 goals, 1000 points)
- CONTRACT YEAR: Which players are hunting stats for their next extension?
- PLAYOFF RACE: Are either team fighting for a wild card spot or division lead?

== SECTION 3: SCHEDULE & TRAVEL ==
- BACK-TO-BACK: Is either team on the 2nd night of a back-to-back? (Affects goalie choices and fatigue)
- REST ADVANTAGE: How many days rest does each team have?
- ROAD TRIP: Is either team ending a long road trip?

== SECTION 4: PLAYER-SPECIFIC CONTEXT ==
- LINE CHANGES: Any players promoted to top lines or PP1 recently?
- HOT/COLD STREAKS: Which players have 5+ points in their last 5 games? Or a goal drought?
- MATCHUP HISTORY: Any players who historically dominate this specific opponent?

== SECTION 5: TEAM ANALYTICS & TRENDS ==
- TEAM FORM: Last 5 games record and scoring average
- SPECIAL TEAMS: Is one team's Power Play (PP) elite vs the other's Penalty Kill (PK)?
- HOME/ROAD SPLITS: Is this a "home dominant" team?

== SECTION 6: GAME ENVIRONMENT ==
- GAME TOTAL (O/U): High total like 6.5 or 7.0 = more scoring opportunities
- SPREAD: Is this expected to be a blowout or a 1-goal game?

FORMAT YOUR RESPONSE with clear section headers. Be FACTUAL - ensure you distinguish between the 2024-25 season and the CURRENT 2025-26 season. Use ${today} as your reference point.

🚫 CRITICAL RULES:
1. FACTS ONLY - Do NOT include any betting predictions, picks, or analysis from articles
2. NO OPINIONS - Do NOT copy predictions
3. YOUR OWN WORDS - Synthesize facts
4. ACCURACY: Double-check all goalie confirmations and injury updates from today.`;
    }
    else {
      // Generic fallback for other sports
      prompt = `For the ${sport} game ${awayTeam} @ ${homeTeam} on ${today}:

Provide comprehensive narrative context including:
1. Breaking news and last-minute updates
2. Injuries and lineup changes
3. Motivation factors (revenge games, milestones, contract years)
4. Schedule context (back-to-backs, travel fatigue)
5. Team trends and recent form
6. Any betting line movement (as minor context only)

Be factual. Do NOT make predictions.`;
    }
    
    console.log(`[Props Narrative] Fetching comprehensive ${sport} context via Gemini...`);
    
    const result = await model.generateContent(prompt);
    const text = result?.response?.text?.() || '';
    
    if (!text || text.length < 100) {
      console.warn('[Props Narrative] Gemini returned insufficient content');
      return null;
    }
    
    console.log(`[Props Narrative] ✓ Got comprehensive context (${text.length} chars)`);
    
    // Parse into structured sections for easier access
    const sections = parseNarrativeSections(text);
    
    return {
      raw: text,
      sections: sections,
      sport: sport,
      matchup: `${awayTeam} @ ${homeTeam}`,
      fetchedAt: new Date().toISOString()
    };
    
  } catch (error) {
    console.error('[Props Narrative] Error fetching context:', error.message);
    return null;
  }
}

/**
 * Parse the narrative text into structured sections
 */
function parseNarrativeSections(text) {
  const sections = {
    breakingNews: '',
    motivation: '',
    schedule: '',
    playerContext: '',
    teamTrends: '',
    bettingSignals: '',
    injuries: '',
    qbSituation: '',
    goalies: '',
    weather: ''  // NEW: Weather section for NFL outdoor games
  };
  
  // Simple section extraction based on headers
  const sectionPatterns = [
    { key: 'breakingNews', patterns: ['BREAKING NEWS', 'SITUATIONAL', 'LAST-MINUTE', 'GAMEDAY INACTIVES'] },
    { key: 'motivation', patterns: ['MOTIVATION', 'REVENGE', 'MILESTONE', 'CONTRACT YEAR'] },
    { key: 'schedule', patterns: ['SCHEDULE', 'TRAVEL', 'BACK-TO-BACK', 'B2B', 'GAME CONTEXT'] },
    { key: 'weather', patterns: ['WEATHER', 'FORECAST', 'TEMPERATURE', 'WIND', 'OUTDOOR'] },
    { key: 'playerContext', patterns: ['PLAYER-SPECIFIC', 'PLAYER CONTEXT', 'TOP PLAYERS', 'TARGET SHARE'] },
    { key: 'teamTrends', patterns: ['TEAM TRENDS', 'STREAKS', 'WIN/LOSE', 'DIVISION'] },
    { key: 'injuries', patterns: ['INJURY', 'INJURIES', 'INACTIVES'] },
    { key: 'qbSituation', patterns: ['QB SITUATION', 'STARTING QB', 'QUARTERBACK'] },
    { key: 'goalies', patterns: ['GOALIE', 'GOALIES', 'STARTING GOALIE'] }
  ];
  
  const lines = text.split('\n');
  let currentSection = '';
  let currentContent = [];
  
  for (const line of lines) {
    const upperLine = line.toUpperCase();
    
    // Check if this line starts a new section
    let newSection = null;
    for (const { key, patterns } of sectionPatterns) {
      if (patterns.some(p => upperLine.includes(p) && (upperLine.includes('==') || upperLine.includes('SECTION')))) {
        newSection = key;
        break;
      }
    }
    
    if (newSection) {
      // Save previous section
      if (currentSection && currentContent.length > 0) {
        sections[currentSection] = currentContent.join('\n').trim();
      }
      currentSection = newSection;
      currentContent = [];
    } else if (currentSection) {
      currentContent.push(line);
    }
  }
  
  // Save final section
  if (currentSection && currentContent.length > 0) {
    sections[currentSection] = currentContent.join('\n').trim();
  }
  
  return sections;
}

/**
 * Parse NHL advanced stats from grounded text
 */
function parseNhlAdvancedStats(text, homeTeam, awayTeam) {
  const result = {
    home_advanced: {},
    away_advanced: {},
    goalie_matchup: {},
    recent_form: {},
    key_analytics_insights: []
  };

  const homeSection = extractTeamSection(text, homeTeam);
  const awaySection = extractTeamSection(text, awayTeam);

  const extractMetric = (section, label) => {
    // Label can be a string or array of aliases
    const labels = Array.isArray(label) ? label : [label];
    for (const l of labels) {
      // Look for the label, followed by anything until a colon, then the number
      const regex = new RegExp(`${l}.*?:\\s*(\\d+\\.?\\d*)`, 'i');
      const match = section.match(regex);
      if (match) return parseFloat(match[1]);
    }
    return null;
  };

  // Home metrics
  result.home_advanced.corsi_for_pct = extractMetric(homeSection, ['Corsi For %', 'CF%', 'Corsi For Percentage']);
  result.home_advanced.expected_goals_for_pct = extractMetric(homeSection, ['Expected Goals For %', 'xGF%', 'xG For %', 'Expected Goals Percentage']);
  result.home_advanced.pdo = extractMetric(homeSection, 'PDO');
  result.home_advanced.high_danger_chances_for_pct = extractMetric(homeSection, ['High-Danger Chances For %', 'HDCF%', 'High Danger %', 'HD Chances For %']);

  // Away metrics
  result.away_advanced.corsi_for_pct = extractMetric(awaySection, ['Corsi For %', 'CF%', 'Corsi For Percentage']);
  result.away_advanced.expected_goals_for_pct = extractMetric(awaySection, ['Expected Goals For %', 'xGF%', 'xG For %', 'Expected Goals Percentage']);
  result.away_advanced.pdo = extractMetric(awaySection, 'PDO');
  result.away_advanced.high_danger_chances_for_pct = extractMetric(awaySection, ['High-Danger Chances For %', 'HDCF%', 'High Danger %', 'HD Chances For %']);

  const extractGoalie = (section) => {
    const nameMatch = section.match(/(?:starting goalie|confirmed starting goalie|goalie|starter).*?:\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)/i);
    const svPctMatch = section.match(/(?:SV%|Save %|Save Percentage).*?:\s*(\.?\d+)/i);
    const gsaxMatch = section.match(/(?:GSAx|Goals Saved Above Expected).*?:\s*([+-]?\d+\.?\d*)/i);
    return {
      name: nameMatch ? nameMatch[1].trim() : 'Unknown',
      savePct: svPctMatch ? parseFloat(svPctMatch[1]) : null,
      gsax: gsaxMatch ? parseFloat(gsaxMatch[1]) : null
    };
  };

  const homeGoalie = extractGoalie(homeSection);
  const awayGoalie = extractGoalie(awaySection);

  result.goalie_matchup = {
    home_starter: homeGoalie.name,
    home_sv_pct: homeGoalie.savePct,
    home_gsax: homeGoalie.gsax,
    away_starter: awayGoalie.name,
    away_sv_pct: awayGoalie.savePct,
    away_gsax: awayGoalie.gsax
  };

  // Recent Form (Last 10)
  const extractLast10 = (section) => {
    const match = section.match(/Last 5 games record:\s*(\d+-\d+-\d+|\d+-\d+)/i);
    return match ? match[1] : null;
  };
  
  result.recent_form = {
    home_last_10: extractLast10(homeSection),
    away_last_10: extractLast10(awaySection)
  };

  return result;
}

export { fetchGroundedContext, fetchComprehensivePropsNarrative };
export default { 
  buildScoutReport, 
  fetchGroundedContext,
  fetchComprehensivePropsNarrative,
  geminiGroundingSearch,
  getGroundedRichContext,
  getGroundedAdvancedStats,
  getGroundedWeather
};

