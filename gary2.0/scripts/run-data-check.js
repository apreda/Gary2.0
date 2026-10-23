#!/usr/bin/env node
/**
 * The morning data check (src/services/gary/dataCheck.js): every settled NFL, college and NBA game pick from a day,
 * its data rebuilt at the pick's time and checked against what was true before kickoff. Writes a private report for the
 * session that owns the pick system; nothing reaches Gary. Resumable: a game already in the day's report is skipped.
 *
 *   node scripts/run-data-check.js                       # yesterday (Eastern)
 *   node scripts/run-data-check.js --date 2026-10-22 --league NFL,NBA --only Patriots
 *
 * Report: ~/Library/Logs/Gary2.0/data-checks/<date>.md (and .json).
 */
import { createClient } from '@supabase/supabase-js';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
await import('../src/loadEnv.js');
const { DATA_CHECK_LEAGUES, dataGaryRead, runDataCheck, sportKeyOf } = await import('../src/services/gary/dataCheck.js');
const { linePath, lineStory } = await import('../src/services/sports/nfl/nflBettorData.js');

const arg = (name) => { const i = process.argv.indexOf(name); return i > -1 ? process.argv[i + 1] : null; };
const date = arg('--date') || new Date(Date.now() - 86400000).toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
const leagues = (arg('--league') || DATA_CHECK_LEAGUES.join(',')).split(',').map((s) => s.trim().toUpperCase()).filter((l) => DATA_CHECK_LEAGUES.includes(l));
const only = arg('--only');
const db = createClient(process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } });
const dir = `${homedir()}/Library/Logs/Gary2.0/data-checks`; mkdirSync(dir, { recursive: true });
const jsonPath = `${dir}/${date}.json`;
const done = existsSync(jsonPath) ? JSON.parse(readFileSync(jsonPath, 'utf8')) : [];

// The day's settled game picks: the NFL's from nfl_results, the rest from game_results (final score away-home).
async function settledPicks() {
  const out = [];
  if (leagues.includes('NFL')) {
    const { data, error } = await db.from('nfl_results').select('pick_text, result, home_team, away_team, home_score, away_score, game_id').eq('game_date', date);
    if (error) throw error;
    for (const r of data || []) out.push({ league: 'NFL', matchup: `${r.away_team} @ ${r.home_team}`, homeTeam: r.home_team, awayTeam: r.away_team, pick: r.pick_text, result: r.result, finalScore: r.home_score == null ? null : `${r.away_score}-${r.home_score}`, gameId: r.game_id });
  }
  const rest = leagues.filter((l) => l !== 'NFL');
  if (rest.length) {
    const { data, error } = await db.from('game_results').select('league, matchup, pick_text, result, final_score, game_id, is_winners_pick').eq('game_date', date).in('league', rest);
    if (error) throw error;
    for (const r of data || []) {
      if (r.is_winners_pick) continue;
      const [awayTeam, homeTeam] = String(r.matchup).split(' @ ');
      out.push({ league: r.league, matchup: r.matchup, homeTeam, awayTeam, pick: r.pick_text, result: r.result, finalScore: r.final_score, gameId: r.game_id });
    }
  }
  return out.filter((p) => ['won', 'lost', 'push'].includes(p.result) && (!only || p.matchup.includes(only)));
}

async function one(p) {
  const { data: desks, error } = await db.from('pick_desks').select('desk, research_briefing, created_at')
    .eq('game_date', date).eq('matchup', p.matchup).not('pick', 'is', null).order('created_at', { ascending: false }).limit(1);
  if (error) throw error;
  const row = desks?.[0];
  if (!row?.desk) return { ...p, skipped: 'no saved desk' };
  const { data: written } = await db.from('winners_candidates').select('rationale:pick_snapshot->>rationale')
    .eq('game_date', date).eq('league', p.league).eq('kind', 'game').eq('pick_text', p.pick).order('id', { ascending: false }).limit(1);
  const { data: odds } = await db.from('odds_snapshots').select('commence_time').eq('sport', sportKeyOf(p.league)).eq('game_id', String(p.gameId)).not('commence_time', 'is', null).limit(1);
  const kick = odds?.[0]?.commence_time ? new Date(odds[0].commence_time) : null;
  // The read's own transcript is exactly what Gary saw; without one, the data is rebuilt from the saved desk.
  const transcript = (() => { try { return readFileSync(`${homedir()}/Library/Logs/gary-${p.league.toLowerCase()}-read/${date}_${p.awayTeam.split(' ').pop()}_at_${p.homeTeam.split(' ').pop()}.md`, 'utf8'); } catch { return null; } })();
  const part = (name) => { const m = transcript?.match(new RegExp(`########## ${name}\\n([\\s\\S]*?)(?=\\n\\n########## |$)`)); return m ? m[1].trim() : null; };
  const asked = part('ASKED'), answered = part('ANSWERED');
  const { story, news } = asked ? { story: null, news: null } : await dataGaryRead({ league: p.league, desk: row.desk, homeTeam: p.homeTeam, awayTeam: p.awayTeam, gameId: p.gameId, gameDate: date, asOf: new Date(row.created_at), news: row.research_briefing });
  const closing = kick ? lineStory(await linePath(db, p.gameId, kick, sportKeyOf(p.league)).catch(() => null), p.homeTeam, p.awayTeam) : null;
  const t0 = Date.now();
  const r = await runDataCheck({ league: p.league, matchup: p.matchup, gameDate: date, kickoff: kick?.toLocaleString('en-US', { timeZone: 'America/New_York', dateStyle: 'medium', timeStyle: 'short' }) + ' ET',
    story, news, asked, answered, pick: p.pick, rationale: written?.[0]?.rationale || null, finalScore: p.finalScore, closingLine: closing });
  return { ...p, source: asked ? 'transcript' : 'rebuilt', ok: r.ok, check: r.check, text: r.text, transport: r.transport, error: r.error, secs: Math.round((Date.now() - t0) / 1000) };
}

function report(rows) {
  const lines = [`# Data check, ${date}`, '', `${rows.length} picks · ${rows.filter((r) => r.check && !r.check.data_sound).length} with data problems · ${rows.filter((r) => r.check?.data_sound).length} sound · ${rows.filter((r) => !r.check).length} unchecked`, ''];
  for (const r of rows) {
    lines.push(`## ${r.league} · ${r.matchup} · ${r.pick} (${r.result}, ${r.finalScore || '?'})${r.source ? ` · data ${r.source}` : ''}`);
    if (!r.check) { lines.push(`Unchecked: ${r.skipped || r.error || 'no JSON in the answer'}`, ''); continue; }
    lines.push(r.check.data_sound ? 'Data sound.' : `${r.check.issues.length} issue(s):`);
    for (const i of r.check.issues) lines.push(`- **${i.kind}${i.question ? `/${i.question}` : ''}** (${i.section}): data said ${i.data_said}; truth: ${i.truth}. Mattered: ${i.mattered}. Fix: ${i.fix}. Evidence: ${i.evidence}`);
    lines.push(`- Line: ${r.check.line}`, `- Decided: ${r.check.decided}`, '');
  }
  return lines.join('\n');
}

const picks = await settledPicks();
const todo = picks.filter((p) => !done.some((d) => d.matchup === p.matchup && d.check));
console.log(`Data check ${date}: ${picks.length} settled picks, ${todo.length} to check (${leagues.join(', ')})`);
const rows = done.filter((d) => !todo.some((p) => p.matchup === d.matchup));
let i = 0;
await Promise.all(Array.from({ length: 2 }, async () => {
  while (i < todo.length) {
    const p = todo[i++];
    try { rows.push(await one(p)); } catch (e) { rows.push({ ...p, error: e.message }); }
    const r = rows[rows.length - 1];
    console.log(`  ${p.league} ${p.matchup}: ${r.check ? (r.check.data_sound ? 'sound' : `${r.check.issues.length} issue(s)`) : `unchecked (${r.skipped || r.error || 'no JSON'})`}${r.secs ? ` ${r.secs}s` : ''}`);
    writeFileSync(jsonPath, JSON.stringify(rows, null, 1));
  }
}));
writeFileSync(`${dir}/${date}.md`, report(rows));
console.log(`Report: ${dir}/${date}.md`);
process.exit(0);
