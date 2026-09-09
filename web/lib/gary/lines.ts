import { rest } from './supabase';

// THE LINE (Sep 9 2026): where a game's line opened, where it is now and
// every rung between — one book, from the odds ledger's public read
// (line_ladder). Display only: numbers and times, never a verdict.

export type LineRung = {
  seen_at: string;
  spread_home: number | null;
  spread_home_odds: number | null;
  spread_away: number | null;
  spread_away_odds: number | null;
  ml_home: number | null;
  ml_away: number | null;
  total: number | null;
  total_over_odds: number | null;
  total_under_odds: number | null;
};

export type LineLadder = {
  sport: string;
  game_date: string;
  game_id: string;
  vendor: string | null;
  home_team: string | null;
  away_team: string | null;
  commence_time: string | null;
  rungs: LineRung[];
};

export const LINE_SPORT_KEYS: Record<string, string> = {
  NFL: 'americanfootball_nfl',
  NCAAF: 'americanfootball_ncaaf',
  MLB: 'baseball_mlb',
};

/** One game's ladder in one book, or null when the ledger has nothing. Fails open. */
export async function fetchLineLadder(
  league: string,
  date: string,
  gameId: string | number | null | undefined,
): Promise<LineLadder | null> {
  const sport = LINE_SPORT_KEYS[String(league || '').toUpperCase()];
  if (!sport || gameId == null || String(gameId).trim() === '') return null;
  try {
    const q = new URLSearchParams({ p_sport: sport, p_game_date: date, p_game_id: String(gameId) });
    const out = await rest<LineLadder | null>(`rpc/line_ladder?${q.toString()}`, { revalidate: 300 });
    return out && Array.isArray(out.rungs) && out.rungs.length > 0 ? out : null;
  } catch {
    return null;
  }
}

// ── Words and clocks ───────────────────────────────────────────────────────

export const american = (v: number) => (v > 0 ? `+${v}` : `${v}`);
export const lineNumber = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(1));
export const spreadText = (v: number) => (v === 0 ? 'PK' : v > 0 ? `+${lineNumber(v)}` : `-${lineNumber(Math.abs(v))}`);
/** "½" · "1" · "1½" — the size of a move in points, unsigned. */
export function pointsText(delta: number): string {
  const magnitude = Math.abs(delta);
  const whole = Math.floor(magnitude);
  const half = magnitude - whole >= 0.5;
  if (whole === 0) return half ? '½' : '0';
  return half ? `${whole}½` : String(whole);
}

const ET = 'America/New_York';
const dayKey = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: ET }).format(d);
const timeOf = (d: Date) => new Intl.DateTimeFormat('en-US', { timeZone: ET, hour: 'numeric', minute: '2-digit' }).format(d);
const weekdayOf = (d: Date) => new Intl.DateTimeFormat('en-US', { timeZone: ET, weekday: 'short' }).format(d);
const monthDayOf = (d: Date) => new Intl.DateTimeFormat('en-US', { timeZone: ET, month: 'short', day: 'numeric' }).format(d);

/** "Today 10:52 AM" · "Tue 9:00 AM" · "Sep 2 3:27 PM" — Eastern, always. */
export function lineClock(iso: string | null | undefined, now: Date = new Date()): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const t = timeOf(d);
  if (dayKey(d) === dayKey(now)) return `Today ${t}`;
  if (Math.abs(d.getTime() - now.getTime()) < 6 * 86_400_000) return `${weekdayOf(d)} ${t}`;
  return `${monthDayOf(d)} ${t}`;
}

// ── The story of one ladder ────────────────────────────────────────────────

export type LineBadge = { kind: 'moved'; text: string } | { kind: 'price' } | { kind: 'holds' };

export type LineMarketRow = { market: 'SPREAD' | 'TOTAL' | 'MONEYLINE'; open: string; now: string; badge: LineBadge };

export type LineStory = {
  vendor: string;
  moves: number;
  openedAt: string | null;
  nowAt: string | null;
  closed: boolean;
  rows: LineMarketRow[];
  /** Markets whose first rung came after the ladder opened. */
  lateOpens: { market: string; seen: string }[];
  rungs: { when: string | null; label: 'OPEN' | 'NOW' | 'CLOSE' | null; spread: string | null; total: string | null; moneyline: string | null }[];
};

/**
 * The ladder told from one side per market so open and now read as one
 * sentence: the spread from the side favored now, the moneyline from the
 * favorite now, the total as itself. Each market opens at the first rung
 * that carries it.
 */
export function lineStory(ladder: LineLadder, awayAbbr: string, homeAbbr: string, kickoffIso?: string | null, now: Date = new Date()): LineStory {
  const rungs = ladder.rungs;
  const last = rungs[rungs.length - 1];
  const first = rungs[0];
  const spreadFromHome = (last.spread_home ?? first.spread_home ?? 0) <= 0;
  const mlFromHome = (() => {
    const h = last.ml_home ?? first.ml_home;
    const a = last.ml_away ?? first.ml_away;
    return h == null || a == null ? true : h <= a;
  })();
  const spreadLine = (r: LineRung) => (spreadFromHome ? r.spread_home : r.spread_away);
  const spreadPrice = (r: LineRung) => (spreadFromHome ? r.spread_home_odds : r.spread_away_odds);
  const moneyline = (r: LineRung) => (mlFromHome ? r.ml_home : r.ml_away);
  const otherMoneyline = (r: LineRung) => (mlFromHome ? r.ml_away : r.ml_home);
  const spreadSide = spreadFromHome ? homeAbbr : awayAbbr;
  const mlSide = mlFromHome ? homeAbbr : awayAbbr;
  const mlOther = mlFromHome ? awayAbbr : homeAbbr;

  const spreadTextOf = (r: LineRung, withPrice = true) => {
    const line = spreadLine(r);
    if (line == null) return null;
    const p = spreadPrice(r);
    return `${spreadSide} ${spreadText(line)}${withPrice && p != null ? ` (${american(p)})` : ''}`;
  };
  const totalTextOf = (r: LineRung, withPrice = true) => {
    if (r.total == null) return null;
    return `${lineNumber(r.total)}${withPrice && r.total_over_odds != null ? ` (${american(r.total_over_odds)})` : ''}`;
  };
  const moneylineTextOf = (r: LineRung, both = false) => {
    const fav = moneyline(r);
    if (fav == null) return null;
    const dog = otherMoneyline(r);
    return `${mlSide} ${american(fav)}${both && dog != null ? ` · ${mlOther} ${american(dog)}` : ''}`;
  };

  const spreadOpen = rungs.find(r => spreadLine(r) != null) ?? null;
  const totalOpen = rungs.find(r => r.total != null) ?? null;
  const mlOpen = rungs.find(r => moneyline(r) != null) ?? null;
  const signed = (d: number, text: string) => `${d > 0 ? '+' : '−'}${text}`;

  const rows: LineMarketRow[] = [];
  if (spreadOpen) {
    const o = spreadTextOf(spreadOpen); const n = spreadTextOf(last);
    if (o && n) {
      const d = Math.abs(spreadLine(last) as number) - Math.abs(spreadLine(spreadOpen) as number);
      const badge: LineBadge = d !== 0 ? { kind: 'moved', text: signed(d, pointsText(d)) } : spreadPrice(spreadOpen) !== spreadPrice(last) ? { kind: 'price' } : { kind: 'holds' };
      rows.push({ market: 'SPREAD', open: o, now: n, badge });
    }
  }
  if (totalOpen) {
    const o = totalTextOf(totalOpen); const n = totalTextOf(last);
    if (o && n) {
      const d = (last.total as number) - (totalOpen.total as number);
      const priceMoved = totalOpen.total_over_odds !== last.total_over_odds || totalOpen.total_under_odds !== last.total_under_odds;
      const badge: LineBadge = d !== 0 ? { kind: 'moved', text: signed(d, pointsText(d)) } : priceMoved ? { kind: 'price' } : { kind: 'holds' };
      rows.push({ market: 'TOTAL', open: o, now: n, badge });
    }
  }
  if (mlOpen) {
    const o = moneylineTextOf(mlOpen); const n = moneylineTextOf(last);
    if (o && n) {
      const d = (moneyline(last) as number) - (moneyline(mlOpen) as number);
      rows.push({ market: 'MONEYLINE', open: o, now: n, badge: d === 0 ? { kind: 'holds' } : { kind: 'moved', text: signed(d, String(Math.abs(d))) } });
    }
  }

  const kickoff = kickoffIso ?? ladder.commence_time;
  const closed = !!kickoff && !Number.isNaN(new Date(kickoff).getTime()) && now.getTime() >= new Date(kickoff).getTime();
  const lateOpens: { market: string; seen: string }[] = [];
  const firstAt = new Date(first.seen_at).getTime();
  for (const [market, rung] of [['SPREAD', spreadOpen], ['TOTAL', totalOpen], ['MONEYLINE', mlOpen]] as const) {
    if (rung && new Date(rung.seen_at).getTime() > firstAt) lateOpens.push({ market, seen: lineClock(rung.seen_at, now) ?? rung.seen_at });
  }

  return {
    vendor: (ladder.vendor ?? 'one book').replace(/_/g, ' ').toUpperCase(),
    moves: Math.max(rungs.length - 1, 0),
    openedAt: lineClock(first.seen_at, now),
    nowAt: lineClock(last.seen_at, now),
    closed,
    rows,
    lateOpens,
    rungs: rungs.map((r, i) => ({
      when: lineClock(r.seen_at, now),
      label: i === rungs.length - 1 ? (closed ? 'CLOSE' : 'NOW') : i === 0 ? 'OPEN' : null,
      spread: spreadTextOf(r),
      total: totalTextOf(r),
      moneyline: moneylineTextOf(r, true),
    })),
  };
}
