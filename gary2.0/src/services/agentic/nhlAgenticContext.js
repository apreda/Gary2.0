/**
 * NHL Agentic Context Builder
 * Builds rich context for NHL moneyline/spread picks using the 3-stage agentic pipeline
 * Modeled after nbaAgenticContext.js
 */
import { ballDontLieService } from '../ballDontLieService.js';
import { getGroundedAdvancedStats, getGroundedRichContext, geminiGroundingSearch } from './scoutReport/scoutReportBuilder.js';
// Context sourced from Gemini 3 Flash Grounding
import {
  formatGameTimeEST,
  buildMarketSnapshot,
  parseGameDate,
  safeApiCallArray,
  safeApiCallObject,
  getEstDate
} from './sharedUtils.js';

/**
 * Fallback grounding search for missing NHL stats
 * This runs a targeted query to recover specific missing data points
 */
async function groundingFallbackForMissingStats(homeTeam, awayTeam, missingFields, dateStr) {
  if (!missingFields || missingFields.length === 0) return null;
  
  console.log(`[Agentic][NHL] ⚠️ Running fallback grounding for ${missingFields.length} missing fields: ${missingFields.join(', ')}`);
  
  // Build a targeted query for the missing fields
  const fieldQueries = {
    corsi_for_pct: `What is ${homeTeam}'s and ${awayTeam}'s current Corsi For % (CF%) at 5-on-5? Use MoneyPuck or Natural Stat Trick data.`,
    xg_for_pct: `What is ${homeTeam}'s and ${awayTeam}'s current Expected Goals For % (xGF%) at 5-on-5?`,
    goalie_starter: `Who are the confirmed starting goalies for ${awayTeam} at ${homeTeam} on ${dateStr}? Include their season save % and GAA.`,
    gsax: `What is the Goals Saved Above Expected (GSAx) for the starting goalies of ${homeTeam} and ${awayTeam} this season?`,
    save_pct: `What is the season save percentage for the starting goalies of ${homeTeam} and ${awayTeam}?`,
    high_danger_pct: `What is ${homeTeam}'s and ${awayTeam}'s High-Danger Chances For % (HDCF%) at 5-on-5?`,
    pdo: `What is ${homeTeam}'s and ${awayTeam}'s current PDO (shooting % + save %)?`
  };
  
  // Select relevant queries based on missing fields
  const queries = missingFields
    .filter(f => fieldQueries[f])
    .map(f => fieldQueries[f]);
  
  if (queries.length === 0) return null;
  
  const combinedQuery = `For the NHL game ${awayTeam} @ ${homeTeam} on ${dateStr}:

PROVIDE THE FOLLOWING SPECIFIC STATS (use MoneyPuck, Natural Stat Trick, or Hockey-Reference):

${queries.join('\n\n')}

Be as specific as possible with numbers. If exact data isn't available, say "N/A".`;

  try {
    const result = await geminiGroundingSearch(combinedQuery, { temperature: 0.1, maxTokens: 1200 });
    
    if (result?.success && result?.data) {
      console.log(`[Agentic][NHL] ✓ Fallback grounding recovered data`);
      return parseGroundingFallbackResponse(result.data, homeTeam, awayTeam);
    }
  } catch (e) {
    console.warn(`[Agentic][NHL] Fallback grounding failed:`, e.message);
  }
  
  return null;
}

/**
 * Parse the fallback grounding response and extract numeric values
 */
function parseGroundingFallbackResponse(text, homeTeam, awayTeam) {
  if (!text) return null;
  
  const result = {
    home_advanced: {},
    away_advanced: {},
    goalie_matchup: {},
    _source: 'gemini_grounding_fallback'
  };
  
  // Helper to extract a percentage value near a team name
  const extractPercent = (teamName, statName) => {
    // Look for patterns like "Team Name: 52.3%" or "Team Name has 52.3% CF"
    const patterns = [
      new RegExp(`${teamName}[^\\d]*${statName}[^\\d]*(\\d+\\.\\d+)\\s*%`, 'i'),
      new RegExp(`${teamName}[^\\d]*(\\d+\\.\\d+)\\s*%[^\\n]*${statName}`, 'i'),
      new RegExp(`${statName}[^\\d]*${teamName}[^\\d]*(\\d+\\.\\d+)`, 'i')
    ];
    
    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) return parseFloat(match[1]);
    }
    return null;
  };
  
  // Extract goalie names
  const goaliePattern = new RegExp(`(\\w+\\s+\\w+)(?:[^\\d]*(?:starter|starting|goalie|goaltender))`, 'gi');
  const goalieMatches = [...text.matchAll(goaliePattern)];
  
  // Try to match goalies to teams
  for (const match of goalieMatches) {
    const goalieName = match[1];
    const context = text.substring(Math.max(0, match.index - 100), match.index + 100);
    if (context.toLowerCase().includes(homeTeam.toLowerCase())) {
      result.goalie_matchup.home_starter = goalieName;
    } else if (context.toLowerCase().includes(awayTeam.toLowerCase())) {
      result.goalie_matchup.away_starter = goalieName;
    }
  }
  
  // Extract Corsi For %
  result.home_advanced.corsi_for_pct = extractPercent(homeTeam, 'corsi|cf');
  result.away_advanced.corsi_for_pct = extractPercent(awayTeam, 'corsi|cf');
  
  // Extract xGF %
  result.home_advanced.expected_goals_for_pct = extractPercent(homeTeam, 'xgf|expected goals');
  result.away_advanced.expected_goals_for_pct = extractPercent(awayTeam, 'xgf|expected goals');
  
  // Extract HDCF %
  result.home_advanced.high_danger_chances_for_pct = extractPercent(homeTeam, 'hdcf|high-danger|high danger');
  result.away_advanced.high_danger_chances_for_pct = extractPercent(awayTeam, 'hdcf|high-danger|high danger');
  
  // Extract save percentages
  const svPctPattern = /(\d+\.\d{2,3})\s*(?:sv%|save\s*%|save\s*percentage)/gi;
  const svMatches = [...text.matchAll(svPctPattern)];
  
  // Log what we recovered
  const recoveredFields = [];
  if (result.home_advanced.corsi_for_pct) recoveredFields.push('home_corsi');
  if (result.away_advanced.corsi_for_pct) recoveredFields.push('away_corsi');
  if (result.home_advanced.expected_goals_for_pct) recoveredFields.push('home_xgf');
  if (result.away_advanced.expected_goals_for_pct) recoveredFields.push('away_xgf');
  if (result.goalie_matchup.home_starter) recoveredFields.push('home_goalie');
  if (result.goalie_matchup.away_starter) recoveredFields.push('away_goalie');
  
  if (recoveredFields.length > 0) {
    console.log(`[Agentic][NHL] ✓ Recovered ${recoveredFields.length} fields: ${recoveredFields.join(', ')}`);
  }
  
  return result;
}

const SPORT_KEY = 'icehockey_nhl';

/**
 * Calculate rest days since last game
 */
function calcRestInfo(recentGames = [], teamId, gameDate) {
  if (!Array.isArray(recentGames) || recentGames.length === 0) {
    return { daysSinceLastGame: null, isBackToBack: false, gamesLast7Days: 0 };
  }

  const targetDate = gameDate instanceof Date ? gameDate : new Date(gameDate);
  
  // Sort by date descending to find most recent game
  const sorted = recentGames
    .filter(g => {
      const gDate = new Date(g.date || g.datetime);
      return gDate < targetDate;
    })
    .sort((a, b) => new Date(b.date || b.datetime) - new Date(a.date || a.datetime));

  if (sorted.length === 0) {
    return { daysSinceLastGame: null, isBackToBack: false, gamesLast7Days: 0 };
  }

  const lastGame = sorted[0];
  const lastGameDate = new Date(lastGame.date || lastGame.datetime);
  const daysSince = Math.floor((targetDate - lastGameDate) / (1000 * 60 * 60 * 24));

  // Count games in last 7 days
  const sevenDaysAgo = new Date(targetDate);
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const gamesLast7 = sorted.filter(g => {
    const gDate = new Date(g.date || g.datetime);
    return gDate >= sevenDaysAgo && gDate < targetDate;
  }).length;

  return {
    daysSinceLastGame: daysSince,
    isBackToBack: daysSince <= 1,
    gamesLast7Days: gamesLast7
  };
}

/**
 * Calculate recent form (last N games record)
 */
function calcRecentForm(recentGames = [], teamId, count = 5) {
  if (!Array.isArray(recentGames) || recentGames.length === 0) {
    return { record: 'N/A', last5: null, goalsFor: 0, goalsAgainst: 0 };
  }

  const sorted = [...recentGames].sort((a, b) => 
    new Date(b.date || b.datetime) - new Date(a.date || a.datetime)
  ).slice(0, count);

  let wins = 0;
  let losses = 0;
  let otLosses = 0;
  let goalsFor = 0;
  let goalsAgainst = 0;

  for (const game of sorted) {
    const isHome = game.home_team?.id === teamId;
    const homeScore = game.home_team_score ?? game.home_score ?? 0;
    const awayScore = game.away_team_score ?? game.visitor_team_score ?? game.away_score ?? 0;
    
    const teamScore = isHome ? homeScore : awayScore;
    const oppScore = isHome ? awayScore : homeScore;
    
    goalsFor += teamScore;
    goalsAgainst += oppScore;

    if (teamScore > oppScore) {
      wins++;
    } else if (game.status?.includes('OT') || game.status?.includes('SO')) {
      otLosses++;
    } else {
      losses++;
    }
  }

  const record = `${wins}-${losses}${otLosses > 0 ? `-${otLosses}` : ''}`;
  
  return {
    record,
    last5: record,
    goalsFor,
    goalsAgainst,
    goalsPerGame: sorted.length > 0 ? (goalsFor / sorted.length).toFixed(2) : null,
    goalsAgainstPerGame: sorted.length > 0 ? (goalsAgainst / sorted.length).toFixed(2) : null
  };
}

/**
 * Format team basics from standings
 */
function formatTeamBasics(team, standings = []) {
  const row = Array.isArray(standings) 
    ? standings.find(s => s?.team?.id === team?.id) 
    : null;
  
  if (!row) {
    return {
      record: 'N/A',
      conference: team?.conference || 'Unknown',
      division: team?.division || 'Unknown',
      streak: null
    };
  }

  const wins = row.wins ?? 0;
  const losses = row.losses ?? 0;
  const otLosses = row.ot_losses ?? row.overtime_losses ?? 0;
  const record = `${wins}-${losses}-${otLosses}`;

  return {
    record,
    conference: row.conference || team?.conference || 'Unknown',
    division: row.division || team?.division || 'Unknown',
    points: row.points ?? null,
    streak: row.streak || row.current_streak || null
  };
}

/**
 * Build NHL-specific token data from BDL stats
 */
function buildNhlTokenData(homeRates, awayRates, advancedStats, restInfo, recentForm, injuries, marketSnapshot, h2hHistory, leagueRanks, homeTeam, awayTeam, homeHotPlayers, awayHotPlayers) {
  const homeRanks = leagueRanks[homeTeam?.id] || {};
  const awayRanks = leagueRanks[awayTeam?.id] || {};

  return {
    // Player Streaks
    hot_players: {
      home: { team: homeTeam?.full_name, players: homeHotPlayers },
      away: { team: awayTeam?.full_name, players: awayHotPlayers }
    },
    // League Ranks
    league_ranks: {
      home: {
        team: homeTeam?.full_name,
        pp_rank: homeRanks.pp_rank || 'N/A',
        pk_rank: homeRanks.pk_rank || 'N/A',
        goals_for_rank: homeRanks.gf_rank || 'N/A',
        goals_against_rank: homeRanks.ga_rank || 'N/A'
      },
      away: {
        team: awayTeam?.full_name,
        pp_rank: awayRanks.pp_rank || 'N/A',
        pk_rank: awayRanks.pk_rank || 'N/A',
        goals_for_rank: awayRanks.gf_rank || 'N/A',
        goals_against_rank: awayRanks.ga_rank || 'N/A'
      }
    },
    // Head-to-Head History
    h2h_history: {
      games_found: h2hHistory.length,
      recent_meetings: h2hHistory.map(g => ({
        date: g.date || g.datetime,
        score: `${g.home_team_score}-${g.visitor_team_score || g.away_team_score}`,
        winner: (g.home_team_score > (g.visitor_team_score || g.away_team_score)) ? g.home_team.full_name : g.visitor_team?.full_name || g.away_team?.full_name
      }))
    },
    // Corsi & Expected Goals (from Gemini Grounding advanced stats)
    corsi_xg: {
      home: {
        team: homeTeam?.full_name,
        corsi_for_pct: advancedStats?.home_advanced?.corsi_for_pct ?? null,
        xg_for_pct: advancedStats?.home_advanced?.expected_goals_for_pct ?? null,
        pdo: advancedStats?.home_advanced?.pdo ?? null,
        high_danger_pct: advancedStats?.home_advanced?.high_danger_chances_for_pct ?? null
      },
      away: {
        team: awayTeam?.full_name,
        corsi_for_pct: advancedStats?.away_advanced?.corsi_for_pct ?? null,
        xg_for_pct: advancedStats?.away_advanced?.expected_goals_for_pct ?? null,
        pdo: advancedStats?.away_advanced?.pdo ?? null,
        high_danger_pct: advancedStats?.away_advanced?.high_danger_chances_for_pct ?? null
      }
    },
    
    // Special Teams
    special_teams: {
      home: {
        team: homeTeam?.full_name,
        pp_pct: homeRates?.ppPct ?? null,
        pk_pct: homeRates?.pkPct ?? null,
        pp_opportunities: homeRates?.ppOpportunities ?? null
      },
      away: {
        team: awayTeam?.full_name,
        pp_pct: awayRates?.ppPct ?? null,
        pk_pct: awayRates?.pkPct ?? null,
        pp_opportunities: awayRates?.ppOpportunities ?? null
      }
    },
    
    // Goalie Matchup (from Gemini Grounding)
    goalie_matchup: {
      home: {
        team: homeTeam?.full_name,
        starter: advancedStats?.goalie_matchup?.home_starter ?? null,
        record: advancedStats?.goalie_matchup?.home_record ?? null,
        save_pct: advancedStats?.goalie_matchup?.home_sv_pct ?? null,
        gaa: advancedStats?.goalie_matchup?.home_gaa ?? null,
        gsax: advancedStats?.goalie_matchup?.home_gsax ?? null
      },
      away: {
        team: awayTeam?.full_name,
        starter: advancedStats?.goalie_matchup?.away_starter ?? null,
        record: advancedStats?.goalie_matchup?.away_record ?? null,
        save_pct: advancedStats?.goalie_matchup?.away_sv_pct ?? null,
        gaa: advancedStats?.goalie_matchup?.away_gaa ?? null,
        gsax: advancedStats?.goalie_matchup?.away_gsax ?? null
      }
    },
    
    // Shot Metrics
    shot_metrics: {
      home: {
        team: homeTeam?.full_name,
        shots_for_pg: homeRates?.shotsForPerGame ?? null,
        shots_against_pg: homeRates?.shotsAgainstPerGame ?? null,
        shot_diff: homeRates?.shotsForPerGame && homeRates?.shotsAgainstPerGame 
          ? (homeRates.shotsForPerGame - homeRates.shotsAgainstPerGame).toFixed(1) 
          : null
      },
      away: {
        team: awayTeam?.full_name,
        shots_for_pg: awayRates?.shotsForPerGame ?? null,
        shots_against_pg: awayRates?.shotsAgainstPerGame ?? null,
        shot_diff: awayRates?.shotsForPerGame && awayRates?.shotsAgainstPerGame 
          ? (awayRates.shotsForPerGame - awayRates.shotsAgainstPerGame).toFixed(1) 
          : null
      }
    },
    
    // Scoring Rates
    scoring: {
      home: {
        team: homeTeam?.full_name,
        goals_for_pg: homeRates?.goalsForPerGame ?? null,
        goals_against_pg: homeRates?.goalsAgainstPerGame ?? null
      },
      away: {
        team: awayTeam?.full_name,
        goals_for_pg: awayRates?.goalsForPerGame ?? null,
        goals_against_pg: awayRates?.goalsAgainstPerGame ?? null
      }
    },
    
    // Five-on-Five play (from Gemini Grounding)
    five_on_five: {
      home: { 
        team: homeTeam?.full_name,
        cf_pct: advancedStats?.home_advanced?.corsi_for_pct ?? null, 
        xgf_pct: advancedStats?.home_advanced?.expected_goals_for_pct ?? null 
      },
      away: { 
        team: awayTeam?.full_name,
        cf_pct: advancedStats?.away_advanced?.corsi_for_pct ?? null, 
        xgf_pct: advancedStats?.away_advanced?.expected_goals_for_pct ?? null 
      }
    },
    
    // Rest & Travel
    rest_fatigue: {
      home: { team: homeTeam?.full_name, ...restInfo.home },
      away: { team: awayTeam?.full_name, ...restInfo.away }
    },
    
    // Recent Form
    recent_form: {
      home: { team: homeTeam?.full_name, ...recentForm.home },
      away: { team: awayTeam?.full_name, ...recentForm.away }
    },
    
    // Injuries
    injury_report: {
      notable: injuries.slice(0, 8),
      total_listed: injuries.length
    },
    
    // Market
    market_snapshot: marketSnapshot
  };
}

/**
 * Main context builder for NHL agentic pipeline
 */
export async function buildNhlAgenticContext(game, options = {}) {
  const commenceDate = parseGameDate(game.commence_time) || new Date();
  const month = commenceDate.getMonth() + 1;
  const year = commenceDate.getFullYear();
  // NHL season starts in October: Oct(10)-Dec = currentYear, Jan-Sep = previousYear
  const season = month >= 10 ? year : year - 1;
  
  // Lookback window for recent games (21 days)
  const lookbackStart = new Date(commenceDate);
  lookbackStart.setDate(lookbackStart.getDate() - 21);
  const startStr = lookbackStart.toISOString().slice(0, 10);
  const endStr = commenceDate.toISOString().slice(0, 10);

  console.log(`[Agentic][NHL] Building context for ${game.away_team} @ ${game.home_team}`);

  // Resolve teams - with detailed logging if fails
  const [homeTeam, awayTeam] = await Promise.all([
    safeApiCallObject(
      () => ballDontLieService.getTeamByNameGeneric(SPORT_KEY, game.home_team),
      `NHL: Resolve home team "${game.home_team}"`
    ),
    safeApiCallObject(
      () => ballDontLieService.getTeamByNameGeneric(SPORT_KEY, game.away_team),
      `NHL: Resolve away team "${game.away_team}"`
    )
  ]);

  if (!homeTeam || !awayTeam) {
    console.warn('[Agentic][NHL] Could not resolve one or both teams');
  }

  const teamIds = [];
  if (homeTeam?.id) teamIds.push(homeTeam.id);
  if (awayTeam?.id) teamIds.push(awayTeam.id);

  // Parallel fetch: recent games, injuries, standings, season stats - with detailed logging
  const [homeRecent, awayRecent, injuries, standings, h2hHistory, leagueRanks, homeHotPlayers, awayHotPlayers] = await Promise.all([
    homeTeam ? safeApiCallArray(
      () => ballDontLieService.getGames(
        SPORT_KEY,
        { seasons: [season], team_ids: [homeTeam.id], postseason: false, start_date: startStr, end_date: endStr, per_page: 50 },
        options.nocache ? 0 : 10
      ),
      `NHL: Fetch home team "${game.home_team}" recent games`
    ) : Promise.resolve([]),
    
    awayTeam ? safeApiCallArray(
      () => ballDontLieService.getGames(
        SPORT_KEY,
        { seasons: [season], team_ids: [awayTeam.id], postseason: false, start_date: startStr, end_date: endStr, per_page: 50 },
        options.nocache ? 0 : 10
      ),
      `NHL: Fetch away team "${game.away_team}" recent games`
    ) : Promise.resolve([]),
    
    teamIds.length > 0 
      ? safeApiCallArray(
          () => ballDontLieService.getInjuriesGeneric(SPORT_KEY, { team_ids: teamIds }, options.nocache ? 0 : 5),
          `NHL: Fetch injuries for teams ${teamIds.join(', ')}`
        )
      : Promise.resolve([]),
    
    safeApiCallArray(
      () => ballDontLieService.getStandingsGeneric(SPORT_KEY, { season }),
      `NHL: Fetch ${season} season standings`
    ),

    (homeTeam?.id && awayTeam?.id)
      ? safeApiCallArray(
          () => ballDontLieService.getH2HHistory(SPORT_KEY, homeTeam.id, awayTeam.id),
          `NHL: Fetch H2H history between ${game.home_team} and ${game.away_team}`
        )
      : Promise.resolve([]),

    safeApiCallObject(
      () => ballDontLieService.getNhlLeagueRanks(season),
      `NHL: Fetch ${season} league rankings`
    ),

    homeTeam ? safeApiCallArray(
      () => ballDontLieService.getTeamTopPerformers(SPORT_KEY, homeTeam.id),
      `NHL: Fetch top performers for home team "${game.home_team}"`
    ) : Promise.resolve([]),

    awayTeam ? safeApiCallArray(
      () => ballDontLieService.getTeamTopPerformers(SPORT_KEY, awayTeam.id),
      `NHL: Fetch top performers for away team "${game.away_team}"`
    ) : Promise.resolve([])
  ]);

  // Fetch season rates (PP%, PK%, shots, goals) - with detailed logging
  const [homePairs, awayPairs] = await Promise.all([
    homeTeam ? safeApiCallArray(
      () => ballDontLieService.getTeamSeasonStats(SPORT_KEY, { teamId: homeTeam.id, season, postseason: false }),
      `NHL: Fetch home team "${game.home_team}" season stats`
    ) : Promise.resolve([]),
    awayTeam ? safeApiCallArray(
      () => ballDontLieService.getTeamSeasonStats(SPORT_KEY, { teamId: awayTeam.id, season, postseason: false }),
      `NHL: Fetch away team "${game.away_team}" season stats`
    ) : Promise.resolve([])
  ]);

  const homeRates = ballDontLieService.deriveNhlTeamRates?.(homePairs) || {};
  const awayRates = ballDontLieService.deriveNhlTeamRates?.(awayPairs) || {};

  // Fetch Gemini Grounding advanced stats (Corsi, xG, PDO, goalie matchup)
  let advancedStats = null;
  const dateStr = getEstDate(commenceDate);
  try {
    console.log('[Agentic][NHL] Fetching advanced stats via Gemini Grounding...');
    advancedStats = await getGroundedAdvancedStats(game.home_team, game.away_team, 'nhl', dateStr);
    if (advancedStats?._source === 'gemini_grounding') {
      console.log('[Agentic][NHL] ✓ Got Grounding advanced stats (Corsi, xG, PDO, goalie matchup)');
    }
  } catch (e) {
    console.warn('[Agentic][NHL] Grounding advanced stats failed:', e.message);
  }
  
  // NEW: Fallback loop for missing critical NHL stats
  // Check if key fields are null/missing and run targeted grounding search
  const missingFields = [];
  if (!advancedStats?.home_advanced?.corsi_for_pct && !advancedStats?.away_advanced?.corsi_for_pct) {
    missingFields.push('corsi_for_pct');
  }
  if (!advancedStats?.home_advanced?.expected_goals_for_pct && !advancedStats?.away_advanced?.expected_goals_for_pct) {
    missingFields.push('xg_for_pct');
  }
  if (!advancedStats?.goalie_matchup?.home_starter && !advancedStats?.goalie_matchup?.away_starter) {
    missingFields.push('goalie_starter');
  }
  if (!advancedStats?.goalie_matchup?.home_gsax && !advancedStats?.goalie_matchup?.away_gsax) {
    missingFields.push('gsax');
  }
  if (!advancedStats?.home_advanced?.high_danger_chances_for_pct) {
    missingFields.push('high_danger_pct');
  }
  
  // Run fallback grounding if there are missing fields
  if (missingFields.length > 0) {
    const fallbackData = await groundingFallbackForMissingStats(
      homeTeam?.full_name || game.home_team,
      awayTeam?.full_name || game.away_team,
      missingFields,
      dateStr
    );
    
    // Merge fallback data into advancedStats
    if (fallbackData) {
      advancedStats = advancedStats || { home_advanced: {}, away_advanced: {}, goalie_matchup: {} };
      
      // Merge home_advanced (only if original is null/missing)
      if (fallbackData.home_advanced) {
        for (const [key, val] of Object.entries(fallbackData.home_advanced)) {
          if (val !== null && !advancedStats.home_advanced?.[key]) {
            advancedStats.home_advanced = advancedStats.home_advanced || {};
            advancedStats.home_advanced[key] = val;
          }
        }
      }
      
      // Merge away_advanced
      if (fallbackData.away_advanced) {
        for (const [key, val] of Object.entries(fallbackData.away_advanced)) {
          if (val !== null && !advancedStats.away_advanced?.[key]) {
            advancedStats.away_advanced = advancedStats.away_advanced || {};
            advancedStats.away_advanced[key] = val;
          }
        }
      }
      
      // Merge goalie_matchup
      if (fallbackData.goalie_matchup) {
        advancedStats.goalie_matchup = advancedStats.goalie_matchup || {};
        for (const [key, val] of Object.entries(fallbackData.goalie_matchup)) {
          if (val !== null && !advancedStats.goalie_matchup[key]) {
            advancedStats.goalie_matchup[key] = val;
          }
        }
      }
      
      advancedStats._source_fallback = 'gemini_grounding_fallback';
      console.log('[Agentic][NHL] ✓ Merged fallback grounding data');
    }
  }

  // Fetch rich context via Gemini Grounding (streaks, trends, injuries, narratives)
  let richContext = null;
  try {
    const dateStr = commenceDate.toISOString().slice(0, 10);
    console.log('[Agentic][NHL] Fetching rich context via Gemini Grounding...');
    richContext = await getGroundedRichContext(game.home_team, game.away_team, 'nhl', dateStr);
    if (richContext && Object.keys(richContext).length > 0) {
      console.log('[Agentic][NHL] ✓ Got Grounding rich context');
    }
  } catch (e) {
    console.warn('[Agentic][NHL] Grounding rich context failed:', e.message);
  }

  // Calculate rest info
  const restInfo = {
    home: calcRestInfo(homeRecent, homeTeam?.id, commenceDate),
    away: calcRestInfo(awayRecent, awayTeam?.id, commenceDate)
  };

  // Calculate recent form
  const recentForm = {
    home: calcRecentForm(homeRecent, homeTeam?.id, 5),
    away: calcRecentForm(awayRecent, awayTeam?.id, 5)
  };

  // Merge Grounding recent form if available
  if (advancedStats?.recent_form) {
    if (advancedStats.recent_form.home_last_10) {
      recentForm.home.last10 = advancedStats.recent_form.home_last_10;
      recentForm.home.goalsPerGameL10 = advancedStats.recent_form.home_goals_per_game_l10;
    }
    if (advancedStats.recent_form.away_last_10) {
      recentForm.away.last10 = advancedStats.recent_form.away_last_10;
      recentForm.away.goalsPerGameL10 = advancedStats.recent_form.away_goals_per_game_l10;
    }
  }

  // Long-term injuries that should NOT count as edges or contradictions
  // (Same logic as NBA - these are already priced in, not actionable)
  const LONG_TERM_INJURY_KEYWORDS = [
    'out for season', 'season-ending', 'out indefinitely', 'out all year',
    'ruled out for 2025', 'not expected to return', 'out for the year'
  ];

  /**
   * Check if an injury should be ignored (long-term, not an edge)
   */
  const isLongTermInjury = (injuryDescription) => {
    if (!injuryDescription) return false;
    const lower = injuryDescription.toLowerCase();
    return LONG_TERM_INJURY_KEYWORDS.some(kw => lower.includes(kw));
  };

  // Format injuries - filter out Available status and long-term injuries
  // (Same approach as NBA: only show actionable injuries that affect today's game)
  const formattedInjuries = (injuries || [])
    .filter(inj => {
      // Exclude Available players
      if (!inj?.status || inj.status === 'Available') return false;
      // Exclude long-term injuries (season-ending, etc.) - these are already priced in
      if (isLongTermInjury(inj.description)) return false;
      return true;
    })
    .map(inj => ({
      player: `${inj?.player?.first_name || ''} ${inj?.player?.last_name || ''}`.trim(),
      position: inj?.player?.position || 'Unknown',
      status: inj.status,
      description: inj.description || '',
      team: inj?.team?.full_name || ''
    }));

  // Build market snapshot
  const marketSnapshot = buildMarketSnapshot(
    game.bookmakers || [],
    homeTeam?.full_name || game.home_team,
    awayTeam?.full_name || game.away_team
  );

  // Build token data
  const tokenData = buildNhlTokenData(
    homeRates,
    awayRates,
    advancedStats,
    restInfo,
    recentForm,
    formattedInjuries,
    marketSnapshot,
    h2hHistory,
    leagueRanks,
    homeTeam,
    awayTeam,
    homeHotPlayers,
    awayHotPlayers
  );

  // Build game summary
  const homeBasics = formatTeamBasics(homeTeam, standings);
  const awayBasics = formatTeamBasics(awayTeam, standings);

  const gameSummary = {
    gameId: `nhl-${game.id}`,
    sport: SPORT_KEY,
    league: 'NHL',
    matchup: `${game.away_team} @ ${game.home_team}`,
    homeTeam: homeTeam?.full_name || game.home_team,
    awayTeam: awayTeam?.full_name || game.away_team,
    tipoff: formatGameTimeEST(game.commence_time),
    location: `${homeTeam?.city || ''} (${homeBasics.conference} ${homeBasics.division})`,
    odds: {
      spread: marketSnapshot.spread,
      moneyline: marketSnapshot.moneyline,
      total: marketSnapshot.total
    },
    records: {
      home: homeBasics.record,
      away: awayBasics.record
    },
    narrative: {
      home: homeBasics.streak ? `Streak: ${homeBasics.streak}` : '',
      away: awayBasics.streak ? `Streak: ${awayBasics.streak}` : '',
      notes: richContext?.summary || advancedStats?.key_analytics_insights?.join('; ') || null
    }
  };

  console.log(`[Agentic][NHL] Context built with ${formattedInjuries.length} injuries, ` +
    `home form: ${recentForm.home.record}, away form: ${recentForm.away.record}`);

  return {
    gameSummary,
    tokenData,
    oddsSummary: marketSnapshot,
    meta: {
      homeTeam,
      awayTeam,
      season,
      window: { start: startStr, end: endStr },
      richKeyFindings: richContext?.key_findings || advancedStats?.key_analytics_insights || [],
      advancedStatsSource: advancedStats?._source || 'none',
      groundingDataSources: advancedStats?.data_sources || []
    }
  };
}

export default {
  buildNhlAgenticContext
};

