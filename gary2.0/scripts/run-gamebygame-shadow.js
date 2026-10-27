#!/usr/bin/env node
/**
 * THE GAME-BY-GAME TEST RUNNER (Oct 27 2026, founder GO), NBA, NFL and college. For each game the live system picked
 * today, the second system reads the same desk at the same moment, with the same prompt, question, spread and news
 * (less its recaps of the games it shows), and answers from its own data (nbaGameByGameRead.js, nflGameByGameRead.js,
 * ncaafGameByGameRead.js). Its pick goes to public.gamebygame_picks beside the live pick and is never published; a
 * football small underdog becomes its moneyline, the house's law, as the live pick does. Opus on the Claude
 * subscription only: no API credit, no GPT; when the subscription is out the game is skipped and the next run tries.
 *
 *   node scripts/run-gamebygame-shadow.js [--league NBA,NFL,NCAAF] [--date 2026-10-27] [--only Knicks]
 *   node scripts/run-gamebygame-shadow.js --grade [--date 2026-10-26]      # grade a day (default yesterday)
 *
 * Reads: ~/Library/Logs/gary-<league>-read-gbg/<date>_<Away>_at_<Home>.md. Side by side: ~/Library/Logs/Gary2.0/gamebygame/<date>.md.
 */
import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
await import('../src/loadEnv.js');
const { supabaseAdmin: db } = await import('../src/supabaseClient.js');
const { buildNbaReadStory } = await import('../src/services/gary/agentic/orchestrator/nbaRead.js');
const { buildNbaGameByGameStory, ensureNbaRecords } = await import('../src/services/gary/agentic/orchestrator/nbaGameByGameRead.js');
const { buildNflGameByGameStory } = await import('../src/services/gary/agentic/orchestrator/nflGameByGameRead.js');
const { buildNcaafGameByGameStory } = await import('../src/services/gary/agentic/orchestrator/ncaafGameByGameRead.js');
const nbaK = await import('../src/services/gary/agentic/orchestrator/nbaKnowledge.js');
const nflK = await import('../src/services/gary/agentic/orchestrator/nflKnowledge.js');
const ncaafK = await import('../src/services/gary/agentic/orchestrator/ncaafKnowledge.js');
const { createModelSession, sendToSessionWithRetry } = await import('../src/services/gary/agentic/orchestrator/sessionManager.js');
const { parseGaryResponse } = await import('../src/services/gary/agentic/orchestrator/responseParser.js');
const { smallDogConversion } = await import('../src/services/gary/agentic/orchestrator/agentLoop.js');
const { nflWeekStartForInstant, nflSeasonForInstant } = await import('../src/services/gary/pickdesk/footballPropsDesk.js');
const { gradeGame } = await import('./lib/results/grading.js');

const arg = (name) => { const i = process.argv.indexOf(name); return i > -1 ? process.argv[i + 1] : null; };
const etDate = (d) => new Date(d).toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
const grading = process.argv.includes('--grade');
const date = arg('--date') || etDate(grading ? Date.now() - 86_400_000 : Date.now());
const only = arg('--only');
const SYSTEM = 'game-by-game';
const reportDir = `${homedir()}/Library/Logs/Gary2.0/gamebygame`;
mkdirSync(reportDir, { recursive: true });
const todayLong = (d) => new Date(`${d}T16:00:00Z`).toLocaleDateString('en-US', { timeZone: 'UTC', weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
const fileName = (day, p) => `${day}_${p.awayTeam.split(' ').pop()}_at_${p.homeTeam.split(' ').pop()}.md`;
const parseJson = (raw) => (Array.isArray(raw) ? raw : JSON.parse(raw || '[]'));

// The news the live read was given, from its transcript: the TODAY'S NEWS section without the closing question.
function liveNews(dir, day, p) {
  const f = `${homedir()}/Library/Logs/${dir}/${fileName(day, p)}`;
  if (!existsSync(f)) return null;
  const sect = (readFileSync(f, 'utf8').match(/## TODAY'S NEWS[^\n]*\n\n([\s\S]*?)\n\n########## ANSWERED/) || [])[1];
  if (sect == null) return null;
  const paras = sect.split('\n\n');
  return (paras.length && /\?\s*$/.test(paras.at(-1)) ? paras.slice(0, -1) : paras).join('\n\n');
}

const LEAGUES = {
  NBA: {
    sport: 'basketball_nba', liveDir: 'gary-nba-read', k: { system: nbaK.nbaSystemPrompt, game: nbaK.nbaGameMessage, card: nbaK.nbaCardMessage, format: nbaK.NBA_FORMAT_ONLY },
    picks: async (day) => { const { data } = await db.from('daily_picks').select('picks').eq('date', day).limit(1); return parseJson(data?.[0]?.picks).filter((p) => String(p.league).toUpperCase() === 'NBA'); },
    gameId: (p) => p.game_id,
    story: async (p, desk, asOf) => { const live = await buildNbaReadStory(desk, { homeTeam: p.homeTeam, awayTeam: p.awayTeam, asOf }); return buildNbaGameByGameStory(desk, { homeTeam: p.homeTeam, awayTeam: p.awayTeam, asOf, news: live.news }); },
    final: async (day, id) => { const { data } = await db.from('game_results').select('final_score, result').eq('league', 'NBA').eq('game_date', day).eq('game_id', id).limit(1); const r = data?.[0]; if (!r?.final_score) return null; const [a, h] = r.final_score.split('-').map(Number); return { away: a, home: h, live: r.result, text: r.final_score }; },
  },
  NFL: {
    sport: 'americanfootball_nfl', liveDir: 'gary-nfl-read', k: { system: nflK.nflSystemPrompt, game: nflK.nflGameMessage, card: nflK.nflCardMessage, format: nflK.NFL_FORMAT_ONLY }, smallDog: true,
    picks: async (day) => {
      const at = `${day}T16:00:00Z`;
      const { data } = await db.from('weekly_nfl_picks').select('picks').eq('week_start', nflWeekStartForInstant(at)).eq('season', nflSeasonForInstant(at)).limit(1);
      return parseJson(data?.[0]?.picks).filter((p) => p.commence_time && etDate(p.commence_time) === day);
    },
    gameId: (p) => p.bdl_game_id ?? p.game_id,
    story: async (p, desk, asOf, day) => { const news = liveNews('gary-nfl-read', day, p); if (news == null) throw new Error('the live read is not on file yet'); return buildNflGameByGameStory(desk, { homeTeam: p.homeTeam, awayTeam: p.awayTeam, gameDate: day, asOf, news }); },
    final: async (day, id) => { const { data } = await db.from('nfl_results').select('home_score, away_score, result, final_score').eq('game_date', day).eq('game_id', id).limit(1); const r = data?.[0]; return r?.home_score == null ? null : { away: Number(r.away_score), home: Number(r.home_score), live: r.result, text: `${r.away_score}-${r.home_score}` }; },
  },
  NCAAF: {
    sport: 'americanfootball_ncaaf', liveDir: 'gary-ncaaf-read', k: { system: ncaafK.ncaafSystemPrompt, game: ncaafK.ncaafGameMessage, card: ncaafK.ncaafCardMessage, format: ncaafK.NCAAF_FORMAT_ONLY }, smallDog: true,
    picks: async (day) => { const { data } = await db.from('daily_picks').select('picks').eq('date', day).limit(1); return parseJson(data?.[0]?.picks).filter((p) => String(p.league).toUpperCase() === 'NCAAF'); },
    gameId: (p) => p.game_id ?? p.bdl_game_id,
    story: async (p, desk, asOf, day) => { const news = liveNews('gary-ncaaf-read', day, p); if (news == null) throw new Error('the live read is not on file yet'); return buildNcaafGameByGameStory(desk, { homeTeam: p.homeTeam, awayTeam: p.awayTeam, gameDate: day, commenceTime: p.commence_time, asOf, news }); },
    final: async (day, id) => { const { data } = await db.from('game_results').select('final_score, result').eq('league', 'NCAAF').eq('game_date', day).eq('game_id', id).limit(1); const r = data?.[0]; if (!r?.final_score) return null; const [a, h] = r.final_score.split('-').map(Number); return { away: a, home: h, live: r.result, text: r.final_score }; },
  },
};
const leagues = (arg('--league') || 'NBA,NFL,NCAAF').split(',').map((s) => s.trim().toUpperCase()).filter((l) => LEAGUES[l]);

async function shadowRows(league, day) {
  const { data, error } = await db.from('gamebygame_picks').select('*').eq('league', league).eq('game_date', day);
  if (error) throw new Error(`gamebygame_picks: ${error.message}`);
  return data || [];
}

// The ticket prices the card is checked against, from the desk's raw odds (the live pick checks the same numbers).
function oddsFromDesk(desk) {
  const raw = (k) => { const m = String(desk).match(new RegExp(`^\\s*${k}:\\s*([+-]?\\d+(?:\\.\\d+)?)\\s*$`, 'm')); return m ? Number(m[1]) : null; };
  return { spread_home: raw('spreadHome'), spread_away: raw('spreadAway'), spread_home_odds: raw('spreadHomeOdds'), spread_away_odds: raw('spreadAwayOdds'),
    moneyline_home: raw('moneylineHome'), moneyline_away: raw('moneylineAway') };
}

async function readOne(league, p) {
  const L = LEAGUES[league];
  const matchup = `${p.awayTeam} @ ${p.homeTeam}`;
  const { data, error } = await db.from('pick_desks').select('desk, created_at').eq('game_date', date).eq('matchup', matchup).limit(1);
  if (error || !data?.[0]?.desk) throw new Error(`desk not on file (${error?.message || 'no row'})`);
  const desk = data[0].desk; const asOf = new Date(data[0].created_at);
  const { story, news, line } = await L.story(p, desk, asOf, date);
  const system = L.k.system(todayLong(date));
  const session = await createModelSession({ modelName: 'claude-opus-5-5', routePinned: true, systemPrompt: system, tools: null, browse: false,
    thinkingLevel: process.env.GARY_BRAIN_EFFORT || 'xhigh', enableCache: true });
  const asked = L.k.game(story, news || "The news search did not return a report for this game; today's news is not on file.");
  const read = (await sendToSessionWithRetry(session, asked)).content || '';
  const dir = `${homedir()}/Library/Logs/${L.liveDir}-gbg`; mkdirSync(dir, { recursive: true });
  const file = `${dir}/${fileName(date, p)}`;
  writeFileSync(file, `########## SYSTEM\n${system}\n\n########## ASKED\n${asked}\n\n########## ANSWERED\n${read}`);
  let answer = (await sendToSessionWithRetry(session, L.k.card(line))).content || '';
  const odds = oddsFromDesk(desk);
  let pick = parseGaryResponse(answer, p.homeTeam, p.awayTeam, L.sport, odds);
  if (!pick) { answer = (await sendToSessionWithRetry(session, L.k.format)).content || ''; pick = parseGaryResponse(answer, p.homeTeam, p.awayTeam, L.sport, odds); }
  if (!pick?.pick) throw new Error('no parseable pick');
  // The house's small-underdog law: the side stands at its moneyline (the live pick has Gary rewrite the card; the
  // ticket is the same).
  const conversion = L.smallDog ? smallDogConversion(pick, p.homeTeam, p.awayTeam) : null;
  const ticket = conversion ? conversion.ticket : pick.pick;
  const row = { league, game_id: String(L.gameId(p)), game_date: date, matchup, system: SYSTEM, pick: ticket, live_pick: p.pick,
    confidence: pick.confidence ?? null, rationale: pick.rationale || null, read_file: file, model: session.modelName || 'claude-opus-5-5' };
  const { error: saveError } = await db.from('gamebygame_picks').upsert(row, { onConflict: 'league,game_id,system' });
  if (saveError) throw new Error(`save failed: ${saveError.message}`);
  return row;
}

// The side-by-side note for a day, every league: the test so far, then the games the two systems disagreed on first.
const side = (pick) => String(pick || '').replace(/\s[+-]\d+(\.\d)?\s[+-]\d{3}$|\sML\s[+-]\d+$/, '').trim();
const tally = (xs, k) => `${xs.filter((r) => r[k] === 'won').length}-${xs.filter((r) => r[k] === 'lost').length}`;
async function writeReport(day) {
  const lines = [`# Game-by-game test, ${day}`, ''];
  for (const league of Object.keys(LEAGUES)) {
    const rows = await shadowRows(league, day);
    const { data: all } = await db.from('gamebygame_picks').select('pick, live_pick, result, live_result').eq('league', league).lte('game_date', day).not('result', 'is', null);
    if (!rows.length && !all?.length) continue;
    lines.push(`## ${league}`, '');
    if (all?.length) {
      const apart = all.filter((r) => side(r.pick) !== side(r.live_pick));
      lines.push(`Since the test began: live ${tally(all, 'live_result')}, game-by-game ${tally(all, 'result')} (${all.length} games); on the ${apart.length} games they took different sides: live ${tally(apart, 'live_result')}, game-by-game ${tally(apart, 'result')}`, '');
    }
    if (rows.some((r) => r.result)) lines.push(`This day: live ${tally(rows, 'live_result')}, game-by-game ${tally(rows, 'result')}`, '');
    const differ = rows.filter((r) => side(r.pick) !== side(r.live_pick));
    lines.push(`${rows.length} games · ${differ.length} where the two systems took different sides`, '');
    for (const r of [...differ, ...rows.filter((x) => !differ.includes(x))]) {
      const [away, home] = r.matchup.split(' @ ');
      const liveFile = `${homedir()}/Library/Logs/${LEAGUES[league].liveDir}/${fileName(day, { awayTeam: away, homeTeam: home })}`;
      lines.push(`### ${r.matchup}${differ.includes(r) ? ' · DIFFERENT SIDES' : ''}${r.final_score ? ` · final ${r.final_score}` : ''}`,
        `- live: ${r.live_pick}${r.live_result ? ` (${r.live_result})` : ''} · read: ${existsSync(liveFile) ? liveFile : 'not on file'}`,
        `- game-by-game: ${r.pick}${r.result ? ` (${r.result})` : ''} · read: ${r.read_file}`, '');
    }
  }
  writeFileSync(`${reportDir}/${day}.md`, lines.join('\n'));
  return `${reportDir}/${day}.md`;
}

async function grade(day) {
  let n = 0;
  for (const league of leagues) {
    for (const r of (await shadowRows(league, day)).filter((x) => !x.result)) {
      const f = await LEAGUES[league].final(day, r.game_id); if (!f) continue;
      const [away, home] = r.matchup.split(' @ ');
      const result = gradeGame(r.pick, home, away, f.home, f.away);
      await db.from('gamebygame_picks').update({ result, live_result: f.live, final_score: f.text, graded_at: new Date().toISOString() })
        .eq('league', league).eq('game_id', r.game_id).eq('system', SYSTEM);
      n += 1;
    }
  }
  console.log(`graded ${n}; ${await writeReport(day)}`);
}

if (grading) { await grade(date); process.exit(0); }
if (leagues.includes('NBA')) { const built = await ensureNbaRecords(); if (built.failed.length) console.log(`NBA records not built: ${built.failed.join('; ')}`); }
for (const league of leagues) {
  const done = new Set((await shadowRows(league, date)).map((r) => r.game_id));
  const todo = (await LEAGUES[league].picks(date)).filter((p) => p.pick && p.homeTeam && p.awayTeam && LEAGUES[league].gameId(p) != null
    && !done.has(String(LEAGUES[league].gameId(p))) && (!only || `${p.awayTeam} ${p.homeTeam}`.includes(only)));
  console.log(`${league} game-by-game ${date}: ${todo.length} to read`);
  for (const p of todo) {
    try { const r = await readOne(league, p); console.log(`  ${r.matchup}: live ${r.live_pick} · game-by-game ${r.pick}`); }
    catch (e) { console.log(`  ${p.awayTeam} @ ${p.homeTeam}: skipped (${e.message})`); }
  }
}
console.log(await writeReport(date));
process.exit(0);
