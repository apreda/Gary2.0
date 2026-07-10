#!/usr/bin/env node
/**
 * SCRATCH ARM RUNNER — "gary-vnext" on GPT-5.6 Sol (Jul 10 2026, founder-approved).
 *
 * The rebuild-from-scratch test arm: strong model + full data + hard rails +
 * almost no instruction. See src/services/agentic/scratchArm/scratchArm.js for
 * the thesis. TEST-ONLY BY CONSTRUCTION: stores exclusively via
 * picksService.storeTestPicks → test_daily_picks. It cannot write production.
 *
 * Usage:
 *   node scripts/run-scratch-arm.js --mlb            # tonight's MLB slate
 *   node scripts/run-scratch-arm.js --wc             # today's World Cup match(es)
 *   node scripts/run-scratch-arm.js --wc --game-id 171
 *   SCRATCH_MODEL=gpt-5.5 node scripts/run-scratch-arm.js --mlb   # engine override
 */
import 'dotenv/config';
import { oddsService } from '../src/services/oddsService.js';
import { buildScoutReport } from '../src/services/agentic/scoutReport/scoutReportBuilder.js';
import { fetchStats } from '../src/services/agentic/tools/statRouters/index.js';
import { summarizeStatForContext } from '../src/services/agentic/orchestrator/orchestratorHelpers.js';
import { geminiGroundingSearch } from '../src/services/agentic/scoutReport/shared/grounding.js';
import { toolDefinitions } from '../src/services/agentic/tools/toolDefinitions.js';
import { createOpenAISession, sendToOpenAISession } from '../src/services/agentic/orchestrator/providerAdapters/openaiSession.js';
import { auditPickRationale, buildStatAuditRetryMessage } from '../src/services/agentic/orchestrator/statAudit.js';
import { picksService } from '../src/services/picksService.js';
import {
  SCRATCH_MODEL_DEFAULT,
  buildScratchSystemPrompt,
  buildScratchUserMessage,
  stripInterpretiveLabels,
  renderFullBoard,
  parseScratchFinal,
} from '../src/services/agentic/scratchArm/scratchArm.js';

const args = process.argv.slice(2);
const getArg = (flag) => { const i = args.indexOf(flag); return i >= 0 ? args[i + 1] : null; };
const SPORTS = [];
if (args.includes('--mlb')) SPORTS.push({ key: 'baseball_mlb', league: 'MLB' });
if (args.includes('--wc')) SPORTS.push({ key: 'soccer_world_cup', league: 'WC' });
if (SPORTS.length === 0) { console.error('Pass --mlb and/or --wc'); process.exit(1); }
const gameIdFilter = getArg('--game-id');
const MODEL = process.env.SCRATCH_MODEL || SCRATCH_MODEL_DEFAULT;
const ARM = 'gary-vnext'; // engine-agnostic arm name; scratch_model on each pick records the engine
const MAX_ITERATIONS = 12;
const MAX_GROUNDING = 6;

const todayEST = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });

// Same per-vendor odds mapping production uses (WC: FIFA vendor rows; MLB: BDL v2).
async function fetchBoardRows(sportKey, gameId) {
  try {
    if (sportKey === 'soccer_world_cup') {
      const { default: fifa } = await import('../src/services/fifaWorldCupService.js').then(m => ({ default: m }));
      const rows = await fifa.getOdds({ matchIds: [gameId] });
      return (rows || []).map(r => ({
        book: r.vendor || 'book', ml_home: r.moneyline_home_odds, ml_away: r.moneyline_away_odds, ml_draw: r.moneyline_draw_odds,
        spread_home: r.spread_home_value, spread_home_odds: r.spread_home_odds,
        spread_away: r.spread_away_value, spread_away_odds: r.spread_away_odds,
        total: r.total_value, total_over_odds: r.total_over_odds, total_under_odds: r.total_under_odds,
      }));
    }
    const { ballDontLieService } = await import('../src/services/ballDontLieService.js');
    const rows = await ballDontLieService.getOddsV2({ game_ids: [gameId] }, sportKey);
    return (rows || []).map(r => ({
      book: r.vendor || 'book', ml_home: r.moneyline_home_odds, ml_away: r.moneyline_away_odds,
      spread_home: r.spread_home_value, spread_home_odds: r.spread_home_odds,
      spread_away: r.spread_away_value, spread_away_odds: r.spread_away_odds,
      total: r.total_value, total_over_odds: r.total_over_odds, total_under_odds: r.total_under_odds,
    }));
  } catch (e) {
    console.warn(`[Scratch] board rows failed for ${gameId}: ${e.message}`);
    return [];
  }
}

async function executeToolCall(tc, sportKey, homeTeam, awayTeam, game, state) {
  const name = tc.function?.name;
  let toolArgs = {};
  try { toolArgs = JSON.parse(tc.function?.arguments || '{}'); } catch { /* leave empty */ }

  if (name === 'fetch_stats') {
    const token = toolArgs.token || toolArgs.stat_type;
    if (!token) return { name, content: 'fetch_stats needs a "token" argument.' };
    try {
      const result = await fetchStats(sportKey, token, homeTeam, awayTeam, { game });
      const summary = summarizeStatForContext(result, token, homeTeam, awayTeam);
      state.corpus.push({ content: summary });
      return { name, content: summary };
    } catch (e) {
      return { name, content: `Error fetching ${token}: ${e.message}` };
    }
  }
  if (name === 'fetch_narrative_context') {
    if (state.grounding >= MAX_GROUNDING) return { name, content: `Search limit reached (${MAX_GROUNDING}).` };
    state.grounding++;
    try {
      const r = await geminiGroundingSearch(toolArgs.query || '', { maxTokens: 1500 });
      const text = r?.data || 'No results.';
      state.corpus.push({ content: text });
      return { name, content: text };
    } catch (e) {
      return { name, content: `Search error: ${e.message}` };
    }
  }
  return { name: name || 'unknown', content: 'Tool not available in this arm.' };
}

async function analyzeOne(sport, game) {
  const homeTeam = game.home_team?.full_name || game.home_team?.name || game.home_team;
  const awayTeam = game.away_team?.full_name || game.away_team?.name || game.away_team;
  const gameId = game.bdl_game_id ?? game.id;
  console.log(`\n════ [Scratch/${MODEL}] ${awayTeam} @ ${homeTeam} (${sport.league}) ════`);

  // Data layer: production scout (Gary's pure-data view), de-labeled; full board.
  const scoutReport = await buildScoutReport(game, sport.key, {});
  const scout = stripInterpretiveLabels(scoutReport.garyText || scoutReport.text || '');
  const boardRows = await fetchBoardRows(sport.key, gameId);
  const board = renderFullBoard(game, sport.key, { homeTeam, awayTeam, sportsbookOdds: boardRows });

  const session = await createOpenAISession({
    modelName: MODEL,
    systemPrompt: buildScratchSystemPrompt(todayEST()),
    tools: toolDefinitions,
    thinkingLevel: 'high',
  });

  const state = { corpus: [{ content: scout }, { content: board }], grounding: 0 };
  let message = buildScratchUserMessage({ awayTeam, homeTeam, scout, board });
  let isFunctionResponse = false;
  let usage = { in: 0, out: 0 };
  let finalText = null;

  for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
    const res = await sendToOpenAISession(session, message, { isFunctionResponse });
    usage.in += res.usage?.prompt_tokens || 0;
    usage.out += res.usage?.completion_tokens || 0;
    if (res.toolCalls?.length) {
      const responses = [];
      for (const tc of res.toolCalls) responses.push(await executeToolCall(tc, sport.key, homeTeam, awayTeam, game, state));
      message = responses;
      isFunctionResponse = true;
      continue;
    }
    finalText = res.content;
    break;
  }

  let parsed = parseScratchFinal(finalText);
  if (!parsed) { console.warn(`[Scratch] no valid final JSON — skipping game`); return null; }

  // Hard rail: anti-fabrication. One corrective retry, then SKIP — never store
  // a rationale whose numbers don't trace to provided data.
  let audit = auditPickRationale({ rationale: parsed.rationale }, state.corpus);
  if (audit.retryable.length > 0) {
    console.warn(`[Scratch] statAudit: ${audit.retryable.length} untraceable claim(s) — one corrective retry`);
    const res = await sendToOpenAISession(session, buildStatAuditRetryMessage(audit.retryable), { isFunctionResponse: false });
    usage.in += res.usage?.prompt_tokens || 0;
    usage.out += res.usage?.completion_tokens || 0;
    const reparsed = parseScratchFinal(res.content);
    if (reparsed) {
      const reaudit = auditPickRationale({ rationale: reparsed.rationale }, state.corpus);
      if (reaudit.retryable.length > 0) { console.warn(`[Scratch] still untraceable after retry — SKIPPING game`); return null; }
      parsed = reparsed;
    } else { console.warn(`[Scratch] retry produced no valid JSON — SKIPPING game`); return null; }
  }

  // Tolerate "(+105)" endings — the smoke run picked "Under 2.5 goals (+105)".
  const odds = Number((parsed.final_pick.match(/([+-]\d{3,4})\)?\s*$/) || [])[1] ?? NaN);
  const isTotal = /^(over|under)/i.test(parsed.final_pick);
  const isSpread = !isTotal && /[+-]\d+(\.\d+)?\s+[+-]?\d{3,4}\s*$/.test(parsed.final_pick) && /[+-]\d\.5|\b[+-]1\b/.test(parsed.final_pick);
  const cost = (usage.in * 5 + usage.out * 30) / 1e6;
  console.log(`[Scratch] ✅ PICK: ${parsed.final_pick} (conf ${parsed.confidence_score}) — ${usage.in.toLocaleString()} in / ${usage.out.toLocaleString()} out ≈ $${cost.toFixed(2)}`);

  return {
    pick: parsed.final_pick,
    type: isTotal ? 'total' : isSpread ? 'spread' : 'moneyline',
    odds: Number.isFinite(odds) ? odds : null,
    league: sport.league,
    sport: sport.key,
    homeTeam, awayTeam,
    game_id: gameId,
    commence_time: game.commence_time || null,
    confidence: parsed.confidence_score,
    rationale: parsed.rationale,
    pick_id: `pick-${todayEST()}-${ARM}-${String(gameId)}`,
    test_arm: ARM,
    scratch_model: MODEL,
  };
}

async function main() {
  const picks = [];
  for (const sport of SPORTS) {
    let games = await oddsService.getUpcomingGames(sport.key).catch(e => { console.error(`[Scratch] game fetch failed: ${e.message}`); return []; });
    const today = todayEST();
    games = (games || []).filter(g => {
      const est = g.commence_time ? new Date(g.commence_time).toLocaleDateString('en-CA', { timeZone: 'America/New_York' }) : null;
      return est === today && new Date(g.commence_time) > new Date();
    });
    if (gameIdFilter) games = games.filter(g => String(g.bdl_game_id ?? g.id) === String(gameIdFilter));
    console.log(`[Scratch] ${sport.league}: ${games.length} game(s) to analyze`);
    for (const game of games) {
      try {
        const pick = await analyzeOne(sport, game);
        if (pick) picks.push(pick);
      } catch (e) {
        console.error(`[Scratch] game failed: ${e.message}`);
      }
    }
  }

  if (!picks.length) { console.log('[Scratch] No picks to store.'); return; }
  const result = await picksService.storeTestPicks(picks, ARM, `Scratch arm (${MODEL}) run at ${new Date().toISOString()}`);
  console.log(`[Scratch] storeTestPicks → ${JSON.stringify(result)}`);
}

main().then(() => { console.log('[Scratch] Done.'); process.exit(0); }).catch(e => { console.error(e); process.exit(1); });
