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
import { laneRowFor, summarizeLanes } from '../src/services/agentic/rationaleLanes.js';

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
  const { data: results, error: e2 } = await db.from('game_results').select('game_id, game_date, result, pick_text').in('game_date', dates);
  if (e2) throw e2;
  const byGame = new Map((results || []).map((r) => [`${r.game_date}|${String(r.game_id)}|${r.pick_text}`, r]));
  const rows = [];
  for (const d of days || []) {
    for (const p of d.picks || []) {
      if (!p?.pick || !p?.rationale) continue;
      const r = byGame.get(`${d.date}|${String(p.game_id)}|${p.pick}`) || null;
      rows.push(laneRowFor(d.date, p, r));
    }
  }
  if (rows.length) {
    const { error: e3 } = await db.from('pick_rationale_lanes').upsert(rows, { onConflict: 'game_date,league,game_id,pick_text' });
    if (e3) throw e3;
  }
  return rows;
}

export function printLaneTable(rows, label) {
  const graded = rows.filter((r) => r.result === 'won' || r.result === 'lost');
  const w = graded.filter((r) => r.result === 'won').length;
  console.log(`\n🧭 RATIONALE LANES — ${label}: ${rows.length} picks, ${graded.length} graded (${w}-${graded.length - w})`);
  for (const s of summarizeLanes(rows)) {
    console.log(`  ${s.lane.padEnd(26)} ${String(s.cited).padStart(3)}/${s.of}   ${s.record}`);
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
