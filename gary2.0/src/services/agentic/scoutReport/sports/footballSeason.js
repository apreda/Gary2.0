const EASTERN_TIME_ZONE = 'America/New_York';

function easternDateParts(value) {
  const date = value instanceof Date ? value : new Date(value ?? Date.now());
  if (Number.isNaN(date.getTime())) {
    throw new TypeError(`Invalid football date: ${value}`);
  }

  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: EASTERN_TIME_ZONE,
    year: 'numeric',
    month: 'numeric',
    weekday: 'short',
    hour: 'numeric',
    minute: 'numeric',
    hourCycle: 'h23'
  }).formatToParts(date);

  const get = (type) => parts.find((part) => part.type === type)?.value;
  return {
    year: Number(get('year')),
    month: Number(get('month')),
    weekday: get('weekday'),
    hour: Number(get('hour')),
    minute: Number(get('minute'))
  };
}

/**
 * BDL keys both NFL preseason and the NCAAF season to the year in which play
 * begins. Both schedules can start in August, so an August 2026 game belongs
 * to season 2026 rather than the still-completing 2025 league year.
 */
export function footballSeasonForDate(sport, value = new Date()) {
  const normalized = String(sport || '').toUpperCase();
  if (!normalized.includes('NFL') && !normalized.includes('NCAAF')) {
    throw new TypeError(`Unsupported football sport: ${sport}`);
  }

  // August opens the football year here AND in the four sibling helpers
  // (insights/footballData, utils/dateUtils nflSeason/ncaafSeason,
  // picksService.getNFLSeason, pickdesk/footballPropsDesk). A late-July
  // Hall of Fame kickoff keys to the prior year in all five — wrong, but
  // consistently so; moving one helper alone (tried Sep 1 2026) filed the
  // same game under two seasons. Fix all five together when that game is
  // next on a slate.
  const { year, month } = easternDateParts(value);
  return month >= 8 ? year : year - 1;
}

export function footballSeasonLabel(season) {
  const startYear = Number(season);
  if (!Number.isInteger(startYear)) return 'Unknown season';
  return `${startYear}-${String(startYear + 1).slice(-2)}`;
}

/**
 * BDL season types: 1 preseason, 2 regular season, 3 postseason. Exact game
 * metadata wins; the August fallback keeps a verified scheduler/daily-slate
 * game preseason-aware if an older cached row predates `season_type`.
 */
export function nflSeasonTypeForGame(game = {}, value = null) {
  const explicit = Number(game?.season_type);
  if ([1, 2, 3].includes(explicit)) return explicit;
  if (game?.postseason === true) return 3;

  const kickoff = value ?? game?.commence_time ?? game?.date ?? new Date();
  // Same rule as insights/footballData.nflSeasonTypeForGame: July and
  // August kickoffs without explicit metadata are preseason.
  const month = easternDateParts(kickoff).month;
  return month === 7 || month === 8 ? 1 : 2;
}

/**
 * NFL preseason player-prop evidence needs two honest windows: BDL's ordinary
 * stats endpoint supplies current preseason game logs, while its season-stats
 * endpoint has no preseason data and must use the prior completed regular
 * season as a labeled baseline.
 */
export function nflPropsDataWindow(game = {}, value = null) {
  const kickoff = value ?? game?.commence_time ?? game?.date ?? new Date();
  const season = footballSeasonForDate('NFL', kickoff);
  const seasonType = nflSeasonTypeForGame(game, kickoff);
  const phase = seasonType === 1 ? 'NFL Preseason' : seasonType === 3 ? 'NFL Postseason' : 'NFL Regular Season';
  const baselineSeason = seasonType === 1 ? season - 1 : season;

  return {
    season,
    seasonType,
    phase,
    baselineSeason,
    // The last completed regular season, always carried (Sep 3 2026). BDL
    // publishes no rows for a season until its first game is final, so a
    // Week 1 board has zero current-season stats and zero game logs: the
    // prop sheets fall back to this season, labeled as last year, and stop
    // leaning on it once the current season has games of its own.
    priorSeason: season - 1,
    priorSeasonType: 2,
    priorLabel: `${season - 1} regular season`,
    baselineLabel: seasonType === 1
      ? `${baselineSeason} prior completed regular-season baseline (not current preseason form)`
      : `${season} ${seasonType === 3 ? 'postseason' : 'regular-season'} performance`,
    recentSeason: season,
    recentSeasonType: seasonType,
    recentLabel: seasonType === 1
      ? `${season} preseason games only`
      : `${season} ${seasonType === 3 ? 'postseason' : 'regular-season'} games`,
  };
}

/**
 * Card/storage metadata for an NFL preseason game. Preseason is a season
 * phase, not a primetime or generic regular-season tag, so it must win over
 * the ordinary night-window labels all the way through the scout result.
 */
export function nflPreseasonContextForGame(game = {}, value = null) {
  if (nflSeasonTypeForGame(game, value) !== 1) return null;
  return {
    tournamentContext: 'NFL Preseason',
    gameSignificance: 'NFL Preseason',
  };
}

export function stampNflPreseasonContext(game = {}, value = null) {
  const context = nflPreseasonContextForGame(game, value);
  if (context) Object.assign(game, context);
  return context;
}

/**
 * Detect the NFL's named night windows in Eastern time. The old code checked
 * UTC weekday, which turns a Monday 8:15 p.m. ET kickoff into Tuesday and
 * silently misses MNF (and likewise for Thursday night).
 */
export function nflPrimetimeSlot(value) {
  if (!value) return null;
  const { weekday, hour } = easternDateParts(value);
  if (hour < 19) return null;
  if (weekday === 'Mon') return 'MNF';
  if (weekday === 'Thu') return 'TNF';
  if (weekday === 'Sun') return 'SNF';
  return null;
}
