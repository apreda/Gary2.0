/**
 * Daily Slate Service
 *
 * Captures the FULL public slate for a day — every scheduled game across the
 * active sports, with an opening-line snapshot — into the `daily_slate`
 * Supabase table. The iOS app reads it under the anon role so the slate shows
 * ALL of today's games from the morning, with Gary's picks overlaying later.
 *
 * Data sources (reuses the exact fetch paths the picks pipeline already pays for):
 *   - MLB / NFL / NCAAF / NBA: oddsService.getUpcomingGames(sportKey, { targetDate })
 *     → BDL games+odds with flat moneyline_home/spread_home/total fields.
 *
 * Write path: service-role REST upsert on (date, league, away_team, home_team)
 * — idempotent, safe to re-run; a later run refreshes the line snapshot.
 */

import axios from 'axios';
import { oddsService } from './oddsService.js';
import { ncaafSlateDateForInstant } from './ncaafGamePolicy.js';
import { sourceFailure } from './sourceFailurePolicy.js';
import {
  isRecoverableMlbGameInterruption,
  normalizeMlbGameStatus,
} from '../../supabase/functions/_shared/mlbGameStatus.js';

// Resolve Supabase config exactly like src/supabaseClient.js does for Node scripts.
const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseAnonKey =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const TABLE = 'daily_slate';
const MLB_GAME_STATUSES = new Set([
  'scheduled',
  'live',
  'final',
  'delayed',
  'postponed',
  'suspended',
  'cancelled',
]);
// Doubleheader-safe (Jul 22 2026, founder-directed after the Max Fried mixup):
// commence_time joined the unique key, so one row per GAME — a same-matchup
// doubleheader is two rows, never a collapse to the earliest kickoff.
const CONFLICT_KEY = 'date,league,away_team,home_team,commence_time';
// Provider-id rows use one exact identity across every sport. This is required
// for NCAAF date-only rows and also means an MLB/NFL kickoff correction updates
// the existing game instead of colliding with the exact-game unique index.
// Legacy id-less rows retain the historical kickoff-based conflict key.
const EXACT_GAME_CONFLICT_KEY = 'league,bdl_game_id';

export function partitionDailySlateRowsByIdentity(rows = []) {
  const safe = Array.isArray(rows) ? rows : [];
  return {
    exactGameRows: safe.filter((row) => row?.bdl_game_id != null),
    legacyRows: safe.filter((row) => row?.bdl_game_id == null),
  };
}

export function dedupeDailySlateRows(rows = []) {
  const safe = Array.isArray(rows) ? rows : [];
  return Object.values(
    safe.reduce((acc, row) => {
      const identity = row?.bdl_game_id != null
        ? `game:${row.bdl_game_id}`
        : `time:${row?.commence_time}`;
      const key = `${row?.date}|${row?.league}|${row?.away_team}|${row?.home_team}|${identity}`;
      // Provider feeds can repeat an exact game after correcting its kickoff;
      // the later normalized snapshot wins. Legacy id-less rows retain the
      // historical first-row behavior because their identity is less certain.
      if (row?.bdl_game_id != null || !acc[key]) acc[key] = row;
      return acc;
    }, {}),
  );
}

export function dailySlateRowIdentity(row) {
  const league = String(row?.league || '').toUpperCase();
  if (row?.bdl_game_id != null) return `${league}|game:${row.bdl_game_id}`;
  return [
    league,
    row?.date ?? '',
    row?.away_team ?? '',
    row?.home_team ?? '',
    row?.commence_time ?? '',
  ].join('|');
}

/**
 * Existing rows absent from a successfully fetched league are canceled or
 * disappeared provider rows. Recoverable MLB interruptions stay until their
 * exact provider game returns; failed leagues are deliberately excluded so one
 * sport outage never deletes another sport's last authoritative snapshot.
 */
export function staleDailySlateRowIds(existingRows, freshRows, healthyLeagues) {
  if (!Array.isArray(existingRows)) {
    throw new Error('daily_slate reconciliation read returned a non-array response');
  }
  const healthy = new Set((healthyLeagues || []).map((league) => String(league).toUpperCase()));
  const fresh = new Set((freshRows || []).map(dailySlateRowIdentity));
  const stale = [];
  for (const row of existingRows) {
    if (!healthy.has(String(row?.league || '').toUpperCase())) continue;
    if (fresh.has(dailySlateRowIdentity(row))) continue;
    // MLB providers can temporarily drop a delayed/postponed/suspended game
    // from a date response. Its exact provider id remains authoritative; keep
    // the last interruption frame until that game returns with a new state or
    // exact time instead of making it disappear from the board.
    if (
      String(row?.league || '').toUpperCase() === 'MLB'
      && isRecoverableMlbGameInterruption(row?.game_status)
    ) continue;
    if (!/^\d+$/.test(String(row?.id ?? ''))) {
      throw new Error('daily_slate reconciliation row is missing a valid id');
    }
    stale.push(String(row.id));
  }
  return [...new Set(stale)];
}

// Active sports for the slate (same set the scheduler plans for).
const SLATE_SPORTS = [
  { key: 'baseball_mlb', league: 'MLB' },
  { key: 'americanfootball_nfl', league: 'NFL' },
  { key: 'americanfootball_ncaaf', league: 'NCAAF' },
  { key: 'basketball_nba', league: 'NBA' },
];

export function getETDateStr(date) {
  return date.toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
}

export function toNum(v) {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * Line sanity guards — odds feeds occasionally emit junk snapshots (seen
 * 2026-06-10: Red Sox @ Rays ml_home -20000 / ml_away +2000 / spread -4.5 on
 * a 6.5 total). Null the junk instead of publishing it:
 *   - |moneyline| > 2000 is junk; moneylines arrive as a pair from the same
 *     snapshot, so one junk side nulls its partner too (a lone +2000 leg of a
 *     -20000 pair is just as fake).
 *   - MLB run lines live at ±1.5 — |spread| > 3.5 is junk. Other leagues'
 *     spreads pass through untouched.
 *   - Totals <= 0 are junk in every league.
 */
export function sanitizeLines(league, { spread, ml_home, ml_away, total }) {
  const mlJunk =
    (ml_home !== null && Math.abs(ml_home) > 2000) ||
    (ml_away !== null && Math.abs(ml_away) > 2000);
  return {
    spread:
      league === 'MLB' && spread !== null && Math.abs(spread) > 3.5 ? null : spread,
    ml_home: mlJunk ? null : ml_home,
    ml_away: mlJunk ? null : ml_away,
    total: total !== null && total <= 0 ? null : total,
  };
}

export class DailySlateSourceError extends Error {
  constructor(result) {
    const failed = (result?.failures || []).map(({ league }) => league).join(', ');
    super(`Daily slate source failure for ${failed || 'unknown league'}; healthy leagues were preserved`);
    this.name = 'DailySlateSourceError';
    this.result = result;
    this.failures = result?.failures || [];
  }
}

/**
 * Persist an official MLB state transition onto one exact daily-slate row.
 * This is intentionally a PATCH, never an upsert: a missing/mismatched row is
 * surfaced loudly instead of creating a partial or cross-wired board game.
 */
export async function patchDailySlateMlbStatus({ date, gameId, status, commenceTime = null }) {
  const adminKey = supabaseServiceKey || supabaseAnonKey;
  if (!supabaseUrl || !adminKey) {
    throw new Error('patchDailySlateMlbStatus: Supabase configuration missing');
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date || ''))) {
    throw new TypeError('patchDailySlateMlbStatus: date must be YYYY-MM-DD');
  }
  if (!/^\d+$/.test(String(gameId ?? ''))) {
    throw new TypeError('patchDailySlateMlbStatus: gameId must be an exact numeric provider id');
  }

  const requestedStatus = String(status ?? '').trim().toLowerCase();
  if (!MLB_GAME_STATUSES.has(requestedStatus)) {
    throw new TypeError(`patchDailySlateMlbStatus: unsupported status "${status}"`);
  }
  const normalized = normalizeMlbGameStatus(requestedStatus);
  let exactCommenceTime = null;
  if (commenceTime != null) {
    if (requestedStatus !== 'scheduled') {
      throw new TypeError('patchDailySlateMlbStatus: commenceTime is valid only for scheduled state');
    }
    if (
      typeof commenceTime !== 'string'
      || !/^\d{4}-\d{2}-\d{2}T/.test(commenceTime)
      || Number.isNaN(Date.parse(commenceTime))
    ) {
      throw new TypeError('patchDailySlateMlbStatus: commenceTime must be an exact ISO datetime');
    }
    exactCommenceTime = new Date(commenceTime).toISOString();
  }
  const response = await axios({
    method: 'PATCH',
    url: `${supabaseUrl}/rest/v1/${TABLE}`,
    params: {
      date: `eq.${date}`,
      league: 'eq.MLB',
      bdl_game_id: `eq.${gameId}`,
      select: 'id,date,league,bdl_game_id,game_status,status_detail',
    },
    data: {
      game_status: normalized.status,
      status_detail: normalized.detail,
      ...(exactCommenceTime ? { commence_time: exactCommenceTime } : {}),
    },
    headers: {
      apikey: adminKey,
      Authorization: `Bearer ${adminKey}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    timeout: 15000,
  });

  if (!Array.isArray(response?.data) || response.data.length !== 1) {
    const count = Array.isArray(response?.data) ? response.data.length : 'non-array';
    throw new Error(
      `patchDailySlateMlbStatus: expected one MLB row for ${date}/${gameId}, received ${count}`,
    );
  }
  return response.data[0];
}

/**
 * Fetch one league's games for the ET date and map them to daily_slate rows.
 * Returns [] when the league has no games.
 */
export const SLATE_SPORTS_LIST = SLATE_SPORTS;

export async function buildLeagueRows(sport, etDateStr) {
  // Active sports: BDL games + odds, flat fields already extracted by oddsService.
  // The BDL adapter handles the MLB UTC-date bleed (evening ET games indexed under
  // the next UTC date) internally; we still filter by actual ET start date here.
  const games = await oddsService.getUpcomingGames(sport.key, {
    nocache: true,
    targetDate: etDateStr,
  });
  if (!Array.isArray(games)) {
    throw new Error(`${sport.league} source returned a non-array slate`);
  }

  if (sport.league === 'NCAAF') {
    const ncaafGames = Array.isArray(games) ? games : [];
    const unverified = ncaafGames
      .filter((game) => game?.ncaaf_fbs_verified !== true);
    if (unverified.length > 0) {
      throw new Error(
        `NCAAF source returned ${unverified.length} game(s) without provider-verified FBS identity`,
      );
    }
    const missingGameIdentity = ncaafGames
      .filter((game) => game?.bdl_game_id == null && game?.id == null);
    if (missingGameIdentity.length > 0) {
      throw new Error(
        `NCAAF source returned ${missingGameIdentity.length} game(s) without a provider game id`,
      );
    }
  }

  const rows = [];
  for (const g of Array.isArray(games) ? games : []) {
    const gameId = g?.bdl_game_id ?? g?.id;
    if (gameId == null) {
      throw new Error(`${sport.league} source returned a game without a provider game id`);
    }
    if (typeof g?.home_team !== 'string' || !g.home_team.trim()
      || typeof g?.away_team !== 'string' || !g.away_team.trim()) {
      throw new Error(`${sport.league} game ${gameId} is missing provider team identity`);
    }

    const isNcaaf = sport.league === 'NCAAF';
    const hasExplicitFootballKickoff = isNcaaf || sport.league === 'NFL';
    const kickoffStatus = hasExplicitFootballKickoff ? g.kickoff_status : null;
    if (hasExplicitFootballKickoff && !['confirmed', 'date_only'].includes(kickoffStatus)) {
      throw new Error(`${sport.league} game ${g.id ?? '?'} is missing a valid kickoff_status`);
    }

    let onDate = false;
    if (kickoffStatus === 'date_only') {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(String(g.scheduled_date || ''))) {
        throw new Error(`${sport.league} game ${gameId} date-only kickoff is missing scheduled_date`);
      }
      onDate = g.scheduled_date === etDateStr;
    } else {
      if (typeof g?.commence_time !== 'string' || !g.commence_time.trim()
        || /^\d{4}-\d{2}-\d{2}$/.test(g.commence_time.trim())) {
        throw new Error(`${sport.league} game ${gameId} is missing a confirmed commence_time`);
      }
      const start = new Date(g.commence_time);
      if (Number.isNaN(start.getTime())) {
        throw new Error(`${sport.league} game ${gameId} has an unparseable commence_time`);
      }
      onDate = isNcaaf
        ? ncaafSlateDateForInstant(start) === etDateStr
        : getETDateStr(start) === etDateStr;
    }
    if (!onDate) continue;

    rows.push({
      date: etDateStr,
      league: sport.league,
      away_team: g.away_team,
      home_team: g.home_team,
      commence_time: kickoffStatus === 'date_only' ? null : g.commence_time,
      ...(hasExplicitFootballKickoff ? {
        scheduled_date: g.scheduled_date ?? etDateStr,
        kickoff_status: kickoffStatus,
      } : {}),
      ...(sport.league === 'MLB' ? {
        game_status: g.game_status ?? 'scheduled',
        status_detail: g.status_detail ?? null,
      } : {}),
      // The game's own identity — lets every reader (iOS pages, insight
      // attachment) tell doubleheader games apart without string games.
      bdl_game_id: gameId,
      venue: null, // BDL games+odds shape carries no venue
      line_vendor: g.line_vendor ?? null,
      ...sanitizeLines(sport.league, {
        spread: toNum(g.spread_home),
        ml_home: toNum(g.moneyline_home),
        ml_away: toNum(g.moneyline_away),
        total: toNum(g.total),
      }),
    });
  }
  return rows;
}

/**
 * Snapshot the full slate for `etDateStr` (YYYY-MM-DD, ET game day; defaults
 * to today ET) into daily_slate. Idempotent upsert on the unique key — re-runs
 * refresh the line snapshot in place.
 *
 * Per-league fetch failures do not block healthy-league upserts, but they are
 * returned as a typed failure after those writes complete. This keeps one
 * flaky sport isolated without reporting an outage as a legitimate dark day.
 *
 * @returns {Promise<{date: string, total: number, byLeague: Object}>}
 */
export async function writeDailySlate(etDateStr = getETDateStr(new Date())) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(etDateStr)) {
    throw new Error(`writeDailySlate: invalid date "${etDateStr}" (expected YYYY-MM-DD)`);
  }
  const adminKey = supabaseServiceKey || supabaseAnonKey;
  if (!supabaseUrl || !adminKey) {
    throw new Error(
      'writeDailySlate: Supabase config missing — set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY'
    );
  }

  const rows = [];
  const byLeague = {};
  const failures = [];
  for (const sport of SLATE_SPORTS) {
    try {
      const leagueRows = await buildLeagueRows(sport, etDateStr);
      byLeague[sport.league] = leagueRows.length;
      if (leagueRows.length > 0) {
        rows.push(...leagueRows);
      }
      console.log(`[DailySlate] ${sport.league}: ${leagueRows.length} game(s) for ${etDateStr}`);
    } catch (e) {
      const message = e?.message || String(e);
      failures.push(sourceFailure(sport.league, e));
      console.warn(`[DailySlate] ${sport.league} fetch failed (healthy leagues continue): ${message}`);
    }
  }

  // De-dupe TRUE duplicates on the same identity used by the upsert. Exact
  // provider IDs preserve real doubleheaders while collapsing duplicate feed
  // rows even if one copy carries a corrected start time. Legacy id-less rows
  // retain the historical matchup+kickoff identity.
  const dedupedRows = dedupeDailySlateRows(rows);
  if (dedupedRows.length < rows.length) {
    console.log(`[DailySlate] De-duped ${rows.length - dedupedRows.length} exact-duplicate row(s) on the conflict key`);
  }

  // Idempotent upsert. Every provider-identified game uses exact identity;
  // only legacy id-less rows use the historical kickoff key.
  const sanitized = JSON.parse(JSON.stringify(dedupedRows));
  const { exactGameRows, legacyRows } = partitionDailySlateRowsByIdentity(sanitized);

  // Read before mutating. This turns each successfully fetched league into an
  // authoritative replacement, including a valid empty slate, while a failed
  // league remains outside reconciliation entirely.
  const healthyLeagues = SLATE_SPORTS
    .map(({ league }) => league)
    .filter((league) => !failures.some((failure) => failure.league === league));
  const existingResponse = await axios({
    method: 'GET',
    url: `${supabaseUrl}/rest/v1/${TABLE}`,
    params: {
      date: `eq.${etDateStr}`,
      select: 'id,date,league,away_team,home_team,commence_time,bdl_game_id,game_status,status_detail',
    },
    headers: { apikey: adminKey, Authorization: `Bearer ${adminKey}` },
    timeout: 15000,
  });
  const staleIds = staleDailySlateRowIds(existingResponse?.data, sanitized, healthyLeagues);

  const upsert = async (data, conflictKey) => {
    if (data.length === 0) return;
    // PostgREST bulk upsert requires an IDENTICAL key set on every object —
    // PGRST102 "All object keys must match". The first mixed MLB+football
    // slate of the fall (Aug 20) had per-league row shapes, the whole batch
    // 400'd, and Home's board rendered empty all morning. Union the keys and
    // null-fill so a mixed-league day always posts.
    const keys = [...new Set(data.flatMap((row) => Object.keys(row)))];
    const uniform = data.map((row) => Object.fromEntries(keys.map((k) => [k, row[k] ?? null])));
    await axios({
      method: 'POST',
      url: `${supabaseUrl}/rest/v1/${TABLE}`,
      data: uniform,
      params: { on_conflict: conflictKey },
      headers: {
        apikey: adminKey,
        Authorization: `Bearer ${adminKey}`,
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates,return=minimal',
      },
    });
  };
  await upsert(exactGameRows, EXACT_GAME_CONFLICT_KEY);
  await upsert(legacyRows, CONFLICT_KEY);

  if (staleIds.length > 0) {
    await axios({
      method: 'DELETE',
      url: `${supabaseUrl}/rest/v1/${TABLE}`,
      params: { id: `in.(${staleIds.join(',')})` },
      headers: {
        apikey: adminKey,
        Authorization: `Bearer ${adminKey}`,
        Prefer: 'return=minimal',
      },
      timeout: 15000,
    });
  }

  const summary = Object.entries(byLeague).map(([l, n]) => `${l}=${n}`).join(', ');
  console.log(`[DailySlate] ✅ Reconciled ${dedupedRows.length} game(s) for ${etDateStr} (${summary}); removed ${staleIds.length} stale row(s)`);
  const result = { date: etDateStr, total: dedupedRows.length, byLeague, failures };
  if (failures.length > 0) throw new DailySlateSourceError(result);
  return result;
}
