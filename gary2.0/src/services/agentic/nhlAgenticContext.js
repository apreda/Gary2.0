/**
 * NHL Agentic Context Builder
 * Builds rich context for NHL moneyline/spread picks using the 3-stage agentic pipeline
 * Modeled after nbaAgenticContext.js
 */
import { ballDontLieService } from '../ballDontLieService.js';
import { perplexityService } from '../perplexityService.js';
import {
  formatGameTimeEST,
  buildMarketSnapshot,
  parseGameDate
} from './sharedUtils.js';

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
function buildNhlTokenData(homeRates, awayRates, advancedStats, restInfo, recentForm, injuries, marketSnapshot) {
  return {
    // Corsi & Expected Goals (from Perplexity advanced stats)
    corsi_xg: {
      home: {
        corsiForPct: advancedStats?.home_advanced?.corsi_for_pct ?? null,
        xGForPct: advancedStats?.home_advanced?.expected_goals_for_pct ?? null,
        pdo: advancedStats?.home_advanced?.pdo ?? null,
        highDangerPct: advancedStats?.home_advanced?.high_danger_chances_for_pct ?? null
      },
      away: {
        corsiForPct: advancedStats?.away_advanced?.corsi_for_pct ?? null,
        xGForPct: advancedStats?.away_advanced?.expected_goals_for_pct ?? null,
        pdo: advancedStats?.away_advanced?.pdo ?? null,
        highDangerPct: advancedStats?.away_advanced?.high_danger_chances_for_pct ?? null
      }
    },
    
    // Special Teams
    special_teams: {
      home: {
        ppPct: homeRates?.ppPct ?? null,
        pkPct: homeRates?.pkPct ?? null,
        ppOpportunities: homeRates?.ppOpportunities ?? null
      },
      away: {
        ppPct: awayRates?.ppPct ?? null,
        pkPct: awayRates?.pkPct ?? null,
        ppOpportunities: awayRates?.ppOpportunities ?? null
      }
    },
    
    // Goalie Matchup (from Perplexity)
    goalie_matchup: {
      home: {
        starter: advancedStats?.goalie_matchup?.home_starter ?? null,
        record: advancedStats?.goalie_matchup?.home_record ?? null,
        savePct: advancedStats?.goalie_matchup?.home_sv_pct ?? null,
        gaa: advancedStats?.goalie_matchup?.home_gaa ?? null,
        gsax: advancedStats?.goalie_matchup?.home_gsax ?? null
      },
      away: {
        starter: advancedStats?.goalie_matchup?.away_starter ?? null,
        record: advancedStats?.goalie_matchup?.away_record ?? null,
        savePct: advancedStats?.goalie_matchup?.away_sv_pct ?? null,
        gaa: advancedStats?.goalie_matchup?.away_gaa ?? null,
        gsax: advancedStats?.goalie_matchup?.away_gsax ?? null
      }
    },
    
    // Shot Metrics
    shot_metrics: {
      home: {
        shotsForPerGame: homeRates?.shotsForPerGame ?? null,
        shotsAgainstPerGame: homeRates?.shotsAgainstPerGame ?? null,
        shotDifferential: homeRates?.shotsForPerGame && homeRates?.shotsAgainstPerGame 
          ? (homeRates.shotsForPerGame - homeRates.shotsAgainstPerGame).toFixed(1) 
          : null
      },
      away: {
        shotsForPerGame: awayRates?.shotsForPerGame ?? null,
        shotsAgainstPerGame: awayRates?.shotsAgainstPerGame ?? null,
        shotDifferential: awayRates?.shotsForPerGame && awayRates?.shotsAgainstPerGame 
          ? (awayRates.shotsForPerGame - awayRates.shotsAgainstPerGame).toFixed(1) 
          : null
      }
    },
    
    // Scoring Rates
    scoring: {
      home: {
        goalsForPerGame: homeRates?.goalsForPerGame ?? null,
        goalsAgainstPerGame: homeRates?.goalsAgainstPerGame ?? null
      },
      away: {
        goalsForPerGame: awayRates?.goalsForPerGame ?? null,
        goalsAgainstPerGame: awayRates?.goalsAgainstPerGame ?? null
      }
    },
    
    // Five-on-Five play (from Perplexity)
    five_on_five: advancedStats?.five_on_five ?? {
      home: { cfPct: null, xgfPct: null },
      away: { cfPct: null, xgfPct: null }
    },
    
    // Rest & Travel
    rest_fatigue: restInfo,
    
    // Recent Form
    recent_form: recentForm,
    
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
  // NHL season spans Oct-June, so if month <= 6, we're in previous year's season
  const season = month <= 6 ? year - 1 : year;
  
  // Lookback window for recent games (21 days)
  const lookbackStart = new Date(commenceDate);
  lookbackStart.setDate(lookbackStart.getDate() - 21);
  const startStr = lookbackStart.toISOString().slice(0, 10);
  const endStr = commenceDate.toISOString().slice(0, 10);

  console.log(`[Agentic][NHL] Building context for ${game.away_team} @ ${game.home_team}`);

  // Resolve teams
  const [homeTeam, awayTeam] = await Promise.all([
    ballDontLieService.getTeamByNameGeneric(SPORT_KEY, game.home_team).catch(() => null),
    ballDontLieService.getTeamByNameGeneric(SPORT_KEY, game.away_team).catch(() => null)
  ]);

  if (!homeTeam || !awayTeam) {
    console.warn('[Agentic][NHL] Could not resolve one or both teams');
  }

  const teamIds = [];
  if (homeTeam?.id) teamIds.push(homeTeam.id);
  if (awayTeam?.id) teamIds.push(awayTeam.id);

  // Parallel fetch: recent games, injuries, standings, season stats
  const [homeRecent, awayRecent, injuries, standings] = await Promise.all([
    homeTeam ? ballDontLieService.getGames(
      SPORT_KEY,
      { seasons: [season], team_ids: [homeTeam.id], postseason: false, start_date: startStr, end_date: endStr, per_page: 50 },
      options.nocache ? 0 : 10
    ).catch(() => []) : Promise.resolve([]),
    
    awayTeam ? ballDontLieService.getGames(
      SPORT_KEY,
      { seasons: [season], team_ids: [awayTeam.id], postseason: false, start_date: startStr, end_date: endStr, per_page: 50 },
      options.nocache ? 0 : 10
    ).catch(() => []) : Promise.resolve([]),
    
    teamIds.length > 0 
      ? ballDontLieService.getInjuriesGeneric(SPORT_KEY, { team_ids: teamIds }, options.nocache ? 0 : 5).catch(() => [])
      : Promise.resolve([]),
    
    ballDontLieService.getStandingsGeneric(SPORT_KEY, { season }).catch(() => [])
  ]);

  // Fetch season rates (PP%, PK%, shots, goals)
  const [homePairs, awayPairs] = await Promise.all([
    homeTeam ? ballDontLieService.getTeamSeasonStats(SPORT_KEY, { teamId: homeTeam.id, season, postseason: false }).catch(() => []) : Promise.resolve([]),
    awayTeam ? ballDontLieService.getTeamSeasonStats(SPORT_KEY, { teamId: awayTeam.id, season, postseason: false }).catch(() => []) : Promise.resolve([])
  ]);

  const homeRates = ballDontLieService.deriveNhlTeamRates?.(homePairs) || {};
  const awayRates = ballDontLieService.deriveNhlTeamRates?.(awayPairs) || {};

  // Fetch Perplexity advanced stats (Corsi, xG, PDO, goalie matchup)
  let advancedStats = null;
  try {
    const dateStr = commenceDate.toISOString().slice(0, 10);
    console.log('[Agentic][NHL] Fetching Perplexity advanced stats...');
    advancedStats = await perplexityService.getNhlAdvancedStats(game.home_team, game.away_team, dateStr);
    if (advancedStats?._source === 'perplexity') {
      console.log('[Agentic][NHL] ✓ Got Perplexity advanced stats (Corsi, xG, PDO, goalie matchup)');
    }
  } catch (e) {
    console.warn('[Agentic][NHL] Perplexity advanced stats failed:', e.message);
  }

  // Fetch Perplexity rich context (streaks, trends, injuries, narratives)
  let richContext = null;
  try {
    const dateStr = commenceDate.toISOString().slice(0, 10);
    console.log('[Agentic][NHL] Fetching Perplexity rich context...');
    richContext = await perplexityService.getRichGameContext(game.home_team, game.away_team, 'nhl', dateStr);
    if (richContext && Object.keys(richContext).length > 0) {
      console.log('[Agentic][NHL] ✓ Got Perplexity rich context');
    }
  } catch (e) {
    console.warn('[Agentic][NHL] Perplexity rich context failed:', e.message);
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

  // Merge Perplexity recent form if available
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

  // Format injuries
  const formattedInjuries = (injuries || [])
    .filter(inj => inj?.status && inj.status !== 'Available')
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
    marketSnapshot
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
      perplexityDataSources: advancedStats?.data_sources || []
    }
  };
}

export default {
  buildNhlAgenticContext
};

