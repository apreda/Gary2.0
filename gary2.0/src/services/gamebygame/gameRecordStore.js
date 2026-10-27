/**
 * THE GAME RECORDS STORE (Oct 27 2026, the game-by-game system): finished games written up once and kept in
 * public.game_records. Reads, prop sheets, opponent lines and data checks are assembled from these rows, so a fix to a
 * game's data is made once and every read that shows the game has it.
 */
import { supabaseAdmin } from '../../supabaseClient.js';

const TABLE = 'game_records';
const db = () => {
  if (!supabaseAdmin) throw new Error('game records store: no service-role client');
  return supabaseAdmin;
};

/** Saves one built record (insert or replace). */
export async function saveGameRecord(row) {
  const { error } = await db().from(TABLE).upsert({ ...row, built_at: new Date().toISOString() }, { onConflict: 'league,game_id' });
  if (error) throw new Error(`game records store: save ${row.league} ${row.game_id} failed: ${error.message}`);
}

/** The ids of a season's games already in the store, with their version. */
export async function storedGameIds(league, season) {
  const out = new Map();
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db().from(TABLE).select('game_id, version').eq('league', league).eq('season', season).range(from, from + 999);
    if (error) throw new Error(`game records store: list failed: ${error.message}`);
    for (const r of data || []) out.set(String(r.game_id), r.version);
    if (!data || data.length < 1000) return out;
  }
}

/** One team's full records in a season with a game date before `beforeDate` (YYYY-MM-DD), newest first. */
export async function teamRecords(league, season, teamId, beforeDate, limit = 100) {
  const id = String(teamId);
  const { data, error } = await db().from(TABLE).select('game_id, game_date, record, checks')
    .eq('league', league).eq('season', season).or(`home_team_id.eq.${id},away_team_id.eq.${id}`)
    .lt('game_date', beforeDate).order('game_date', { ascending: false }).limit(limit);
  if (error) throw new Error(`game records store: team ${id} failed: ${error.message}`);
  return data || [];
}

/** Every game's one-line summary in a season before `beforeDate` (for the opponent lines), oldest first. */
export async function seasonSummaries(league, season, beforeDate) {
  const out = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db().from(TABLE).select('game_id, game_date, summary')
      .eq('league', league).eq('season', season).lt('game_date', beforeDate).order('game_date').range(from, from + 999);
    if (error) throw new Error(`game records store: summaries failed: ${error.message}`);
    out.push(...(data || []));
    if (!data || data.length < 1000) return out;
  }
}
