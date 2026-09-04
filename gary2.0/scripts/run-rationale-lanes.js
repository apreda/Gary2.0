#!/usr/bin/env node
/**
 * RATIONALE LANES runner (Sep 1 2026): tag every stored game pick for a date
 * (or a range) with the desk lanes its rationale leaned on, join the graded
 * result, upsert into pick_rationale_lanes, and print the lane table.
 *
 *   node scripts/run-rationale-lanes.js                  # yesterday (ET)
 *   node scripts/run-rationale-lanes.js 2026-08-28       # one date
 *   node scripts/run-rationale-lanes.js 2026-08-28 2026-08-31
 *
 * Runs after nightly grading from run-all-results.js as well. Read-only for
 * Gary: nothing here reaches a prompt or a desk.
 */
import '../src/loadEnv.js';
import { laneRowFor, summarizeLanes, summarizeCaseLanes, summarizeCaseOrder, summarizeWinners } from '../src/services/agentic/rationaleLanes.js';
import { gameTicketIdentity } from '../src/services/pickdesk/winnersBook.js';
import { WINNERS_CUTOVER_DATE } from '../src/services/pickdesk/winnersAdmissions.js';
import { readWinnersBook, printWinnersBook } from './winners-book.js';

const { supabaseAdmin, supabase } = await import('../src/supabaseClient.js');
const db = supabaseAdmin || supabase;

function etYesterday() {
  const d = new Date(Date.now() - 86400000);
  return d.toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
}
function dateRange(a, b) {
  const out = [];
  for (let t = new Date(`${a}T12:00:00Z`).getTime(); t <= new Date(`${b}T12:00:00Z`).getTime(); t += 86400000) {
    out.push(new Date(t).toISOString().slice(0, 10));
  }
  return out;
}

export async function tagRationaleLanes(dates) {
  const { data: days, error } = await db.from('daily_picks').select('date, picks').in('date', dates);
  if (error) throw error;
  const { data: results, error: e2 } = await db.from('game_results').select('league, game_id, game_date, result, pick_text').in('game_date', dates);
  if (e2) throw e2;
  const byGame = new Map((results || []).map(r => [gameTicketIdentity(r), r]).filter(([key]) => key));
  // Historical rows retain their original review definition. Since Sep 4,
  // use exact immutable publications and the prospective decision ledger.
  const { data: reviews, error: e6 } = await db.from('winners_reviews').select('game_date, league, game_id, on_board, reason, verdict').in('game_date', dates);
  if (e6) throw e6;
  const byReview = new Map((reviews || []).map((w) => [`${w.game_date}|${String(w.league).toUpperCase()}|${String(w.game_id)}`, w]));
  const newDates = dates.filter(date => date >= WINNERS_CUTOVER_DATE).sort();
  const winnersBook = newDates.length ? await readWinnersBook(db, { since: newDates[0], until: newDates.at(-1) }) : [];
  const exactReviews = new Map(winnersBook.filter(row => row.kind === 'game').map(row => [
    `${gameTicketIdentity(row)}|${row.odds}`, row,
  ]));
  const reviewFor = (date, league, gid, pick) => {
    if (date < WINNERS_CUTOVER_DATE) return byReview.get(`${date}|${String(league).toUpperCase()}|${String(gid)}`) || null;
    const identity = gameTicketIdentity({ game_date: date, league, game_id: gid, pick_text: pick.pick });
    const found = exactReviews.get(`${identity}|${Number(pick.odds)}`);
    return { on_board: found?.published === true, reason: found?.reason || found?.group || 'No recorded pregame admission',
      verdict: ['admitted', 'qualified_not_admitted'].includes(found?.group) ? 'STRONG' : found?.group === 'rejected' ? 'WEAK' : null };
  };
  const rows = [];
  for (const d of days || []) {
    for (const p of d.picks || []) {
      if (!p?.pick || !p?.rationale) continue;
      const gid = p.game_id ?? p.bdl_game_id;
      const r = byGame.get(gameTicketIdentity({ game_date: d.date, league: p.league || p.sport, game_id: gid, pick_text: p.pick })) || null;
      rows.push(laneRowFor(d.date, p, r, reviewFor(d.date, p.league || p.sport, gid, p)));
    }
  }
  // NFL lives in its own weekly table; its results carry the game date.
  const { data: nflRes, error: e4 } = await db.from('nfl_results').select('game_id, game_date, result, pick_text').in('game_date', dates);
  if (e4) throw e4;
  if (nflRes?.length) {
    const wanted = new Set(nflRes.map((r) => String(r.game_id)));
    const byNfl = new Map(nflRes.map(r => [gameTicketIdentity({ ...r, league: 'NFL' }), r]));
    const { data: weeks, error: e5 } = await db.from('weekly_nfl_picks').select('picks').order('created_at', { ascending: false }).limit(6);
    if (e5) throw e5;
    for (const w of weeks || []) {
      for (const p of w.picks || []) {
        const gid = String(p?.bdl_game_id ?? p?.game_id ?? '');
        if (!p?.pick || !p?.rationale || !wanted.has(gid)) continue;
        const kickoff = new Date(p.commence_time || '');
        const gameDate = !Number.isNaN(kickoff.getTime())
          ? kickoff.toLocaleDateString('en-CA', { timeZone: 'America/New_York' }) : p.game_date || null;
        let r = byNfl.get(gameTicketIdentity({ game_date: gameDate, league: 'NFL', game_id: gid, pick_text: p.pick })) || null;
        if (!r && (!gameDate || gameDate < WINNERS_CUTOVER_DATE)) {
          const historical = nflRes.filter(result => result.game_date < WINNERS_CUTOVER_DATE && String(result.game_id) === gid && result.pick_text === p.pick);
          if (historical.length === 1) r = historical[0];
        }
        if (!r) continue;
        rows.push(laneRowFor(r.game_date, { ...p, league: 'NFL', game_id: gid }, r, reviewFor(r.game_date, 'NFL', gid, p)));
      }
    }
  }
  if (rows.length) {
    const { error: e3 } = await db.from('pick_rationale_lanes').upsert(rows, { onConflict: 'game_date,league,game_id,pick_text' });
    if (e3) throw e3;
  }
  if (newDates.length) printWinnersBook(winnersBook, `${newDates[0]} through ${newDates.at(-1)}`);
  return rows;
}

export function printLaneTable(rows, label) {
  const graded = rows.filter((r) => r.result === 'won' || r.result === 'lost');
  const w = graded.filter((r) => r.result === 'won').length;
  console.log(`\n🧭 RATIONALE LANES — ${label}: ${rows.length} picks, ${graded.length} graded (${w}-${graded.length - w})`);
  for (const s of summarizeLanes(rows)) {
    console.log(`  ${s.lane.padEnd(26)} ${String(s.cited).padStart(3)}/${s.of}   ${s.record}`);
  }
  // THE CASES (Sep 2 2026): the same lanes read across the two Pass 1
  // cases — picked side vs the other side — beside the card's count.
  // THE CASE ORDER (Sep 2 2026): does the bet follow the case written last?
  // THE WINNERS BOARD (Sep 2 2026): on the board vs off, by why, by verdict.
  const wb = summarizeWinners(rows.filter(row => row.game_date < WINNERS_CUTOVER_DATE));
  if (wb.stamped) {
    const fmt = (r) => `${r.record} ${r.units >= 0 ? '+' : ''}${r.units}u`;
    const by = (o) => Object.entries(o).map(([k, r]) => `${k} ${fmt(r)}`).join(' · ');
    console.log(`  🏆 winners (${wb.stamped} stamped): ON THE BOARD ${wb.on.n} → ${fmt(wb.on)} · off the board ${wb.off.n} → ${fmt(wb.off)}`);
    console.log(`     why on: ${by(wb.byReason) || 'none'} · reviewer verdict (all stamped): ${by(wb.byVerdict) || 'none'}`);
  }
  const order = summarizeCaseOrder(rows);
  if (order.n) {
    console.log(`  case order (${order.n} stamped): bet the LAST case ${order.pickedLast} (${order.pickedLastRecord}) · bet the FIRST case ${order.pickedFirst} (${order.pickedFirstRecord}) · home last ${order.byLast.home.n} → home taken ${order.byLast.home.pickedLast} · away last ${order.byLast.away.n} → away taken ${order.byLast.away.pickedLast}`);
  }
  const cases = summarizeCaseLanes(rows).filter((c) => c.pickedCase || c.otherCase || c.card);
  if (cases.length && cases[0].of) {
    console.log(`  cases (${cases[0].of} sided): lane · card · picked-side case · other-side case · picked-case record`);
    for (const c of cases) {
      console.log(`  ${c.lane.padEnd(26)} card ${String(c.card).padStart(2)} · picked ${String(c.pickedCase).padStart(2)} · other ${String(c.otherCase).padStart(2)} · ${c.record}`);
    }
  }
}

const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop());
if (isMain) {
  const [a, b] = process.argv.slice(2);
  const dates = a ? dateRange(a, b || a) : [etYesterday()];
  const rows = await tagRationaleLanes(dates);
  printLaneTable(rows, dates.length === 1 ? dates[0] : `${dates[0]} → ${dates[dates.length - 1]}`);
  process.exit(0);
}
