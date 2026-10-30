#!/usr/bin/env node
/**
 * Cash Rail worker (Oct 29 2026): keeps live_boards current for today's NFL
 * games. One run = 4 passes 15 seconds apart, then exit; launchd
 * (com.gary2.cash-rail) starts it every minute, so a board is never more than
 * ~15 seconds behind BDL's plays. The pass itself lives in
 * src/services/cashRail/worker.js.
 *
 * Usage:
 *   node scripts/cash-rail-worker.js            # 4 passes, 15s apart
 *   node scripts/cash-rail-worker.js --once     # one pass
 */
import '../src/loadEnv.js';
import { createClient } from '@supabase/supabase-js';
import { runPass } from '../src/services/cashRail/worker.js';

const supabase = createClient(process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } });
const BDL_KEY = process.env.BALLDONTLIE_API_KEY;

async function bdlGet(path) {
  const r = await fetch(`https://api.balldontlie.io${path}`, { headers: { Authorization: BDL_KEY } });
  if (!r.ok) throw new Error(`BDL ${r.status} ${path}`);
  return r.json();
}
async function bdlAll(path) {
  const rows = [];
  let cursor = null;
  for (let page = 0; page < 30; page++) {
    const sep = path.includes('?') ? '&' : '?';
    const j = await bdlGet(`${path}${sep}per_page=100${cursor ? `&cursor=${cursor}` : ''}`);
    rows.push(...(j.data || []));
    cursor = j.meta?.next_cursor;
    if (!cursor) break;
  }
  return rows;
}

const bdl = {
  game: async id => (await bdlGet(`/nfl/v1/games/${id}`)).data ?? null,
  props: async id => (await bdlGet(`/nfl/v1/odds/player_props?game_id=${id}`)).data ?? [],
  gameOdds: async id => (await bdlGet(`/nfl/v1/odds?game_ids[]=${id}`)).data ?? [],
  players: async ids => {
    const out = {};
    for (let i = 0; i < ids.length; i += 50) {
      const q = ids.slice(i, i + 50).map(x => `player_ids[]=${x}`).join('&');
      for (const p of await bdlAll(`/nfl/v1/players?${q}`)) {
        out[p.id] = { name: `${p.first_name} ${p.last_name}`.trim(), number: p.jersey_number ?? null, team: p.team?.abbreviation ?? null };
      }
    }
    return out;
  },
  plays: async id => bdlAll(`/nfl/v1/plays?game_id=${id}`),
};

const etDate = d => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(d);
const must = ({ data, error }) => { if (error) throw error; return data; };
const db = {
  // BDL dates games in UTC, so a night game sits on the next UTC day: ask for
  // both and keep the games whose kickoff falls on this ET slate date.
  listNflGameIds: async date => {
    const next = new Date(new Date(`${date}T12:00:00Z`).getTime() + 86_400_000).toISOString().slice(0, 10);
    const games = await bdlAll(`/nfl/v1/games?dates[]=${date}&dates[]=${next}`);
    return games.filter(g => g.date && etDate(new Date(g.date)) === date).map(g => g.id);
  },
  lastSnapshot: async (league, id) => must(await supabase.from('live_board_prices').select('captured_at')
    .eq('league', league).eq('game_id', id).order('captured_at', { ascending: false }).limit(1))[0] ?? null,
  frozenSnapshot: async (league, id, kickoff) => must(await supabase.from('live_board_prices').select('captured_at,props,game_odds,players')
    .eq('league', league).eq('game_id', id).lte('captured_at', kickoff).order('captured_at', { ascending: false }).limit(1))[0] ?? null,
  insertSnapshot: async row => { must(await supabase.from('live_board_prices').insert(row)); },
  getBoard: async (league, id) => must(await supabase.from('live_boards').select('status').eq('league', league).eq('game_id', id).maybeSingle()),
  upsertBoard: async row => { must(await supabase.from('live_boards').upsert(row, { onConflict: 'league,game_id' })); },
  garyPickRow: async g => {
    const weeks = must(await supabase.from('weekly_nfl_picks').select('picks,week_start').order('week_start', { ascending: false }).limit(2));
    for (const w of weeks) {
      const picks = typeof w.picks === 'string' ? JSON.parse(w.picks) : (w.picks || []);
      const hit = picks.find(p => p.homeTeam === g.home_team?.full_name && p.awayTeam === g.visitor_team?.full_name);
      if (hit) return hit;
    }
    return null;
  },
};

/** Today's ET slate date, plus yesterday's in the small hours (a Monday night game runs past midnight). */
function slateDates(now = new Date()) {
  const fmt = d => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(d);
  const hour = Number(new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: 'numeric', hourCycle: 'h23' }).format(now));
  return hour < 5 ? [fmt(now), fmt(new Date(now - 86_400_000))] : [fmt(now)];
}

const log = msg => console.log(`[cash-rail ${new Date().toISOString()}] ${msg}`);
const passes = process.argv.includes('--once') ? 1 : 4;
for (let i = 0; i < passes; i++) {
  const started = Date.now();
  for (const date of slateDates()) {
    try { await runPass({ date, db, bdl, log }); }
    catch (e) { log(`pass failed for ${date}: ${e.message}`); }
  }
  if (i < passes - 1) await new Promise(r => setTimeout(r, Math.max(0, 15_000 - (Date.now() - started))));
}
