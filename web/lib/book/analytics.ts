import type { UserBet } from './model';

// ─────────────────────────────────────────────────────────────────────────────
// YOUR BOOK ANALYTICS — web port of ios/GaryApp/BookAnalytics.swift (Sep 9 2026).
// Calendar-aligned periods, the month grid, breakdowns, rolling bankroll
// windows and tags. Every date is an Eastern calendar day ("yyyy-MM-dd").
// Same rules, same answers, on both surfaces.
// ─────────────────────────────────────────────────────────────────────────────

// ── Dates (pure string arithmetic on ET calendar days) ───────────────────────

function parts(date: string): { y: number; m: number; d: number } {
  const [y, m, d] = date.split('-').map(Number);
  return { y, m, d };
}

export function makeDate(y: number, m: number, d: number): string {
  return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

export function shiftDays(date: string, days: number): string {
  const { y, m, d } = parts(date);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** 1 = Sunday … 7 = Saturday, matching the S M T W T F S header. */
export function weekday(date: string): number {
  const { y, m, d } = parts(date);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 1;
}

export function daysInMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export function monthName(m: number, short = false): string {
  const name = MONTHS[Math.max(0, Math.min(11, m - 1))];
  return short ? name.slice(0, 3) : name;
}

export function shortDate(date: string): string {
  const { m, d } = parts(date);
  return `${monthName(m, true)} ${d}`;
}

// ── Periods (WEEK · MONTH · YEAR · ALL) ──────────────────────────────────────

export type PeriodKind = 'week' | 'month' | 'year' | 'all';
export const PERIOD_KINDS: { key: PeriodKind; label: string }[] = [
  { key: 'week', label: 'Week' }, { key: 'month', label: 'Month' }, { key: 'year', label: 'Year' }, { key: 'all', label: 'All' },
];

export interface BookPeriod { kind: PeriodKind; start: string; end: string }

/** Weeks run Sunday to Saturday, the same way the calendar grid reads. */
export function periodContaining(date: string, kind: PeriodKind): BookPeriod {
  if (kind === 'all') return { kind, start: '0000-01-01', end: '9999-12-31' };
  if (kind === 'week') {
    const start = shiftDays(date, -(weekday(date) - 1));
    return { kind, start, end: shiftDays(start, 6) };
  }
  const { y, m } = parts(date);
  if (kind === 'month') return { kind, start: makeDate(y, m, 1), end: makeDate(y, m, daysInMonth(y, m)) };
  return { kind, start: makeDate(y, 1, 1), end: makeDate(y, 12, 31) };
}

export function periodContains(p: BookPeriod, date: string): boolean {
  return date >= p.start && date <= p.end;
}

export function shiftPeriod(p: BookPeriod, steps: number): BookPeriod {
  if (p.kind === 'all' || steps === 0) return p;
  if (p.kind === 'week') return periodContaining(shiftDays(p.start, 7 * steps), 'week');
  const { y, m } = parts(p.start);
  if (p.kind === 'month') {
    const index = y * 12 + (m - 1) + steps;
    return periodContaining(makeDate(Math.floor(index / 12), (index % 12) + 1, 1), 'month');
  }
  return periodContaining(makeDate(y + steps, 1, 1), 'year');
}

/** Forward paging stops at the period that holds today. */
export function canMoveForward(p: BookPeriod, today: string): boolean {
  return p.kind !== 'all' && shiftPeriod(p, 1).start <= today;
}

export function periodLabel(p: BookPeriod): string {
  if (p.kind === 'all') return 'All time';
  if (p.kind === 'year') return p.start.slice(0, 4);
  const s = parts(p.start), e = parts(p.end);
  if (p.kind === 'month') return `${monthName(s.m)} ${s.y}`;
  const left = `${monthName(s.m, true)} ${s.d}`;
  const right = s.m === e.m ? `${e.d}` : `${monthName(e.m, true)} ${e.d}`;
  return s.y === e.y ? `${left} – ${right}` : `${left}, ${s.y} – ${right}, ${e.y}`;
}

/** "SEP 4 – SEP 10, 2026" / "SEPTEMBER 2026" / "2026" / "ALL TIME". */
export function periodKicker(p: BookPeriod): string {
  if (p.kind !== 'week') return periodLabel(p).toUpperCase();
  const s = parts(p.start), e = parts(p.end);
  return `${monthName(s.m, true)} ${s.d} – ${monthName(e.m, true)} ${e.d}, ${e.y}`.toUpperCase();
}

// ── Summary (PROFIT · ROI · RECORD) ──────────────────────────────────────────

export interface BookSummary {
  wins: number; losses: number; pushes: number; profit: number; staked: number; settledCount: number;
  roi: number | null; winPct: number | null; record: string;
}

const isSettled = (b: UserBet) => b.status !== 'pending';

export function summaryOf(rows: UserBet[]): BookSummary {
  let wins = 0, losses = 0, pushes = 0, profit = 0, staked = 0, settledCount = 0;
  for (const b of rows) {
    if (!isSettled(b)) continue;
    settledCount++;
    profit += b.units_net ?? 0;
    if (b.status === 'won') { wins++; staked += b.stake_units; }
    else if (b.status === 'lost') { losses++; staked += b.stake_units; }
    else if (b.status === 'push') pushes++;
  }
  const decided = wins + losses;
  return {
    wins, losses, pushes, profit: round2(profit), staked, settledCount,
    roi: staked > 0 ? profit / staked * 100 : null,
    winPct: decided > 0 ? wins / decided * 100 : null,
    record: `${wins}-${losses}${pushes > 0 ? `-${pushes}` : ''}`,
  };
}

function round2(v: number): number { return Math.round(v * 100) / 100; }

// ── The calendar ─────────────────────────────────────────────────────────────

export interface DayCell {
  date: string; day: number; inMonth: boolean;
  /** Net of settled entries that day; null when nothing settled. */
  net: number | null; settledCount: number; pendingCount: number;
}

export interface MonthGrid {
  year: number; month: number; net: number; settledCount: number; activeDays: number;
  /** Always six rows of seven so the grid never jumps height between months. */
  weeks: DayCell[][];
  title: string; kicker: string; period: BookPeriod;
}

export function monthGrid(year: number, month: number, rows: UserBet[]): MonthGrid {
  const first = makeDate(year, month, 1);
  const last = makeDate(year, month, daysInMonth(year, month));
  const gridStart = shiftDays(first, -(weekday(first) - 1));
  const net = new Map<string, number>(), settled = new Map<string, number>(), pending = new Map<string, number>();
  for (const b of rows) {
    if (b.status === 'pending') pending.set(b.game_date, (pending.get(b.game_date) ?? 0) + 1);
    else {
      net.set(b.game_date, (net.get(b.game_date) ?? 0) + (b.units_net ?? 0));
      settled.set(b.game_date, (settled.get(b.game_date) ?? 0) + 1);
    }
  }
  const weeks: DayCell[][] = [];
  let cursor = gridStart;
  for (let w = 0; w < 6; w++) {
    const row: DayCell[] = [];
    for (let d = 0; d < 7; d++) {
      const p = parts(cursor);
      const count = settled.get(cursor) ?? 0;
      row.push({
        date: cursor, day: p.d, inMonth: p.y === year && p.m === month,
        net: count > 0 ? round2(net.get(cursor) ?? 0) : null,
        settledCount: count, pendingCount: pending.get(cursor) ?? 0,
      });
      cursor = shiftDays(cursor, 1);
    }
    weeks.push(row);
  }
  const inMonth = [...settled.keys()].filter((k) => k >= first && k <= last);
  return {
    year, month,
    net: round2(inMonth.reduce((s, k) => s + (net.get(k) ?? 0), 0)),
    settledCount: inMonth.reduce((s, k) => s + (settled.get(k) ?? 0), 0),
    activeDays: inMonth.length, weeks,
    title: `${monthName(month)} ${year}`, kicker: `${monthName(month)} ${year}`.toUpperCase(),
    period: periodContaining(first, 'month'),
  };
}

export function monthOf(date: string): { year: number; month: number } {
  const { y, m } = parts(date);
  return { year: y, month: m };
}

// ── Breakdowns (LEAGUE · TYPE · BOOK · TAGS · VS GARY · GARY'S LEAN) ─────────

export type BreakdownDimension = 'league' | 'market' | 'bookmaker' | 'tags' | 'side' | 'confidence';
export const BREAKDOWN_DIMENSIONS: { key: BreakdownDimension; label: string; column: string; empty: string }[] = [
  { key: 'league', label: 'League', column: 'League', empty: 'No settled plays in this view yet.' },
  { key: 'market', label: 'Type', column: 'Bet type', empty: "Bet types show once settled plays carry one. Gary's picks are typed automatically; choose a type when you log an outside bet." },
  { key: 'bookmaker', label: 'Book', column: 'Sportsbook', empty: 'Add a sportsbook when you log an outside bet to compare books here.' },
  { key: 'tags', label: 'Tags', column: 'Tag', empty: 'Tag a bet (live, promo, primetime) and each tag gets its own line here.' },
  { key: 'side', label: 'Vs Gary', column: 'Side', empty: 'Ride or fade a pick from its card. Your record against Gary lands here.' },
  { key: 'confidence', label: 'Lean', column: 'Lean', empty: 'Verified picks split by how strongly Gary leaned when you rode or faded them.' },
];

export interface BreakdownRow {
  key: string; label: string; wins: number; losses: number; pushes: number; net: number;
  played: number; decided: number; winPct: number | null; record: string;
}

export const MARKET_OPTIONS: { key: string; label: string }[] = [
  { key: 'moneyline', label: 'Moneyline' }, { key: 'spread', label: 'Spread' }, { key: 'total', label: 'Total' },
  { key: 'prop', label: 'Player prop' }, { key: 'parlay', label: 'Parlay' }, { key: 'other', label: 'Other' },
];

export function marketLabel(market: string | null | undefined): string {
  switch ((market ?? '').toLowerCase()) {
    case 'moneyline': return 'MONEYLINE';
    case 'spread': return 'SPREAD';
    case 'total': return 'TOTAL';
    case 'prop': return 'PLAYER PROP';
    case 'parlay': return 'PARLAY';
    case 'other': return 'OTHER';
    default: return 'UNTYPED';
  }
}

export function marketShort(market: string | null | undefined): string {
  switch ((market ?? '').toLowerCase()) {
    case 'moneyline': return 'ML';
    case 'spread': return 'SPREAD';
    case 'total': return 'TOTAL';
    case 'prop': return 'PROP';
    case 'parlay': return 'PARLAY';
    case 'other': return 'OTHER';
    default: return '';
  }
}

/** Gary's stated lean, in the tiers the Billfold already uses to read him. */
export function leanTier(confidence: number | null | undefined): string {
  if (confidence == null) return 'No lean recorded';
  if (confidence >= 0.6) return 'Strong lean';
  if (confidence >= 0.55) return 'Solid lean';
  return 'Slight lean';
}

const isVerified = (b: UserBet) => b.kind === 'tail' || b.kind === 'fade';

export function breakdownRows(rows: UserBet[], dimension: BreakdownDimension): BreakdownRow[] {
  const order: string[] = [];
  const labels = new Map<string, string>();
  const wins = new Map<string, number>(), losses = new Map<string, number>(), pushes = new Map<string, number>(), net = new Map<string, number>();
  const add = (key: string, label: string, b: UserBet) => {
    if (!labels.has(key)) { labels.set(key, label); order.push(key); }
    if (b.status === 'won') wins.set(key, (wins.get(key) ?? 0) + 1);
    else if (b.status === 'lost') losses.set(key, (losses.get(key) ?? 0) + 1);
    else if (b.status === 'push') pushes.set(key, (pushes.get(key) ?? 0) + 1);
    else return;
    net.set(key, (net.get(key) ?? 0) + (b.units_net ?? 0));
  };
  for (const b of rows) {
    if (!isSettled(b) || b.status === 'void') continue;
    switch (dimension) {
      case 'league': { const lg = (b.league ?? '').trim().toUpperCase() || 'OTHER'; add(lg, lg, b); break; }
      case 'market': { const key = (b.market ?? '').toLowerCase() || 'untyped'; add(key, marketLabel(b.market), b); break; }
      case 'bookmaker': { const book = (b.bookmaker ?? '').trim(); add(book ? book.toLowerCase() : 'unset', book ? book.toUpperCase() : 'NOT SET', b); break; }
      case 'tags': for (const t of b.tags ?? []) { const tag = t.trim().toLowerCase(); if (tag) add(tag, tag.toUpperCase(), b); } break;
      case 'side': if (isVerified(b)) add(b.kind, b.kind === 'tail' ? 'RIDING GARY' : 'FADING GARY', b); break;
      case 'confidence': if (isVerified(b)) { const tier = leanTier(b.gary_confidence); add(tier, tier.toUpperCase(), b); } break;
    }
  }
  const result: BreakdownRow[] = order.map((key) => {
    const w = wins.get(key) ?? 0, l = losses.get(key) ?? 0, p = pushes.get(key) ?? 0;
    const decided = w + l;
    return { key, label: labels.get(key) ?? key, wins: w, losses: l, pushes: p, net: round2(net.get(key) ?? 0),
      played: w + l + p, decided, winPct: decided > 0 ? w / decided * 100 : null, record: `${w}-${l}${p > 0 ? `-${p}` : ''}` };
  }).filter((r) => r.played > 0);
  if (dimension === 'side') return result.sort((a, b) => (a.key === 'tail' ? 0 : 1) - (b.key === 'tail' ? 0 : 1));
  if (dimension === 'confidence') {
    const rank: Record<string, number> = { 'strong lean': 0, 'solid lean': 1, 'slight lean': 2, 'no lean recorded': 3 };
    return result.sort((a, b) => (rank[a.key.toLowerCase()] ?? 9) - (rank[b.key.toLowerCase()] ?? 9));
  }
  // Most played first, net breaks ties; the "not set" bucket always sinks.
  const placeholder = new Set(['unset', 'untyped']);
  return result.sort((a, b) => {
    const pa = placeholder.has(a.key), pb = placeholder.has(b.key);
    if (pa !== pb) return pa ? 1 : -1;
    if (a.played !== b.played) return b.played - a.played;
    if (a.net !== b.net) return b.net - a.net;
    return a.label.localeCompare(b.label);
  });
}

// ── Bankroll windows (rolling 30 · 60 · 90 days, ending today) ───────────────

export interface RollingWindow { days: number; start: string; end: string; summary: BookSummary }

export function rollingWindows(rows: UserBet[], today: string, days: number[] = [30, 60, 90]): RollingWindow[] {
  return days.map((n) => {
    const start = shiftDays(today, -(n - 1));
    return { days: n, start, end: today, summary: summaryOf(rows.filter((b) => b.game_date >= start && b.game_date <= today)) };
  });
}

// ── Tags ─────────────────────────────────────────────────────────────────────

export const MAX_TAGS = 8;
export const MAX_TAG_LENGTH = 24;

/** Lowercased, trimmed, allowed characters only; null when nothing survives. */
export function cleanTag(raw: string): string | null {
  const lowered = raw.toLowerCase().trim();
  if (!lowered) return null;
  const kept = lowered.replace(/[^a-z0-9 _.\-]/g, '').trim();
  if (!/^[a-z0-9]/.test(kept)) return null;
  return kept.slice(0, MAX_TAG_LENGTH);
}

export function addTag(raw: string, tags: string[]): string[] {
  const tag = cleanTag(raw);
  if (!tag || tags.includes(tag) || tags.length >= MAX_TAGS) return tags;
  return [...tags, tag];
}

/** "live, promo, under" → ["live", "promo", "under"]. */
export function parseTags(text: string): string[] {
  return text.split(/[,\n]/).reduce<string[]>((acc, piece) => addTag(piece, acc), []);
}

export function popularTags(rows: UserBet[], limit = 12): string[] {
  const counts = new Map<string, number>();
  for (const b of rows) for (const t of b.tags ?? []) counts.set(t, (counts.get(t) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, limit).map(([t]) => t);
}
