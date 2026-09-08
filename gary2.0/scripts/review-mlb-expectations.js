#!/usr/bin/env node
/** Incremental main-Gary expectation reviews; never creates or grades a pick. */
import '../src/loadEnv.js';
import { pathToFileURL } from 'node:url';
import { randomUUID } from 'node:crypto';
import { supabaseAdmin } from '../src/supabaseClient.js';
import { getMlbSchedule, getGameBoxScore, getScoringFlowAttributed } from '../src/services/mlbStatsApiService.js';
import { gameTicketIdentity, normalizedResult } from '../src/services/pickdesk/winnersBook.js';
import { buildMlbExpectationSnapshot, reviewMlbExpectations, formatMlbExpectationMemory } from '../src/services/diary/mlbExpectations.js';

const todayET = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
const normalize = value => String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
const checked = ({ data, error }, label) => { if (error) throw new Error(`${label}: ${error.message}`); return data || []; };
const withSignal = (query, signal) => signal && typeof query.abortSignal === 'function' ? query.abortSignal(signal) : query;
async function bounded(action, signal) {
  signal?.throwIfAborted();
  if (!signal) return action();
  let onAbort;
  const aborted = new Promise((_, reject) => {
    onAbort = () => reject(signal.reason || new Error('MLB expectation batch cancelled'));
    signal.addEventListener('abort', onAbort, { once: true });
  });
  try { return await Promise.race([action(), aborted]); }
  finally { signal.removeEventListener('abort', onAbort); }
}
async function pages(makeQuery, order, label, signal) {
  const rows = [];
  for (let offset = 0; ; offset += 500) {
    const data = checked(await bounded(() => withSignal(makeQuery().order(order, { ascending: true }).range(offset, offset + 499), signal), signal), label);
    rows.push(...data);
    if (data.length < 500) return rows;
  }
}

// The existing MLB read service has no cancellation parameter. These bounded
// reads use its same official endpoints and scoring attribution when a batch
// signal is supplied, so timed-out enrichment cannot keep the results job alive.
async function officialJson(path, signal) {
  const response = await fetch(`https://statsapi.mlb.com/api/v1${path}`, { signal });
  if (!response.ok) throw new Error(`MLB Stats API ${response.status}`);
  return response.json();
}
const scheduleSource = async (date, { signal } = {}) => {
  if (!signal) return getMlbSchedule(date, { throwOnError: true });
  const data = await officialJson(`/schedule?sportId=1&date=${date}&hydrate=probablePitcher,linescore`, signal);
  if (!Array.isArray(data?.dates) || data.dates.some(day => !Array.isArray(day.games))) throw new Error('Official schedule collection is invalid');
  return data.dates.flatMap(day => day.games);
};
const boxSource = (gamePk, { signal } = {}) => signal ? officialJson(`/game/${gamePk}/boxscore`, signal) : getGameBoxScore(gamePk);
const scoringSource = async (gamePk, { signal } = {}) => {
  if (!signal) return getScoringFlowAttributed(gamePk);
  const data = await officialJson(`/game/${gamePk}/playByPlay`, signal);
  if (!Array.isArray(data.allPlays) || !Array.isArray(data.scoringPlays)) throw new Error('Official play-by-play collection is invalid');
  return data.scoringPlays.map(index => data.allPlays[index]).filter(play => play?.result).map(play => {
    const half = String(play.about?.halfInning || '').startsWith('t') ? 'T' : 'B';
    return `[${half}${play.about?.inning ?? '?'}] ${play.result.description || ''}${play.matchup?.pitcher?.fullName ? ` — off ${play.matchup.pitcher.fullName}` : ''} (${play.result.awayScore}-${play.result.homeScore})`;
  });
};

/** MLB Stats IDs and BDL IDs are never treated as interchangeable. */
export async function loadMlbExpectationGameEvidence(snapshot, { schedule = scheduleSource, boxscore = boxSource,
  scoring = scoringSource, clock = Date.now, signal } = {}) {
  const games = await bounded(() => schedule(snapshot.game_date, { throwOnError: true, signal }), signal);
  const matches = (games || []).filter(game => {
    const date = game.officialDate || (game.gameDate ? new Date(game.gameDate).toLocaleDateString('en-CA', { timeZone: 'America/New_York' }) : null);
    if (date !== snapshot.game_date || normalize(game.teams?.home?.team?.name) !== normalize(snapshot.home_team)
        || normalize(game.teams?.away?.team?.name) !== normalize(snapshot.away_team)) return false;
    return snapshot.game_pk != null ? String(game.gamePk) === String(snapshot.game_pk)
      : Date.parse(game.gameDate) === Date.parse(snapshot.commence_time);
  });
  if (matches.length !== 1) throw new Error('Official final game cannot be bound uniquely to the original date, teams and game ID or scheduled start');
  const game = matches[0];
  if (!/^(final|game over|completed)/i.test(game.status?.detailedState || '') && game.status?.abstractGameState !== 'Final') {
    throw new Error('Official game is not final');
  }
  if (!Number.isSafeInteger(Number(game.gamePk)) || Number(game.gamePk) <= 0) throw new Error('Official gamePk is invalid');
  const observed_at = new Date(clock()).toISOString();
  const sources = [{ source_id: `postgame:${game.gamePk}:final`, kind: 'final', observed_at,
    url: `https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=${snapshot.game_date}`,
    text: JSON.stringify({ gamePk: game.gamePk, officialDate: game.officialDate, gameDate: game.gameDate,
      status: game.status, teams: game.teams, linescore: game.linescore }) }];
  const fetched = await Promise.allSettled([bounded(() => boxscore(game.gamePk, { signal }), signal), bounded(() => scoring(game.gamePk, { signal }), signal)]);
  signal?.throwIfAborted();
  const collection_errors = [];
  if (fetched[0].status === 'fulfilled' && fetched[0].value?.teams?.home && fetched[0].value?.teams?.away) {
    const box = fetched[0].value;
    for (const side of ['away', 'home']) {
      if (box.teams[side]?.team?.id != null && game.teams[side]?.team?.id != null
          && String(box.teams[side].team.id) !== String(game.teams[side].team.id)) throw new Error('Official box score belongs to different teams');
    }
    const teams = Object.fromEntries(['away', 'home'].map(side => {
      const team = box.teams[side];
      return [side, { team: team.team, teamStats: team.teamStats, pitchers: team.pitchers, battingOrder: team.battingOrder,
        players: Object.entries(team.players || {}).map(([id, p]) => ({ id, person: p.person, position: p.position, stats: p.stats })) }];
    }));
    sources.push({ source_id: `postgame:${game.gamePk}:boxscore`, kind: 'boxscore', observed_at: new Date(clock()).toISOString(),
      url: `https://statsapi.mlb.com/api/v1/game/${game.gamePk}/boxscore`, text: JSON.stringify({ gamePk: game.gamePk, teams }) });
  } else collection_errors.push(`Box score: ${fetched[0].reason?.message || 'no complete team record'}`);
  if (fetched[1].status === 'fulfilled' && Array.isArray(fetched[1].value) && fetched[1].value.length) {
    sources.push({ source_id: `postgame:${game.gamePk}:plays`, kind: 'plays', observed_at: new Date(clock()).toISOString(),
      url: `https://statsapi.mlb.com/api/v1/game/${game.gamePk}/playByPlay`, text: fetched[1].value.join('\n') });
  } else collection_errors.push(`Scoring plays: ${fetched[1].reason?.message || 'no scoring-play record'}`);
  return { league: 'MLB', game_date: snapshot.game_date, game_id: snapshot.game_id, game_pk: Number(game.gamePk),
    final: true, sources, collection_errors };
}

/** All settled outcomes enter this queue; no outcome or favored-side sampling. */
export async function reviewMlbExpectationBatch({ db = supabaseAdmin, since = '2026-09-08', until = todayET(), limit = 30, budgetMs = 360_000, signal: parentSignal } = {},
  { collectEvidence = loadMlbExpectationGameEvidence, review = reviewMlbExpectations, clock = Date.now, log = console.log } = {}) {
  if (!db) throw new Error('Expectation reviews require the private service client');
  if (![since, until].every(value => /^\d{4}-\d{2}-\d{2}$/.test(value) && new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) === value)
      || since > until) throw new Error('Expectation review dates must be YYYY-MM-DD with since <= until');
  const budget = Math.min(360_000, Math.max(1, Number(budgetMs) || 360_000));
  const deadline = clock() + budget, controller = new AbortController();
  const signal = parentSignal ? AbortSignal.any([parentSignal, controller.signal]) : controller.signal;
  const timer = setTimeout(() => controller.abort(new Error('MLB expectation batch deadline reached')), budget);
  timer.unref?.();
  try {
  const dates = query => query.gte('game_date', since).lte('game_date', until);
  const results = await Promise.allSettled([
    pages(() => dates(db.from('mlb_judgment_runs').select('*')).eq('league', 'MLB'), 'run_id', 'judgment runs', signal),
    pages(() => dates(db.from('mlb_expectation_reviews').select('run_id,game_date')), 'run_id', 'expectation reviews', signal),
    pages(() => dates(db.from('game_results').select('id,game_date,game_id,league,pick_text,result')).eq('league', 'MLB'), 'id', 'game results', signal),
    pages(() => db.from('mlb_expectation_review_attempts').select('run_id,status,attempts,lease_until,next_retry_at,started_at,error'), 'run_id', 'expectation review attempts', signal),
    pages(() => db.from('mlb_judgment_events').select('run_id').eq('phase', 'published'), 'run_id', 'published judgment runs', signal),
  ]);
  const failed = results.filter(result => result.status === 'rejected');
  if (failed.length) throw new Error(failed.map(result => result.reason.message).join('; '));
  const [runs, existing, grades, priorAttempts, publications] = results.map(result => result.value);
  const done = new Set(existing.map(row => String(row.run_id)));
  const published = new Set(publications.map(row => String(row.run_id)));
  const attemptByRun = new Map(priorAttempts.map(row => [String(row.run_id), row]));
  const incomplete = runs.filter(run => !done.has(String(run.run_id)) && Date.parse(run.commence_time) < clock());
  const pending = incomplete.filter(run => {
    if (!published.has(String(run.run_id))) return false;
    const previous = attemptByRun.get(String(run.run_id));
    return !previous || (previous.status !== 'completed' && !(Date.parse(previous.lease_until) > clock()) && !(Date.parse(previous.next_retry_at) > clock()));
  }).sort((a, b) => {
    // New games receive their first review before retried failures. Once all
    // new games have had a turn, retry the least recently attempted game.
    const left = attemptByRun.get(String(a.run_id)), right = attemptByRun.get(String(b.run_id));
    return Number(!!left) - Number(!!right)
      || (left && right ? (Date.parse(left.started_at) || 0) - (Date.parse(right.started_at) || 0) : 0)
      || `${a.game_date}|${a.run_id}`.localeCompare(`${b.game_date}|${b.run_id}`);
  });
  const unpublished = incomplete.filter(run => !published.has(String(run.run_id))).length;
  const report = { considered: incomplete.length, unpublished, deferred: incomplete.length - pending.length - unpublished, claimed: 0,
    reviewed: 0, already_recorded: 0, unsettled: 0, budget_exhausted: false, unavailable: [], reviews: [] };
  let attempts = 0;
  for (const run of pending) {
    if (clock() >= deadline || signal.aborted) { report.budget_exhausted = true; break; }
    if (attempts >= Math.max(1, Math.min(100, limit))) break;
    let leaseToken = null;
    const finish = async error => {
      if (!leaseToken || signal.aborted || clock() >= deadline) return;
      const receipt = await bounded(() => withSignal(db.rpc('finish_mlb_expectation_review_attempt', {
        p_run_id: run.run_id, p_lease_token: leaseToken, p_error: error,
      }), signal), signal);
      if (receipt.error) throw new Error(`finish expectation attempt: ${receipt.error.message}`);
      if (receipt.data !== true) throw new Error('Expectation attempt completion was not confirmed');
      leaseToken = null;
    };
    try {
      if (!grades.some(grade => String(grade.game_id) === String(run.game_id) && grade.game_date === run.game_date && normalizedResult(grade.result))) {
        report.unsettled++;
        continue;
      }
      const events = await pages(() => db.from('mlb_judgment_events').select('*').eq('run_id', run.run_id), 'event_id', 'judgment events', signal);
      if (!events.some(event => event.phase === 'published')) { report.unsettled++; continue; }
      const snapshot = buildMlbExpectationSnapshot(run, events);
      const identity = gameTicketIdentity({ ...snapshot, pick_text: snapshot.pick_snapshot.pick });
      const matching = grades.filter(grade => gameTicketIdentity(grade) === identity && normalizedResult(grade.result));
      const outcomes = new Set(matching.map(grade => normalizedResult(grade.result)));
      if (!matching.length) { report.unsettled++; continue; }
      if (outcomes.size !== 1) throw new Error('Conflicting exact-ticket grades; expectation review withheld');
      const result = { ...matching[0], result: normalizedResult(matching[0].result) };
      const token = randomUUID();
      const claim = await bounded(() => withSignal(db.rpc('claim_mlb_expectation_review', {
        p_run_id: run.run_id, p_lease_token: token, p_lease_seconds: 420,
      }), signal), signal);
      if (claim.error) throw new Error(`claim expectation review: ${claim.error.message}`);
      if (typeof claim.data !== 'boolean') throw new Error('Expectation review ownership was not confirmed');
      if (!claim.data) { report.deferred++; continue; }
      leaseToken = token;
      attempts++;
      report.claimed++;
      const game_evidence = await bounded(() => collectEvidence(snapshot, { signal, clock }), signal);
      const input = { snapshot, result, game_evidence };
      const output = await bounded(() => review(input, { signal, clock, timeoutMs: Math.min(180_000, deadline - clock()) }), signal);
      if (!output?.ok) throw new Error(output?.error || 'No valid expectation review');
      if (clock() >= deadline) throw new Error('MLB expectation batch deadline reached');
      const final_evidence = { ...input, review_started_at: output.review_started_at, review_completed_at: output.review_completed_at };
      const receipt = await bounded(() => withSignal(db.rpc('record_mlb_expectation_review', { p_run_id: run.run_id,
        p_review_model: output.model, p_review: output.review, p_final_evidence: final_evidence, p_lease_token: leaseToken }), signal), signal);
      if (receipt.error) throw new Error(`record expectation review: ${receipt.error.message}`);
      if (typeof receipt.data !== 'boolean') throw new Error('Expectation review publication was not confirmed');
      const inserted = receipt.data;
      if (inserted === true) report.reviewed++; else report.already_recorded++;
      report.reviews.push({ run_id: run.run_id, game_date: run.game_date, game_id: run.game_id, review: output.review, final_evidence, created_at: output.review_completed_at });
      await finish(null);
      log(`[MLB expectations] ${run.game_date} ${run.game_id}: ${inserted === true ? 'recorded' : 'already recorded'} four original expectations (${result.result})`);
    } catch (error) {
      if (clock() >= deadline || signal.aborted) report.budget_exhausted = true;
      let attempt_error = null;
      try { await finish(error.message); } catch (finishError) { attempt_error = finishError.message; }
      report.unavailable.push({ run_id: run.run_id, game_date: run.game_date, game_id: run.game_id, error: error.message,
        ...(attempt_error ? { attempt_error } : {}), ...(leaseToken ? { recovery: 'Lease expiration permits a later retry' } : {}) });
      log(`[MLB expectations] ${run.game_date} ${run.game_id}: unavailable — ${error.message}`);
    }
  }
  return report;
  } finally { clearTimeout(timer); }
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const args = Object.fromEntries(process.argv.slice(2).map(arg => arg.replace(/^--/, '').split('=')));
  try {
    const report = await reviewMlbExpectationBatch({ since: args.since || '2026-09-08', until: args.until || todayET(), limit: Number(args.limit) || 30 },
      { log: Object.hasOwn(args, 'json') ? () => {} : console.log });
    if (Object.hasOwn(args, 'json')) console.log(JSON.stringify(report, null, 2));
    else {
      console.log(`Reviewed ${report.reviewed}; already recorded ${report.already_recorded}; unsettled ${report.unsettled}; unavailable ${report.unavailable.length}.`);
      if (report.reviews.length) console.log(formatMlbExpectationMemory(report.reviews));
    }
    if (report.unavailable.length) process.exitCode = 1;
  } catch (error) { console.error(`MLB expectation review failed: ${error.message}`); process.exitCode = 1; }
}
