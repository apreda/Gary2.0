#!/usr/bin/env node
/** Read-only prospective record: node scripts/winners-book.js --since=2026-09-04 */
import '../src/loadEnv.js';
import { pathToFileURL } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import { buildWinnersBook, tallyWinnersBook } from '../src/services/pickdesk/winnersBook.js';
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

export async function readWinnersBook(db, { since = WINNERS_CUTOVER_DATE, until = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' }) } = {}) {
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
  ]);
  const failed = reads.filter(read => read.status === 'rejected');
  if (failed.length) throw new Error(failed.map(read => read.reason.message).join('; '));
  const [candidates, board, gameResults, nflResults, propResults] = reads.map(read => read.value);
  const events = [];
  for (let start = 0; start < candidates.length; start += 200) {
    const ids = candidates.slice(start, start + 200).map(row => row.id);
    events.push(...await readAllRows(() => db.from('winners_decision_events').select('id,candidate_id,event,occurred_at').in('candidate_id', ids), 'winners_decision_events'));
  }
  return buildWinnersBook({ candidates, board, events,
    gameResults: [...gameResults, ...nflResults.filter(row => Number(row.season_type) !== 1).map(row => ({ ...row, league: 'NFL' }))], propResults });
}

const fmt = tally => {
  const win = tally.win_pct === null ? '—' : `${tally.win_pct.toFixed(1)}%`;
  const roi = tally.roi_pct === null ? '—' : `${tally.roi_pct >= 0 ? '+' : ''}${tally.roi_pct.toFixed(1)}%`;
  return `${tally.candidates} tickets / ${tally.games} games; ${tally.won}-${tally.lost}, ${tally.push} pushes, ${tally.voided} voids (${win}); ${tally.units >= 0 ? '+' : ''}${tally.units.toFixed(2)}u / ${tally.priced} priced W/L, ROI ${roi}; ${tally.missing} missing, ${tally.conflicting} conflicting, ${tally.unpriced} unpriced`;
};

export function printWinnersBook(rows, label, log = console.log) {
  log(`WINNERS BOOK — ${label}`);
  log('One unit risked per ticket at its recorded candidate price. Pushes/voids return zero and are excluded from W/L ROI.');
  const order = ['admitted', 'qualified_not_admitted', 'rejected', 'unavailable', 'unreviewed_at_kickoff', 'awaiting_review', 'timing_excluded'];
  for (const group of order) log(`  ${group}: ${fmt(tallyWinnersBook(rows.filter(row => row.group === group)))}`);
  const groups = new Map();
  for (const row of rows.filter(row => row.group !== 'timing_excluded')) {
    const key = `${row.league} ${row.kind} | ${row.policy_version} | picker ${row.pick_model} | prompt ${row.prompt_version} | reviewer ${row.review_model} | ${row.group}`;
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
    const rows = await readWinnersBook(db, { since, until });
    printWinnersBook(rows, `${since} through ${until}`);
  } catch (error) { console.error(`Winners book failed: ${error.message}`); process.exitCode = 1; }
}
