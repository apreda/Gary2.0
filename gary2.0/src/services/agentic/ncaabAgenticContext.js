import { ballDontLieService } from '../ballDontLieService.js';
import { perplexityService } from '../perplexityService.js';
import { formatGameTimeEST, buildMarketSnapshot, calcRestInfo, calcRecentForm, parseGameDate } from './sharedUtils.js';

const SPORT_KEY = 'basketball_ncaab';

// Minimum games played threshold to consider a team has adequate data
const MIN_GAMES_THRESHOLD = 3;

/**
 * Check if a team profile has adequate data for analysis
 * @param {Object} profile - Team profile built from season stats
 * @param {Array} seasonRows - Raw season stats rows from API
 * @returns {boolean} - True if team has sufficient data
 */
const hasAdequateData = (profile, seasonRows) => {
  const map = seasonRowToMap(seasonRows);
  const gamesPlayed = map.games_played ?? map.games ?? 0;
  
  // Must have played at least MIN_GAMES_THRESHOLD games
  if (gamesPlayed < MIN_GAMES_THRESHOLD) return false;
  
  // Check for essential stats being present
  const hasFGData = profile.shooting?.fgPct != null && profile.shooting.fgPct > 0;
  const hasTempo = profile.tempo != null && profile.tempo > 0;
  const hasRecord = profile.record != null && profile.record !== 'N/A';
  
  // Need at least shooting stats and games played
  return hasFGData || (hasRecord && gamesPlayed >= MIN_GAMES_THRESHOLD);
};

const seasonRowToMap = (rows) => {
  if (!Array.isArray(rows) || rows.length === 0) return {};
  if (rows[0]?.name && typeof rows[0]?.value !== 'undefined') {
    const map = {};
    rows.forEach((row) => {
      map[row.name] = row.value;
    });
    return map;
  }
  return rows[0] || {};
};

const safeDiv = (num, den) => {
  if (typeof num !== 'number' || typeof den !== 'number' || den === 0) return null;
  return num / den;
};

const buildTeamProfile = (seasonRows = [], standingsRow = null) => {
  const map = seasonRowToMap(seasonRows);
  const games = map.games_played ?? map.games ?? null;
  const points = map.points ?? map.total_points ?? null;
  const oppPoints = map.points_against ?? map.opp_total_points ?? null;
  const fga = map.field_goals_attempted ?? map.fga ?? null;
  const fgm = map.field_goals_made ?? map.fgm ?? null;
  const fg3a = map.three_point_field_goals_attempted ?? map.fg3a ?? null;
  const fg3m = map.three_point_field_goals_made ?? map.fg3m ?? null;
  const fta = map.free_throws_attempted ?? map.fta ?? null;
  const ftm = map.free_throws_made ?? map.ftm ?? null;
  const oreb = map.offensive_rebounds ?? map.oreb ?? null;
  const dreb = map.defensive_rebounds ?? map.dreb ?? null;
  const treb = (typeof oreb === 'number' && typeof dreb === 'number') ? oreb + dreb : null;
  const turnovers = map.turnovers ?? map.tov ?? null;
  const possessions = (typeof fga === 'number' && typeof fta === 'number' && typeof oreb === 'number' && typeof turnovers === 'number')
    ? fga + 0.44 * fta - oreb + turnovers
    : null;

  const record = standingsRow?.record || map.record || null;
  const homeRecord =
    standingsRow?.home_record ||
    (standingsRow?.home_wins != null && standingsRow?.home_losses != null
      ? `${standingsRow.home_wins}-${standingsRow.home_losses}`
      : null);
  const roadRecord =
    standingsRow?.away_record ||
    (standingsRow?.away_wins != null && standingsRow?.away_losses != null
      ? `${standingsRow.away_wins}-${standingsRow.away_losses}`
      : null);

  return {
    record,
    homeRecord,
    roadRecord,
    adjEfficiency: points != null && possessions
      ? {
          offensiveRating: safeDiv(points, possessions) != null ? safeDiv(points, possessions) * 100 : null,
          defensiveRating: (oppPoints != null && possessions) ? (oppPoints / possessions) * 100 : null,
          netRating:
            (points != null && oppPoints != null && possessions)
              ? ((points - oppPoints) / possessions) * 100
              : null
        }
      : {},
    tempo: games ? safeDiv(possessions, games) : possessions,
    turnoverRate: possessions ? safeDiv(turnovers, possessions) : null,
    offensiveRebRate: treb ? safeDiv(oreb, treb) : null,
    threePointDependency: (typeof fg3a === 'number' && typeof fga === 'number' && fga > 0) ? fg3a / fga : null,
    ftRate: (typeof fta === 'number' && typeof fga === 'number' && fga > 0) ? fta / fga : null,
    shooting: {
      fgPct: (typeof fgm === 'number' && typeof fga === 'number' && fga > 0) ? fgm / fga : null,
      threePct: (typeof fg3m === 'number' && typeof fg3a === 'number' && fg3a > 0) ? fg3m / fg3a : null,
      ftPct: (typeof ftm === 'number' && typeof fta === 'number' && fta > 0) ? ftm / fta : null
    }
  };
};

export async function buildNcaabAgenticContext(game, options = {}) {
  const commenceDate = parseGameDate(game.commence_time) || new Date();
  const season = commenceDate.getMonth() + 1 <= 4 ? commenceDate.getFullYear() - 1 : commenceDate.getFullYear();

  const homeTeam = await ballDontLieService.getTeamByNameGeneric(SPORT_KEY, game.home_team);
  const awayTeam = await ballDontLieService.getTeamByNameGeneric(SPORT_KEY, game.away_team);

  if (!homeTeam || !awayTeam) {
    throw new Error('Unable to resolve NCAAB teams for agentic context');
  }

  const lookbackStart = new Date(commenceDate);
  lookbackStart.setDate(lookbackStart.getDate() - 21);
  const startStr = lookbackStart.toISOString().slice(0, 10);
  const endStr = commenceDate.toISOString().slice(0, 10);

  const homeConference = homeTeam.conference || homeTeam.conference_id;
  const awayConference = awayTeam.conference || awayTeam.conference_id;

  const [homeRecent, awayRecent, injuries, homeStandings, awayStandings, homeSeasonRows, awaySeasonRows] = await Promise.all([
    ballDontLieService.getGames(
      SPORT_KEY,
      { seasons: [season], team_ids: [homeTeam.id], start_date: startStr, end_date: endStr, per_page: 50 },
      options.nocache ? 0 : 5
    ),
    ballDontLieService.getGames(
      SPORT_KEY,
      { seasons: [season], team_ids: [awayTeam.id], start_date: startStr, end_date: endStr, per_page: 50 },
      options.nocache ? 0 : 5
    ),
    ballDontLieService.getInjuriesGeneric(SPORT_KEY, { team_ids: [homeTeam.id, awayTeam.id] }, options.nocache ? 0 : 5),
    ballDontLieService.getStandingsGeneric(
      SPORT_KEY,
      homeConference ? { season, conference_id: homeConference } : { season }
    ),
    ballDontLieService.getStandingsGeneric(
      SPORT_KEY,
      awayConference ? { season, conference_id: awayConference } : { season }
    ),
    ballDontLieService.getTeamSeasonStats(SPORT_KEY, { teamId: homeTeam.id, season }),
    ballDontLieService.getTeamSeasonStats(SPORT_KEY, { teamId: awayTeam.id, season })
  ]);

  const restInfo = {
    home: calcRestInfo(homeRecent, homeTeam.id, commenceDate),
    away: calcRestInfo(awayRecent, awayTeam.id, commenceDate)
  };
  const recentForm = {
    home: calcRecentForm(homeRecent, homeTeam.id, 5),
    away: calcRecentForm(awayRecent, awayTeam.id, 5)
  };

  const homeProfile = buildTeamProfile(homeSeasonRows, Array.isArray(homeStandings) ? homeStandings.find((r) => r?.team?.id === homeTeam.id) : null);
  const awayProfile = buildTeamProfile(awaySeasonRows, Array.isArray(awayStandings) ? awayStandings.find((r) => r?.team?.id === awayTeam.id) : null);

  // Check data quality for both teams
  const homeHasData = hasAdequateData(homeProfile, homeSeasonRows);
  const awayHasData = hasAdequateData(awayProfile, awaySeasonRows);
  const dataQuality = {
    homeHasAdequateData: homeHasData,
    awayHasAdequateData: awayHasData,
    bothTeamsHaveData: homeHasData && awayHasData,
    homeGamesPlayed: seasonRowToMap(homeSeasonRows).games_played ?? seasonRowToMap(homeSeasonRows).games ?? 0,
    awayGamesPlayed: seasonRowToMap(awaySeasonRows).games_played ?? seasonRowToMap(awaySeasonRows).games ?? 0
  };
  
  if (!dataQuality.bothTeamsHaveData) {
    console.warn(`[Agentic][NCAAB] ⚠️ Insufficient data for game: ${game.away_team} @ ${game.home_team}`);
    console.warn(`  - ${game.home_team}: ${homeHasData ? '✓' : '✗'} (${dataQuality.homeGamesPlayed} games)`);
    console.warn(`  - ${game.away_team}: ${awayHasData ? '✓' : '✗'} (${dataQuality.awayGamesPlayed} games)`);
  }

  const injuriesList = (injuries || []).map((injury) => ({
    player: injury?.player?.full_name || `${injury?.player?.first_name || ''} ${injury?.player?.last_name || ''}`.trim(),
    status: injury?.status,
    description: injury?.description || '',
    team: injury?.team?.full_name || ''
  }));

  const marketSnapshot = buildMarketSnapshot(game.bookmakers || [], homeTeam.full_name, awayTeam.full_name);

  let richContext = null;
  try {
    const dateStr = commenceDate.toISOString().slice(0, 10);
    richContext = await perplexityService.getRichGameContext(game.home_team, game.away_team, 'ncaab', dateStr);
  } catch (error) {
    console.warn('[Agentic][NCAAB] Perplexity context failed:', error.message);
  }

  const tokenData = {
    adj_efficiency: {
      home: homeProfile.adjEfficiency,
      away: awayProfile.adjEfficiency
    },
    tempo: {
      home: { possessionsPerGame: homeProfile.tempo },
      away: { possessionsPerGame: awayProfile.tempo }
    },
    turnover_rate: {
      home: { turnoverRate: homeProfile.turnoverRate },
      away: { turnoverRate: awayProfile.turnoverRate }
    },
    offensive_rebounding: {
      home: { offensiveRebRate: homeProfile.offensiveRebRate },
      away: { offensiveRebRate: awayProfile.offensiveRebRate }
    },
    three_pt_dependency: {
      home: { attemptRate: homeProfile.threePointDependency },
      away: { attemptRate: awayProfile.threePointDependency }
    },
    home_court_value: {
      home: { record: homeProfile.homeRecord, roadRecord: homeProfile.roadRecord },
      away: { record: awayProfile.homeRecord, roadRecord: awayProfile.roadRecord }
    },
    ft_rate: {
      home: { rate: homeProfile.ftRate, ftPct: homeProfile.shooting.ftPct },
      away: { rate: awayProfile.ftRate, ftPct: awayProfile.shooting.ftPct }
    },
    injury_report: {
      notable: injuriesList.slice(0, 6),
      total_listed: injuriesList.length
    },
    market_snapshot: marketSnapshot,
    recent_form: recentForm
  };

  const records = {
    home: homeProfile.record || 'N/A',
    away: awayProfile.record || 'N/A'
  };

  const gameSummary = {
    gameId: `ncaab-${game.id}`,
    sport: SPORT_KEY,
    league: 'NCAAB',
    matchup: `${game.away_team} @ ${game.home_team}`,
    homeTeam: homeTeam.full_name,
    awayTeam: awayTeam.full_name,
    tipoff: formatGameTimeEST(game.commence_time),
    location: homeTeam.city || homeTeam.full_name,
    odds: {
      spread: marketSnapshot.spread,
      moneyline: marketSnapshot.moneyline
    },
    records,
    narrative: {
      home: richContext?.home_storyline || null,
      away: richContext?.away_storyline || null,
      notes: richContext?.summary || null
    }
  };

  return {
    gameSummary,
    tokenData,
    oddsSummary: marketSnapshot,
    meta: {
      homeTeam,
      awayTeam,
      season,
      window: { start: startStr, end: endStr },
      richKeyFindings: richContext?.key_findings || [],
      dataQuality
    }
  };
}

