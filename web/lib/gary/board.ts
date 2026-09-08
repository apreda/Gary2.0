import { rest } from './supabase';
import { normalizeLeague } from './leagues';
import { parseGameTime } from './format';
import type { GaryPick } from './types';

/**
 * `daily_slate` is written at the 5am plan step — every game on the day with
 * its opening lines. The board exists hours before the picks do, which is the
 * whole point: the app shows all twelve games from breakfast on and fills each
 * one in as Gary posts it. The website used to render only the posted picks,
 * so a morning visitor saw a single card and acres of black.
 */
export interface SlateRow {
  game_status?: string | null;
  status_detail?: string | null;
  bdl_game_id?: string | number | null;
  league: string | null;
  away_team: string | null;
  home_team: string | null;
  commence_time: string | null;
  venue: string | null;
  spread: string | null;
  ml_home: string | null;
  ml_away: string | null;
  total: string | null;
}

export async function fetchDailySlate(date: string, revalidate = 600): Promise<SlateRow[]> {
  return rest<SlateRow[]>(
    `daily_slate?select=league,away_team,home_team,commence_time,venue,spread,ml_home,ml_away,total,bdl_game_id,game_status,status_detail` +
      `&date=eq.${date}&order=commence_time.asc`,
    { revalidate },
  );
}

/** "Blue Jays" / "Toronto Blue Jays" → "bluejays" — join key across feeds. */
function teamKey(name?: string | null): string {
  return (name ?? '').toLowerCase().replace(/[^a-z]/g, '');
}

/** Two names refer to the same club when either contains the other. */
function sameTeam(a?: string | null, b?: string | null): boolean {
  const x = teamKey(a);
  const y = teamKey(b);
  if (!x || !y) return false;
  return x === y || x.includes(y) || y.includes(x);
}

export interface BoardGame {
  key: string;
  league: string;
  away: string;
  home: string;
  commence: string | null;
  venue: string | null;
  spread: string | null;
  mlHome: string | null;
  mlAway: string | null;
  total: string | null;
  pick: GaryPick | null;
}

/**
 * The day's board: every slate game in first-pitch order with Gary's call
 * attached when it has posted. Picks that carry no matching slate row (a
 * league whose slate never wrote, a weekly NFL card) are appended rather than
 * dropped — a posted pick must never fall off the public board.
 */
export function buildBoard(slate: SlateRow[], picks: GaryPick[]): BoardGame[] {
  const used = new Set<GaryPick>();
  const attached = new Map<number, GaryPick>();

  // Resolve each ticket before consuming any row. A missing game-1 pick must
  // never make the nightcap inherit game 1's clock, market or Book lock.
  const matches = picks.flatMap(pick => {
    if ((pick.type ?? 'game') === 'prop') return [];
    const pickLeague = normalizeLeague(pick.league, pick.sport);
    const candidates = slate.flatMap((row, index) => {
      const league = normalizeLeague(row.league);
      return (!league || !pickLeague || pickLeague === league) &&
        sameTeam(pick.awayTeam, row.away_team) && sameTeam(pick.homeTeam, row.home_team)
        ? [{ row, index }] : [];
    });
    const id = pick.bdl_game_id == null ? '' : String(pick.bdl_game_id).trim();
    const exactIds = id ? candidates.filter(({ row }) => String(row.bdl_game_id ?? '').trim() === id) : [];
    if (exactIds.length === 1) return [{ pick, index: exactIds[0].index, priority: 3 }];
    if (exactIds.length > 1) return [];

    // Never override conflicting provider IDs with a coincident clock. The
    // generic game_id can be an odds-vendor ID, so only compare BDL fields.
    const compatible = candidates.filter(({ row }) => !id || row.bdl_game_id == null || String(row.bdl_game_id).trim() === '');
    const start = parseGameTime(pick.commence_time)?.getTime();
    const exactTimes = start == null ? [] : compatible.filter(({ row }) => parseGameTime(row.commence_time)?.getTime() === start);
    if (exactTimes.length === 1) return [{ pick, index: exactTimes[0].index, priority: 2 }];
    if (exactTimes.length > 1) return [];

    // Legacy name-only tickets are safe only for an unambiguous matchup,
    // and never when both clocks explicitly identify different games.
    if (candidates.length === 1 && compatible.length === 1 &&
        (start == null || parseGameTime(compatible[0].row.commence_time) == null)) {
      return [{ pick, index: compatible[0].index, priority: 1 }];
    }
    return [];
  }).sort((a, b) => b.priority - a.priority);
  for (const { pick, index } of matches) {
    if (attached.has(index) || used.has(pick)) continue;
    attached.set(index, pick);
    used.add(pick);
  }

  const games: BoardGame[] = slate.map((row, i) => {
    const league = normalizeLeague(row.league) ?? (row.league ?? '').toUpperCase();
    const pick = attached.get(i) ?? null;
    return {
      key: `${row.away_team}-${row.home_team}-${i}`,
      league,
      away: row.away_team ?? '',
      home: row.home_team ?? '',
      commence: row.commence_time,
      venue: row.venue,
      spread: row.spread,
      mlHome: row.ml_home,
      mlAway: row.ml_away,
      total: row.total,
      pick,
    };
  });

  for (const [index, p] of picks.entries()) {
    if (used.has(p) || (p.type ?? 'game') === 'prop') continue;
    games.push({
      key: `${p.pick_id ?? `${p.awayTeam}-${p.homeTeam}-${p.commence_time ?? 'unknown'}-${index}`}`,
      league: normalizeLeague(p.league, p.sport) ?? '',
      away: p.awayTeam ?? '',
      home: p.homeTeam ?? '',
      commence: p.commence_time ?? null,
      venue: p.venue ?? null,
      spread: p.spread != null ? String(p.spread) : null,
      mlHome: p.moneylineHome != null ? String(p.moneylineHome) : null,
      mlAway: p.moneylineAway != null ? String(p.moneylineAway) : null,
      total: p.total != null ? String(p.total) : null,
      pick: p,
    });
  }

  return games.sort((a, b) => {
    const ta = parseGameTime(a.commence)?.getTime() ?? Number.MAX_SAFE_INTEGER;
    const tb = parseGameTime(b.commence)?.getTime() ?? Number.MAX_SAFE_INTEGER;
    return ta - tb;
  });
}

/** League codes present on the board, in first-pitch order. */
export function boardLeagues(games: BoardGame[]): string[] {
  const seen: string[] = [];
  for (const g of games) if (g.league && !seen.includes(g.league)) seen.push(g.league);
  return seen;
}
