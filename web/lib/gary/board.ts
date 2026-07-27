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
    `daily_slate?select=league,away_team,home_team,commence_time,venue,spread,ml_home,ml_away,total` +
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

  const games: BoardGame[] = slate.map((row, i) => {
    const league = normalizeLeague(row.league) ?? (row.league ?? '').toUpperCase();
    const pick =
      picks.find(
        p =>
          !used.has(p) &&
          (p.type ?? 'game') !== 'prop' &&
          sameTeam(p.awayTeam, row.away_team) &&
          sameTeam(p.homeTeam, row.home_team),
      ) ?? null;
    if (pick) used.add(pick);
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

  for (const p of picks) {
    if (used.has(p) || (p.type ?? 'game') === 'prop') continue;
    games.push({
      key: `${p.pick_id ?? `${p.awayTeam}-${p.homeTeam}`}`,
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
