import { supabase } from '../supabaseClient';

/**
 * Web-side mirror of the iOS SupabaseAPI performance fetchers. Reads from the
 * same `game_results` table the app reads so the website shows identical
 * numbers without any backfill / sync layer.
 */

function toESTDateStr(d) {
  return d.toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
}

/**
 * Fetch the most recent day (within the last 7) that has any graded results,
 * return overall W-L-P. Matches the iOS fetchMostRecentGameRecord behavior.
 *
 * Returns: { wins, losses, pushes, date | null }
 */
export async function fetchMostRecentGameRecord() {
  const now = new Date();
  const since = new Date(now.getTime() - 7 * 86400000);

  const { data, error } = await supabase
    .from('game_results')
    .select('game_date, result')
    .gte('game_date', toESTDateStr(since))
    .order('game_date', { ascending: false });

  if (error) {
    console.error('[performanceService] game_results fetch failed', error);
    return { wins: 0, losses: 0, pushes: 0, date: null };
  }

  if (!data || data.length === 0) return { wins: 0, losses: 0, pushes: 0, date: null };

  // Walk back through yesterday → 7 days ago, return the first day with results
  for (let daysBack = 1; daysBack <= 7; daysBack += 1) {
    const checkDate = new Date(now.getTime() - daysBack * 86400000);
    const checkStr = toESTDateStr(checkDate);
    let wins = 0;
    let losses = 0;
    let pushes = 0;
    for (const row of data) {
      if (row.game_date !== checkStr) continue;
      const r = (row.result || '').toLowerCase();
      if (r === 'won' || r === 'win' || r === 'w') wins += 1;
      else if (r === 'lost' || r === 'loss' || r === 'l') losses += 1;
      else if (r === 'push' || r === 'p') pushes += 1;
    }
    if (wins + losses > 0) return { wins, losses, pushes, date: checkStr };
  }

  return { wins: 0, losses: 0, pushes: 0, date: null };
}

/**
 * Same logic by league. Returns an array of { league, wins, losses, pushes }
 * for the most recent results day.
 */
export async function fetchRecentSportBreakdown() {
  const now = new Date();
  const since = new Date(now.getTime() - 7 * 86400000);

  const { data, error } = await supabase
    .from('game_results')
    .select('game_date, result, league')
    .gte('game_date', toESTDateStr(since))
    .order('game_date', { ascending: false });

  if (error) return [];
  if (!data || data.length === 0) return [];

  for (let daysBack = 1; daysBack <= 7; daysBack += 1) {
    const checkDate = new Date(now.getTime() - daysBack * 86400000);
    const checkStr = toESTDateStr(checkDate);
    const rows = data.filter(r => r.game_date === checkStr);
    if (rows.length === 0) continue;

    const buckets = new Map();
    for (const row of rows) {
      const league = (row.league || 'OTHER').toUpperCase();
      const bucket = buckets.get(league) || { league, wins: 0, losses: 0, pushes: 0 };
      const r = (row.result || '').toLowerCase();
      if (r === 'won' || r === 'win' || r === 'w') bucket.wins += 1;
      else if (r === 'lost' || r === 'loss' || r === 'l') bucket.losses += 1;
      else if (r === 'push' || r === 'p') bucket.pushes += 1;
      buckets.set(league, bucket);
    }
    const list = [...buckets.values()].filter(b => b.wins + b.losses > 0);
    if (list.length > 0) {
      // Sort by total picks (most active sport first)
      list.sort((a, b) => (b.wins + b.losses) - (a.wins + a.losses));
      return list;
    }
  }
  return [];
}

/**
 * Last N graded wins across all sports. Used for the "Recent Wins" ticker.
 * Returns array of { league, pick, game_date }.
 */
export async function fetchRecentWins(limit = 8) {
  const now = new Date();
  const since = new Date(now.getTime() - 14 * 86400000);

  const { data, error } = await supabase
    .from('game_results')
    .select('game_date, result, league, pick_text, matchup')
    .gte('game_date', toESTDateStr(since))
    .ilike('result', 'w%')
    .order('game_date', { ascending: false })
    .limit(limit * 2); // overfetch a bit since some rows may have empty pick_text

  if (error) return [];
  if (!data) return [];

  return data
    .filter(r => r.pick_text || r.matchup)
    .slice(0, limit)
    .map(r => ({
      league: (r.league || '').toUpperCase(),
      pick: r.pick_text || r.matchup || '',
      date: r.game_date,
    }));
}
