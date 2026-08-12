'use client';

import { supabaseBrowser } from '@/lib/auth/client';
import type { UserBet } from './model';

// ─────────────────────────────────────────────────────────────────────────────
// YOUR BOOK client API — the same PostgREST surface iOS UserBookAPI talks to,
// through the cookie-session Supabase client. Tail/fade INSERT only via the
// SECURITY DEFINER RPCs (they resolve odds + lock server-side and refuse
// post-lock writes); manual bets write the table directly under RLS.
// ─────────────────────────────────────────────────────────────────────────────

/** Server diagnostics stay in the console; users get product language. */
function friendly(diagnostic: string): string {
  const lower = diagnostic.toLowerCase();
  if (lower.includes('locked') || lower.includes('already started')) {
    return 'This game has already started, so that choice is locked.';
  }
  if (lower.includes('pick not found') || lower.includes('no rows')) {
    return 'That pick is no longer available. Refresh and try again.';
  }
  if (lower.includes('lock time')) {
    return 'This pick is not open for tracking yet. Try again shortly.';
  }
  if (lower.includes('not signed in') || lower.includes('jwt') || lower.includes('unauthorized')) {
    return 'Sign in to save this to your book.';
  }
  if (lower.includes('handle')) {
    if (lower.includes('taken')) return 'That handle is already taken.';
    if (lower.includes('reserved')) return 'That handle is reserved. Try another.';
    return 'Use 3-18 letters, numbers, or underscores.';
  }
  return 'We could not save that right now. Please try again.';
}

function asRow<T>(data: unknown): T {
  return (Array.isArray(data) ? data[0] : data) as T;
}

export async function placeBet(args: {
  gameDate: string;
  pickId?: string | null;
  pickText: string;
  kind: 'tail' | 'fade';
  stake: number;
  streak?: boolean;
}): Promise<UserBet> {
  const { data, error } = await supabaseBrowser().rpc('place_user_bet', {
    p_game_date: args.gameDate,
    p_pick_id: args.pickId ?? null,
    p_pick_text: args.pickText,
    p_kind: args.kind,
    p_stake: args.stake,
    p_streak: args.streak ?? false,
  });
  if (error) {
    console.warn('[YourBook] place_user_bet failed:', error.message);
    throw new Error(friendly(error.message));
  }
  return asRow<UserBet>(data);
}

export async function placePropBet(args: {
  gameDate: string;
  player: string;
  propType: string;
  kind: 'tail' | 'fade';
  stake: number;
}): Promise<UserBet> {
  const { data, error } = await supabaseBrowser().rpc('place_user_prop_bet', {
    p_game_date: args.gameDate,
    p_player: args.player,
    p_prop_type: args.propType,
    p_kind: args.kind,
    p_stake: args.stake,
  });
  if (error) {
    console.warn('[YourBook] place_user_prop_bet failed:', error.message);
    throw new Error(friendly(error.message));
  }
  return asRow<UserBet>(data);
}

/** The signed-in user's bets, newest first (RLS scopes to the owner). */
export async function fetchMyBets(): Promise<UserBet[]> {
  const { data, error } = await supabaseBrowser()
    .from('user_bets')
    .select('*')
    .order('placed_at', { ascending: false })
    .limit(400);
  if (error) {
    console.warn('[YourBook] user_bets fetch failed:', error.message);
    return [];
  }
  return (data ?? []) as UserBet[];
}

export interface UserStreak {
  current: number;
  best: number;
  last_counted_date: string | null;
  last_result: string | null;
}

/** The user's streak row (owner-only RLS). Null until a streak play settles. */
export async function fetchMyStreak(): Promise<UserStreak | null> {
  const { data, error } = await supabaseBrowser()
    .from('user_streaks')
    .select('current,best,last_counted_date,last_result')
    .limit(1);
  if (error) return null;
  return (data?.[0] as UserStreak | undefined) ?? null;
}

/** The signed-in user's claimed handle, if any. */
export async function fetchMyHandle(): Promise<string | null> {
  const { data, error } = await supabaseBrowser()
    .from('public_profiles')
    .select('display_name')
    .limit(1);
  if (error) return null;
  return (data?.[0] as { display_name: string } | undefined)?.display_name ?? null;
}

export async function claimHandle(name: string): Promise<string> {
  const { data, error } = await supabaseBrowser().rpc('claim_handle', { p_name: name });
  if (error) throw new Error(friendly(error.message));
  return asRow<{ display_name: string }>(data).display_name;
}

export interface BoardRow {
  display_name: string;
  wins: number;
  losses: number;
  pushes: number;
  units: number;
  best_streak: number;
}

/** Public standings (aggregate-only RPC; anon-readable by design). */
export async function fetchLeaderboard(window: '7d' | '30d' | 'season'): Promise<BoardRow[]> {
  const { data, error } = await supabaseBrowser().rpc('your_book_leaderboard', { p_window: window });
  if (error) {
    console.warn('[YourBook] leaderboard fetch failed:', error.message);
    return [];
  }
  return (data ?? []) as BoardRow[];
}

/** Public riders/faders counts per pick_text for a date (aggregate only). */
export async function fetchTailCounts(
  gameDate: string,
): Promise<Record<string, { tails: number; fades: number }>> {
  const { data, error } = await supabaseBrowser().rpc('pick_tail_counts', { p_game_date: gameDate });
  if (error) return {};
  const out: Record<string, { tails: number; fades: number }> = {};
  for (const r of (data ?? []) as { pick_text: string; tails: number; fades: number }[]) {
    out[r.pick_text] = { tails: r.tails, fades: r.fades };
  }
  return out;
}

export async function logManual(args: {
  league: string;
  description: string;
  odds: number | null;
  stake: number;
  gameDate: string;
}): Promise<UserBet> {
  const supabase = supabaseBrowser();
  const { data: auth } = await supabase.auth.getUser();
  const uid = auth.user?.id;
  if (!uid) throw new Error('Sign in to keep a book.');

  const row: Record<string, unknown> = {
    user_id: uid,
    kind: 'manual',
    game_date: args.gameDate,
    league: args.league,
    pick_text: args.description,
    description: args.description,
    stake_units: args.stake,
  };
  if (args.odds != null) row.odds_american = args.odds;

  const { data, error } = await supabase.from('user_bets').insert(row).select('*');
  if (error) {
    console.warn('[YourBook] manual insert failed:', error.message);
    throw new Error(friendly(error.message));
  }
  const bet = (data ?? [])[0] as UserBet | undefined;
  if (!bet) throw new Error('We could not save that bet. Please try again.');
  return bet;
}

export async function gradeManual(id: string, status: 'won' | 'lost' | 'push', unitsNet: number): Promise<boolean> {
  const { error } = await supabaseBrowser()
    .from('user_bets')
    .update({ status, units_net: unitsNet, graded_at: new Date().toISOString(), graded_by: 'user' })
    .eq('id', id);
  if (error) console.warn('[YourBook] manual grade failed:', error.message);
  return !error;
}

export async function deleteBet(id: string): Promise<boolean> {
  const { error } = await supabaseBrowser().from('user_bets').delete().eq('id', id);
  if (error) console.warn('[YourBook] delete failed:', error.message);
  return !error;
}
