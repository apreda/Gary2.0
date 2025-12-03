import { ballDontLieService } from '../ballDontLieService.js';
import { perplexityService } from '../perplexityService.js';
import { formatGameTimeEST, buildMarketSnapshot, calcRestInfo, calcRecentForm, parseGameDate } from './sharedUtils.js';

const SPORT_KEY = 'americanfootball_ncaaf';

const seasonStatsToMap = (rows) => {
  if (!Array.isArray(rows) || rows.length === 0) return {};
  if (rows[0]?.name && typeof rows[0]?.value !== 'undefined') {
    const map = {};
    rows.forEach((r) => {
      map[r.name] = r.value;
    });
    return map;
  }
  return rows[0] || {};
};

const safeRate = (num, den) => {
  if (typeof num !== 'number' || typeof den !== 'number' || den === 0) return null;
  return num / den;
};

const buildCollegeMetrics = (map = {}) => {
  const wins = map.overall_wins ?? map.wins ?? null;
  const losses = map.overall_losses ?? map.losses ?? null;
  const games = (typeof wins === 'number' && typeof losses === 'number') ? wins + losses : map.games_played ?? null;
  const totalYards = map.total_offensive_yards ?? map.total_yards ?? null;
  const offensivePlays = map.total_offensive_plays ?? map.offensive_plays ?? null;
  const yardsPerPlay = map.yards_per_play ?? safeRate(totalYards, offensivePlays);
  const oppYardsPerPlay = map.opp_yards_per_play ?? null;
  const offensivePoints = map.total_points ?? null;
  const defensivePoints = map.opp_total_points ?? null;
  const pointsPerGame = games ? safeRate(offensivePoints, games) : null;
  const oppPointsPerGame = games ? safeRate(defensivePoints, games) : null;
  const tacklesForLoss = map.defensive_tackles_for_loss ?? map.tackles_for_loss ?? null;
  const sacks = map.sacks ?? map.defensive_sacks ?? null;
  const defensivePlays = map.defensive_plays ?? null;
  const havocRate = defensivePlays ? safeRate((tacklesForLoss || 0) + (sacks || 0), defensivePlays) : null;
  const redZoneScores = map.red_zone_scores ?? null;
  const redZoneAttempts = map.red_zone_attempts ?? null;
  const finishingDrives = safeRate(redZoneScores, redZoneAttempts);
  const pace = games ? safeRate(offensivePlays, games) : offensivePlays;

  return {
    record: wins != null && losses != null ? `${wins}-${losses}` : 'N/A',
    talentComposite: (wins != null && losses != null && pointsPerGame != null && oppPointsPerGame != null)
      ? {
          wins,
          losses,
          scoringMargin: pointsPerGame - oppPointsPerGame
        }
      : null,
    yardsPerPlay,
    oppYardsPerPlay,
    havocRate,
    finishingDrives,
    pace,
    pointsPerGame
  };
};

export async function buildNcaafAgenticContext(game, options = {}) {
  const commenceDate = parseGameDate(game.commence_time) || new Date();
  const season = commenceDate.getFullYear();

  const [homeTeam, awayTeam] = await Promise.all([
    ballDontLieService.getTeamByNameGeneric(SPORT_KEY, game.home_team),
    ballDontLieService.getTeamByNameGeneric(SPORT_KEY, game.away_team)
  ]);
  if (!homeTeam || !awayTeam) {
    throw new Error('Unable to resolve NCAAF teams for agentic context');
  }

  const lookbackStart = new Date(commenceDate);
  lookbackStart.setDate(lookbackStart.getDate() - 28);
  const startStr = lookbackStart.toISOString().slice(0, 10);
  const endStr = commenceDate.toISOString().slice(0, 10);

  const [homeRecent, awayRecent, injuries, standings, homeSeasonRows, awaySeasonRows] = await Promise.all([
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
    ballDontLieService.getStandingsGeneric(SPORT_KEY, { season }),
    ballDontLieService.getTeamSeasonStats(SPORT_KEY, { teamId: homeTeam.id, season, postseason: false }),
    ballDontLieService.getTeamSeasonStats(SPORT_KEY, { teamId: awayTeam.id, season, postseason: false })
  ]);

  const restInfo = {
    home: calcRestInfo(homeRecent, homeTeam.id, commenceDate),
    away: calcRestInfo(awayRecent, awayTeam.id, commenceDate)
  };
  const recentForm = {
    home: calcRecentForm(homeRecent, homeTeam.id, 5),
    away: calcRecentForm(awayRecent, awayTeam.id, 5)
  };

  const homeStats = buildCollegeMetrics(seasonStatsToMap(homeSeasonRows));
  const awayStats = buildCollegeMetrics(seasonStatsToMap(awaySeasonRows));

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
    richContext = await perplexityService.getRichGameContext(game.home_team, game.away_team, 'ncaaf', dateStr);
  } catch (error) {
    console.warn('[Agentic][NCAAF] Perplexity context failed:', error.message);
  }

  const buildMotivationSpot = (rest) => ({
    daysSinceLastGame: rest?.days_since_last_game ?? null,
    gamesInLast7: rest?.games_in_last_7 ?? null,
    backToBack: rest?.back_to_back ?? false,
    lastOpponent: rest?.last_opponent || null
  });

  const tokenData = {
    talent_composite: {
      home: homeStats.talentComposite,
      away: awayStats.talentComposite
    },
    motivation_spot: {
      home: buildMotivationSpot(restInfo.home),
      away: buildMotivationSpot(restInfo.away)
    },
    havoc_rate: {
      home: { rate: homeStats.havocRate },
      away: { rate: awayStats.havocRate }
    },
    explosiveness: {
      home: { yardsPerPlay: homeStats.yardsPerPlay, pointsPerGame: homeStats.pointsPerGame },
      away: { yardsPerPlay: awayStats.yardsPerPlay, pointsPerGame: awayStats.pointsPerGame }
    },
    finishing_drives: {
      home: { redZoneRate: homeStats.finishingDrives },
      away: { redZoneRate: awayStats.finishingDrives }
    },
    pace: {
      home: { playsPerGame: homeStats.pace },
      away: { playsPerGame: awayStats.pace }
    },
    injury_report: {
      notable: injuriesList.slice(0, 8),
      total_listed: injuriesList.length
    },
    market_snapshot: marketSnapshot,
    recent_form: recentForm
  };

  const records = (Array.isArray(standings)
    ? standings.reduce(
        (acc, row) => {
          if (row?.team?.id === homeTeam.id) acc.home = row?.record || `${row?.wins ?? '-'}-${row?.losses ?? '-'}`;
          if (row?.team?.id === awayTeam.id) acc.away = row?.record || `${row?.wins ?? '-'}-${row?.losses ?? '-'}`;
          return acc;
        },
        { home: 'N/A', away: 'N/A' }
      )
    : { home: 'N/A', away: 'N/A' });

  const gameSummary = {
    gameId: `ncaaf-${game.id}`,
    sport: SPORT_KEY,
    league: 'NCAAF',
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
      richKeyFindings: richContext?.key_findings || []
    }
  };
}

