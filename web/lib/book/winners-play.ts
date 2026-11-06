import { normalizeLeague } from '@/lib/gary/leagues';
import { bookName, num, propTicket, scoreLine, shortTitle, splitDirection, str, ticketBody, trailingPrice } from '@/lib/gary/ticket-format';
import type { WinnersBoard } from './access';

// One play on the Winners board, read the way the app reads it
// (ios/GaryApp/WinnersLab: LabBoardTicket, WinnersLabView).

export interface PlayReason { claim: string; why: string; stat: string | null; note: string | null }
export type PlayResult = 'won' | 'lost' | 'push';

export interface WinnersPlay {
  id: number;
  gameDate: string;
  league: string;
  kind: 'game' | 'prop';
  gameId: string | null;
  commence: string | null;
  matchup: string;
  /** The ticket on a card, over or under lifted off: "Derrick Henry 69.5 rushing yards". */
  title: string;
  short: string;
  /** The ticket on a one-line row, over or under left in: "Henry under 69.5 rushing yards". */
  rowTitle: string;
  direction: 'over' | 'under' | null;
  book: string | null;
  price: number | null;
  stakeUnits: number | null;
  scratched: boolean;
  result: PlayResult | null;
  score: string | null;
  reasons: PlayReason[];
  rationale: string | null;
  keyStats: string[];
  snapshot: WinnersBoard['tickets'][number]['pick_snapshot'];
}

export function toPlay(t: WinnersBoard['tickets'][number]): WinnersPlay {
  const snap = (t.pick_snapshot ?? {}) as unknown as Record<string, unknown>;
  const league = normalizeLeague(t.league) ?? t.league.toUpperCase();
  const kind = t.kind === 'prop' ? 'prop' : 'game';
  const player = kind === 'prop' ? str(snap.player) : null;
  const matchup = kind === 'prop'
    ? (str(snap.matchup) ?? '')
    : [str(snap.awayTeam), str(snap.homeTeam)].filter(Boolean).join(' @ ');
  const pick = str(snap.pick) ?? '';
  const spoken = kind === 'prop' ? (propTicket(snap) ?? ticketBody(pick)) : ticketBody(pick);
  const split = splitDirection(spoken, league);
  const books = Array.isArray(snap.sportsbook_odds) ? (snap.sportsbook_odds as { book?: string }[]) : [];
  const raw = (t.result?.result ?? '').toLowerCase();
  const result: PlayResult | null = raw === 'won' || raw === 'lost' ? raw : raw === 'push' || raw === 'void' ? 'push' : null;
  return {
    id: Number(t.candidate_id),
    gameDate: t.game_date,
    league,
    kind,
    gameId: t.game_id === null || t.game_id === undefined ? null : String(t.game_id),
    commence: str(snap.commence_time),
    matchup,
    title: split.body,
    short: shortTitle(split.body, player, matchup, league),
    rowTitle: shortTitle(spoken, player, matchup, league),
    direction: split.direction,
    book: split.direction ? null : bookName(str(books[0]?.book)),
    price: kind === 'game' ? (trailingPrice(pick) ?? num(snap.odds)) : num(snap.odds),
    stakeUnits: num(t.stake_units),
    scratched: !!t.scratched_at,
    result,
    score: scoreLine({ result: t.result, pick_snapshot: snap }, league, kind),
    reasons: (t.reasons ?? [])
      .map(r => ({ claim: str(r.claim) ?? '', why: str(r.why) ?? '', stat: str(r.stat), note: str(r.note) }))
      .filter(r => r.claim),
    rationale: (str(snap.rationale) ?? str(snap.analysis))?.replace(/^\s*Gary'?s Take\s*\n+/i, '') ?? null,
    keyStats: Array.isArray(snap.key_stats) ? (snap.key_stats as unknown[]).map(str).filter((s): s is string => !!s) : [],
    snapshot: t.pick_snapshot,
  };
}

/** What a dollar risked pays at this price. */
export const payout = (price: number | null) => {
  const p = price ?? -110;
  return p > 0 ? p / 100 : 100 / Math.abs(p);
};

/** The play's result in units: the win at its price, the stake on a loss. */
export function netUnits(play: WinnersPlay): number {
  const stake = play.stakeUnits ?? 0;
  return play.result === 'won' ? stake * payout(play.price) : play.result === 'lost' ? -stake : 0;
}

/** A net result as money: "+$478", "-$50", "$0". */
export function unitsNet(units: number): string {
  const dollars = Math.round(units * 100);
  if (dollars === 0) return '$0';
  return `${dollars > 0 ? '+' : '-'}$${Math.abs(dollars).toLocaleString('en-US')}`;
}

export interface DayLine { won: number; lost: number; push: number; open: number; units: number }

export function dayLine(plays: WinnersPlay[]): DayLine {
  const line: DayLine = { won: 0, lost: 0, push: 0, open: 0, units: 0 };
  for (const p of plays) {
    if (p.scratched) continue;
    if (p.result === 'won') line.won += 1;
    else if (p.result === 'lost') line.lost += 1;
    else if (p.result === 'push') line.push += 1;
    else line.open += 1;
    line.units += netUnits(p);
  }
  return line;
}

export const recordText = (l: DayLine) => `${l.won}-${l.lost}${l.push ? `-${l.push}` : ''}`;

/** "3 h 5 min", "35 min"; null once the game has started. */
export function countdown(commence: string | null, now: number): string | null {
  const at = commence ? new Date(commence).getTime() : NaN;
  if (!Number.isFinite(at) || at <= now) return null;
  const minutes = Math.ceil((at - now) / 60000);
  return minutes >= 60 ? `${Math.floor(minutes / 60)} h ${minutes % 60} min` : `${minutes} min`;
}
