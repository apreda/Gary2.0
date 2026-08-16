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
  return easternDateParts(kickoff).month === 8 ? 1 : 2;
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
