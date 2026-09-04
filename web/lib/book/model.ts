import { daysAgoEST, estDateStr } from '@/lib/gary/dates';
import { parseGameTime } from '@/lib/gary/format';

// ─────────────────────────────────────────────────────────────────────────────
// YOUR BOOK — shared model + pure math (web port of iOS UserBookView.swift).
//
// One system, three entry points: a TAIL, a FADE, and a manually logged
// outside bet are the same `user_bets` row with a different kind. Tail/fade
// go through server RPCs that resolve odds + lock time and refuse post-lock
// writes — the record is unfakeable. Two ledgers, never mixed: WITH GARY
// (system-graded tails/fades) and YOUR PLAYS (self-graded, labeled).
// ─────────────────────────────────────────────────────────────────────────────

export interface UserBet {
  id: string;
  kind: string;                 // tail | fade | manual
  pick_type: string | null;     // game | prop
  game_date: string;
  league: string | null;
  pick_text: string;
  matchup: string | null;
  player_name: string | null;
  prop_type: string | null;
  description: string | null;
  odds_american: number | null;
  odds_estimated: boolean | null;
  stake_units: number;
  gary_confidence: number | null;
  streak_pick: boolean | null;
  status: string;               // pending | won | lost | push | void
  units_net: number | null;
  lock_at: string | null;
  placed_at: string | null;
  graded_by: string | null;
  is_favorite?: boolean;
  notes?: string | null;
  bookmaker?: string | null;
  source_game_id?: string | null;
  source_pick_id?: string | null;
  source_line?: number | null;
  source_side?: string | null;
}

/** The ledger's calendar key is the game's Eastern-time start date. Weekly
 * NFL cards can span several dates, so the page's display date is only a
 * fallback for old rows without a parseable kickoff. */
export function gameDateForBook(
  commence: string | null | undefined,
  fallbackDate: string,
): string {
  const parsed = parseGameTime(commence);
  return parsed ? estDateStr(parsed) : fallbackDate;
}

/** Collision-safe client key for the ledger's date + exact-pick identity. */
export function gamePickReceiptKey(gameDate: string, pickText: string): string {
  return JSON.stringify([gameDate, pickText]);
}

export type TailFadeCounts = Record<string, { tails: number; fades: number }>;

/** Public tail/fade totals are returned for one requested date. Keep them off
 * rows from another day on a multi-date board. */
export function tailFadeCountForGame(
  counts: TailFadeCounts,
  countsDate: string,
  gameDate: string,
  pickText: string,
): { tails: number; fades: number } | undefined {
  return countsDate === gameDate ? counts[pickText] : undefined;
}

/** The shared Book ledger currently identifies game rows by date + exact pick
 * text. If two games on the same date publish the same text, the website must
 * not pretend it can attach a receipt to either one unambiguously. */
export function ambiguousGamePickReceiptKeys(
  picks: Array<{
    pick?: string | null;
    type?: string | null;
    commence_time?: string | null;
  }>,
  fallbackDate: string,
): string[] {
  const counts = new Map<string, number>();
  for (const pick of picks) {
    if ((pick.type ?? 'game').toLowerCase() === 'prop') continue;
    if (typeof pick.pick !== 'string' || pick.pick.trim() === '') continue;
    const gameDate = gameDateForBook(pick.commence_time, fallbackDate);
    const key = gamePickReceiptKey(gameDate, pick.pick);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts].filter(([, count]) => count > 1).map(([key]) => key);
}

/** Match the receipt for this exact website board item. Repeated selections
 * on a later slate must remain independent. */
export function findExistingGameBet(
  rows: UserBet[],
  gameDate: string,
  pickText: string,
  pickId?: string | null,
): UserBet | null {
  const matching = rows.filter(
    bet => bet.game_date === gameDate && bet.pick_type === 'game' && bet.pick_text === pickText,
  );
  if (pickId) {
    const exact = matching.find(b => b.source_pick_id === pickId);
    if (exact) return exact;
    const legacy = matching.filter(b => !b.source_pick_id && !b.source_game_id);
    return legacy.length === 1 ? legacy[0] : null;
  }
  return matching.length === 1 ? matching[0] : null;
}

export function findExistingPropBet(
  rows: UserBet[],
  gameDate: string,
  player: string,
  propType: string,
  gameId?: string | null,
  line?: number | null,
  side?: string | null,
): UserBet | null {
  const wantedPlayer = player.trim().toLowerCase();
  const wantedType = propType.trim().toLowerCase();
  const matching = rows.filter(
    bet => bet.game_date === gameDate &&
      bet.pick_type === 'prop' &&
      (bet.player_name ?? '').trim().toLowerCase() === wantedPlayer &&
      (bet.prop_type ?? '').trim().toLowerCase() === wantedType,
  );
  if (gameId) {
    const exact = matching.find(b => b.source_game_id === gameId &&
      (line == null || b.source_line === line) && (!side || b.source_side?.toLowerCase() === side.toLowerCase()));
    if (exact) return exact;
    const legacy = matching.filter(b => !b.source_game_id);
    return legacy.length === 1 ? legacy[0] : null;
  }
  return matching.length === 1 ? matching[0] : null;
}

/** Tails/fades are system-graded — the unfakeable ledger. */
export const isVerified = (b: UserBet) => b.kind === 'tail' || b.kind === 'fade';
export const isSettled = (b: UserBet) => b.status !== 'pending';

export function isBetLocked(bet: UserBet, now = Date.now()): boolean {
  if (bet.kind === 'manual') return false;
  const lock = bet.lock_at ? Date.parse(bet.lock_at) : NaN;
  return bet.status !== 'pending' || !Number.isFinite(lock) || lock <= now;
}

export function searchBets(rows: UserBet[], search: string, league: string, status: string, favoritesOnly: boolean): UserBet[] {
  const query = search.trim().toLowerCase();
  return rows.filter(b => (!league || b.league === league) &&
    (!status || (status === 'settled' ? isSettled(b) : b.status === status)) &&
    (!favoritesOnly || b.is_favorite) &&
    (!query || [b.pick_text, b.matchup, b.notes, b.bookmaker, b.player_name].some(v => v?.toLowerCase().includes(query))));
}

/** CSV cells stay data even when a personal note begins with a formula. */
export function betsCsv(rows: UserBet[]): string {
  const cell = (value: unknown) => {
    let s = value == null ? '' : String(value);
    if (typeof value === 'string' && /^[\s]*[=+@-]/.test(s)) s = `'${s}`;
    return `"${s.replaceAll('"', '""')}"`;
  };
  return [
    ['Date', 'League', 'Selection', 'Source', 'Status', 'American odds', 'Stake units', 'Net units', 'Graded by', 'Favorite', 'Streak pick', 'Sportsbook', 'Notes'],
    ...rows.map(b => [b.game_date, b.league, b.pick_text, b.kind, b.status, b.odds_american, b.stake_units, b.units_net, b.graded_by, !!b.is_favorite, !!b.streak_pick, b.bookmaker, b.notes]),
  ].map(row => row.map(cell).join(',')).join('\r\n');
}

export interface BookRecord {
  wins: number;
  losses: number;
  pushes: number;
  units: number;
  /** Win% of decided (pushes excluded), rounded. Null with nothing decided. */
  pct: number | null;
}

export function bookRecord(rows: UserBet[]): BookRecord {
  let wins = 0, losses = 0, pushes = 0, units = 0;
  for (const b of rows) {
    if (b.status === 'won') wins++;
    else if (b.status === 'lost') losses++;
    else if (b.status === 'push') pushes++;
    units += b.units_net ?? 0;
  }
  const decided = wins + losses;
  return { wins, losses, pushes, units, pct: decided > 0 ? Math.round((wins / decided) * 100) : null };
}

// ── Tracker windows + filters (the YOU page's chips) ────────────────────────

export type Timeframe = '7d' | '30d' | 'season' | 'all';
export type Source = 'all' | 'tail' | 'fade' | 'manual';

/** First day of the verified record era. Later seasons start on January 1. */
export const SEASON_START = '2026-03-01';

/** Inclusive ISO floor for a timeframe, or null for no floor. */
export function windowSince(tf: Timeframe, now: Date = new Date()): string | null {
  if (tf === '7d') return daysAgoEST(6, now);
  if (tf === '30d') return daysAgoEST(29, now);
  if (tf === 'season') {
    const yearStart = `${estDateStr(now).slice(0, 4)}-01-01`;
    return yearStart > SEASON_START ? yearStart : SEASON_START;
  }
  return null;
}

export function filterBets(rows: UserBet[], tf: Timeframe, source: Source, now: Date = new Date()): UserBet[] {
  const since = windowSince(tf, now);
  return rows.filter(b => {
    if (since && b.game_date < since) return false;
    if (source !== 'all' && b.kind !== source) return false;
    return true;
  });
}

// ── Tracker stats (WIN% / ROI / AVG ODDS / BEST DAY) ────────────────────────
// ROI and win% here are the user's OWN money math — never Gary-side language.

export interface TrackerStats {
  winPct: number | null;
  roiPct: number | null;
  avgOdds: number | null;
  bestDay: { date: string; units: number } | null;
}

export function trackerStats(rows: UserBet[]): TrackerStats {
  const settled = rows.filter(isSettled);
  const decided = settled.filter(b => b.status === 'won' || b.status === 'lost');
  const wins = decided.filter(b => b.status === 'won').length;

  const staked = decided.reduce((s, b) => s + b.stake_units, 0);
  const net = settled.reduce((s, b) => s + (b.units_net ?? 0), 0);

  const withOdds = settled.filter(b => b.odds_american != null);
  // Average payouts in decimal space; averaging American odds could produce
  // impossible prices such as +53 when favorites and underdogs are mixed.
  const decimalAverage = withOdds.length > 0 ? withOdds.reduce((sum, b) => {
    const price = b.odds_american!;
    return sum + (price > 0 ? 1 + price / 100 : 1 + 100 / Math.abs(price));
  }, 0) / withOdds.length : null;
  const avgOdds = decimalAverage === null ? null : Math.round(decimalAverage >= 2
    ? (decimalAverage - 1) * 100 : -100 / (decimalAverage - 1));

  const byDay = new Map<string, number>();
  for (const b of settled) {
    byDay.set(b.game_date, (byDay.get(b.game_date) ?? 0) + (b.units_net ?? 0));
  }
  let bestDay: { date: string; units: number } | null = null;
  for (const [date, units] of byDay) {
    if (!bestDay || units > bestDay.units) bestDay = { date, units: Math.round(units * 100) / 100 };
  }

  return {
    winPct: decided.length > 0 ? Math.round((wins / decided.length) * 100) : null,
    roiPct: staked > 0 ? Math.round((net / staked) * 100) : null,
    avgOdds,
    bestDay,
  };
}

/** Cumulative net over settled bets, day by day, oldest first — THE RIDE. */
export function cumulativeSeries(rows: UserBet[]): { date: string; units: number }[] {
  const byDay = new Map<string, number>();
  for (const b of rows.filter(isSettled)) {
    byDay.set(b.game_date, (byDay.get(b.game_date) ?? 0) + (b.units_net ?? 0));
  }
  const days = [...byDay.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  let running = 0;
  return days.map(([date, net]) => {
    running += net;
    return { date, units: Math.round(running * 100) / 100 };
  });
}

export interface LedgerDay {
  date: string;
  net: number;
  rows: UserBet[];
}

/** Settled slips grouped by day, newest day first — THE LEDGER. */
export function groupLedgerDays(rows: UserBet[]): LedgerDay[] {
  const byDay = new Map<string, UserBet[]>();
  for (const b of rows.filter(isSettled)) {
    byDay.set(b.game_date, [...(byDay.get(b.game_date) ?? []), b]);
  }
  return [...byDay.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([date, dayRows]) => ({
      date,
      net: Math.round(dayRows.reduce((s, r) => s + (r.units_net ?? 0), 0) * 100) / 100,
      rows: dayRows,
    }));
}

/**
 * Manual settle math, mirroring the server's: a win pays at the row's odds
 * (assumed -110 when none was entered), a loss is -stake, a push is zero.
 */
export function manualUnits(status: string, stake: number, odds: number | null): number {
  const price = odds ?? -110;
  if (status === 'won') {
    return Math.round(stake * (price > 0 ? price / 100 : 100 / Math.abs(price)) * 100) / 100;
  }
  if (status === 'lost') return -stake;
  return 0;
}

// ── Money display (founder, Jul 26: "don't do units, do money") ─────────────
// Stakes/results STORE as units; the DISPLAY is dollars once the user says
// what a unit is worth. Until then, units show.

function dollars(v: number): string {
  const r = Math.round(v * 100) / 100;
  return Number.isInteger(r) ? `$${r}` : `$${r.toFixed(2)}`;
}

/** A stake: "$25" once the unit is set, else "1.0u". */
export function fmtStake(units: number, unitDollars: number): string {
  return unitDollars > 0 ? dollars(units * unitDollars) : `${units.toFixed(1)}u`;
}

/** A net result: "+$63" / "-$25", else "+0.63u" / "-1.00u". */
export function fmtNet(units: number, unitDollars: number): string {
  if (unitDollars > 0) {
    const d = units * unitDollars;
    return (d >= 0 ? '+' : '-') + dollars(Math.abs(d));
  }
  return `${units >= 0 ? '+' : ''}${units.toFixed(2)}u`;
}

/** Ledger totals, one decimal in unit mode: "+$140" / "+1.4u". */
export function fmtNetTotal(units: number, unitDollars: number): string {
  if (unitDollars > 0) {
    const d = units * unitDollars;
    return (d >= 0 ? '+' : '-') + dollars(Math.abs(d));
  }
  return `${units >= 0 ? '+' : ''}${units.toFixed(1)}u`;
}

/** American odds as slip text: "+135" / "-110". */
export function fmtOdds(odds: number | null): string | null {
  if (odds == null) return null;
  return odds > 0 ? `+${odds}` : `${odds}`;
}
