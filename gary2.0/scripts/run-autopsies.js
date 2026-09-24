#!/usr/bin/env node
/**
 * THE AUTOPSIES, nightly (founder GO, Sep 3 2026; back on their own Sep 24
 * 2026): after the final, a one-shot reader grades Gary's stated reason for
 * each graded MLB game pick against what happened: the original decision
 * and the outcome as separate assessments, plus at most one case-specific
 * note. Read only by us, in the nightly ledger (run-rationale-lanes). Nothing
 * here reaches any Gary prompt. The notebook pick and the shadow model that
 * once shared this pass stay retired.
 *
 *   node scripts/run-autopsies.js                       # yesterday (ET)
 *   node scripts/run-autopsies.js 2026-09-24
 *   node scripts/run-autopsies.js 2026-09-20 2026-09-24 # a range
 */
import '../src/loadEnv.js';
import { easternDateOffset } from '../supabase/functions/_shared/dateKeys.js';
import { gameStory, writeAutopsy } from '../src/services/diary/autopsy.js';
import { pickSideOf } from '../src/services/closingLine.js';
import { getMlbSchedule } from '../src/services/mlbStatsApiService.js';
import { matchingDesk, pregameEvidence } from '../src/services/diary/evidence.js';

const { supabaseAdmin, supabase } = await import('../src/supabaseClient.js');
const db = supabaseAdmin || supabase;
const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

function dateRange(a, b) {
  const out = [];
  for (let t = new Date(`${a}T12:00:00Z`).getTime(); t <= new Date(`${b}T12:00:00Z`).getTime(); t += 86400000) out.push(new Date(t).toISOString().slice(0, 10));
  return out;
}

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
const findFinal = (finals, awayTeam, homeTeam) => finals.byNames.get(`${norm(awayTeam)}@${norm(homeTeam)}`)
  || [...finals.byNames.values()].find((r) => norm(r.home).endsWith(norm(String(homeTeam).split(' ').pop())) && norm(r.away).endsWith(norm(String(awayTeam).split(' ').pop())))
  || null;

/** Autopsies for Gary's graded MLB game picks on a date; a pick already read is skipped. */
export async function runAutopsies(date, { database = db, getFinals = finalsFor, getStory = gameStory, review = writeAutopsy, log = console } = {}) {
  const finals = await getFinals(date);
  const { data: existing, error: existingError } = await database.from('pick_autopsies').select('game_id').eq('game_date', date).eq('league', 'MLB').eq('source', 'gary');
  if (existingError) throw existingError;
  const have = new Set((existing || []).map((r) => String(r.game_id)));
  const { data: days, error: daysError } = await database.from('daily_picks').select('picks').eq('date', date);
  const { data: results, error: resultsError } = await database.from('game_results').select('game_id, pick_text, result').eq('game_date', date);
  if (daysError || resultsError) throw daysError || resultsError;
  const { data: desks, error: deskError } = await database.from('pick_desks').select('matchup, pick, desk, research_briefing, created_at').eq('game_date', date);
  if (deskError) log.warn(`  ⚠️ original desks unavailable: ${deskError.message}; decision quality will remain unknown`);
  const res = new Map((results || []).map((r) => [`${String(r.game_id)}|${r.pick_text}`, r.result]));
  const picks = (days || []).flatMap((d) => d.picks || []);
  const jobs = [];
  for (const p of picks) {
    if (String(p?.league).toUpperCase() !== 'MLB' || p?.game_id == null || !p?.rationale) continue;
    const result = res.get(`${String(p.game_id)}|${p.pick}`) ?? null;
    if (!['won', 'lost', 'push'].includes(result) || have.has(String(p.game_id))) continue;
    const side = pickSideOf({ pick: p.pick, homeTeam: p.homeTeam, awayTeam: p.awayTeam });
    const sameMatchupGames = new Set(picks.filter((other) => String(other?.league).toUpperCase() === 'MLB'
      && norm(other.homeTeam) === norm(p.homeTeam) && norm(other.awayTeam) === norm(p.awayTeam)).map((other) => String(other.game_id))).size;
    const desk = matchingDesk(desks, { homeTeam: p.homeTeam, awayTeam: p.awayTeam, pickText: p.pick, sameMatchupGames });
    jobs.push({ game_id: String(p.game_id), pick_text: p.pick, result, home_team: p.homeTeam, away_team: p.awayTeam, rationale: p.rationale, caseText: side === 'home' ? p.path_home : side === 'away' ? p.path_away : null,
      pregameEvidence: pregameEvidence({ pickText: p.pick, price: p.odds, model: p.model, era: p.prompt_sha, rationale: p.rationale, caseHome: p.path_home, caseAway: p.path_away, desk: desk?.desk, briefing: desk?.research_briefing, capturedAt: desk?.created_at, provenance: desk ? 'stored_pick_desks_exact_ticket' : 'card_only_original_desk_missing' }),
    });
  }
  let done = 0;
  for (const j of jobs) {
    const fin = findFinal(finals, j.away_team, j.home_team);
    const story = fin ? await getStory({ gamePk: fin.gamePk, gameDate: date, homeTeam: j.home_team, awayTeam: j.away_team }) : '';
    const out = await review({ homeTeam: j.home_team, awayTeam: j.away_team, gameDate: date, pickText: j.pick_text, result: j.result, rationale: j.rationale, caseText: j.caseText, pregameEvidence: j.pregameEvidence, story });
    if (!out.ok) { log.warn(`  ⚠️ autopsy skipped ${j.away_team} @ ${j.home_team}: ${out.error}`); continue; }
    const a = out.autopsy;
    const { data: inserted, error } = await database.from('pick_autopsies').upsert({
      game_date: date, league: 'MLB', game_id: j.game_id, source: 'gary', pick_text: j.pick_text, result: j.result,
      home_team: j.home_team, away_team: j.away_team, final_score: fin ? `${j.away_team} ${fin.ar}, ${j.home_team} ${fin.hr}` : null,
      mechanism_stated: a.mechanism_stated, reason_type: a.reason_type, decided_by: a.decided_by, mechanism_label: a.mechanism_label,
      reason_status: a.reason_status, note: a.note || null, game_story: story || null, model: out.model, ms: out.ms, computed_at: new Date().toISOString(),
      review_version: a.review_version, pregame_evidence: j.pregameEvidence, decision_review: a.decision_review, outcome_review: a.outcome_review,
    }, { onConflict: 'game_date,league,game_id,source', ignoreDuplicates: true }).select('game_id');
    if (error) { log.warn(`  ⚠️ autopsy not stored: ${error.message}`); continue; }
    if (!inserted?.length) continue;
    done += 1;
    log.log(`  🩺 ${j.away_team} @ ${j.home_team} · ${j.pick_text} ${j.result} · decision ${a.decision_review.assessment} · claim ${a.outcome_review.claim_status}`);
  }
  return { jobs: jobs.length, done };
}

const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop());
if (isMain) {
  const positional = process.argv.slice(2).filter((a) => !a.startsWith('--'));
  const dates = positional.length ? dateRange(positional[0], positional[1] || positional[0]) : [easternDateOffset(-1)];
  for (const d of dates) {
    const r = await runAutopsies(d);
    console.log(`  ${d}: ${r.done}/${r.jobs} autopsies written`);
  }
  process.exit(0);
}
