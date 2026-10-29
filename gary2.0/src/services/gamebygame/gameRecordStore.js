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

// Every paged read orders on a unique key (Oct 29 2026 hunt, round 7): pages sorted only by game date skipped or
// doubled games that share a date at a page edge (a 20-row test read 4 Oct 28 games twice and 4 not at all).

/** A season's games already in the store: Map(game id -> { version, date, failed: the checks that did not hold }). */
export async function storedGameIds(league, season) {
  const out = new Map();
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db().from(TABLE).select('game_id, version, game_date, checks, built_at').eq('league', league).eq('season', season).order('game_id').range(from, from + 999);
    if (error) throw new Error(`game records store: list failed: ${error.message}`);
    for (const r of data || []) out.set(String(r.game_id), { version: r.version, date: r.game_date, builtAt: r.built_at, failed: (r.checks || []).filter((c) => !c.ok).map((c) => c.check) });
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
      .eq('league', league).eq('season', season).lt('game_date', beforeDate).order('game_date').order('game_id').range(from, from + 999);
    if (error) throw new Error(`game records store: summaries failed: ${error.message}`);
    out.push(...(data || []));
    if (!data || data.length < 1000) return out;
  }
}

/** Given games' full records, by id, oldest first. */
export async function recordsById(league, gameIds) {
  if (!gameIds.length) return [];
  const { data, error } = await db().from(TABLE).select('game_id, game_date, record, checks').eq('league', league).in('game_id', gameIds.map(String)).order('game_date');
  if (error) throw new Error(`game records store: records failed: ${error.message}`);
  return data || [];
}
