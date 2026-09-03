#!/usr/bin/env node
/**
 * THE NOTEBOOK, nightly (founder GO, Sep 3 2026):
 *   1. Autopsies — for every graded MLB pick on the date(s), the real Gary's
 *      and the notebook shadow's alike (same reader): read the game back,
 *      grade the stated reason, write the one-line note. Upsert pick_autopsies.
 *   2. Grade the notebook shadow's picks from the official finals and read
 *      them on the closing-line ruler.
 *   3. Print the three systems side by side: Gary, Gary with the notebook,
 *      the formula (shadow_picks).
 *
 *   node scripts/run-diary.js                       # yesterday (ET)
 *   node scripts/run-diary.js 2026-09-03
 *   node scripts/run-diary.js 2026-08-28 2026-09-02 # a range (backfill the real Gary's autopsies)
 *   node scripts/run-diary.js 2026-09-03 --no-autopsy   # grade + read only
 */
import '../src/loadEnv.js';
import { gameStory, writeAutopsy } from '../src/services/diary/autopsy.js';
import { readPick } from '../src/services/closingLine.js';
import { getMlbSchedule } from '../src/services/mlbStatsApiService.js';

const { supabaseAdmin, supabase } = await import('../src/supabaseClient.js');
const db = supabaseAdmin || supabase;
const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

function etYesterday() { return new Date(Date.now() - 86400000).toLocaleDateString('en-CA', { timeZone: 'America/New_York' }); }
function dateRange(a, b) {
  const out = [];
  for (let t = new Date(`${a}T12:00:00Z`).getTime(); t <= new Date(`${b}T12:00:00Z`).getTime(); t += 86400000) out.push(new Date(t).toISOString().slice(0, 10));
  return out;
}
const unitsOf = (price, result) => (result === 'won' ? (Number(price) > 0 ? Number(price) / 100 : 100 / Math.abs(Number(price))) : result === 'lost' ? -1 : 0);

/** Official finals for a date: by gamePk and by club-name key. */
async function finalsFor(date) {
  const byPk = new Map();
  const byNames = new Map();
  const sched = await getMlbSchedule(date).catch(() => []);
  for (const g of sched || []) {
    if (!/final|completed|game over/i.test(String(g?.status?.detailedState || ''))) continue;
    const hr = Number(g?.linescore?.teams?.home?.runs); const ar = Number(g?.linescore?.teams?.away?.runs);
    if (!Number.isFinite(hr) || !Number.isFinite(ar)) continue;
    const rec = { gamePk: g.gamePk, hr, ar, home: g.teams?.home?.team?.name, away: g.teams?.away?.team?.name };
    byPk.set(String(g.gamePk), rec);
    byNames.set(`${norm(rec.away)}@${norm(rec.home)}`, rec);
  }
  return { byPk, byNames };
}
const findFinal = (finals, awayTeam, homeTeam, gamePk = null) => (gamePk && finals.byPk.get(String(gamePk)))
  || finals.byNames.get(`${norm(awayTeam)}@${norm(homeTeam)}`)
  || [...finals.byNames.values()].find((r) => norm(r.home).endsWith(norm(String(homeTeam).split(' ').pop())) && norm(r.away).endsWith(norm(String(awayTeam).split(' ').pop())))
  || null;

function gradeFrom(side, betType, point, fin) {
  if (!fin || !side) return null;
  const mine = side === 'home' ? fin.hr : fin.ar; const theirs = side === 'home' ? fin.ar : fin.hr;
  if (betType === 'spread') { const m = mine - theirs + Number(point || 0); return m > 0 ? 'won' : m < 0 ? 'lost' : 'push'; }
  return mine > theirs ? 'won' : mine < theirs ? 'lost' : 'push';
}

/** Step 1: autopsies for the real Gary's and the shadow's graded picks on a date. */
export async function runAutopsies(date, { onlySource = null } = {}) {
  const finals = await finalsFor(date);
  const { data: existing } = await db.from('pick_autopsies').select('game_id, source').eq('game_date', date).eq('league', 'MLB');
  const have = new Set((existing || []).map((r) => `${r.source}|${String(r.game_id)}`));
  const jobs = [];
  if (onlySource !== 'diary') {
    const { data: days } = await db.from('daily_picks').select('picks').eq('date', date);
    const { data: results } = await db.from('game_results').select('game_id, pick_text, result').eq('game_date', date);
    const res = new Map((results || []).map((r) => [`${String(r.game_id)}|${r.pick_text}`, r.result]));
    for (const p of days?.[0]?.picks || []) {
      if (String(p?.league).toUpperCase() !== 'MLB' || p?.game_id == null || !p?.rationale) continue;
      const result = res.get(`${String(p.game_id)}|${p.pick}`) ?? null;
      if (!result || result === 'push' || have.has(`gary|${String(p.game_id)}`)) continue;
      const side = String(p.pick || '').toLowerCase().startsWith(String(p.homeTeam || '').split(' ').pop().toLowerCase()) ? 'home' : 'away';
      jobs.push({ source: 'gary', game_id: String(p.game_id), pick_text: p.pick, result, home_team: p.homeTeam, away_team: p.awayTeam, rationale: p.rationale, caseText: side === 'home' ? p.path_home : p.path_away });
    }
  }
  if (onlySource !== 'gary') {
    const { data: diary } = await db.from('diary_picks').select('*').eq('game_date', date).eq('league', 'MLB');
    for (const d of diary || []) {
      if (!d.result || d.result === 'push' || !d.rationale || have.has(`diary|${String(d.game_id)}`)) continue;
      jobs.push({ source: 'diary', game_id: String(d.game_id), pick_text: d.pick_text, result: d.result, home_team: d.home_team, away_team: d.away_team, rationale: d.rationale, caseText: d.side === 'home' ? d.path_home : d.path_away });
    }
  }
  let done = 0;
  for (const j of jobs) {
    const fin = findFinal(finals, j.away_team, j.home_team);
    const story = fin ? await gameStory({ gamePk: fin.gamePk, gameDate: date, homeTeam: j.home_team, awayTeam: j.away_team }) : '';
    const out = await writeAutopsy({ homeTeam: j.home_team, awayTeam: j.away_team, gameDate: date, pickText: j.pick_text, result: j.result, rationale: j.rationale, caseText: j.caseText, story });
    if (!out.ok) { console.warn(`  ⚠️ autopsy skipped ${j.source} ${j.away_team} @ ${j.home_team}: ${out.error}`); continue; }
    const a = out.autopsy;
    const { error } = await db.from('pick_autopsies').upsert({
      game_date: date, league: 'MLB', game_id: j.game_id, source: j.source, pick_text: j.pick_text, result: j.result,
      home_team: j.home_team, away_team: j.away_team, final_score: fin ? `${j.away_team} ${fin.ar}, ${j.home_team} ${fin.hr}` : null,
      mechanism_stated: a.mechanism_stated, reason_type: a.reason_type, decided_by: a.decided_by, mechanism_label: a.mechanism_label,
      reason_status: a.reason_status, note: a.note || null, game_story: story ? story.slice(0, 4000) : null, model: out.model, ms: out.ms, computed_at: new Date().toISOString(),
    }, { onConflict: 'game_date,league,game_id,source' });
    if (error) { console.warn(`  ⚠️ autopsy not stored: ${error.message}`); continue; }
    done += 1;
    console.log(`  📓 ${j.source.padEnd(5)} ${j.away_team} @ ${j.home_team} · ${j.pick_text} ${j.result} · ${a.reason_type} was ${a.reason_status || '?'} · ${a.note || '(side-note dropped)'}`);
  }
  return { jobs: jobs.length, done };
}

/** Step 2: grade the notebook shadow's picks and read them on the ruler. */
export async function gradeDiary(dates) {
  const { data: rows } = await db.from('diary_picks').select('*').in('game_date', dates).eq('league', 'MLB');
  if (!rows?.length) return [];
  const { data: snaps } = await db.from('odds_snapshots').select('game_date, game_id, moneyline_home, moneyline_away, spread_home, spread_home_odds, spread_away, spread_away_odds, line_vendor, seen_at').eq('sport', 'baseball_mlb').in('game_date', dates);
  const snapsBy = new Map();
  for (const s of snaps || []) { const k = `${s.game_date}|${String(s.game_id)}`; if (!snapsBy.has(k)) snapsBy.set(k, []); snapsBy.get(k).push(s); }
  const { data: slate } = await db.from('daily_slate').select('date, bdl_game_id, commence_time, ml_home, ml_away, line_vendor').in('date', dates).eq('league', 'MLB');
  const slateBy = new Map((slate || []).map((s) => [`${s.date}|${String(s.bdl_game_id)}`, s]));
  const finalsByDate = new Map();
  const updates = [];
  for (const r of rows) {
    if (!finalsByDate.has(r.game_date)) finalsByDate.set(r.game_date, await finalsFor(r.game_date));
    const fin = findFinal(finalsByDate.get(r.game_date), r.away_team, r.home_team);
    const result = fin ? gradeFrom(r.side, r.bet_type, r.point, fin) : r.result ?? null;
    const s = slateBy.get(`${r.game_date}|${r.game_id}`);
    const read = readPick({ pick: r.pick_text, type: r.bet_type, odds: r.price, spread: r.point, moneylineHome: s?.ml_home, moneylineAway: s?.ml_away, homeTeam: r.home_team, awayTeam: r.away_team, bestLineBook: s?.line_vendor || null, game_date: r.game_date, league: 'MLB', game_id: r.game_id }, snapsBy.get(`${r.game_date}|${r.game_id}`) || [], { commenceTime: s?.commence_time || null });
    updates.push({ ...r, result, units: result ? unitsOf(r.price, result) : null, clv_pts: read.clv_pts, open_to_close_pts: read.open_to_close_pts, graded_at: result ? new Date().toISOString() : r.graded_at });
  }
  const { error } = await db.from('diary_picks').upsert(updates.map(({ id, ...u }) => u), { onConflict: 'game_date,league,game_id' });
  if (error) throw error;
  return updates;
}

const rec = (rs) => { const g = rs.filter((r) => r.result === 'won' || r.result === 'lost'); const w = g.filter((r) => r.result === 'won').length; return { n: g.length, w, l: g.length - w, units: Math.round(g.reduce((s, r) => s + (r.units ?? unitsOf(r.price ?? r.odds, r.result)), 0) * 100) / 100 }; };
const fmt = (r) => `${r.w}-${r.l} (${r.units >= 0 ? '+' : ''}${r.units}u)`;
const right = (rs) => { const x = rs.filter((r) => r.clv_pts != null); return x.length ? `${x.filter((r) => r.clv_pts > 0).length}/${x.length} right side` : 'unread'; };

/** Step 3: Gary vs the notebook vs the formula on the same games. */
export async function printThreeWay(dates, label) {
  const { data: days } = await db.from('daily_picks').select('date, picks').in('date', dates);
  const { data: results } = await db.from('game_results').select('game_date, game_id, pick_text, result').in('game_date', dates);
  const res = new Map((results || []).map((r) => [`${r.game_date}|${String(r.game_id)}|${r.pick_text}`, r.result]));
  const { data: lineReads } = await db.from('pick_line_reads').select('game_date, game_id, clv_pts').in('game_date', dates).eq('league', 'MLB');
  const clvBy = new Map((lineReads || []).map((r) => [`${r.game_date}|${String(r.game_id)}`, r.clv_pts]));
  const gary = new Map();
  for (const d of days || []) for (const p of d.picks || []) {
    if (String(p?.league).toUpperCase() !== 'MLB' || p?.game_id == null) continue;
    const result = res.get(`${d.date}|${String(p.game_id)}|${p.pick}`) ?? null;
    gary.set(`${d.date}|${String(p.game_id)}`, { pick: p.pick, odds: Number(p.odds), result, units: result ? unitsOf(p.odds, result) : null, clv_pts: clvBy.get(`${d.date}|${String(p.game_id)}`) ?? null });
  }
  const { data: diary } = await db.from('diary_picks').select('*').in('game_date', dates).eq('league', 'MLB');
  const { data: formula } = await db.from('shadow_picks').select('*').in('game_date', dates).eq('league', 'MLB');
  const keys = new Set([...(diary || []).map((r) => `${r.game_date}|${r.game_id}`), ...(formula || []).map((r) => `${r.game_date}|${r.game_id}`)]);
  const g = [...keys].map((k) => gary.get(k)).filter(Boolean);
  const dRows = diary || []; const fRows = formula || [];
  console.log(`\n📚 THREE SYSTEMS — ${label}: ${keys.size} games with a shadow`);
  console.log(`  Gary:            ${fmt(rec(g))} · ${right(g)}`);
  console.log(`  Gary + notebook: ${fmt(rec(dRows))} · ${right(dRows)} · different side from Gary on ${dRows.filter((r) => r.agree_with_gary === false).length}`);
  console.log(`  Formula:         ${fmt(rec(fRows))} · ${right(fRows)} · different side from Gary on ${fRows.filter((r) => r.agree_with_gary === false).length}`);
  const splitD = dRows.filter((r) => r.agree_with_gary === false);
  if (splitD.length) console.log(`  where the notebook split from Gary: notebook ${fmt(rec(splitD))} vs Gary ${fmt(rec(splitD.map((r) => gary.get(`${r.game_date}|${r.game_id}`)).filter(Boolean)))}`);
  const splitF = fRows.filter((r) => r.agree_with_gary === false);
  if (splitF.length) console.log(`  where the formula split from Gary:  formula ${fmt(rec(splitF))} vs Gary ${fmt(rec(splitF.map((r) => gary.get(`${r.game_date}|${r.game_id}`)).filter(Boolean)))}`);
}

const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop());
if (isMain) {
  const positional = process.argv.slice(2).filter((a) => !a.startsWith('--'));
  const dates = positional.length ? dateRange(positional[0], positional[1] || positional[0]) : [etYesterday()];
  const label = dates.length === 1 ? dates[0] : `${dates[0]} → ${dates[dates.length - 1]}`;
  if (!process.argv.includes('--no-autopsy')) {
    for (const d of dates) {
      await gradeDiary([d]);
      const r = await runAutopsies(d);
      console.log(`  ${d}: ${r.done}/${r.jobs} autopsies written`);
    }
  }
  await gradeDiary(dates);
  await printThreeWay(dates, label);
  process.exit(0);
}
