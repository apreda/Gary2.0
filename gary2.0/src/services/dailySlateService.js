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

// Resolve Supabase config exactly like src/supabaseClient.js does for Node scripts.
const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseAnonKey =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const TABLE = 'daily_slate';
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
    if (!g?.home_team || !g?.away_team) continue;

    const isNcaaf = sport.league === 'NCAAF';
    const kickoffStatus = isNcaaf ? g.kickoff_status : null;
    if (isNcaaf && !['confirmed', 'date_only'].includes(kickoffStatus)) {
      throw new Error(`NCAAF game ${g.id ?? '?'} is missing a valid kickoff_status`);
    }

    let onDate = false;
    if (kickoffStatus === 'date_only') {
      onDate = /^\d{4}-\d{2}-\d{2}$/.test(String(g.scheduled_date || ''))
        && g.scheduled_date === etDateStr;
    } else {
      if (!g?.commence_time) continue;
      const start = new Date(g.commence_time);
      if (Number.isNaN(start.getTime())) continue;
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
      ...(isNcaaf ? {
        scheduled_date: g.scheduled_date ?? etDateStr,
        kickoff_status: kickoffStatus,
      } : {}),
      // The game's own identity — lets every reader (iOS pages, insight
      // attachment) tell doubleheader games apart without string games.
      bdl_game_id: g.bdl_game_id ?? g.id ?? null,
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
 * Per-league fetch failures are caught and logged so one flaky sport never
 * sinks the rest of the slate. Throws only on config errors or if the final
 * upsert itself fails.
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
  for (const sport of SLATE_SPORTS) {
    try {
      const leagueRows = await buildLeagueRows(sport, etDateStr);
      if (leagueRows.length > 0) {
        rows.push(...leagueRows);
        byLeague[sport.league] = leagueRows.length;
      }
      console.log(`[DailySlate] ${sport.league}: ${leagueRows.length} game(s) for ${etDateStr}`);
    } catch (e) {
      console.warn(`[DailySlate] ${sport.league} fetch failed (skipping league): ${e.message}`);
    }
  }

  if (rows.length === 0) {
    console.log(`[DailySlate] No games for ${etDateStr} — nothing to write.`);
    return { date: etDateStr, total: 0, byLeague };
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
  const upsert = async (data, conflictKey) => {
    if (data.length === 0) return;
    await axios({
      method: 'POST',
      url: `${supabaseUrl}/rest/v1/${TABLE}`,
      data,
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

  const summary = Object.entries(byLeague).map(([l, n]) => `${l}=${n}`).join(', ');
  console.log(`[DailySlate] ✅ Upserted ${dedupedRows.length} game(s) for ${etDateStr} (${summary})`);
  return { date: etDateStr, total: dedupedRows.length, byLeague };
}
