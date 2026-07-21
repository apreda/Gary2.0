/**
 * Daily Slate Service
 *
 * Captures the FULL public slate for a day — every scheduled game across the
 * active sports, with an opening-line snapshot — into the `daily_slate`
 * Supabase table. The iOS app reads it under the anon role so the slate shows
 * ALL of today's games from the morning, with Gary's picks overlaying later.
 *
 * Data sources (reuses the exact fetch paths the picks pipeline already pays for):
 *   - MLB / NBA / NHL: oddsService.getUpcomingGames(sportKey, { targetDate })
 *     → BDL games+odds with flat moneyline_home/spread_home/total fields.
 *
 * Write path: service-role REST upsert on (date, league, away_team, home_team)
 * — idempotent, safe to re-run; a later run refreshes the line snapshot.
 */

import axios from 'axios';
import { oddsService } from './oddsService.js';

// Resolve Supabase config exactly like src/supabaseClient.js does for Node scripts.
const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseAnonKey =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const TABLE = 'daily_slate';
const CONFLICT_KEY = 'date,league,away_team,home_team';

// Active sports for the slate (same set the scheduler plans for).
const SLATE_SPORTS = [
  { key: 'baseball_mlb', league: 'MLB' },
  { key: 'basketball_nba', league: 'NBA' },
  { key: 'icehockey_nhl', league: 'NHL' },
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
  // MLB / NBA / NHL: BDL games + odds, flat fields already extracted by oddsService.
  // The BDL adapter handles the MLB UTC-date bleed (evening ET games indexed under
  // the next UTC date) internally; we still filter by actual ET start date here.
  const games = await oddsService.getUpcomingGames(sport.key, {
    nocache: true,
    targetDate: etDateStr,
  });

  const rows = [];
  for (const g of Array.isArray(games) ? games : []) {
    if (!g?.home_team || !g?.away_team || !g?.commence_time) continue;
    const start = new Date(g.commence_time);
    if (Number.isNaN(start.getTime())) continue;
    // Keep estimated-time games (date-only timestamps) on their nominal date —
    // converting T00:00:00Z to ET would shift them to the previous day.
    const onDate = g.estimated_time
      ? String(g.commence_time).slice(0, 10) === etDateStr
      : getETDateStr(start) === etDateStr;
    if (!onDate) continue;

    rows.push({
      date: etDateStr,
      league: sport.league,
      away_team: g.away_team,
      home_team: g.home_team,
      commence_time: g.commence_time,
      venue: null, // BDL games+odds shape carries no venue
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

  // De-dupe on the conflict key BEFORE the upsert. A doubleheader (same matchup, two game
  // times on one ET date) produces two rows with an identical (date, league, away_team,
  // home_team) key; PostgREST merge-duplicates then throws "ON CONFLICT DO UPDATE command
  // cannot affect row a second time" (a 500) and sinks the WHOLE slate — that's the
  // 2026-06-24 outage (3 MLB doubleheaders). Keep the earliest kickoff per matchup.
  const dedupedRows = Object.values(
    rows.slice()
      .sort((a, b) => new Date(a.commence_time || 0) - new Date(b.commence_time || 0))
      .reduce((acc, r) => {
        const k = `${r.date}|${r.league}|${r.away_team}|${r.home_team}`;
        if (!acc[k]) acc[k] = r;   // first (earliest) wins
        return acc;
      }, {}),
  );
  if (dedupedRows.length < rows.length) {
    console.log(`[DailySlate] De-duped ${rows.length - dedupedRows.length} doubleheader row(s) on the conflict key (kept earliest kickoff)`);
  }

  // Idempotent upsert (PostgREST merge-duplicates on the unique key).
  const sanitized = JSON.parse(JSON.stringify(dedupedRows));
  await axios({
    method: 'POST',
    url: `${supabaseUrl}/rest/v1/${TABLE}`,
    data: sanitized,
    params: { on_conflict: CONFLICT_KEY },
    headers: {
      apikey: adminKey,
      Authorization: `Bearer ${adminKey}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=minimal',
    },
  });

  const summary = Object.entries(byLeague).map(([l, n]) => `${l}=${n}`).join(', ');
  console.log(`[DailySlate] ✅ Upserted ${dedupedRows.length} game(s) for ${etDateStr} (${summary})`);
  return { date: etDateStr, total: dedupedRows.length, byLeague };
}
