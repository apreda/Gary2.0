#!/usr/bin/env node
/**
 * THE GAME-BY-GAME TEST RUNNER (Oct 27 2026, founder GO). For each game the live system picked today, the second
 * system reads the same desk at the same moment, with the same prompt, question, spread and news (less its recaps of
 * past games), and answers from the stored game records instead (nbaGameByGameRead.js). Its pick goes to
 * public.gamebygame_picks beside the live pick and is never published. Opus on the Claude subscription only: no API
 * credit, no GPT; when the subscription is out the game is skipped and the next run tries again.
 *
 *   node scripts/run-gamebygame-shadow.js [--date 2026-10-27] [--only Knicks]     # read today's live picks
 *   node scripts/run-gamebygame-shadow.js --grade [--date 2026-10-26]             # grade a day (default yesterday)
 *
 * Reads: ~/Library/Logs/gary-nba-read-gbg/<date>_<Away>_at_<Home>.md. Side by side: ~/Library/Logs/Gary2.0/gamebygame/<date>.md.
 */
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
await import('../src/loadEnv.js');
const { supabaseAdmin: db } = await import('../src/supabaseClient.js');
const { buildNbaReadStory } = await import('../src/services/gary/agentic/orchestrator/nbaRead.js');
const { buildNbaGameByGameStory, ensureNbaRecords } = await import('../src/services/gary/agentic/orchestrator/nbaGameByGameRead.js');
const { nbaSystemPrompt, nbaGameMessage, nbaCardMessage, NBA_FORMAT_ONLY } = await import('../src/services/gary/agentic/orchestrator/nbaKnowledge.js');
const { createModelSession, sendToSessionWithRetry } = await import('../src/services/gary/agentic/orchestrator/sessionManager.js');
const { parseGaryResponse } = await import('../src/services/gary/agentic/orchestrator/responseParser.js');
const { gradeGame } = await import('./lib/results/grading.js');

const arg = (name) => { const i = process.argv.indexOf(name); return i > -1 ? process.argv[i + 1] : null; };
const etDate = (d) => new Date(d).toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
const grading = process.argv.includes('--grade');
const date = arg('--date') || etDate(grading ? Date.now() - 86_400_000 : Date.now());
const only = arg('--only');
const SYSTEM = 'game-by-game';
const readDir = `${homedir()}/Library/Logs/gary-nba-read-gbg`;
const reportDir = `${homedir()}/Library/Logs/Gary2.0/gamebygame`;
mkdirSync(readDir, { recursive: true }); mkdirSync(reportDir, { recursive: true });
const todayLong = (d) => new Date(`${d}T16:00:00Z`).toLocaleDateString('en-US', { timeZone: 'UTC', weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

async function livePicks(day) {
  const { data, error } = await db.from('daily_picks').select('picks').eq('date', day).limit(1);
  if (error) throw new Error(`daily_picks: ${error.message}`);
  const raw = data?.[0]?.picks; const picks = Array.isArray(raw) ? raw : JSON.parse(raw || '[]');
  return picks.filter((p) => String(p.league).toUpperCase() === 'NBA' && p.pick && p.homeTeam && p.awayTeam);
}
async function shadowRows(day) {
  const { data, error } = await db.from('gamebygame_picks').select('*').eq('league', 'NBA').eq('game_date', day);
  if (error) throw new Error(`gamebygame_picks: ${error.message}`);
  return data || [];
}

// The ticket prices the card is checked against, from the desk's raw odds (the live pick checks the same numbers).
function oddsFromDesk(desk) {
  const raw = (k) => { const m = String(desk).match(new RegExp(`^\\s*${k}:\\s*([+-]?\\d+(?:\\.\\d+)?)\\s*$`, 'm')); return m ? Number(m[1]) : null; };
  return { spread_home: raw('spreadHome'), spread_away: raw('spreadAway'), spread_home_odds: raw('spreadHomeOdds'), spread_away_odds: raw('spreadAwayOdds'),
    moneyline_home: raw('moneylineHome'), moneyline_away: raw('moneylineAway') };
}

async function readOne(p) {
  const matchup = `${p.awayTeam} @ ${p.homeTeam}`;
  const { data, error } = await db.from('pick_desks').select('desk, created_at').eq('game_date', date).eq('matchup', matchup).limit(1);
  if (error || !data?.[0]?.desk) throw new Error(`desk not on file (${error?.message || 'no row'})`);
  const desk = data[0].desk; const asOf = new Date(data[0].created_at);
  // The live read's news for the same desk, then the second system's story from the stored records.
  const live = await buildNbaReadStory(desk, { homeTeam: p.homeTeam, awayTeam: p.awayTeam, asOf });
  const { story, news, line } = await buildNbaGameByGameStory(desk, { homeTeam: p.homeTeam, awayTeam: p.awayTeam, asOf, news: live.news });
  const system = nbaSystemPrompt(todayLong(date));
  const session = await createModelSession({ modelName: 'claude-opus-5-5', routePinned: true, systemPrompt: system, tools: null, browse: false,
    thinkingLevel: process.env.GARY_BRAIN_EFFORT || 'xhigh', enableCache: true });
  const asked = nbaGameMessage(story, news || "The news search did not return a report for this game; today's news is not on file.");
  const read = (await sendToSessionWithRetry(session, asked)).content || '';
  const file = `${readDir}/${date}_${p.awayTeam.split(' ').pop()}_at_${p.homeTeam.split(' ').pop()}.md`;
  writeFileSync(file, `########## SYSTEM\n${system}\n\n########## ASKED\n${asked}\n\n########## ANSWERED\n${read}`);
  let answer = (await sendToSessionWithRetry(session, nbaCardMessage(line))).content || '';
  const odds = oddsFromDesk(desk);
  let pick = parseGaryResponse(answer, p.homeTeam, p.awayTeam, 'basketball_nba', odds);
  if (!pick) { answer = (await sendToSessionWithRetry(session, NBA_FORMAT_ONLY)).content || ''; pick = parseGaryResponse(answer, p.homeTeam, p.awayTeam, 'basketball_nba', odds); }
  if (!pick?.pick) throw new Error('no parseable pick');
  const row = { league: 'NBA', game_id: String(p.game_id), game_date: date, matchup, system: SYSTEM, pick: pick.pick, live_pick: p.pick,
    confidence: pick.confidence ?? null, rationale: pick.rationale || null, read_file: file, model: session.modelName || 'claude-opus-5-5' };
  const { error: saveError } = await db.from('gamebygame_picks').upsert(row, { onConflict: 'league,game_id,system' });
  if (saveError) throw new Error(`save failed: ${saveError.message}`);
  return row;
}

// The side-by-side note for a day: the games the two systems disagreed on first, with both reads' files.
async function writeReport(day) {
  const rows = await shadowRows(day);
  const liveDir = `${homedir()}/Library/Logs/gary-nba-read`;
  const side = (pick) => String(pick || '').replace(/\s[+-]\d+(\.\d)?\s[+-]\d{3}$|\sML\s[+-]\d+$/, '').trim();
  const lines = [`# Game-by-game test, NBA, ${day}`, ''];
  const tally = (k) => { const w = rows.filter((r) => r[k] === 'won').length, l = rows.filter((r) => r[k] === 'lost').length; return `${w}-${l}`; };
  if (rows.some((r) => r.result)) lines.push(`Graded: live ${tally('live_result')}, game-by-game ${tally('result')}`, '');
  // The test so far: every graded game, and the games the two systems took different sides on.
  const { data: all } = await db.from('gamebygame_picks').select('pick, live_pick, result, live_result').eq('league', 'NBA').lte('game_date', day).not('result', 'is', null);
  if (all?.length) {
    const t = (xs, k) => `${xs.filter((r) => r[k] === 'won').length}-${xs.filter((r) => r[k] === 'lost').length}`;
    const apart = all.filter((r) => side(r.pick) !== side(r.live_pick));
    lines.push(`Since the test began: live ${t(all, 'live_result')}, game-by-game ${t(all, 'result')} (${all.length} games); on the ${apart.length} games they took different sides: live ${t(apart, 'live_result')}, game-by-game ${t(apart, 'result')}`, '');
  }
  const differ = rows.filter((r) => side(r.pick) !== side(r.live_pick));
  lines.push(`${rows.length} games · ${differ.length} where the two systems took different sides`, '');
  for (const r of [...differ, ...rows.filter((x) => !differ.includes(x))]) {
    const liveFile = `${liveDir}/${day}_${r.matchup.split(' @ ')[0].split(' ').pop()}_at_${r.matchup.split(' @ ')[1].split(' ').pop()}.md`;
    lines.push(`## ${r.matchup}${differ.includes(r) ? ' · DIFFERENT SIDES' : ''}${r.final_score ? ` · final ${r.final_score}` : ''}`,
      `- live: ${r.live_pick}${r.live_result ? ` (${r.live_result})` : ''} · read: ${existsSync(liveFile) ? liveFile : 'not on file'}`,
      `- game-by-game: ${r.pick}${r.result ? ` (${r.result})` : ''} · read: ${r.read_file}`, '');
  }
  writeFileSync(`${reportDir}/${day}.md`, lines.join('\n'));
  return `${reportDir}/${day}.md`;
}

async function grade(day) {
  const rows = (await shadowRows(day)).filter((r) => !r.result);
  for (const r of rows) {
    const { data } = await db.from('game_results').select('final_score, result, matchup').eq('league', 'NBA').eq('game_date', day).eq('game_id', r.game_id).limit(1);
    const live = data?.[0]; if (!live?.final_score) continue;
    const [awayScore, homeScore] = live.final_score.split('-').map(Number);
    const [away, home] = r.matchup.split(' @ ');
    const result = gradeGame(r.pick, home, away, homeScore, awayScore);
    await db.from('gamebygame_picks').update({ result, live_result: live.result, final_score: live.final_score, graded_at: new Date().toISOString() })
      .eq('league', 'NBA').eq('game_id', r.game_id).eq('system', SYSTEM);
  }
  console.log(`graded ${rows.length}; ${await writeReport(day)}`);
}

if (grading) { await grade(date); process.exit(0); }
const built = await ensureNbaRecords();
if (built.failed.length) console.log(`records not built: ${built.failed.join('; ')}`);
const done = new Set((await shadowRows(date)).map((r) => r.game_id));
const todo = (await livePicks(date)).filter((p) => !done.has(String(p.game_id)) && (!only || `${p.awayTeam} ${p.homeTeam}`.includes(only)));
console.log(`game-by-game ${date}: ${todo.length} to read`);
for (const p of todo) {
  try { const r = await readOne(p); console.log(`  ${r.matchup}: live ${r.live_pick} · game-by-game ${r.pick}`); }
  catch (e) { console.log(`  ${p.awayTeam} @ ${p.homeTeam}: skipped (${e.message})`); }
}
console.log(await writeReport(date));
process.exit(0);
