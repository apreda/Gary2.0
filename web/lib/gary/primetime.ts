import { rest } from '@/lib/gary/supabase';

// PRIMETIME (founder GO, Sep 24 2026): the night's big game as a newsletter
// from Gary, the same read the app's Darts page shows. The public site reads
// it without Winners access, so the Winners play arrives sealed until it is
// graded.

export type PrimetimeBet = {
  kind: 'game' | 'prop' | 'dart' | 'winners';
  label: string;
  text?: string | null;
  odds?: number | null;
  result?: 'won' | 'lost' | 'push' | null;
  player?: string | null;
  sealed?: boolean;
  stake_dollars?: number | null;
};

export type PrimetimeLive = {
  status?: string | null;
  detail?: string | null;
  away_abbr?: string | null;
  home_abbr?: string | null;
  away_score?: number | null;
  home_score?: number | null;
};

export type PrimetimeGame = {
  league: string;
  game_id: string;
  slot: string | null;
  away_team: string;
  home_team: string;
  commence_time: string | null;
  venue: string | null;
  spread: number | null;
  total: number | null;
  lede: string | null;
  stat_to_know: string | null;
  injuries: string | null;
  live: PrimetimeLive | null;
  bets: PrimetimeBet[];
};

export type PrimetimeDay = { date: string; games: PrimetimeGame[] };

export async function fetchPrimetime(date: string): Promise<PrimetimeDay> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('Invalid date');
  return rest<PrimetimeDay>(`rpc/get_primetime?p_date=${date}`, { revalidate: 300 });
}

/** "Chicago Cubs" → "Cubs", "Toronto Blue Jays" → "Blue Jays" (the app's LabFormat.nickname). */
export function nickname(team: string): string {
  const words = team.trim().split(/\s+/);
  if (words.length >= 2 && ['Sox', 'Jays'].includes(words[words.length - 1])) return words.slice(-2).join(' ');
  return words[words.length - 1] ?? team;
}

/** "Packers -4.5": the favorite and the spread. */
export function lineWords(game: PrimetimeGame): string | null {
  if (game.spread == null || game.spread === 0) return null;
  const fav = game.spread < 0 ? game.home_team : game.away_team;
  return `${nickname(fav)} -${Math.abs(game.spread)}`;
}

export function price(odds?: number | null): string {
  if (odds == null) return '';
  return odds > 0 ? `+${odds}` : `${odds}`;
}

/** "Thursday Night Football" from the stored "THURSDAY NIGHT FOOTBALL". */
export function slotWords(slot: string | null): string {
  return (slot ?? 'Primetime').toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
}
