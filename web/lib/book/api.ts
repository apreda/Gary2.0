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
  if (lower.includes('stake')) return 'Choose a stake between 0.01 and 10 units.';
  if (lower.includes('odds')) return 'Use American odds from -100000 to -100 or +100 to +100000.';
  if (lower.includes('streak')) return 'Your streak pick is locked for that day. Choose a future game.';
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
  gameId?: string | null;
  line?: number | null;
  side?: string | null;
  streak?: boolean;
}): Promise<UserBet> {
  const exact = args.gameId && args.line != null && args.side;
  const { data, error } = await supabaseBrowser().rpc(exact ? 'place_user_prop_bet_v2' : 'place_user_prop_bet', {
    p_game_date: args.gameDate,
    p_player: args.player,
    p_prop_type: args.propType,
    p_kind: args.kind,
    p_stake: args.stake,
    p_streak: args.streak ?? false,
    ...(exact ? { p_game_id: args.gameId, p_line: args.line, p_side: args.side } : {}),
  });
  if (error) {
    console.warn('[YourBook] place_user_prop_bet failed:', error.message);
    throw new Error(friendly(error.message));
  }
  return asRow<UserBet>(data);
}

/** The signed-in user's bets, newest first (RLS scopes to the owner). */
export async function fetchMyBets(): Promise<UserBet[]> {
  const { data: auth, error: authError } = await supabaseBrowser().auth.getUser();
  if (authError || !auth.user) throw new Error('Your session has ended. Sign in to open your book.');
  const rows: UserBet[] = [];
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await supabaseBrowser().from('user_bets').select('*')
      .eq('user_id', auth.user.id).order('placed_at', { ascending: false })
      .order('id', { ascending: false }).range(offset, offset + 499);
    if (error) throw new Error('Your book could not load. Your saved bets are still there. Please retry.');
    rows.push(...(data ?? []) as UserBet[]);
    if ((data?.length ?? 0) < 500) return [...new Map(rows.map(row => [row.id, row])).values()];
  }
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
  if (error) throw new Error('Your streak could not load. Please retry.');
  return (data?.[0] as UserStreak | undefined) ?? null;
}

/** The signed-in user's claimed handle, if any. */
export async function fetchMyHandle(): Promise<string | null> {
  return (await fetchMyProfile()).profile?.display_name ?? null;
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
    throw new Error('The leaderboard could not load. Please retry.');
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
  notes?: string;
  bookmaker?: string;
  favorite?: boolean;
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
    notes: args.notes ?? '',
    bookmaker: args.bookmaker ?? '',
    is_favorite: args.favorite ?? false,
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

export async function gradeManual(id: string, status: 'pending' | 'won' | 'lost' | 'push' | 'void', unitsNet: number): Promise<boolean> {
  const { data, error } = await supabaseBrowser()
    .from('user_bets')
    .update({ status, units_net: unitsNet, graded_at: new Date().toISOString(), graded_by: 'user' })
    .eq('id', id).eq('kind', 'manual').select('id');
  if (error) throw new Error(friendly(error.message));
  if (!data?.length) throw new Error('That bet could not be updated. Refresh and try again.');
  return true;
}

export async function deleteBet(id: string): Promise<boolean> {
  const { data, error } = await supabaseBrowser().from('user_bets').delete().eq('id', id).select('id');
  if (error) throw new Error(friendly(error.message));
  if (!data?.length) throw new Error('That bet is locked or no longer available. Refresh your book.');
  return true;
}

export interface MyProfile {
  ok: boolean;
  profile: { display_name: string; handle: string | null; avatar: string | null; bio: string | null; leaderboard_visible: boolean } | null;
  preferences: { favorite_sports: string[]; unit_value: number | null } | null;
}

export async function fetchMyProfile(): Promise<MyProfile> {
  const { data, error } = await supabaseBrowser().rpc('get_my_profile');
  if (error || !data?.ok) throw new Error('Your profile could not load. Please retry.');
  return data as MyProfile;
}

export async function saveMyProfile(args: { handle?: string; avatar?: string; bio?: string; visible?: boolean; sports?: string[]; unitValue?: number | null }): Promise<MyProfile> {
  const { data, error } = await supabaseBrowser().rpc('save_my_profile', {
    p_handle: args.handle ?? null, p_avatar: args.avatar ?? null, p_bio: args.bio ?? null,
    p_leaderboard_visible: args.visible ?? null, p_favorite_sports: args.sports ?? null,
    p_unit_value: args.unitValue ?? null,
  });
  if (error || !data?.ok) throw new Error(friendly(error?.message ?? data?.error ?? 'profile'));
  return data as MyProfile;
}

export async function updateBet(id: string, patch: Partial<Pick<UserBet, 'is_favorite' | 'notes' | 'bookmaker' | 'pick_text' | 'description' | 'game_date' | 'league' | 'odds_american' | 'stake_units'>>): Promise<UserBet> {
  const { data, error } = await supabaseBrowser().from('user_bets').update(patch).eq('id', id).select('*').single();
  if (error || !data) throw new Error(friendly(error?.message ?? 'update failed'));
  return data as UserBet;
}

export async function setStreakPick(id: string, star: boolean): Promise<UserBet> {
  const { data, error } = await supabaseBrowser().rpc('set_streak_pick', { p_bet_id: id, p_star: star });
  if (error) throw new Error(friendly(error.message));
  return asRow<UserBet>(data);
}

export type BoardSort = 'streak' | 'wins' | 'record' | 'units';
export interface RankedRow extends BoardRow {
  rank: number; user_id: string; handle: string | null; avatar: string | null;
  win_pct: number | null; streak_len: number; streak_kind: string | null; decided: number;
}
export interface LeaderboardData {
  rows: RankedRow[]; me: RankedRow | null; qualified_count: number; min_decided: number;
  my_decided: number; window: string; sort: string; league: string; has_more: boolean;
}
export async function fetchRankings(window: string, sort: BoardSort, league: string, offset = 0): Promise<LeaderboardData> {
  const { data, error } = await supabaseBrowser().rpc('your_book_leaderboard_v3', {
    p_window: window, p_sort: sort, p_league: league, p_limit: 25, p_offset: offset,
  });
  if (error || !data) throw new Error('The leaderboard could not load. Please retry.');
  return data as LeaderboardData;
}
