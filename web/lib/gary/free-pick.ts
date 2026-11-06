import { rest } from '@/lib/gary/supabase';
import { normalizeLeague } from '@/lib/gary/leagues';
import { bookName, num, propTicket, scoreLine, shortTitle, splitDirection, str, ticketBody } from '@/lib/gary/ticket-format';

export { bookName, marketWords, shortMatchup, shortTitle, splitDirection, ticketBody } from '@/lib/gary/ticket-format';

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
  /** Today's ticket, or the one before it. */
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
  /** The game the ticket is on, to find the pick card it came from. */
  gameId: string | null;
  /** The player on a prop ticket. */
  player: string | null;
}

interface StreakDay {
  candidate_id: number;
  game_id?: string | number | null;
  player?: string | null;
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
    title: shortTitle(split.body, kind === 'prop' ? str(snap.player) : null, day.matchup, league),
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
    gameId: day.game_id === null || day.game_id === undefined ? null : String(day.game_id),
    player: str(snap.player) ?? str(day.player),
  };
}

export interface FreePicks {
  /** Today's ticket once Gary chooses it. */
  today: FreePick | null;
  /** The ticket before today's, graded. */
  last: FreePick | null;
  /** The streak form: decided results, oldest first. */
  recent: ('W' | 'L')[];
}

/**
 * Today's free pick and the one before it, each with its own date and grade.
 * Throws when the database can't be read, so a page keeps its last good
 * render instead of claiming there is no pick.
 */
export async function fetchFreePicks(today: string): Promise<FreePicks> {
  const state = await rest<StreakState>(`rpc/get_streak?p_date=${today}`, { revalidate: 120 });
  const read = async (day: StreakDay | null, which: FreePick['day']) => {
    if (!day) return null;
    const ticket = await freeTicket(day.game_date, Number(day.candidate_id)).catch(() => null);
    if (ticket?.scratched_at) return null;
    return shape(day, ticket, state, which);
  };
  const [todays, last] = await Promise.all([
    read(state.today, 'today'),
    read(state.yesterday, 'yesterday'),
  ]);
  const recent = (state.recent ?? []).filter((r): r is 'W' | 'L' => r === 'W' || r === 'L');
  return { today: todays, last, recent };
}
