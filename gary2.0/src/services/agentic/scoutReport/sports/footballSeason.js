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
 * BDL keys the NFL and NCAAF seasons to the year in which play begins, so a
 * September 2026 game belongs to season 2026 and a January 2027 playoff game
 * still belongs to 2026.
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
 * metadata wins; July/August kickoffs without it are preseason, so exhibition
 * games stay out of every regular-season window and record.
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
 * The evidence windows for an NFL props board: this season's games (regular
 * season, or postseason in January) and the last completed regular season,
 * carried and labeled for early weeks.
 */
export function nflPropsDataWindow(game = {}, value = null) {
  const kickoff = value ?? game?.commence_time ?? game?.date ?? new Date();
  const season = footballSeasonForDate('NFL', kickoff);
  const seasonType = game?.postseason === true || Number(game?.season_type) === 3 ? 3 : 2;
  const phase = seasonType === 3 ? 'NFL Postseason' : 'NFL Regular Season';
  const kind = seasonType === 3 ? 'postseason' : 'regular-season';

  return {
    season,
    seasonType,
    phase,
    baselineSeason: season,
    // The last completed regular season, always carried (Sep 3 2026). BDL
    // publishes no rows for a season until its first game is final, so a
    // Week 1 board has zero current-season stats and zero game logs: the
    // prop sheets fall back to this season, labeled as last year, and stop
    // leaning on it once the current season has games of its own.
    priorSeason: season - 1,
    priorSeasonType: 2,
    priorLabel: `${season - 1} regular season`,
    baselineLabel: `${season} ${kind} performance`,
    recentSeason: season,
    recentSeasonType: seasonType,
    recentLabel: `${season} ${kind} games`,
  };
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
