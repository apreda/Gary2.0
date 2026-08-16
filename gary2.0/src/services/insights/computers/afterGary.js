// AFTER GARY — an exact, same-sportsbook receipt for a published football pick.
//
// This lane never elects a new side and never compares books. It joins one
// immutable stored NFL/NCAAF game pick to the latest available BDL odds row for
// that pick's exact game id AND exact sportsbook. If either identity is absent,
// or that same book no longer carries the selected market, the row is omitted.

import axios from 'axios';
import { makeRow, TONES } from '../shared.js';

const FOOTBALL = Object.freeze({
  nfl: Object.freeze({ sportKey: 'americanfootball_nfl', table: 'weekly_nfl_picks' }),
  ncaaf: Object.freeze({ sportKey: 'americanfootball_ncaaf', table: 'daily_picks' }),
});

const NON_SPORTSBOOK_VENDORS = new Set([
  '',
  'unknown',
  'openingsnapshot',
  'kalshi',
  'polymarket',
]);

function finite(value) {
  if (value == null || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function rounded(value, digits = 3) {
  if (value == null || value === '') return null;
  if (!Number.isFinite(Number(value))) return null;
  const scale = 10 ** digits;
  const result = Math.round(Number(value) * scale) / scale;
  return Object.is(result, -0) ? 0 : result;
}

function cleanText(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function validIso(value) {
  if (!value || /^\d{4}-\d{2}-\d{2}$/.test(String(value))) return null;
  const instant = new Date(value);
  return Number.isNaN(instant.getTime()) ? null : instant.toISOString();
}

/** Case/punctuation-insensitive sportsbook identity. */
export function normalizeVendor(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

/** American price -> implied probability in the 0...1 band. */
export function americanImpliedProbability(value) {
  const odds = finite(value);
  if (odds == null || odds === 0) return null;
  return odds < 0 ? (-odds) / ((-odds) + 100) : 100 / (odds + 100);
}

function normalizeMarketType(value, pickText = '') {
  const raw = cleanText(value);
  const text = cleanText(pickText);
  if (raw === 'spread' || raw === 'point spread') return 'spread';
  if (raw === 'moneyline' || raw === 'money line' || raw === 'ml' || raw === 'h2h') return 'moneyline';
  if (raw === 'total' || raw === 'over under' || raw === 'overunder') return 'total';
  if (/^(over|under)\b/.test(text)) return 'total';
  if (/\b(ml|moneyline|money line)\b/.test(text)) return 'moneyline';
  return null;
}

function teamNames(team, storedName) {
  const values = [
    storedName,
    team?.full_name,
    team?.fullName,
    team?.name,
    team?.short_name,
    team?.shortName,
    team?.abbreviation,
  ];
  if (team?.city && team?.name) values.push(`${team.city} ${team.name}`);
  const names = new Set();
  for (const value of values) {
    const normalized = cleanText(value);
    if (!normalized) continue;
    names.add(normalized);
    const pieces = normalized.split(' ');
    if (pieces.length > 1) names.add(pieces.at(-1));
  }
  return [...names];
}

function resolveTeamSide(pick, game) {
  const text = cleanText(pick?.pick);
  if (!text) return null;
  const sides = [
    { side: 'home', names: teamNames(game?.home_team, pick?.homeTeam) },
    { side: 'away', names: teamNames(game?.away_team ?? game?.visitor_team, pick?.awayTeam) },
  ];
  const matches = sides.flatMap(({ side, names }) => names
    .filter((name) => text === name || text.startsWith(`${name} `))
    .map((name) => ({ side, length: name.length })));
  if (!matches.length) return null;
  matches.sort((a, b) => b.length - a.length || a.side.localeCompare(b.side));
  if (matches[1] && matches[1].length === matches[0].length && matches[1].side !== matches[0].side) return null;
  return matches[0].side;
}

function teamAbbreviation(game, side) {
  const team = side === 'home' ? game?.home_team : (game?.away_team ?? game?.visitor_team);
  return String(team?.abbreviation || team?.short_name || team?.name || (side === 'home' ? 'HOME' : 'AWAY'))
    .trim()
    .toUpperCase();
}

function publishedTimestamp(record) {
  const exact = validIso(record?.pick?.published_at);
  if (exact) return { value: exact, source: 'pick' };
  return null;
}

function requireObjectArray(value, label) {
  if (!Array.isArray(value)) {
    throw new TypeError(`${label} must be an array`);
  }
  for (const [index, item] of value.entries()) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      throw new TypeError(`${label}[${index}] must be an object`);
    }
  }
  return value;
}

function parseTrailingOdds(text) {
  const match = String(text || '').trim().match(/(?:^|\s)([+-]\d{3,4})\s*$/);
  return match ? finite(match[1]) : null;
}

function parseTotalLine(text) {
  const match = String(text || '').trim().match(/^\s*(?:over|under|o|u)\s*([0-9]+(?:\.[0-9]+)?)/i);
  return match ? finite(match[1]) : null;
}

function kickoffFor(record, game) {
  return validIso(
    record?.pick?.commence_time
      ?? game?.commence_time
      ?? game?.datetime
      ?? game?.start_time_utc
      ?? game?.date,
  );
}

/**
 * Resolve the immutable stored market attached to one published pick.
 * Returns null instead of guessing any missing pick, game, side, book, line,
 * price, publication time, or kickoff identity.
 */
export function resolvePublishedPickMarket(recordInput, game) {
  const record = recordInput?.pick ? recordInput : { pick: recordInput, container: {} };
  const pick = record?.pick;
  const pickId = String(pick?.pick_id || '').trim();
  const gameId = pick?.bdl_game_id ?? pick?.game_id;
  if (!pickId || gameId == null || String(gameId) !== String(game?.id)) return null;

  const publishedAt = publishedTimestamp(record);
  if (!publishedAt) {
    throw new TypeError(`AFTER GARY pick ${pickId} requires an immutable pick.published_at timestamp`);
  }

  const snapshot = pick?.published_market && typeof pick.published_market === 'object'
    ? pick.published_market
    : null;
  const marketType = normalizeMarketType(snapshot?.market_type ?? snapshot?.type ?? pick?.type, pick?.pick);
  if (!marketType) return null;

  const pickSide = marketType === 'total'
    ? (/^\s*over\b/i.test(String(pick?.pick || '')) ? 'over'
      : (/^\s*under\b/i.test(String(pick?.pick || '')) ? 'under' : null))
    : resolveTeamSide(pick, game);
  if (!pickSide) return null;

  const rawVendor = snapshot?.vendor ?? pick?.bestLineBook;
  const vendorKey = normalizeVendor(rawVendor);
  if (NON_SPORTSBOOK_VENDORS.has(vendorKey)) return null;

  const line = marketType === 'spread'
    ? finite(snapshot?.line ?? pick?.spread)
    : marketType === 'total'
      ? finite(snapshot?.line ?? pick?.total ?? parseTotalLine(pick?.pick))
      : null;
  const odds = marketType === 'spread'
    ? finite(snapshot?.odds ?? pick?.spreadOdds ?? pick?.odds)
    : finite(snapshot?.odds ?? pick?.odds ?? parseTrailingOdds(pick?.pick));
  if ((marketType !== 'moneyline' && line == null) || odds == null) return null;

  const kickoff = kickoffFor(record, game);
  if (!kickoff) return null;

  return {
    game,
    gameId: String(gameId),
    pickId,
    pickText: String(pick?.pick || ''),
    marketType,
    pickSide,
    pickTeam: marketType === 'total'
      ? null
      : String(pickSide === 'home' ? (pick?.homeTeam || teamAbbreviation(game, 'home')) : (pick?.awayTeam || teamAbbreviation(game, 'away'))),
    pickLabel: marketType === 'total' ? pickSide.toUpperCase() : teamAbbreviation(game, pickSide),
    vendor: String(rawVendor),
    vendorKey,
    line,
    odds,
    publishedAt: publishedAt.value,
    publishedAtSource: publishedAt.source,
    kickoff,
    seasonType: pick?.season_type ?? game?.season_type ?? null,
  };
}

function currentMarket(row, published) {
  let line = null;
  let odds = null;
  if (published.marketType === 'spread') {
    line = finite(published.pickSide === 'home' ? row?.spread_home_value : row?.spread_away_value);
    odds = finite(published.pickSide === 'home' ? row?.spread_home_odds : row?.spread_away_odds);
  } else if (published.marketType === 'moneyline') {
    odds = finite(published.pickSide === 'home' ? row?.moneyline_home_odds : row?.moneyline_away_odds);
  } else if (published.marketType === 'total') {
    line = finite(row?.total_value);
    odds = finite(published.pickSide === 'over' ? row?.total_over_odds : row?.total_under_odds);
  }
  if ((published.marketType !== 'moneyline' && line == null) || odds == null) return null;
  return { line, odds };
}

function rowTimestamp(row) {
  const value = validIso(row?.updated_at ?? row?.last_updated_at ?? row?.last_update);
  return value ? Date.parse(value) : Number.NEGATIVE_INFINITY;
}

function latestSameVendorRow(rows, published) {
  const matching = (rows || []).filter((row) => {
    const gameId = row?.game_id ?? row?.game?.id;
    return gameId != null
      && String(gameId) === published.gameId
      && normalizeVendor(row?.vendor) === published.vendorKey;
  });
  if (!matching.length) return null;
  matching.sort((a, b) => {
    const time = rowTimestamp(b) - rowTimestamp(a);
    if (time) return time;
    return String(a?.id ?? JSON.stringify(a)).localeCompare(String(b?.id ?? JSON.stringify(b)));
  });
  // If the newest row dropped this market, omit it. Falling back to an older
  // row would no longer be a truthful current comparison.
  return currentMarket(matching[0], published) ? matching[0] : null;
}

function movementFor(published, current) {
  let lineDelta = null;
  if (published.marketType === 'spread') {
    lineDelta = current.line - published.line;
  } else if (published.marketType === 'total' && published.pickSide === 'over') {
    lineDelta = published.line - current.line;
  } else if (published.marketType === 'total' && published.pickSide === 'under') {
    lineDelta = current.line - published.line;
  }
  lineDelta = rounded(lineDelta);

  const publishedProbability = americanImpliedProbability(published.odds);
  const currentProbability = americanImpliedProbability(current.odds);
  const priceDeltaPp = publishedProbability != null && currentProbability != null
    ? rounded((publishedProbability - currentProbability) * 100)
    : null;

  const hasLineMove = lineDelta != null && Math.abs(lineDelta) >= 0.001;
  const primaryUnit = published.marketType === 'moneyline' || !hasLineMove
    ? 'probability_points'
    : 'points';
  const signedPrimary = primaryUnit === 'points' ? (lineDelta ?? 0) : (priceDeltaPp ?? 0);
  return {
    primary_unit: primaryUnit,
    primary_value: rounded(Math.abs(signedPrimary)),
    advantage: signedPrimary > 0 ? 'now' : signedPrimary < 0 ? 'gary' : 'same',
    line_delta_for_pick: lineDelta,
    price_delta_pp_for_pick: priceDeltaPp,
    publishedProbability,
    currentProbability,
  };
}

function displayNumber(value) {
  const number = finite(value);
  if (number == null) return '—';
  return Number.isInteger(number) ? String(number) : String(rounded(number, 2));
}

function displaySigned(value) {
  const number = finite(value);
  if (number == null) return '—';
  return `${number > 0 ? '+' : ''}${displayNumber(number)}`;
}

function headlineFor(published, current) {
  if (published.marketType === 'spread') {
    return `${published.pickLabel} ${displaySigned(published.line)} → ${displaySigned(current.line)}`;
  }
  if (published.marketType === 'total') {
    return `${published.pickLabel} ${displayNumber(published.line)} → ${displayNumber(current.line)}`;
  }
  return `${published.pickLabel} ${displaySigned(published.odds)} → ${displaySigned(current.odds)}`;
}

function valueFor(movement) {
  if (movement.advantage === 'same' || !movement.primary_value) return 'NO MOVE';
  const owner = movement.advantage === 'gary' ? 'GARY' : 'NOW';
  const suffix = movement.primary_unit === 'probability_points' ? 'PP' : '';
  return `${owner} +${displayNumber(movement.primary_value)}${suffix}`;
}

/**
 * Pure row builder used by both the full Hub run and the narrow proof refresh.
 * `publishedPicks` accepts loader records `{ pick, container }` or raw picks.
 */
export function buildAfterGaryRows({ league, date, games, publishedPicks, currentOdds, now = new Date() }) {
  const leagueKey = String(league || '').trim().toLowerCase();
  if (!FOOTBALL[leagueKey]) return [];
  const nowInstant = now instanceof Date ? now : new Date(now);
  if (Number.isNaN(nowInstant.getTime())) {
    throw new TypeError('AFTER GARY now must be a valid instant');
  }
  const gameRows = requireObjectArray(games, 'AFTER GARY games');
  const pickRows = requireObjectArray(publishedPicks, 'AFTER GARY publishedPicks');
  const oddsRows = requireObjectArray(currentOdds, 'AFTER GARY currentOdds');
  const gameById = new Map(gameRows.filter((game) => game?.id != null).map((game) => [String(game.id), game]));
  const rows = [];

  for (const item of pickRows) {
    const record = item?.pick ? item : { pick: item, container: {} };
    const gameId = record?.pick?.bdl_game_id ?? record?.pick?.game_id;
    const game = gameId == null ? null : gameById.get(String(gameId));
    if (!game) continue;
    const published = resolvePublishedPickMarket(record, game);
    if (!published) continue;
    const currentRow = latestSameVendorRow(oddsRows, published);
    if (!currentRow) continue;
    const current = currentMarket(currentRow, published);
    if (!current) continue;

    const movement = movementFor(published, current);
    const providerAsOf = validIso(currentRow?.updated_at ?? currentRow?.last_updated_at ?? currentRow?.last_update);
    const observedAt = providerAsOf ? Date.parse(providerAsOf) : nowInstant.getTime();
    const kickoffAt = Date.parse(published.kickoff);
    const publishedAt = Date.parse(published.publishedAt);
    // BDL can expose in-game/postgame prices through the same odds shape. Those
    // are a different market and must never be compared with Gary's sealed
    // pregame number. Once play starts, omission preserves the last verified
    // pre-kick receipt already stored by the proof writer.
    if (!Number.isFinite(kickoffAt)
        || !Number.isFinite(publishedAt)
        || publishedAt > observedAt
        || observedAt >= kickoffAt) continue;
    const asOf = providerAsOf || nowInstant.toISOString();
    const marketState = nowInstant.getTime() < kickoffAt ? 'pregame' : 'closed';
    const label = `${teamAbbreviation(game, 'away')} @ ${teamAbbreviation(game, 'home')}`;
    const magnitude = movement.primary_value || 0;

    rows.push(makeRow({
      category: 'after_gary',
      headline: headlineFor(published, current),
      detail: `${String(currentRow.vendor).toUpperCase()} · SAME BOOK · ${marketState === 'pregame' ? 'PRE-KICK' : 'CLOSED'}`,
      game: label,
      value: valueFor(movement),
      tone: TONES.NEUTRAL,
      relevance_score: Math.min(94, Math.round(62 + magnitude * (movement.primary_unit === 'points' ? 8 : 2))),
      line_val: current.line ?? current.odds,
      game_id: game.id,
      meta: {
        kind: 'after_gary',
        version: 1,
        grade: 'context',
        pick_id: published.pickId,
        game_id: published.gameId,
        league: leagueKey.toUpperCase(),
        season_type: published.seasonType,
        market_type: published.marketType,
        pick_side: published.pickSide,
        pick_team: published.pickTeam,
        pick_label: published.pickLabel,
        published_at: published.publishedAt,
        published_at_source: published.publishedAtSource,
        kickoff: published.kickoff,
        market_state: marketState,
        vendor: String(currentRow.vendor),
        published: {
          line: published.line,
          odds: published.odds,
          implied_probability: rounded(movement.publishedProbability, 6),
        },
        current: {
          line: current.line,
          odds: current.odds,
          implied_probability: rounded(movement.currentProbability, 6),
        },
        movement: {
          primary_unit: movement.primary_unit,
          primary_value: movement.primary_value,
          advantage: movement.advantage,
          line_delta_for_pick: movement.line_delta_for_pick,
          price_delta_pp_for_pick: movement.price_delta_pp_for_pick,
        },
        as_of: asOf,
        as_of_source: providerAsOf ? 'provider_updated_at' : 'retrieved_at',
      },
    }));
  }

  return rows;
}

function nflWeekStart(date) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(date || ''));
  if (!match) return null;
  const civil = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  const daysSinceTuesday = (civil.getUTCDay() - 2 + 7) % 7;
  civil.setUTCDate(civil.getUTCDate() - daysSinceTuesday);
  return civil.toISOString().slice(0, 10);
}

function pickBelongsToLeague(pick, league) {
  const declared = String(pick?.league || '').trim().toLowerCase();
  const sport = String(pick?.sport || '').trim().toLowerCase();
  return declared === league || sport === FOOTBALL[league]?.sportKey;
}

function storedPickArray(value, table, rowIndex) {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    let parsed;
    try {
      parsed = JSON.parse(value);
    } catch (error) {
      throw new Error(
        `Malformed ${table}.picks JSON at row ${rowIndex}: ${error.message}`,
        { cause: error },
      );
    }
    if (Array.isArray(parsed)) return parsed;
  }
  throw new TypeError(`Malformed ${table}.picks at row ${rowIndex}: expected an array`);
}

/** Read exact stored game picks; read-only, no production mutation. */
export async function loadPublishedFootballPicks({
  league,
  date,
  season,
  slateGameIds,
  httpClient = axios,
  supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
  key = process.env.SUPABASE_SERVICE_ROLE_KEY
    || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    || process.env.SUPABASE_ANON_KEY,
} = {}) {
  const leagueKey = String(league || '').trim().toLowerCase();
  const config = FOOTBALL[leagueKey];
  if (!config) return [];

  const wanted = new Set([...(slateGameIds || [])].map(String));
  if (!wanted.size) return [];
  if (!supabaseUrl || !key) {
    throw new Error('Supabase configuration missing for AFTER GARY proof');
  }
  const params = {
    select: leagueKey === 'nfl'
      ? 'picks,week_start,season'
      : 'picks,date',
    limit: 2,
  };
  if (leagueKey === 'nfl') {
    const weekStart = nflWeekStart(date);
    if (!weekStart || !Number.isInteger(Number(season))) {
      throw new TypeError('Invalid NFL date/season for AFTER GARY proof');
    }
    params.week_start = `eq.${weekStart}`;
    params.season = `eq.${Number(season)}`;
  } else {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date || ''))) {
      throw new TypeError('Invalid NCAAF date for AFTER GARY proof');
    }
    params.date = `eq.${date}`;
  }

  const { data } = await httpClient.get(`${supabaseUrl}/rest/v1/${config.table}`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
    params,
  });
  if (!Array.isArray(data)) {
    throw new TypeError(`Malformed ${config.table} response: expected an array`);
  }
  const records = [];
  for (const [rowIndex, container] of data.entries()) {
    const picks = storedPickArray(container?.picks, config.table, rowIndex);
    for (const pick of picks) {
      if (!pick || typeof pick !== 'object' || Array.isArray(pick)) {
        throw new TypeError(`Malformed ${config.table}.picks entry at row ${rowIndex}`);
      }
      const gameId = pick?.bdl_game_id ?? pick?.game_id;
      if (!pickBelongsToLeague(pick, leagueKey)
          || pick?.type === 'prop'
          || pick?.pickType === 'prop'
          || !String(pick?.pick_id || '').trim()
          || gameId == null
          || !wanted.has(String(gameId))) continue;
      if (!validIso(pick?.published_at)) {
        throw new TypeError(
          `AFTER GARY pick ${String(pick.pick_id)} requires an immutable pick.published_at timestamp`,
        );
      }
      records.push({ pick, container });
    }
  }
  return records;
}

/** Full-Hub computer; also callable directly by the 15-minute proof runner. */
export async function computeAfterGary(ctx) {
  const league = String(ctx?.league || '').trim().toLowerCase();
  const config = FOOTBALL[league];
  if (!config) return [];
  const games = requireObjectArray(ctx?.games, 'AFTER GARY games');
  if (!games.length) return [];
  const slateGameIds = new Set(games.map((game) => game?.id).filter((id) => id != null));
  if (slateGameIds.size !== games.length) {
    throw new TypeError('AFTER GARY every game requires an exact provider id');
  }
  const loader = typeof ctx?.afterGaryPickLoader === 'function'
    ? ctx.afterGaryPickLoader
    : loadPublishedFootballPicks;
  const hasInjectedPicks = Object.prototype.hasOwnProperty.call(ctx ?? {}, 'afterGaryPicks');
  const loadedPicks = hasInjectedPicks
    ? ctx.afterGaryPicks
    : await loader({
      league,
      date: ctx.date,
      season: ctx.season,
      slateGameIds,
      httpClient: ctx?.afterGaryHttpClient,
    });
  const publishedPicks = requireObjectArray(loadedPicks, 'AFTER GARY publishedPicks');
  if (!publishedPicks.length) return [];

  const slateIdentities = new Set([...slateGameIds].map(String));
  const exactGameIds = [...new Set(publishedPicks
    .map((item) => item?.pick ?? item)
    .map((pick) => pick?.bdl_game_id ?? pick?.game_id)
    .filter((id) => id != null && slateIdentities.has(String(id))))];
  if (!exactGameIds.length) return [];
  const hasInjectedOdds = Object.prototype.hasOwnProperty.call(ctx ?? {}, 'afterGaryOdds');
  if (!hasInjectedOdds && typeof ctx?.bdl?.getOddsV2 !== 'function') {
    throw new Error('BDL odds configuration missing for AFTER GARY proof');
  }
  const loadedOdds = hasInjectedOdds
    ? ctx.afterGaryOdds
    : await ctx.bdl.getOddsV2(
      { game_ids: exactGameIds, per_page: 100 },
      config.sportKey,
      1,
    );
  const currentOdds = requireObjectArray(loadedOdds, 'AFTER GARY currentOdds');
  return buildAfterGaryRows({
    league,
    date: ctx.date,
    games,
    publishedPicks,
    currentOdds,
    now: ctx?.now ?? new Date(),
  });
}

export const afterGaryInternals = Object.freeze({
  currentMarket,
  latestSameVendorRow,
  movementFor,
  nflWeekStart,
});

export default { computeAfterGary };
