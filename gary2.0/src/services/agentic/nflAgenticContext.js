import { ballDontLieService } from '../ballDontLieService.js';
import { perplexityService } from '../perplexityService.js';
import { formatGameTimeEST, buildMarketSnapshot, calcRestInfo, calcRecentForm, parseGameDate } from './sharedUtils.js';

const SPORT_KEY = 'americanfootball_nfl';

const buildNflTokenSlices = (homeRates, awayRates, injuries, marketSnapshot, restInfo, recentForm) => {
  const toNumber = (value) => (typeof value === 'number' && Number.isFinite(value) ? value : null);
  return {
    epa_per_play: {
      home: { yardsPerPlay: toNumber(homeRates?.yardsPerPlay), oppYardsPerPlay: toNumber(homeRates?.oppYardsPerPlay) },
      away: { yardsPerPlay: toNumber(awayRates?.yardsPerPlay), oppYardsPerPlay: toNumber(awayRates?.oppYardsPerPlay) }
    },
    success_rate: {
      home: { thirdDownPct: toNumber(homeRates?.thirdDownPct), fourthDownPct: toNumber(homeRates?.fourthDownPct) },
      away: { thirdDownPct: toNumber(awayRates?.thirdDownPct), fourthDownPct: toNumber(awayRates?.fourthDownPct) }
    },
    ol_dl_matchup: {
      home: {
        sacksAllowedPerDropback: toNumber(homeRates?.sacksAllowedPerDropback),
        defensiveSackRate: toNumber(homeRates?.defSackRateProxy)
      },
      away: {
        sacksAllowedPerDropback: toNumber(awayRates?.sacksAllowedPerDropback),
        defensiveSackRate: toNumber(awayRates?.defSackRateProxy)
      }
    },
    turnover_luck: {
      home: { turnoverDiff: toNumber(homeRates?.turnoverDiff) },
      away: { turnoverDiff: toNumber(awayRates?.turnoverDiff) }
    },
    red_zone_efficiency: {
      home: { offense: toNumber(homeRates?.redZoneProxy), defense: toNumber(homeRates?.redZoneDefProxy) },
      away: { offense: toNumber(awayRates?.redZoneProxy), defense: toNumber(awayRates?.redZoneDefProxy) }
    },
    explosiveness: {
      home: { yardsPerPlay: toNumber(homeRates?.yardsPerPlay), pointsPerGame: toNumber(homeRates?.pointsPerGame) },
      away: { yardsPerPlay: toNumber(awayRates?.yardsPerPlay), pointsPerGame: toNumber(awayRates?.pointsPerGame) }
    },
    injury_report: {
      notable: injuries.slice(0, 8),
      total_listed: injuries.length
    },
    market_snapshot: marketSnapshot,
    rest_fatigue: restInfo,
    recent_form: recentForm
  };
};

const formatInjuries = (injuries = []) =>
  (injuries || []).map((injury) => ({
    player: injury?.player?.full_name || `${injury?.player?.first_name || ''} ${injury?.player?.last_name || ''}`.trim(),
    status: injury?.status || 'Unknown',
    description: injury?.description || '',
    team: injury?.team?.full_name || ''
  }));

const buildRecordMap = (standings, homeTeam, awayTeam) => {
  if (!Array.isArray(standings)) return { home: 'N/A', away: 'N/A' };
  const findRecord = (teamId) => {
    const row = standings.find((entry) => entry?.team?.id === teamId);
    if (!row) return 'N/A';
    if (row.record) return row.record;
    const wins = row?.wins ?? row?.overall_wins;
    const losses = row?.losses ?? row?.overall_losses;
    const ties = row?.ties ?? row?.overall_ties ?? 0;
    if (wins == null || losses == null) return 'N/A';
    return ties ? `${wins}-${losses}-${ties}` : `${wins}-${losses}`;
  };
  return {
    home: findRecord(homeTeam.id),
    away: findRecord(awayTeam.id)
  };
};

export async function buildNflAgenticContext(game, options = {}) {
  const commenceDate = parseGameDate(game.commence_time) || new Date();
  const season = commenceDate.getFullYear();

  const [homeTeam, awayTeam] = await Promise.all([
    ballDontLieService.getTeamByNameGeneric(SPORT_KEY, game.home_team),
    ballDontLieService.getTeamByNameGeneric(SPORT_KEY, game.away_team)
  ]);
  if (!homeTeam || !awayTeam) {
    throw new Error('Unable to resolve NFL teams for agentic context');
  }

  const lookbackStart = new Date(commenceDate);
  lookbackStart.setDate(lookbackStart.getDate() - 28);
  const startStr = lookbackStart.toISOString().slice(0, 10);
  const endStr = commenceDate.toISOString().slice(0, 10);

  const [homeRecent, awayRecent, injuries, standings, homeSeason, awaySeason] = await Promise.all([
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

  const homeRates = ballDontLieService.deriveNflTeamRates(homeSeason);
  const awayRates = ballDontLieService.deriveNflTeamRates(awaySeason);

  const injuriesList = formatInjuries(injuries || []);
  const marketSnapshot = buildMarketSnapshot(game.bookmakers || [], homeTeam.full_name, awayTeam.full_name);

  let richContext = null;
  try {
    const dateStr = commenceDate.toISOString().slice(0, 10);
    richContext = await perplexityService.getRichGameContext(game.home_team, game.away_team, 'nfl', dateStr);
  } catch (error) {
    console.warn('[Agentic][NFL] Perplexity context failed:', error.message);
  }

  const records = buildRecordMap(standings, homeTeam, awayTeam);
  const tokenData = buildNflTokenSlices(homeRates, awayRates, injuriesList, marketSnapshot, restInfo, recentForm);

  const gameSummary = {
    gameId: `nfl-${game.id}`,
    sport: SPORT_KEY,
    league: 'NFL',
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

