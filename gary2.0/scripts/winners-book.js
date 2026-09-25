#!/usr/bin/env node
/** Read-only prospective record: node scripts/winners-book.js --since=2026-09-04 */
import '../src/loadEnv.js';
import { pathToFileURL } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import { buildWinnersBook, buildMlbSelectionBook, tallyWinnersBook } from '../src/services/pickdesk/winnersBook.js';
import { WINNERS_CUTOVER_DATE } from '../src/services/pickdesk/winnersAdmissions.js';

const PAGE_SIZE = 1000;
export async function readAllRows(query, label) {
  const rows = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await query().order('id', { ascending: true }).range(offset, offset + PAGE_SIZE - 1);
    if (error) throw new Error(`${label}: ${error.message}`);
    rows.push(...(data || []));
    if ((data || []).length < PAGE_SIZE) return rows;
  }
}

async function readWinnersRecords(db, { since = WINNERS_CUTOVER_DATE, until = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' }), includeMlb = false } = {}) {
  const dates = query => query.gte('game_date', since).lte('game_date', until);
  const reads = await Promise.allSettled([
    readAllRows(() => dates(db.from('winners_candidates').select('id,game_date,league,kind,game_id,ticket_key,pick_text,odds,commence_time,pick_snapshot,policy_version,status,reason,review_model,created_at,reviewed_at,admitted_at')), 'winners_candidates'),
    // Board uses candidate_id instead of id; its maximum is six per league/kind/day.
    (async () => {
      const rows = [];
      for (let offset = 0; ; offset += PAGE_SIZE) {
        const { data, error } = await dates(db.from('winners_board').select('candidate_id,game_date,league,kind,game_id,ticket_key,pick_snapshot,admitted_at,policy_version,reason'))
          .order('candidate_id', { ascending: true }).range(offset, offset + PAGE_SIZE - 1);
        if (error) throw new Error(`winners_board: ${error.message}`);
        rows.push(...(data || []));
        if ((data || []).length < PAGE_SIZE) return rows;
      }
    })(),
    readAllRows(() => dates(db.from('game_results').select('id,game_date,league,game_id,pick_text,result')), 'game_results'),
    readAllRows(() => dates(db.from('nfl_results').select('id,game_date,game_id,pick_text,result,season_type')), 'nfl_results'),
    readAllRows(() => dates(db.from('prop_results').select('id,game_date,sport,game_id,player_name,prop_type,line_value,bet,result')), 'prop_results'),
    ...(includeMlb ? [
      readAllRows(() => dates(db.from('winners_selection_runs').select('id,game_date,league,kind,policy_version,cohort,window_start,input_snapshot,selection,status,model,ms,error,attempt_history,lease_until,created_at,completed_at,attempts,fingerprint')), 'winners_selection_runs'),
      (async () => {
        const rows = [];
        for (let offset = 0; ; offset += PAGE_SIZE) {
          const { data, error } = await db.from('daily_picks').select('date,picks').gte('date', since).lte('date', until)
            .order('date', { ascending: true }).range(offset, offset + PAGE_SIZE - 1);
          if (error) throw new Error(`daily_picks: ${error.message}`);
          for (const day of data || []) {
            let picks = day.picks;
            if (typeof picks === 'string') {
              try { picks = JSON.parse(picks); } catch { throw new Error(`daily_picks ${day.date}: malformed serialized picks`); }
            }
            if (!Array.isArray(picks)) throw new Error(`daily_picks ${day.date}: picks is not an array`);
            picks.forEach((pick, public_pick_index) => {
              if (!pick || typeof pick !== 'object' || Array.isArray(pick) || !(pick.league || pick.sport)) {
                throw new Error(`daily_picks ${day.date} #${public_pick_index}: cannot establish pick league`);
              }
              rows.push({ ...pick, game_date: day.date, public_pick_index });
            });
          }
          if ((data || []).length < PAGE_SIZE) return rows;
        }
      })(),
    ] : []),
  ]);
  const failed = reads.filter(read => read.status === 'rejected');
  if (failed.length) throw new Error(failed.map(read => read.reason.message).join('; '));
  const [candidates, board, gameResults, nflResults, propResults, selectionRuns = [], publicPicks = []] = reads.map(read => read.value);
  const events = [];
  for (let start = 0; start < candidates.length; start += 200) {
    const ids = candidates.slice(start, start + 200).map(row => row.id);
    events.push(...await readAllRows(() => db.from('winners_decision_events').select('id,candidate_id,event,occurred_at').in('candidate_id', ids), 'winners_decision_events'));
  }
  return { candidates, board, events, selectionRuns, publicPicks,
    gameResults: [...gameResults, ...nflResults.filter(row => Number(row.season_type) !== 1).map(row => ({ ...row, league: 'NFL' }))], propResults };
}

/** Existing consumers retain the candidate-only return shape and read dependencies. */
export async function readWinnersBook(db, options = {}) {
  return buildWinnersBook(await readWinnersRecords(db, options));
}

export async function readWinnersReport(db, options = {}) {
  const records = await readWinnersRecords(db, { ...options, includeMlb: true });
  return { rows: buildWinnersBook(records), mlb: buildMlbSelectionBook(records), selection_runs: records.selectionRuns };
}

const fmt = tally => {
  const win = tally.win_pct === null ? '—' : `${tally.win_pct.toFixed(1)}%`;
  const roi = tally.roi_pct === null ? '—' : `${tally.roi_pct >= 0 ? '+' : ''}${tally.roi_pct.toFixed(1)}%`;
  return `${tally.candidates} tickets / ${tally.games} games; ${tally.won}-${tally.lost}, ${tally.push} pushes, ${tally.voided} voids (${win}); ${tally.units >= 0 ? '+' : ''}${tally.units.toFixed(2)}u / ${tally.priced} priced W/L, ROI ${roi}; ${tally.missing} missing, ${tally.conflicting} conflicting, ${tally.unpriced} unpriced`;
};

export function printWinnersBook(rows, label, log = console.log) {
  log(`WINNERS BOOK — ${label}`);
  log('One unit risked per ticket at its recorded candidate price. Pushes/voids return zero and are excluded from W/L ROI.');
  log('This candidate ledger tracks factual qualification. For MLB judgment picks, the public-picks section below distinguishes Gary’s comparison decisions from queue and selection failures.');
  const order = ['admitted', 'qualified_not_admitted', 'rejected', 'unavailable', 'unreviewed_at_kickoff', 'awaiting_review', 'timing_excluded'];
  const policies = new Map();
  for (const row of rows) {
    const key = `${row.league} ${row.kind} | ${row.policy_version} | decision ${row.decision_policy || 'unstamped'}`;
    if (!policies.has(key)) policies.set(key, []);
    policies.get(key).push(row);
  }
  for (const [policy, sample] of policies) {
    log(`\n  ${policy}`);
    for (const group of order) log(`    ${group}: ${fmt(tallyWinnersBook(sample.filter(row => row.group === group)))}`);
  }
  const groups = new Map();
  for (const row of rows.filter(row => row.group !== 'timing_excluded')) {
    const key = `${row.league} ${row.kind} | ${row.policy_version} | decision ${row.decision_policy || 'unstamped'} | picker ${row.pick_model} | prompt ${row.prompt_version} | reviewer ${row.review_model} | ${row.group}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  if (groups.size) {
    log('\nBy league, ticket kind and versions');
    for (const [key, group] of [...groups.entries()].sort(([a], [b]) => a.localeCompare(b))) log(`  ${key}\n    ${fmt(tallyWinnersBook(group))}`);
  }
  const excluded = rows.filter(row => row.group === 'timing_excluded');
  if (excluded.length) {
    log('\nExcluded from the prospective comparison');
    for (const row of excluded) log(`  #${row.candidate_id} ${row.game_date} ${row.league} ${row.pick_text}: ${row.timing_reason}`);
  }
  log('\nThese are descriptive results, not proof that admission improves betting performance. Ticket samples can share a game; small samples and changing versions cannot establish an edge.');
}

export function printMlbSelectionBook(rows, label, log = console.log) {
  log(`\nMLB PUBLIC PICKS AND GARY'S WINNERS SELECTIONS — ${label}`);
  log('All public MLB game tickets, including missing queue records. Original public odds; one unit risked. Policies and pick-model/prompt eras are separate.');
  log('Considered-not-selected requires Gary’s completed pregame comparison. Failed, expired or unfinished comparisons never count as his rejection. Candidate recorded time is queue capture, not original pick publication time.');
  const cohorts = new Map();
  for (const row of rows) {
    const key = `${row.decision_policy} | picker ${row.pick_model} | prompt ${row.prompt_version}`;
    if (!cohorts.has(key)) cohorts.set(key, []);
    cohorts.get(key).push(row);
  }
  for (const [cohort, sample] of [...cohorts].sort(([a], [b]) => a.localeCompare(b))) {
    log(`\n  ${cohort}`);
    log(`    all_public: ${fmt(tallyWinnersBook(sample))}`);
    const policies = new Set(sample.map(row => row.policy_version));
    for (const policy of [...policies].sort()) {
      const subset = sample.filter(row => row.policy_version === policy);
      log(`    Winners policy ${policy}`);
      for (const group of [...new Set(subset.map(row => row.group))].sort()) {
        log(`      ${group}: ${fmt(tallyWinnersBook(subset.filter(row => row.group === group)))}`);
      }
    }
  }
  log('\nExact ticket decisions (candidate #, original odds, review, comparisons and board reason)');
  for (const row of rows) {
    log(`  ${row.game_date} game ${row.game_id ?? '?'} #${row.candidate_id ?? 'not queued'} ${row.pick_text} @ ${row.odds ?? 'missing'}: ${row.group}; ${row.grade_status}${row.result ? `/${row.result}` : ''}; review ${row.review_model}; ${row.reason || 'no recorded review reason'}`);
    if (row.timing_reason) log(`    Timing: ${row.timing_reason}`);
    if (row.board_reason) log(`    Published reason: ${row.board_reason}`);
    for (const run of row.selection_history || []) {
      log(`    Run #${run.run_id}, cohort ${run.cohort}, window ${run.window_start}, ${run.status}, model ${run.model}, completed ${run.completed_at || '—'}: ${run.valid_decision ? `rank ${run.rank}, selected ${run.selected}` : run.invalid_reason}`);
      if (run.reason) log(`      ${run.reason}`);
      if (run.expected_outcome) log(`      Expected outcome: ${run.expected_outcome}`);
      if (run.comparison) log(`      Compared with other picks: ${run.comparison}`);
      for (const attempt of run.attempt_history || []) {
        log(`      Attempt ${attempt.attempt}, ${attempt.at || 'time unavailable'}, model ${attempt.model || 'unstamped'}: ${attempt.error || 'completed comparison recorded'}`);
      }
    }
  }
  log('\nUse --json for exact rows, all selection attempts, preserved inputs, window capacities and explanations. No completed new-policy selections means no measured Winners selection performance yet.');
}

function validDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  try {
    const args = Object.fromEntries(process.argv.slice(2).map(arg => arg.replace(/^--/, '').split('=')));
    const since = args.since || WINNERS_CUTOVER_DATE;
    const until = args.until || new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
    if (!validDate(since) || !validDate(until) || since < WINNERS_CUTOVER_DATE || since > until) throw new Error(`Use dates YYYY-MM-DD from ${WINNERS_CUTOVER_DATE}, with since <= until`);
    const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
    if (!url || !key) throw new Error('Missing Supabase service credentials for the private Winners ledger');
    const db = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
    const report = await readWinnersReport(db, { since, until });
    if (Object.hasOwn(args, 'json')) console.log(JSON.stringify({ since, until, ...report }, null, 2));
    else {
      printWinnersBook(report.rows, `${since} through ${until}`);
      printMlbSelectionBook(report.mlb, `${since} through ${until}`);
    }
  } catch (error) { console.error(`Winners book failed: ${error.message}`); process.exitCode = 1; }
}
