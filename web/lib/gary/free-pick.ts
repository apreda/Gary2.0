import { rest } from '@/lib/gary/supabase';
import { cardTeamName } from '@/components/picks/model';
import { nativeTeamLabel } from '@/components/picks/score-labels';
import { normalizeLeague } from '@/lib/gary/leagues';

// Gary's free pick of the day, read the way the app's Winners page reads it:
// get_streak names the ticket and the run, get_winners_board carries the
// ticket itself with its reasons and its grade. Both RPCs are open to anon
// for the free ticket. The board is read for the free ticket only.

export interface FreePickReason {
  claim: string;
  why: string;
}

export interface FreePick {
  /** The ET date the pick belongs to. */
  date: string;
  /** Today's pick, or yesterday's while today's hasn't been chosen. */
  day: 'today' | 'yesterday';
  league: string;
  kind: 'game' | 'prop';
  matchup: string;
  commence: string | null;
  /** The ticket as a reader says it, without its price. */
  title: string;
  /** Over or under, lifted off the title the way the app's ticket does. */
  direction: 'over' | 'under' | null;
  price: number | null;
  stakeUnits: number | null;
  /** The book with the best price on a game pick, as it writes its name. */
  book: string | null;
  result: 'won' | 'lost' | 'push' | null;
  /** "TB 24 · DAL 16" for a game, "0 hits" for a prop. */
  score: string | null;
  reasons: FreePickReason[];
  /** Gary's written case, the pick card's take. */
  rationale: string | null;
  /** The streak form: decided results oldest first, and whether this one waits. */
  recent: ('W' | 'L')[];
  pending: boolean;
}

interface StreakDay {
  candidate_id: number;
  game_date: string;
  league: string;
  kind: string;
  matchup: string;
  commence_time: string | null;
  pick_text: string;
  odds: number | string | null;
  result: string | null;
  stake_units: number | null;
}

interface StreakState {
  current: number;
  recent: string[];
  today: StreakDay | null;
  yesterday: StreakDay | null;
}

interface BoardTicket {
  candidate_id: number;
  stake_units: number | string | null;
  scratched_at: string | null;
  reasons: { claim?: string; why?: string }[] | null;
  result: {
    result?: string;
    away_score?: number;
    home_score?: number;
    final_score?: string;
    actual_value?: number;
  } | null;
  pick_snapshot: Record<string, unknown> | null;
}

interface WinnersBoard {
  free_candidate_id: number | null;
  tickets: BoardTicket[];
}

const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);
const num = (v: unknown): number | null => {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
};

/** "Giants +6.5 -102" → "Giants +6.5". */
export function ticketBody(text: string): string {
  return text.replace(/\s*[+-]\d{3,4}\s*$/, '').trim();
}

/** "Nick Martinez over 4.5 hits" → over, "Nick Martinez 4.5 hits"; a bare total gets the league's word. */
export function splitDirection(body: string, league: string): { direction: 'over' | 'under' | null; body: string } {
  const m = body.match(/\b(over|under)\s+(?=[0-9])/i);
  if (!m || m.index === undefined) return { direction: null, body };
  const direction = m[1].toLowerCase() === 'over' ? 'over' : 'under';
  let rest = (body.slice(0, m.index) + body.slice(m.index + m[0].length)).trim();
  if (/^[0-9]+(\.[0-9]+)?$/.test(rest)) {
    const l = league.toUpperCase();
    rest += l === 'MLB' ? ' runs' : ['NFL', 'NCAAF', 'NBA', 'NCAAB'].includes(l) ? ' points' : ' goals';
  }
  return { direction, body: rest };
}

/** "pitcher_earned_runs 2.5" → "earned runs". */
export function marketWords(raw: string | null): string {
  if (!raw) return '';
  let s = raw.toLowerCase().replace(/\s*[0-9]+(\.[0-9]+)?$/, '');
  s = s.replace('pitcher_', '').replace('batter_', '').replace(/_/g, ' ');
  if (s === 'hits runs rbis') return 'hits + runs + RBI';
  if (s === 'hits allowed') return 'hits';
  if (s === 'rbi' || s === 'rbis') return 'RBI';
  return s;
}

function propTicket(snap: Record<string, unknown>): string | null {
  const player = str(snap.player);
  const prop = str(snap.prop);
  const bet = (str(snap.bet) ?? '').toLowerCase();
  if (prop && /^(first|1st)_inning/i.test(prop)) return bet === 'under' ? 'No Run 1st Inning' : 'Yes Run 1st Inning';
  const line = str(snap.line) ?? (prop?.match(/[0-9]+(\.[0-9]+)?$/)?.[0] ?? null);
  const parts = [player, bet || null, line, marketWords(prop) || null].filter(Boolean);
  return parts.length ? parts.join(' ') : null;
}

/** The book as it writes its own name. */
export function bookName(raw: string | null): string | null {
  switch ((raw ?? '').toLowerCase()) {
    case 'fanduel': return 'FanDuel';
    case 'draftkings': return 'DraftKings';
    case 'betmgm': return 'BetMGM';
    case 'caesars': return 'Caesars';
    case 'betrivers': return 'BetRivers';
    case 'fanatics': return 'Fanatics';
    case '': return null;
    default: return raw ? raw.charAt(0).toUpperCase() + raw.slice(1) : null;
  }
}

/** "New York Giants @ Los Angeles Rams" → "Giants @ Rams"; colleges by school. */
export function shortMatchup(matchup: string, league: string): string {
  const sides = matchup.split(' @ ');
  if (sides.length !== 2) return matchup;
  return sides.map(s => cardTeamName(s, league)).join(' @ ');
}

function countWords(value: number, market: string | null): string {
  let words = marketWords(market);
  if (value === 1) {
    const singular: Record<string, string> = {
      hits: 'hit', strikeouts: 'strikeout', outs: 'out', walks: 'walk', runs: 'run', rbis: 'RBI',
      'home runs': 'home run', 'total bases': 'total base', 'earned runs': 'earned run',
      receptions: 'reception', touchdowns: 'touchdown', 'receiving yards': 'receiving yard',
      'rushing yards': 'rushing yard', 'passing yards': 'passing yard',
    };
    words = singular[words.toLowerCase()] ?? words;
  }
  return words ? `${value} ${words}` : String(value);
}

function scoreLine(ticket: BoardTicket, league: string, kind: string): string | null {
  const r = ticket.result;
  const snap = ticket.pick_snapshot ?? {};
  if (!r) return null;
  if (kind === 'prop') {
    const actual = num(r.actual_value);
    return actual === null ? null : countWords(actual, str(snap.prop));
  }
  const away = str(snap.awayTeam), home = str(snap.homeTeam);
  const a = num(r.away_score), h = num(r.home_score);
  if (away && home && a !== null && h !== null) {
    return `${nativeTeamLabel(away, league)} ${a} · ${nativeTeamLabel(home, league)} ${h}`;
  }
  return str(r.final_score);
}

function resultWord(raw: string | null | undefined): FreePick['result'] {
  const r = (raw ?? '').toLowerCase();
  if (r === 'won') return 'won';
  if (r === 'lost') return 'lost';
  if (r === 'push' || r === 'void') return 'push';
  return null;
}

async function freeTicket(date: string, candidateId: number): Promise<BoardTicket | null> {
  const board = await rest<WinnersBoard>(`rpc/get_winners_board?p_date=${date}`, { revalidate: 120 });
  return board.tickets.find(t => Number(t.candidate_id) === candidateId) ?? null;
}

function shape(day: StreakDay, ticket: BoardTicket | null, state: StreakState, which: FreePick['day']): FreePick {
  const league = normalizeLeague(day.league) ?? day.league.toUpperCase();
  const kind = day.kind === 'prop' ? 'prop' : 'game';
  const snap = ticket?.pick_snapshot ?? {};
  const spoken = kind === 'prop' ? (propTicket(snap) ?? ticketBody(day.pick_text)) : ticketBody(day.pick_text);
  const split = splitDirection(spoken, league);
  const books = Array.isArray(snap.sportsbook_odds) ? (snap.sportsbook_odds as { book?: string }[]) : [];
  const result = resultWord(ticket?.result?.result ?? day.result);
  const recent = (state.recent ?? []).filter((r): r is 'W' | 'L' => r === 'W' || r === 'L');
  return {
    date: day.game_date,
    day: which,
    league,
    kind,
    matchup: day.matchup,
    commence: day.commence_time,
    title: split.body,
    direction: split.direction,
    price: num(day.odds),
    stakeUnits: num(ticket?.stake_units ?? day.stake_units),
    book: split.direction ? null : bookName(str(books[0]?.book)),
    result,
    score: ticket ? scoreLine(ticket, league, kind) : null,
    reasons: (ticket?.reasons ?? [])
      .map(r => ({ claim: str(r.claim) ?? '', why: str(r.why) ?? '' }))
      .filter(r => r.claim),
    rationale: str(snap.rationale),
    recent,
    pending: result === null,
  };
}

/**
 * Today's free pick, or yesterday's (dated and graded) until Gary chooses
 * today's. Throws when the database can't be read, so a page keeps its last
 * good render instead of claiming there is no pick.
 */
export async function fetchFreePick(today: string): Promise<FreePick | null> {
  const state = await rest<StreakState>(`rpc/get_streak?p_date=${today}`, { revalidate: 120 });
  const day = state.today ?? state.yesterday;
  if (!day) return null;
  const ticket = await freeTicket(day.game_date, Number(day.candidate_id)).catch(() => null);
  if (ticket?.scratched_at) return null;
  return shape(day, ticket, state, state.today ? 'today' : 'yesterday');
}
