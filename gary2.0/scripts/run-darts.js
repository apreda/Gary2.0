#!/usr/bin/env node
/**
 * DARTS — Gary's fun leans for the day, their own lane (founder, Sep 22 2026).
 * Never game picks, never prop picks, never graded, never on any record.
 *
 * Each run (com.gary.darts, every 20 minutes):
 *  1. From DARTS_START_ET (09:15) on, for each league with games still to
 *     start: fill every category to five from the day's real markets. The
 *     first run of the day throws the board; later runs only fill categories
 *     that were short because their markets had not posted yet, at most once
 *     an hour per league. A dart already thrown is never replaced.
 *  2. Scratch any dart whose player is not playing (MLB lineup posted
 *     without him, NFL injury report has him out).
 *
 * Usage:
 *   node scripts/run-darts.js                 # the scheduled run
 *   node scripts/run-darts.js --league MLB --force --dry
 *   node scripts/run-darts.js --scratch-only
 */
import '../src/loadEnv.js';
import { createClient } from '@supabase/supabase-js';

const { DART_COUNT, DART_CATEGORIES, etDate, etMinutes } = await import('../src/services/darts/dartsCommon.js');
const { buildMlbDartsBoard, mlbDartRow } = await import('../src/services/darts/mlbDartsBoard.js');
const { buildNflDartsBoard, nflDartRow } = await import('../src/services/darts/nflDartsBoard.js');
const { throwDarts, DARTS_PROMPT_SHA } = await import('../src/services/darts/dartsBrain.js');
const { scratchDarts } = await import('../src/services/darts/dartsScratch.js');

const args = Object.fromEntries(process.argv.slice(2).map((a) => {
  const [k, v] = a.replace(/^--/, '').split('=');
  return [k, v ?? true];
}));
const argAfter = (flag) => { const i = process.argv.indexOf(`--${flag}`); return i > 0 && !process.argv[i + 1]?.startsWith('--') ? process.argv[i + 1] : null; };
const date = argAfter('date') || args.date || etDate();
const onlyLeague = (argAfter('league') || args.league || '').toUpperCase() || null;
const force = !!args.force;
const dry = !!args.dry;
const scratchOnly = !!args['scratch-only'];

const START = String(process.env.DARTS_START_ET || '09:15').split(':').map(Number);
const START_MIN = START[0] * 60 + (START[1] || 0);
const REFILL_GAP_MS = 55 * 60 * 1000;

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const log = (...m) => console.log(`[${new Date().toLocaleString('en-US', { timeZone: 'America/New_York' })}]`, ...m);
const dateLong = new Date(`${date}T12:00:00-04:00`).toLocaleDateString('en-US', { timeZone: 'America/New_York', weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

async function throwLeague(league) {
  const { data: existing, error } = await supabase.from('darts').select('kind, player, game_id').eq('game_date', date).eq('league', league);
  if (error) throw new Error(`darts read: ${error.message}`);
  const used = {};
  const have = {};
  for (const d of existing || []) {
    (used[d.kind] ||= []).push(d.kind === 'first_inning' ? d.game_id : d.player);
    have[d.kind] = (have[d.kind] || 0) + 1;
  }
  if (DART_CATEGORIES[league].every((c) => (have[c.kind] || 0) >= DART_COUNT)) { log(`${league}: board full`); return; }

  if (!force) {
    const { data: last } = await supabase.from('dart_runs').select('started_at, status')
      .eq('game_date', date).eq('league', league).order('started_at', { ascending: false }).limit(1);
    const lastAt = last?.[0] ? Date.parse(last[0].started_at) : 0;
    if (Date.now() - lastAt < REFILL_GAP_MS) { log(`${league}: last throw ${Math.round((Date.now() - lastAt) / 60000)} min ago, waiting`); return; }
  }

  const board = league === 'MLB'
    ? await buildMlbDartsBoard({ supabase, date, used })
    : await buildNflDartsBoard({ date, used });
  if (!board.games) { log(`${league}: no games left to start`); return; }
  const needed = Object.fromEntries(DART_CATEGORIES[league].map((c) => [c.kind,
    Math.min(Math.max(0, DART_COUNT - (have[c.kind] || 0)), board.eligible[c.kind]?.length || 0)]));
  const owed = Object.values(needed).reduce((a, b) => a + b, 0);
  if (!owed) { log(`${league}: nothing new to throw (${JSON.stringify(have)})`); return; }
  log(`${league}: ${board.games} games, throwing ${JSON.stringify(needed)}`);

  let runId = null;
  if (!dry) {
    const { data: run, error: runErr } = await supabase.from('dart_runs').insert({ game_date: date, league, needed }).select('id').single();
    if (runErr) throw new Error(`dart_runs insert: ${runErr.message}`);
    runId = run.id;
  }
  try {
    const { darts, model, missing } = await throwDarts({ league, board, needed, dateLong });
    const rows = darts.map((d) => {
      const c = board.candidates.get(d.id);
      const base = league === 'MLB' ? mlbDartRow(d.kind, c, { side: d.side }) : nflDartRow(d.kind, c);
      return { ...base, game_date: date, reason: d.reason, model: `${model} · ${DARTS_PROMPT_SHA}` };
    });
    for (const r of rows) log(`  🎯 ${r.kind} · ${r.player} · ${r.prop} ${r.bet} ${r.odds ?? ''}${r.odds_alt != null ? ` / run ${r.odds_alt}` : ''}`);
    if (dry) { log(`${league}: dry run, ${rows.length} darts not stored`); return; }
    const { error: insErr } = await supabase.from('darts').upsert(rows, { onConflict: 'game_date,league,kind,player,game_id', ignoreDuplicates: true });
    if (insErr) throw new Error(`darts insert: ${insErr.message}`);
    const shortBy = Object.values(missing).reduce((a, b) => a + b, 0);
    await supabase.from('dart_runs').update({ finished_at: new Date().toISOString(), status: shortBy ? 'short' : 'ok', thrown: rows.length, model }).eq('id', runId);
    log(`${league}: stored ${rows.length} darts${shortBy ? `, still owed ${JSON.stringify(missing)}` : ''}`);
  } catch (e) {
    if (runId) await supabase.from('dart_runs').update({ finished_at: new Date().toISOString(), status: 'failed', error: String(e.message).slice(0, 2000) }).eq('id', runId);
    throw e;
  }
}

let failed = false;
if (!scratchOnly && (force || etMinutes() >= START_MIN || date !== etDate())) {
  for (const league of ['MLB', 'NFL'].filter((l) => !onlyLeague || l === onlyLeague)) {
    try { await throwLeague(league); } catch (e) { failed = true; console.error(`${league} darts failed: ${e.message}`); }
  }
}
try {
  const n = await scratchDarts({ supabase, date, log });
  if (n) log(`scratched ${n}`);
} catch (e) { failed = true; console.error(`scratch pass failed: ${e.message}`); }
process.exit(failed ? 1 : 0);
