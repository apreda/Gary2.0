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
 *     without him, NFL injury report has him out). A scratched dart's spot
 *     is thrown again on a later run (Sep 24 2026): the quota counts the
 *     darts that stand, and a new dart's rank follows the category's last.
 *
 * Usage:
 *   node scripts/run-darts.js                 # the scheduled run
 *   node scripts/run-darts.js --league MLB --force --dry --fresh   # read the board as if empty
 *   node scripts/run-darts.js --league MLB --force --dry --fresh --as-of 2026-09-24T13:00:00Z   # as it stood that morning
 *   node scripts/run-darts.js --scratch-only
 */
import '../src/loadEnv.js';
import { createClient } from '@supabase/supabase-js';

const { DART_CATEGORIES, dartCounts, etDate, etMinutes } = await import('../src/services/darts/dartsCommon.js');
const { buildMlbDartsBoard, mlbDartRow } = await import('../src/services/darts/mlbDartsBoard.js');
const { buildNflDartsBoard, nflDartRow } = await import('../src/services/darts/nflDartsBoard.js');
const { throwCategory, DARTS_PROMPT_SHA, PER_CLUB_ONE_GAME, FORMULA_FILL } = await import('../src/services/darts/dartsBrain.js');
const { screenMlbCategory, screenNflCategory, loadMlbRows, loadNflContexts, mlbGameBlock, nflGameBlock } = await import('../src/services/darts/dartsScreen.js');
const { loadMlbGameFrames, loadMlbPlayerSplits, loadVsPitcher } = await import('../src/services/mlbGameFrames.js');
const { loadPriceHistory } = await import('../src/services/pickdesk/priceHistory.js');
const { getBatterXStats, getBatterStatcastProfiles } = await import('../src/services/baseballSavantService.js');
const { refreshNflRedZone, loadNflRedZone } = await import('../src/services/nflRedZone.js');
const { gameDays, snapCounts, defenseByPosition, weeklyRows: nflWeeklyRows } = await import('../src/services/nflPlayerContext.js');
const { ballDontLieService: bdl } = await import('../src/services/ballDontLieService.js');
const { normName } = await import('../src/services/darts/dartsCommon.js');
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
// --as-of (dry runs only): read the board as it stood at that time, e.g. --as-of 2026-09-24T13:00:00Z.
const asOfArg = argAfter('as-of') || args['as-of'];
const asOf = dry && asOfArg && Number.isFinite(Date.parse(asOfArg)) ? Date.parse(asOfArg) : undefined;

const START = String(process.env.DARTS_START_ET || '09:15').split(':').map(Number);
const START_MIN = START[0] * 60 + (START[1] || 0);
const REFILL_GAP_MS = 55 * 60 * 1000;

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const log = (...m) => console.log(`[${new Date().toLocaleString('en-US', { timeZone: 'America/New_York' })}]`, ...m);
const dateLong = new Date(`${date}T12:00:00-04:00`).toLocaleDateString('en-US', { timeZone: 'America/New_York', weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

/** The board's prices, kept per day so a player's own price history builds (dart_board_prices). Never fatal. */
async function storeBoardPrices(board, league, date) {
  const rows = [];
  const add = (kind, c, player, m) => { if (m) rows.push({ game_date: date, league, kind, player, player_id: c.playerId ?? null, game_id: String(c.gameId), line: m.line ?? null, over_odds: m.over ?? m.odds ?? null, under_odds: m.under ?? null, book: m.book ?? null, seen_at: new Date().toISOString() }); };
  for (const c of board.candidates.values()) {
    if (league === 'MLB') {
      if (c.kind === 'first_inning') add('first_inning', c, c.matchup, { line: 0.5, over: c.yes, under: c.no, book: c.book });
      else { add('hr', c, c.player, c.hr && { ...c.hr, line: 0.5 }); add('multihit', c, c.player, c.hits && { ...c.hits, line: 1.5 }); }
    } else {
      add(c.tdKind || 'td', c, c.player, c.td && { ...c.td, line: 0.5 });
      add('recyds', c, c.player, c.rec); add('rushyds', c, c.player, c.rush); add('passtd', c, c.player, c.pass); add('int', c, c.player, c.int);
    }
  }
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await supabase.from('dart_board_prices').upsert(rows.slice(i, i + 500), { onConflict: 'game_date,league,kind,player,game_id' });
    if (error) { log(`${league}: board prices not stored (${error.message})`); return; }
  }
  log(`${league}: ${rows.length} board prices stored`);
}

async function throwLeague(league) {
  const { data: existing, error } = fresh ? { data: [] } : await supabase.from('darts').select('kind, player, game_id, rank, scratched_at').eq('game_date', date).eq('league', league);
  if (error) throw new Error(`darts read: ${error.message}`);
  const used = {};
  const have = {};
  const lastRank = {};
  for (const d of existing || []) {
    (used[d.kind] ||= []).push(d.kind === 'first_inning' ? d.game_id : d.player);
    if (!d.scratched_at) have[d.kind] = (have[d.kind] || 0) + 1;
    lastRank[d.kind] = Math.max(lastRank[d.kind] || 0, d.rank || 0);
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
    ? await buildMlbDartsBoard({ supabase, date, used, now: asOf })
    : await buildNflDartsBoard({ date, used, now: asOf, supabase });
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
    // His own last three days of throws per category, as facts about his record.
    const since = new Date(Date.parse(`${date}T12:00:00Z`) - 3 * 86400000).toISOString().slice(0, 10);
    const { data: recent } = await supabase.from('darts').select('game_date, kind, player, matchup, prop, bet, odds, result, scratched_at, rank')
      .eq('league', league).gte('game_date', since).lt('game_date', date).is('replaced_by', null);
    const historyOf = (kind) => (recent || []).filter((d) => d.kind === kind);
    let screens;
    const blocks = new Map();
    const starts = new Map();
    if (league === 'MLB') {
      // THE WHOLE BOARD (Sep 24 2026): every priced batter, the arms they face and both starters of every game.
      const ids = new Set();
      for (const kind of owedKinds.filter((k) => k !== 'first_inning')) {
        for (const id of board.eligible[kind] || []) { const c = board.candidates.get(id); if (c?.playerId) ids.add(c.playerId); if (c?.facing?.playerId) ids.add(c.facing.playerId); }
      }
      for (const f of board.gamesById.values()) for (const st of [f.awayStarter, f.homeStarter]) if (st?.playerId) ids.add(st.playerId);
      const names = [...new Set([...board.candidates.values()].map((c) => c.player).filter(Boolean))];
      const [rows, games, splits, xstats, statcast, history] = await Promise.all([
        loadMlbRows([...ids], board.season, { log: { warn: log } }),
        loadMlbGameFrames(date).catch((e) => { log(`${league}: game frames unavailable (${e.message}); sheets print without dates and arms`); return []; }),
        loadMlbPlayerSplits([...board.gamesById.values()].map((f) => f.gamePk), board.season).catch(() => null),
        getBatterXStats(board.season).then((list) => new Map((list || []).map((x) => [String(x.player_id), x]))).catch(() => new Map()),
        getBatterStatcastProfiles(board.season).then((list) => new Map((list || []).map((x) => [String(x.player_id), x]))).catch(() => new Map()),
        loadPriceHistory(supabase, { league: 'MLB', players: names, date }),
      ]);
      const pairs = [];
      if (splits) {
        for (const c of board.candidates.values()) {
          const pk = board.gamesById.get(String(c.gameId))?.gamePk;
          if (pk && c.player && c.facing?.name) pairs.push({ batterId: splits.idOf(pk, c.player), pitcherId: splits.idOf(pk, c.facing.name) });
        }
      }
      const vs = await loadVsPitcher(pairs).catch(() => new Map());
      log(`${league}: game rows for ${rows.size} of ${ids.size} players · ${games.length} past games framed · ${vs.size} batter-vs-starter lines · price history for ${history.size} markets`);
      const ctx = { games, splits, vs, xstats, statcast, history, gamePkOf: (gid) => board.gamesById.get(String(gid))?.gamePk ?? null };
      for (const f of board.gamesById.values()) { blocks.set(String(f.gameId), mlbGameBlock(f, ctx, rows)); starts.set(String(f.gameId), f.commence); }
      screens = owedKinds.map((kind) => screenMlbCategory({ kind, board, rowsByPlayer: rows, ctx, log: { log } }));
    } else {
      await refreshNflRedZone({ supabase, seasons: [board.season], log: { warn: log } }).catch((e) => log(`${league}: red zone refresh failed (${e.message})`));
      const [gamesByName, priorByName, contexts, rz, days, snaps, defCur, defPrev, weekRows, injuries, history] = await Promise.all([
        nflSeasonGames(board.season), nflSeasonGames(board.season - 1), loadNflContexts(board.frames, board.season, { log: { warn: log } }),
        loadNflRedZone({ supabase, seasons: [board.season, board.season - 1] }).catch(() => null),
        gameDays(), snapCounts(board.season), defenseByPosition(board.season), defenseByPosition(board.season - 1), nflWeeklyRows(board.season),
        bdl.getNflPlayerInjuries().catch(() => []),
        loadPriceHistory(supabase, { league: 'NFL', players: [...new Set([...board.candidates.values()].map((c) => c.player))], date, days: 21 }),
      ]);
      const weeksByName = new Map();
      for (const r of [...(weekRows || [])].sort((a, b) => Number(b.week) - Number(a.week))) { const k = normName(r.player_display_name); if (!weeksByName.has(k)) weeksByName.set(k, []); weeksByName.get(k).push(r); }
      const framesById = new Map(board.frames.map((f) => [String(f.gameId), f]));
      const ctx = { rz, days, snaps, defCur, defPrev, weeksByName, injuries, history, frameOf: (gid) => framesById.get(String(gid)) };
      log(`${league}: game logs for ${gamesByName.size} players this season, ${priorByName.size} last; team context for ${[...contexts.values()].filter(Boolean).length} of ${board.frames.length} games; red zone ${rz ? rz.byName.size : 0} player-seasons, snaps ${snaps?.size || 0}`);
      for (const f of board.frames) { blocks.set(String(f.gameId), nflGameBlock(f)); starts.set(String(f.gameId), f.commence); }
      screens = owedKinds.map((kind) => screenNflCategory({ kind, board, gamesByName, priorByName, contexts, season: board.season, ctx, log: { log } }));
    }
    if (!dry) await storeBoardPrices(board, league, date);
    const perClubKinds = league === 'NFL' && board.games === 1 ? PER_CLUB_ONE_GAME : [];
    const rows = [];
    const models = new Set();
    let filled = 0;
    for (const screen of screens) {
      const { kind, menu } = screen;
      if (!menu.length) { log(`${league} ${kind}: nothing priced on the board`); continue; }
      const thrown = await throwCategory({ league, kind, count: needed[kind], menu, board, dateLong, perClub: perClubKinds.includes(kind), blocks, starts, history: historyOf(kind), note: screen.note, log: { warn: log } });
      filled += thrown.filled;
      if (thrown.looked?.length) log(`${league} ${kind}: read ${thrown.looked.length} sheets of ${menu.length} (${thrown.looked.join(', ')})`);
      for (const d of thrown.darts) {
        const c = board.candidates.get(d.id);
        const base = league === 'MLB' ? mlbDartRow(d.kind, c, { side: d.side }) : nflDartRow(d.kind, c, { side: d.side || 'over' });
        const model = d.model === FORMULA_FILL ? `${FORMULA_FILL} · ${DARTS_PROMPT_SHA}` : `${d.model} · ${DARTS_PROMPT_SHA}`;
        models.add(d.model);
        rows.push({ ...base, game_date: date, reason: d.reason, model, rank: (lastRank[kind] || 0) + d.rank, screen: screen.screen[d.id] || null });
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
