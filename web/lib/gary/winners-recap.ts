import { rest } from '@/lib/gary/supabase';

// Last night's Winners, read the way the app's morning recap reads it
// (DailyRecapOverlay): the night's record, the money, the bankroll after it,
// and Gary's face for the night from its win rate. get_winners_recap is open
// to anon.

export type GaryMood = 'fire' | 'cooking' | 'beer' | 'icecold' | 'doomsday';

export interface WinnersNight {
  /** The ET date of the night. */
  date: string;
  won: number;
  lost: number;
  push: number;
  /** The night's net in dollars. */
  net: number;
  bankroll: number | null;
  mood: GaryMood;
}

interface RecapTicket {
  result: string | null;
  net_dollars: number | string | null;
}

interface Recap {
  date: string;
  bankroll_dollars: number | string | null;
  tickets: RecapTicket[] | null;
}

/** The app's emotion ladder: 80+ Fire, 70s Cooking, 50s-60s Beer, 40s Ice Cold, under 40 Doomsday. */
export function moodFor(won: number, lost: number): GaryMood {
  const graded = won + lost;
  const pct = graded === 0 ? 0 : won / graded;
  if (pct >= 0.8) return 'fire';
  if (pct >= 0.7) return 'cooking';
  if (pct >= 0.5) return 'beer';
  if (pct >= 0.4) return 'icecold';
  return 'doomsday';
}

const num = (v: number | string | null | undefined) => {
  const n = typeof v === 'string' ? Number(v) : v;
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
};

/** The night's Winners, or null when nothing on it has a result yet. */
export async function fetchWinnersNight(date: string): Promise<WinnersNight | null> {
  const recap = await rest<Recap | null>(`rpc/get_winners_recap?p_date=${date}`, { revalidate: 300 });
  const tickets = recap?.tickets ?? [];
  const won = tickets.filter((t) => t.result === 'won').length;
  const lost = tickets.filter((t) => t.result === 'lost').length;
  const push = tickets.filter((t) => t.result === 'push').length;
  if (!recap || won + lost + push === 0) return null;
  const net = tickets.reduce((sum, t) => sum + (num(t.net_dollars) ?? 0), 0);
  return {
    date,
    won,
    lost,
    push,
    net: Math.round(net),
    bankroll: num(recap.bankroll_dollars),
    mood: moodFor(won, lost),
  };
}
