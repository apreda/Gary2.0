const FOOTBALL_SPORTS = new Set(['NFL', 'NCAAF']);
const ANYTIME_TD_PROP_TYPES = new Set([
  'anytime_touchdown',
  'anytime_td',
  'player_anytime_td',
]);
const FIRST_TD_PROP_TYPES = new Set([
  'first_td',
  'first_touchdown',
  '1st_td',
  'first_scorer',
]);

function cleanText(value) {
  if (value == null) return null;
  const cleaned = String(value).trim();
  return cleaned || null;
}

function uniqueStrings(values) {
  return [...new Set(values.map(cleanText).filter(Boolean))];
}

export function propStorageGameId(pick) {
  return cleanText(pick?.game_id ?? pick?.bdl_game_id);
}

function propTypeToken(pick) {
  // `prop` is the reconciled final/storage field (and carries the line after a
  // space); prefer it over any model-era prop_type alias that survived parsing.
  return String(pick?.prop ?? pick?.prop_type ?? '')
    .trim()
    .toLowerCase()
    .split(/\s+/)[0];
}

/**
 * TD scorer identity is derived from the verified stored market and American
 * price, never from model-authored category text. The app treats td_category
 * as the pre-grade TD discriminator, while passing/rushing TD totals remain
 * ordinary over/under props.
 */
export function deriveFootballTdCategory(pick, leagueLabel) {
  const sport = cleanText(leagueLabel ?? pick?.sport)?.toUpperCase() || null;
  if (!FOOTBALL_SPORTS.has(sport)) return null;

  const propType = propTypeToken(pick);
  if (FIRST_TD_PROP_TYPES.has(propType)) return 'first_td';
  if (!ANYTIME_TD_PROP_TYPES.has(propType)) return null;

  const oddsText = String(pick?.odds ?? '').replaceAll(',', '').trim();
  if (!oddsText) return null;
  const odds = Number(oddsText);
  if (!Number.isFinite(odds)) return null;
  return odds >= 200 ? 'underdog' : 'standard';
}

export function stampFootballTdCategory(pick, leagueLabel) {
  if (!pick || typeof pick !== 'object') return pick;
  const sport = cleanText(leagueLabel ?? pick?.sport)?.toUpperCase() || null;
  if (!FOOTBALL_SPORTS.has(sport)) return pick;

  const propType = propTypeToken(pick);
  const isScorerMarket = ANYTIME_TD_PROP_TYPES.has(propType) || FIRST_TD_PROP_TYPES.has(propType);
  const category = deriveFootballTdCategory(pick, sport);
  if (isScorerMarket && !category) {
    throw new Error(`${sport} TD scorer storage requires verified American odds`);
  }
  if (category) {
    return pick.td_category === category ? pick : { ...pick, td_category: category };
  }

  // Do not let a model-authored td_category turn a passing/rushing TD total or
  // a regular yardage prop into a scorer pick in iOS.
  if (Object.hasOwn(pick, 'td_category')) {
    const { td_category: _ignored, ...regularPick } = pick;
    return regularPick;
  }
  return pick;
}

export function validateAtomicPropBatch({ date, leagueLabel, picks, forceRun = false }) {
  const sport = cleanText(leagueLabel)?.toUpperCase() || null;
  if (!cleanText(date)) throw new Error('Atomic prop storage requires an ET date');
  if (!sport) throw new Error('Atomic prop storage requires a league label');
  if (!Array.isArray(picks) || picks.length === 0) {
    throw new Error('Atomic prop storage requires at least one pick');
  }

  const missingFootballId = FOOTBALL_SPORTS.has(sport)
    ? picks.find((pick) => propStorageGameId(pick) == null)
    : null;
  if (missingFootballId) {
    throw new Error(`${sport} atomic prop storage requires game_id or bdl_game_id for every pick`);
  }

  const gameIds = uniqueStrings(picks.map(propStorageGameId));
  if (forceRun && picks.some((pick) => propStorageGameId(pick) == null)) {
    // A forced run is intentionally destructive only for the exact provider
    // games carried in the replacement request. A missing id can never fall
    // back to a broad matchup deletion.
    throw new Error('Forced atomic prop replacement requires a provider game id for every pick');
  }

  return { sport, gameIds };
}

/**
 * Atomically stores one ET-date batch in public.prop_picks.
 *
 * There is intentionally no direct-table fallback. Every production writer
 * must take the same Postgres date lock or a read/merge/upsert can erase a
 * sibling process that finished at the same time.
 */
export async function storePropPicksAtomic({
  client,
  date,
  leagueLabel,
  picks,
  forceRun = false,
}) {
  if (!client?.rpc) throw new Error('Atomic prop storage requires a Supabase RPC client');

  const storagePicks = picks.map((pick) => stampFootballTdCategory(pick, leagueLabel));

  const { sport, gameIds } = validateAtomicPropBatch({
    date,
    leagueLabel,
    picks: storagePicks,
    forceRun,
  });

  const { data, error } = await client.rpc('upsert_prop_picks_atomic', {
    p_date: String(date),
    p_sport: sport,
    p_new_picks: storagePicks,
    p_replace_game_ids: forceRun ? gameIds : [],
  });

  if (error) {
    throw new Error(`Could not atomically store prop_picks row for ${date}: ${error.message || error}`);
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error(`Atomic prop storage returned an invalid result for ${date}`);
  }

  const returnedGameIds = Array.isArray(data.game_ids)
    ? uniqueStrings(data.game_ids)
    : null;
  if (returnedGameIds == null) {
    throw new Error(`Atomic prop storage did not return game_ids for ${date}`);
  }

  return {
    added: Number(data.added ?? 0),
    skipped: Number(data.skipped ?? 0),
    replaced: Number(data.replaced ?? 0),
    total: Number(data.total ?? 0),
    game_ids: returnedGameIds,
    added_game_ids: Array.isArray(data.added_game_ids)
      ? uniqueStrings(data.added_game_ids)
      : [],
    skipped_game_ids: Array.isArray(data.skipped_game_ids)
      ? uniqueStrings(data.skipped_game_ids)
      : [],
    replaced_game_ids: Array.isArray(data.replaced_game_ids)
      ? uniqueStrings(data.replaced_game_ids)
      : [],
    mode: cleanText(data.mode) || (forceRun ? 'replace' : 'append'),
  };
}
