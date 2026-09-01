import { mergeGameResults } from '@/lib/gary/results';
import { restAll } from '@/lib/gary/supabase';
import type { GameResultRow, NflResultRow } from '@/lib/gary/types';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Read only the result window the Today desk displays, never the full ledger. */
export async function fetchRecentGameResults(
  since: string,
  revalidate = 600,
): Promise<GameResultRow[]> {
  if (!ISO_DATE.test(since)) throw new Error('Invalid recent-results date');

  const [games, nfl] = await Promise.all([
    restAll<GameResultRow>(
      `game_results?select=game_date,league,matchup,pick_text,result,final_score,confidence&game_date=gte.${since}&order=game_date.desc`,
      { revalidate },
    ),
    restAll<NflResultRow>(
      `nfl_results?select=game_date,matchup,pick_text,result,final_score,confidence,week_number,season,season_type,home_team,away_team,home_score,away_score&game_date=gte.${since}&order=game_date.desc`,
      { revalidate },
    ),
  ]);

  return mergeGameResults(nfl, games);
}
