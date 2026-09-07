// Mirrors native HubStoryIdentity/openSignal for a dated, already-loaded card
// collection. Keep the executable Swift parity fixtures with this monitor.
export const HUB_LEAGUES = ['MLB', 'NFL', 'NCAAF', 'NBA'];
// SignalKind.from drops unknown categories before the Hub can route them.
export const HUB_CATEGORIES = ["streak", "h2h", "head-to-head", "head_to_head", "owned", "h2h_form", "hot", "heat", "heat check", "heat_check", "cold", "cooling", "cooling off", "cooling_off", "injury", "replacement", "beneficiary", "situational", "rest", "fatigue", "rest & fatigue", "rest_fatigue", "platoon", "platoon edge", "platoon_edge", "ballpark", "ballpark shift", "ballpark_shift", "regression", "regression watch", "regression_watch", "regression_tomorrow", "xg_regression", "xg regression", "advancement", "advancement_odds", "advancement odds", "xg_recap", "xg recap", "tournament", "stakes", "group", "tournament_stakes", "gary_hr_threats", "hr_threat", "hr threats", "streaking", "starter_form", "starter_team_record", "team_record", "bullpen_fatigue", "first_inning", "running_game", "park_weather", "fantasy_pickups", "streamers", "pickups", "two_start_week", "two_start", "closer_watch", "return_watch", "cut_list", "trenches", "the_trenches", "ol_dl", "line_play", "line_of_scrimmage", "quarterback", "quarterbacks", "qb", "qb_matchup", "mismatch", "the_mismatch", "pass_rush", "pressure", "pressure_rate", "coverage", "secondary", "coverage_matchup", "pace_script", "pace_and_script", "game_script", "tempo", "red_zone", "red_zone_edge", "red_zone_td", "turnover_edge", "turnovers", "turnover_margin", "explosive_play", "explosive_plays", "explosiveness", "special_teams", "special_teams_edge", "coaching", "coaching_edge", "the_sweat", "sweat", "after_gary", "after gary", "market_range", "market range", "next_slate", "next slate", "practice_report", "practice report", "fantasy_usage", "usage", "usage_role", "snap_share", "target_share", "rush_share", "fantasy_red_zone", "red_zone_role", "goal_line_role", "fantasy_matchup", "player_matchup", "fantasy_trend", "recent_usage", "recent_trend"];
export const SIGNAL_COLUMNS = 'id,date,league,category,player_id,team_id,game_id,headline,meta,generated_by';
export const CARD_COLUMNS = 'id,date,league,player_id,player_name,team_abbr,game_id,payload';

const clean = value => typeof value === 'string' && value.trim() ? value.trim() : null;
const leagueKey = value => clean(value)?.toUpperCase() ?? null;
const nameKey = value => (value ?? '').normalize('NFD').replace(/\p{M}/gu, '')
  .toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
const nameTokens = value => (value ?? '').split(/\s+/).map(nameKey).filter(Boolean);
const object = value => value != null && typeof value === 'object' && !Array.isArray(value);
export const headlinePlayerName = headline => (headline ?? '').split(/[:(,/·—]/)[0].trim();

// Optional fields decoded by PlayerInsightPack. Unknown extras are ignored;
// malformed known fields invalidate the whole array on a fresh native load.
const labeledStat = { label: 'string', value: 'string', detail: 'string' };
const packSchema = {
  type: 'string', name: 'string', team: 'string', position: 'string', hand: 'string', game: 'string',
  opponent: { name: 'string', hand: 'string' }, strengths: ['string'], weaknesses: ['string'],
  season: { line1: 'string', line2: 'string' },
  xstats: [{ label: 'string', actual: 'string', expected: 'string', verdict: 'string' }],
  splits: [labeledStat], form: labeledStat, formRows: [labeledStat], bvp: labeledStat,
  pitchMatchup: [{ pitch: 'string', usagePct: 'number', ba: 'string', slg: 'string', whiffPct: 'number', grade: 'string' }],
  venue: labeledStat, props: [{ label: 'string', line: 'string', odds: 'string', rate: 'string' }],
  statsSectionTitle: 'string',
};

function decodes(value, schema) {
  if (value == null) return true;
  if (typeof schema === 'string') return typeof value === schema && (schema !== 'number' || Number.isFinite(value));
  if (Array.isArray(schema)) return Array.isArray(value) && value.every(item => item != null && decodes(item, schema[0]));
  return object(value) && Object.entries(schema).every(([key, shape]) => decodes(value[key], shape));
}

export function isNativeCardDecodable(card) {
  return object(card) && ['league', 'player_id', 'player_name', 'team_abbr', 'game_id']
    .every(key => card[key] == null || typeof card[key] === 'string')
    && decodes(card.payload, packSchema);
}

/** Empty dictionaries decode, but are separately reported as thin cards. */
export function isThinPack(payload) {
  if (!object(payload)) return true;
  const has = value => typeof value === 'number' || (typeof value === 'string' && value.trim().length > 0);
  const any = (row, keys) => object(row) && keys.some(key => has(row[key]));
  const rows = (value, keys) => Array.isArray(value) && value.some(row => any(row, keys));
  return !(any(payload.season, ['line1', 'line2'])
    || any(payload.form, ['value', 'detail']) || rows(payload.formRows, ['value', 'detail'])
    || rows(payload.splits, ['value', 'detail']) || rows(payload.xstats, ['actual', 'expected'])
    || any(payload.bvp, ['value', 'detail']) || any(payload.venue, ['value', 'detail'])
    || rows(payload.pitchMatchup, ['usagePct', 'ba', 'slg', 'whiffPct'])
    || rows(payload.props, ['line', 'odds', 'rate']));
}

export function resolvePlayerCard({ league, slateDate, playerID, playerName, gameID, loadedDate, currentDate, candidates }) {
  const expectedLeague = leagueKey(league);
  if (!expectedLeague || !clean(slateDate) || !clean(loadedDate) || !clean(currentDate)
    || clean(slateDate) !== clean(currentDate) || clean(loadedDate) !== clean(currentDate)) {
    return { index: null, reason: 'date_or_league' };
  }
  const expectedGame = clean(gameID);
  const scope = candidates.map((card, index) => ({ card, index })).filter(({ card }) =>
    leagueKey(card.league) === expectedLeague && (expectedGame == null || clean(card.gameID) === expectedGame));
  let matches;
  const expectedPlayer = clean(playerID);
  if (expectedPlayer != null) {
    matches = scope.filter(({ card }) => clean(card.playerID) === expectedPlayer);
  } else {
    const name = clean(playerName);
    const query = nameKey(name);
    if (!name || [...query].length < 5) return { index: null, reason: 'missing_name' };
    matches = scope.filter(({ card }) => nameKey(card.name) === query);
    if (!matches.length) {
      const tokens = nameTokens(name);
      if (tokens.length < 2 || [...tokens[0]].length !== 1) return { index: null, reason: 'name_not_found' };
      const surname = tokens.slice(1).join('');
      matches = scope.filter(({ card }) => {
        const candidate = nameTokens(card.name);
        return candidate.length >= 2 && candidate[0].startsWith(tokens[0]) && candidate.slice(1).join('') === surname;
      });
    }
  }
  if (!matches.length) return { index: null, reason: expectedPlayer ? 'player_game_not_found' : 'name_not_found' };
  if (matches.length !== 1) return { index: null, reason: 'ambiguous' };
  if (!matches[0].card.hasPayload) return { index: null, reason: 'missing_payload' };
  return { index: matches[0].index, reason: expectedPlayer ? 'player_id' : 'name' };
}

function ignoredRoute(signal) {
  if (signal.generated_by === 'fantasy_briefing_v1' || signal.meta?.source === 'fantasy_briefing_v1') return 'fantasy_briefing';
  if (leagueKey(signal.league) === 'NCAAF' && signal.meta?.source === 'balldontlie_ncaaf_rankings') return 'ranked_game';
  if (signal.player_id == null && (signal.team_id != null || signal.meta?.kind === 'h2h')) return 'team';
  return null;
}

/** Audits a complete snapshot as if opened on currentDate (normally date). */
export function auditCardCoverage({ signals, cards, date, currentDate = date, strict = false }) {
  const failures = [];
  const warnings = [];
  const malformed = cards.filter(card => !isNativeCardDecodable(card));
  if (malformed.length) failures.push(`${malformed.length} malformed player card row(s) prevent the native card collection from decoding`);
  const wrongDate = cards.filter(card => card.date !== date);
  if (wrongDate.length) failures.push(`${wrongDate.length} card row(s) do not belong to the requested date ${date}`);
  // A malformed row invalidates the fresh native collection, not one pack.
  const usable = malformed.length || wrongDate.length ? [] : cards;
  const candidates = usable.map(card => ({ league: card.league, playerID: card.player_id,
    gameID: card.game_id, name: card.player_name ?? card.payload?.name, hasPayload: card.payload != null }));
  const rows = [];
  for (const league of HUB_LEAGUES) {
    // Insight requests use canonical league filters. Cards load every league,
    // then apply the native case/whitespace normalization above.
    const leagueSignals = signals.filter(signal => signal.league === league);
    const leagueCards = cards.filter(card => leagueKey(card.league) === league);
    if (!leagueSignals.length && !leagueCards.length) continue;
    const excluded = { fantasy_briefing: 0, ranked_game: 0, team: 0, empty_headline: 0, unknown_category: 0 };
    const required = [];
    const nameOnly = [];
    for (const signal of leagueSignals) {
      if (!HUB_CATEGORIES.includes(clean(signal.category)?.toLowerCase())) { excluded.unknown_category += 1; continue; }
      const route = ignoredRoute(signal);
      if (route) { excluded[route] += 1; continue; }
      if (!clean(signal.headline)) { excluded.empty_headline += 1; continue; }
      const resolved = resolvePlayerCard({ league, slateDate: signal.date, playerID: signal.player_id,
        playerName: headlinePlayerName(signal.headline), gameID: signal.game_id,
        loadedDate: date, currentDate, candidates });
      const result = { id: signal.id, category: signal.category, player_id: signal.player_id,
        game_id: signal.game_id, headline: signal.headline, ...resolved };
      if (signal.player_id != null) required.push(result);
      else if (resolved.index != null) nameOnly.push(result);
    }
    const reachable = required.filter(row => row.index != null);
    const gaps = required.filter(row => row.index == null);
    const thinCards = leagueCards.filter(card => isThinPack(card.payload));
    const thin = thinCards.length;
    if (required.length && !leagueCards.length) failures.push(`${league}: ${required.length} player row(s) on the board and NO cards at all`);
    else if (required.length && !reachable.length) failures.push(`${league}: none of ${required.length} player row(s) can open a unique populated card for this date/game`);
    else if (gaps.length) {
      const message = `${league}: ${gaps.length} of ${required.length} player row(s) use the full-story fallback`;
      (strict ? failures : warnings).push(message);
    }
    if (leagueCards.length && thin === leagueCards.length) failures.push(`${league}: every card is thin (no rendered stats and data)`);
    else if (thin) warnings.push(`${league}: ${thin} of ${leagueCards.length} card(s) have no rendered stats and data`);
    if (excluded.unknown_category) warnings.push(`${league}: ${excluded.unknown_category} stored row(s) have categories the native Hub cannot render`);
    rows.push({ league, cards: leagueCards.length, player_rows: required.length, reachable: reachable.length,
      name_only_reachable: nameOnly.length, thin, gaps, excluded,
      thin_cards: thinCards.map(card => ({ id: card.id, player_id: card.player_id, player_name: card.player_name, game_id: card.game_id })) });
  }
  return { date, current_date: currentDate, rows, failures, warnings,
    malformed_card_ids: malformed.map(card => card?.id), complete: failures.length === 0 && warnings.length === 0 };
}

/** Stable pagination plus exact counts detects server caps and changed reads. */
export async function readCoverageRows(sb, table, columns, date, { pageSize = 500, maxRows = 20_000, maxPages = 40, timeoutMs = 20_000 } = {}) {
  if (![pageSize, maxRows, maxPages].every(value => Number.isInteger(value) && value > 0)) throw new Error('Invalid card-watch pagination bounds');
  const rows = [];
  const ids = new Set();
  let total;
  let pages = 0;
  while (rows.length < maxRows && pages < maxPages) {
    pages += 1;
    const { data, error, count } = await sb.from(table).select(columns, { count: 'exact' }).eq('date', date)
      .order('id', { ascending: true }).range(rows.length, rows.length + pageSize - 1)
      .abortSignal(AbortSignal.timeout(timeoutMs));
    if (error) throw new Error(`${table} read failed: ${error.message}`);
    if (!Array.isArray(data) || !Number.isInteger(count) || count < 0) throw new Error(`${table} read has no complete row/count response`);
    if (total == null) total = count;
    if (count !== total) throw new Error(`${table} changed during pagination; rerun the card watch`);
    if (total > maxRows) throw new Error(`${table} exceeds the ${maxRows}-row audit bound`);
    for (const row of data) {
      if (!object(row) || row.id == null || ids.has(String(row.id))) throw new Error(`${table} repeated or missing row identity during pagination`);
      if (row.date !== date) throw new Error(`${table} returned a row outside ${date}`);
      ids.add(String(row.id));
      rows.push(row);
    }
    if (rows.length > total) throw new Error(`${table} returned more rows than its exact count`);
    if (rows.length === total) return rows;
    if (!data.length) throw new Error(`${table} truncated after ${rows.length} of ${total} rows`);
  }
  throw new Error(`${table} exceeded the row/request audit bound before completion`);
}
