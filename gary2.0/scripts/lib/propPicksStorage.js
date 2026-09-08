import { isAmericanPrice } from '../../src/services/marketTruth.js';
import { withTransientRetry } from '../../src/utils/transientRetry.js';

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
  const value = pick?.game_id ?? pick?.bdl_game_id;
  if (!['number', 'string'].includes(typeof value) || (typeof value === 'number' && !Number.isFinite(value))) return null;
  const id = cleanText(value);
  return /^(null|undefined)$/i.test(id || '') ? null : id;
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

const receiptObject = value => value != null && typeof value === 'object' && !Array.isArray(value);

export function assertAtomicPropReceipt(receipt, picks, { forceRun = false } = {}) {
  const invalid = () => { throw new Error('Invalid atomic prop publication receipt; publication is unconfirmed'); };
  if (!receiptObject(receipt)) invalid();
  for (const key of ['added', 'skipped', 'replaced', 'total']) {
    if (!Number.isSafeInteger(receipt[key]) || receipt[key] < 0) invalid();
  }
  if (receipt.added + receipt.skipped !== picks.length || receipt.total < receipt.added || receipt.total < 1) invalid();
  if (!['insert', 'append', 'replace'].includes(receipt.mode) || (receipt.mode === 'replace') !== forceRun) invalid();
  if (!forceRun && receipt.replaced !== 0) invalid();
  const expectedIds = new Set(picks.map(propStorageGameId).filter(Boolean));
  const groups = {};
  for (const key of ['game_ids', 'added_game_ids', 'skipped_game_ids', 'replaced_game_ids']) {
    if (!Array.isArray(receipt[key])) invalid();
    groups[key] = new Set();
    for (const id of receipt[key]) {
      if (!['number', 'string'].includes(typeof id) || !expectedIds.has(String(id)) || groups[key].has(String(id))) invalid();
      groups[key].add(String(id));
    }
  }
  if (groups.game_ids.size !== expectedIds.size) invalid();
  for (const [count, key] of [['added', 'added_game_ids'], ['skipped', 'skipped_game_ids'], ['replaced', 'replaced_game_ids']]) {
    if (groups[key].size > receipt[count] || (!receipt[count] && groups[key].size)) invalid();
    if (picks.every(propStorageGameId) && receipt[count] > 0 && groups[key].size === 0) invalid();
  }
  for (const id of expectedIds) if (!groups.added_game_ids.has(id) && !groups.skipped_game_ids.has(id)) invalid();
  return receipt;
}

// Mirror the deployed atomic RPC's natural identity; odds/rationale are NOT
// identity dimensions, so a skipped retry can only acknowledge the original.
function propNaturalIdentity(pick) {
  if (!receiptObject(pick)) return null;
  const clean = value => typeof value === 'string' ? value.trim().toLowerCase() : '';
  const sport = clean(pick.sport);
  const game = propStorageGameId(pick);
  const matchup = clean(pick.matchup);
  const player = clean(pick.player);
  const market = clean(pick.prop || pick.prop_type).replace(/\s+[+-]?\d+(?:\.\d+)?\s*$/, '').trim();
  let side = clean(pick.bet || pick.direction);
  if (side === 'yes') side = 'over';
  const raw = String(pick.line ?? '').trim();
  const line = /^[+-]?\d+(?:\.\d+)?$/.test(raw) ? String(Number(raw)) : raw.toLowerCase();
  if (!sport || (!game && !matchup) || !player || !market || !side || !line) return null;
  return JSON.stringify([sport, game || `legacy:${matchup}`, player, market, side, line, clean(pick.td_category)]);
}

export function assertExistingPropPublications(published, incoming) {
  if (!Array.isArray(published)) throw new Error('Prop publication readback is not a pick array');
  for (const pick of incoming) {
    const key = propNaturalIdentity(pick);
    const original = published.find(row => key != null && propNaturalIdentity(row) === key
      && typeof row.rationale === 'string' && row.rationale.trim()
      && isAmericanPrice(row.odds) && Number.isFinite(Number(row.line)));
    if (!original) throw new Error(`Prop publication unconfirmed for game ${propStorageGameId(pick)}: original ticket is missing or malformed; original record preserved`);
  }
}

/** Every actual write attempt, including retries, must still precede first pitch/kickoff. */
export function assertPropPublicationPregame(picks, now = Date.now()) {
  for (const pick of picks) {
    const value = pick?.commence_time;
    // Explicit timezone is required: a machine-local interpretation can move
    // the deadline by hours. Generation already supplies ISO provider instants.
    const start = typeof value === 'string' && /T.*(?:Z|[+-]\d{2}:?\d{2})$/i.test(value)
      ? Date.parse(value) : Number.NaN;
    if (!Number.isFinite(start)) throw new Error('Prop publication requires a valid timezone-qualified commence_time');
    if (start <= now) throw new Error(`Prop publication closed: game ${propStorageGameId(pick) || '<unknown>'} has started`);
  }
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
  winnersEvidenceByGame = null,
  enqueueWinners = null,
}) {
  if (!client?.rpc) throw new Error('Atomic prop storage requires a Supabase RPC client');

  const storagePicks = picks.map((pick) => stampFootballTdCategory(pick, leagueLabel));

  const { sport, gameIds } = validateAtomicPropBatch({
    date,
    leagueLabel,
    picks: storagePicks,
    forceRun,
  });

  // TRANSIENT RETRY (Aug 24 2026, Aug 23 outage post-mortem): a generated
  // props slate never dies on one failed HTTP call — Cloudflare 5xx and
  // statement timeouts get ~4 more attempts over ~3 minutes before failing.
  const data = await withTransientRetry(async () => {
    assertPropPublicationPregame(storagePicks);
    const { data: rpcData, error } = await client.rpc('upsert_prop_picks_atomic', {
      p_date: String(date),
      p_sport: sport,
      p_new_picks: storagePicks,
      p_replace_game_ids: forceRun ? gameIds : [],
    });
    if (error) {
      throw new Error(`Could not atomically store prop_picks row for ${date}: ${error.message || error}`);
    }
    return rpcData;
  }, { label: 'prop-picks atomic RPC' });
  assertAtomicPropReceipt(data, storagePicks, { forceRun });
  const returnedGameIds = uniqueStrings(data.game_ids);
  let confirmedPublished = null;
  if (data.skipped > 0) {
    const { data: published, error } = await client.from('prop_picks').select('picks').eq('date', date).maybeSingle();
    if (error) throw new Error(`Prop publication confirmation failed: ${error.message || error}`);
    assertExistingPropPublications(published?.picks, storagePicks);
    confirmedPublished = published.picks;
  }

  if (winnersEvidenceByGame) {
    try {
      const { enqueueWinnersProps, publishedDecisionMatches } = await import('../../src/services/pickdesk/winnersAdmissions.js');
      const addedIds = new Set([...(data.added_game_ids || []), ...(data.replaced_game_ids || [])].map(String));
      const { data: published, error: readError } = confirmedPublished != null
        ? { data: { picks: confirmedPublished }, error: null }
        : await client.from('prop_picks').select('picks').eq('date', date).maybeSingle();
      if (readError) throw readError;
      // The RPC reports additions by game, not by individual ticket. A mixed
      // added/skipped batch must never queue the skipped incoming price/card.
      const confirmed=(published?.picks || []).filter(p=>String(p.sport || p.league || '').toUpperCase()===sport && addedIds.has(String(p.game_id ?? p.bdl_game_id))
        && storagePicks.some(incoming=>publishedDecisionMatches(incoming,p,{date,league:sport,kind:'prop'})));
      await (enqueueWinners || enqueueWinnersProps)(client, { date, league: sport,
        picks: confirmed,
        evidenceByGame: winnersEvidenceByGame });
    } catch (e) { console.warn(`[Winners] Props queue failed: ${e.message}; publication remains intact`); }
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
