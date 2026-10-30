// PLAYER RED ZONE (founder GO, Sep 24 2026): a player's carries and targets
// inside the 20 (and the 10, and carries inside the 5), this season beside
// last, from Ball Don't Lie's NFL play-by-play: every play carries its yards
// to the end zone and names the rusher, the passer and the targeted receiver,
// incompletions included. BDL carries no situational split endpoint, so the
// counts are ours: per game, per player, in nfl_red_zone_games, filled once
// per final game (refreshNflRedZone reads only games not yet read) and read
// back as season totals. Facts only.
import { ballDontLieService as bdl } from '../../providers/ballDontLieService.js';
import { normName } from '../../gary/darts/dartsCommon.js';

const API = 'https://api.balldontlie.io/nfl/v1';
const RUSH = new Set(['rush', 'rushing-touchdown']);
const PASS = new Set(['pass-reception', 'pass-incompletion', 'passing-touchdown', 'pass-interception-return']);
const CAUGHT = new Set(['pass-reception', 'passing-touchdown']);

const blank = () => ({ carries_in20: 0, carries_in10: 0, carries_in5: 0, rush_tds_in20: 0, targets_in20: 0, targets_in10: 0, receptions_in20: 0, rec_tds_in20: 0, pass_att_in20: 0, pass_tds_in20: 0 });

/** One game's plays → Map player_id → { team, counts }. */
export function countRedZone(plays) {
  const out = new Map();
  const bump = (id, team, f) => {
    if (id == null) return;
    const k = Number(id);
    if (!out.has(k)) out.set(k, { team: team || null, ...blank() });
    f(out.get(k));
  };
  for (const p of plays || []) {
    const ytg = Number(p?.start_yards_to_endzone);
    if (!Number.isFinite(ytg) || ytg > 20 || ytg <= 0) continue;
    const slug = String(p.type_slug || '');
    const team = p.team?.abbreviation || null;
    const who = (type) => (p.participants || []).find((x) => x.type === type)?.player_id;
    // A victory-formation kneel is typed as a rush with the quarterback as rusher; it is not a red-zone carry
    // (audit, Oct 13 2026: Bo Nix read 7 carries inside the 20, 4 real; Sam Darnold 2, 0 real).
    if (RUSH.has(slug) && /\bkneel/i.test(String(p.text || p.description || ''))) continue;
    if (RUSH.has(slug)) {
      bump(who('rusher'), team, (c) => {
        c.carries_in20 += 1; if (ytg <= 10) c.carries_in10 += 1; if (ytg <= 5) c.carries_in5 += 1;
        if (slug === 'rushing-touchdown') c.rush_tds_in20 += 1;
      });
    } else if (PASS.has(slug)) {
      bump(who('passer'), team, (c) => { c.pass_att_in20 += 1; if (slug === 'passing-touchdown') c.pass_tds_in20 += 1; });
      bump(who('receiver'), team, (c) => {
        c.targets_in20 += 1; if (ytg <= 10) c.targets_in10 += 1;
        if (CAUGHT.has(slug)) c.receptions_in20 += 1;
        if (slug === 'passing-touchdown') c.rec_tds_in20 += 1;
      });
    }
  }
  return out;
}

async function seasonFinalGames(season) {
  const key = process.env.BALLDONTLIE_API_KEY || process.env.VITE_BALLDONTLIE_API_KEY || process.env.NEXT_PUBLIC_BALLDONTLIE_API_KEY;
  const games = [];
  let cursor = null;
  for (let page = 0; page < 20; page++) {
    const q = new URLSearchParams({ 'seasons[]': String(season), per_page: '100' });
    if (cursor) q.set('cursor', String(cursor));
    const res = await fetch(`${API}/games?${q}`, { headers: { Authorization: key }, signal: AbortSignal.timeout(20000) });
    if (!res.ok) throw new Error(`BDL NFL games HTTP ${res.status}`);
    const body = await res.json();
    games.push(...(body.data || []));
    cursor = body.meta?.next_cursor;
    if (!cursor) break;
  }
  return games.filter((g) => /^final/i.test(String(g.status || '')));
}

/** Read every final game of the seasons not yet read. Returns how many games were read. */
export async function refreshNflRedZone({ supabase, seasons, log = console }) {
  let read = 0;
  for (const season of seasons) {
    const finals = await seasonFinalGames(season);
    const { data: done, error } = await supabase.from('nfl_red_zone_read').select('game_id').eq('season', season);
    if (error) throw new Error(error.message);
    const have = new Set((done || []).map((r) => Number(r.game_id)));
    const todo = finals.filter((g) => !have.has(Number(g.id)));
    let i = 0;
    const worker = async () => {
      while (i < todo.length) {
        const g = todo[i++];
        try {
          const counts = countRedZone(await bdl.getNflPlays(g.id));
          const ids = [...counts.keys()];
          const people = ids.length ? await bdl.getNflPlayersByIds(ids) : {};
          const rows = ids.map((id) => {
            const c = counts.get(id);
            const info = people?.[id] || people?.[String(id)] || {};
            return { game_id: g.id, season, week: g.week ?? null, player_id: id, player_name: info.name || [info.first_name, info.last_name].filter(Boolean).join(' ') || null, updated_at: new Date().toISOString(), ...c };
          });
          if (rows.length) {
            const { error: e } = await supabase.from('nfl_red_zone_games').upsert(rows, { onConflict: 'game_id,player_id' });
            if (e) throw new Error(e.message);
          }
          const { error: e2 } = await supabase.from('nfl_red_zone_read').upsert({ game_id: g.id, season }, { onConflict: 'game_id' });
          if (e2) throw new Error(e2.message);
          read += 1;
        } catch (e) { log.warn(`[Red zone] game ${g.id}: ${e.message}`); }
      }
    };
    await Promise.all(Array.from({ length: Math.min(4, todo.length) }, worker));
  }
  return read;
}

/** Each player's games with a red-zone touch: { byName: Map "season|name" → [rows by week], byId: Map "season|id" → [...] }.
 * Game by game, no season totals (round 9, Oct 29 2026: the line was the one season total left on the prop and dart sheets). */
export async function loadNflRedZone({ supabase, seasons }) {
  const byName = new Map(), byId = new Map();
  const cols = 'season, week, player_id, player_name, team, carries_in20, carries_in10, carries_in5, rush_tds_in20, targets_in20, targets_in10, receptions_in20, rec_tds_in20, pass_att_in20, pass_tds_in20';
  for (const season of seasons) {
    for (let from = 0; from < 20000; from += 1000) {
      const { data, error } = await supabase.from('nfl_red_zone_games').select(cols).eq('season', season).order('game_id').order('player_id').range(from, from + 999);
      if (error) throw new Error(error.message);
      for (const r of data || []) {
        const row = { week: Number(r.week), ...Object.fromEntries(Object.keys(blank()).map((k) => [k, Number(r[k]) || 0])) };
        for (const [map, key] of [[byId, `${season}|${r.player_id}`], [byName, `${season}|${normName(r.player_name)}`]]) {
          if (!r.player_name && map === byName) continue;
          if (!map.has(key)) map.set(key, []);
          map.get(key).push(row);
        }
      }
      if (!data || data.length < 1000) break;
    }
  }
  return { byName, byId };
}

function oneGame(t, position) {
  const bits = [];
  const pos = String(position || '').toUpperCase();
  if (pos === 'QB' && t.pass_att_in20) bits.push(`${t.pass_att_in20} passes inside the 20, ${t.pass_tds_in20} TD`);
  if (t.carries_in20) bits.push(`${t.carries_in20} carries inside the 20 (${t.carries_in10} inside the 10, ${t.carries_in5} inside the 5), ${t.rush_tds_in20} rushing TD`);
  if (t.targets_in20) bits.push(`${t.targets_in20} targets inside the 20 (${t.targets_in10} inside the 10), ${t.receptions_in20} caught, ${t.rec_tds_in20} TD`);
  return bits.length ? `Wk ${t.week} ${bits.join('; ')}` : null;
}

/** "red zone, 2026 by game, newest first: Wk 7 2 carries inside the 20 (...) · Wk 5 ...; none in his other games". This
 * season only. */
export function redZoneLine(rz, name, season, position) {
  if (!rz) return null;
  const games = (rz.byName.get(`${season}|${normName(name)}`) || []).slice().sort((a, b) => b.week - a.week).map((g) => oneGame(g, position)).filter(Boolean);
  if (!games.length) return `red zone, ${season}: no red-zone touches in any game`;
  return `red zone, ${season} by game, newest first: ${games.join(' · ')}; no red-zone touches in his other games`;
}
