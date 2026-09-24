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
 *  2. Fill each new dart's form (his last 10 games for MLB; this season
 *     beside last season for the NFL; the clubs' first-inning scoring).
 *  3. Scratch any dart whose player is not playing (MLB lineup posted
 *     without him, NFL injury report has him out).
 *
 * Usage:
 *   node scripts/run-darts.js                 # the scheduled run
 *   node scripts/run-darts.js --league MLB --force --dry --fresh   # read the board as if empty
 *   node scripts/run-darts.js --scratch-only
 */
import '../src/loadEnv.js';
import { createClient } from '@supabase/supabase-js';

const { DART_CATEGORIES, dartCounts, etDate, etMinutes } = await import('../src/services/darts/dartsCommon.js');
const { buildMlbDartsBoard, mlbDartRow } = await import('../src/services/darts/mlbDartsBoard.js');
const { buildNflDartsBoard, nflDartRow } = await import('../src/services/darts/nflDartsBoard.js');
const { throwCategory, DARTS_PROMPT_SHA, PER_CLUB_ONE_GAME, FORMULA_FILL } = await import('../src/services/darts/dartsBrain.js');
const { screenMlbCategory, screenNflCategory, loadMlbRows, loadNflContexts, prescreenMlb } = await import('../src/services/darts/dartsScreen.js');
const { nflSeasonGames } = await import('../src/services/darts/nflDartsBoard.js');
const { scratchDarts } = await import('../src/services/darts/dartsScratch.js');
const { fillDartForms } = await import('../src/services/darts/dartsForm.js');

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
// --fresh (dry runs only): read the board as if nothing were thrown yet.
const fresh = dry && !!args.fresh;

const START = String(process.env.DARTS_START_ET || '09:15').split(':').map(Number);
const START_MIN = START[0] * 60 + (START[1] || 0);
const REFILL_GAP_MS = 55 * 60 * 1000;

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const log = (...m) => console.log(`[${new Date().toLocaleString('en-US', { timeZone: 'America/New_York' })}]`, ...m);
const dateLong = new Date(`${date}T12:00:00-04:00`).toLocaleDateString('en-US', { timeZone: 'America/New_York', weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

async function throwLeague(league) {
  const { data: existing, error } = fresh ? { data: [] } : await supabase.from('darts').select('kind, player, game_id').eq('game_date', date).eq('league', league);
  if (error) throw new Error(`darts read: ${error.message}`);
  const used = {};
  const have = {};
  for (const d of existing || []) {
    (used[d.kind] ||= []).push(d.kind === 'first_inning' ? d.game_id : d.player);
    have[d.kind] = (have[d.kind] || 0) + 1;
  }
  const most = dartCounts(league, 99, date);
  if (DART_CATEGORIES[league].every((c) => (have[c.kind] || 0) >= most[c.kind])) { log(`${league}: board full`); return; }

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
  const counts = dartCounts(league, board.games, date);
  const needed = Object.fromEntries(DART_CATEGORIES[league].map((c) => [c.kind,
    Math.min(Math.max(0, counts[c.kind] - (have[c.kind] || 0)), board.eligible[c.kind]?.length || 0)]));
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
    // THE DART SCREEN (Sep 24 2026): the rows the model prices, fetched once
    // for every category that is owed. MLB: the pre-screened batters and the
    // arms they face. NFL: two seasons of game logs from one CSV each and the
    // volume model's team context per game.
    const owedKinds = DART_CATEGORIES[league].map((c) => c.kind).filter((k) => needed[k] > 0);
    let screens;
    if (league === 'MLB') {
      const ids = new Set();
      for (const kind of owedKinds.filter((k) => k !== 'first_inning')) {
        for (const c of prescreenMlb(kind, board.candidates, board.eligible[kind] || [])) { ids.add(c.playerId); if (c.facing?.playerId) ids.add(c.facing.playerId); }
      }
      const rows = await loadMlbRows([...ids], board.season, { log: { warn: log } });
      log(`${league}: game rows for ${rows.size} of ${ids.size} players`);
      screens = await Promise.all(owedKinds.map((kind) => screenMlbCategory({ kind, board, count: needed[kind], rowsByPlayer: rows, pitcherRowsByPlayer: rows, log: { log } })));
    } else {
      const [gamesByName, priorByName, contexts] = await Promise.all([nflSeasonGames(board.season), nflSeasonGames(board.season - 1), loadNflContexts(board.frames, board.season, { log: { warn: log } })]);
      log(`${league}: game logs for ${gamesByName.size} players this season, ${priorByName.size} last; team context for ${[...contexts.values()].filter(Boolean).length} of ${board.frames.length} games`);
      screens = owedKinds.map((kind) => screenNflCategory({ kind, board, count: needed[kind], gamesByName, priorByName, contexts, season: board.season, log: { log } }));
    }
    const perClubKinds = league === 'NFL' && board.games === 1 ? PER_CLUB_ONE_GAME : [];
    const rows = [];
    const models = new Set();
    let filled = 0;
    for (const screen of screens) {
      const { kind, menu } = screen;
      if (!menu.length) { log(`${league} ${kind}: nothing priced on the board`); continue; }
      const thrown = await throwCategory({ league, kind, count: needed[kind], menu, board, dateLong, perClub: perClubKinds.includes(kind), log: { warn: log } });
      filled += thrown.filled;
      for (const d of thrown.darts) {
        const c = board.candidates.get(d.id);
        const base = league === 'MLB' ? mlbDartRow(d.kind, c, { side: d.side }) : nflDartRow(d.kind, c, { side: d.side || 'over' });
        const model = d.model === FORMULA_FILL ? `${FORMULA_FILL} · ${DARTS_PROMPT_SHA}` : `${d.model} · ${DARTS_PROMPT_SHA}`;
        models.add(d.model);
        rows.push({ ...base, game_date: date, reason: d.reason, model, rank: d.rank, screen: screen.screen[d.id] || null });
      }
    }
    for (const r of rows) log(`  🎯 ${r.kind} #${r.rank} · ${r.player} · ${r.prop} ${r.bet} ${r.odds ?? ''}${r.model.startsWith(FORMULA_FILL) ? ' · (menu order)' : ''}\n      ${r.reason}`);
    const model = [...models].filter((m) => m !== FORMULA_FILL).join('+') || FORMULA_FILL;
    const still = Object.fromEntries(owedKinds.map((k) => [k, Math.max(0, needed[k] - rows.filter((r) => r.kind === k).length)]));
    const shortBy = Object.values(still).reduce((a, b) => a + b, 0);
    if (dry) { log(`${league}: dry run, ${rows.length} darts not stored${shortBy ? `, still owed ${JSON.stringify(still)}` : ''}${filled ? `, ${filled} by menu order` : ''}`); return; }
    const { error: insErr } = await supabase.from('darts').upsert(rows, { onConflict: 'game_date,league,kind,player,game_id', ignoreDuplicates: true });
    if (insErr) throw new Error(`darts insert: ${insErr.message}`);
    await supabase.from('dart_runs').update({ finished_at: new Date().toISOString(), status: shortBy ? 'short' : 'ok', thrown: rows.length, model }).eq('id', runId);
    log(`${league}: stored ${rows.length} darts${shortBy ? `, still owed ${JSON.stringify(still)}` : ''}${filled ? `, ${filled} by menu order` : ''}`);
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
  const f = await fillDartForms({ supabase, date, log });
  if (f) log(`form filled on ${f}`);
} catch (e) { failed = true; console.error(`form pass failed: ${e.message}`); }
try {
  const n = await scratchDarts({ supabase, date, log });
  if (n) log(`scratched ${n}`);
} catch (e) { failed = true; console.error(`scratch pass failed: ${e.message}`); }
process.exit(failed ? 1 : 0);
