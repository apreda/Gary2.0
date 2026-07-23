#!/usr/bin/env node
/**
 * SOL-NATIVE test runner (founder direction, Jul 22 night — "maybe we just
 * let Sol investigate and rethink even having a research assistant").
 *
 * The drastically simplified pick system, TEST-ONLY:
 *   - NO research assistant, NO pass stack: ONE system prompt (the true core
 *     via buildSystemPrompt — data rules, anti-hallucination, fact-checking,
 *     judgment line, injury rule surface, identity) + ONE user message
 *     (facts-only scout + all-books board + the founder's best-bet ask and
 *     bet framework, verbatim from the approved Pass 2.5 language).
 *   - Sol investigates for itself: fetch_stats + capped grounding (3).
 *   - reasoning effort xhigh. statAudit + count-claim rail, one retry.
 *   - Stores ONLY via storeTestPicks (test_daily_picks, arm 'sol-native').
 *
 * Usage: node scripts/run-sol-native.js --game-id <bdlGameId>
 */
import 'dotenv/config';
import { oddsService } from '../src/services/oddsService.js';
import { ballDontLieService } from '../src/services/ballDontLieService.js';
import { buildScoutReport } from '../src/services/agentic/scoutReport/scoutReportBuilder.js';
import { buildSystemPrompt } from '../src/services/agentic/orchestrator/orchestratorMain.js';
import { getConstitution } from '../src/services/agentic/constitution/index.js';
import { fetchStats } from '../src/services/agentic/tools/statRouters/index.js';
import { summarizeStatForContext } from '../src/services/agentic/orchestrator/orchestratorHelpers.js';
import { geminiGroundingSearch } from '../src/services/agentic/scoutReport/shared/grounding.js';
import { toolDefinitions } from '../src/services/agentic/tools/toolDefinitions.js';
import { createOpenAISession, sendToOpenAISession } from '../src/services/agentic/orchestrator/providerAdapters/openaiSession.js';
import { auditPickRationale, auditCountClaims, buildStatAuditRetryMessage } from '../src/services/agentic/orchestrator/statAudit.js';
import { picksService } from '../src/services/picksService.js';

const args = process.argv.slice(2);
const gameId = args[args.indexOf('--game-id') + 1];
if (!gameId) { console.error('need --game-id'); process.exit(1); }

const MODEL = 'gpt-5.6-sol';
const MAX_ITER = 14;
const MAX_GROUNDING = 3;
const todayEST = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });

// The betting framework — the founder's approved decision language, verbatim
// from the Pass 2.5 stack, assembled as ONE ask (no passes).
const DECISION_ASK = (homeTeam, awayTeam) => `
## YOUR TASK

Investigate this game with your tools wherever your read wants evidence, then make the bet.

The betting options in front of you are what you are picking from — you are not being asked who is better or who wins on paper; the prices already say what the world thinks. You are picking the BEST BET on this board: hold your read of tonight against the options and take the ticket you would put your own money on. Sometimes that is the favorite at a fair price. Sometimes it is the underdog, because the price pays far more than your read of a close game requires. And sometimes your read simply says a side gets it done regardless of the numbers — that conviction, owned plainly, is a real sports betting decision.

**BET TYPE:** Two options — MONEYLINE (team wins outright) or RUN LINE (standard -1.5/+1.5). The mechanics: -1.5 pays only on a win by 2+ runs — a one-run win pays the moneyline and LOSES -1.5; +1.5 cashes on a win or a one-run loss. They are different bets on different outcomes, not two prices for the same opinion — take the bet that pays if your read is right, not the one that makes a price you dislike look better.

**ESTABLISHED INJURY RULE:** an absence that is multiple games old is already in the line and in the team's recent results — only FRESH injuries (0-2 games) can inform the pick.

Use the EXACT odds shown on the board. Write "Gary's Take" — your pick and the real reasons you landed on it, opening with a brief announcer-style scene-setter — then output JSON:

\`\`\`json
{
  "final_pick": "[Team] [ML or run line] [exact odds]",
  "rationale": "Gary's Take\\n\\n[the prose]",
  "confidence_score": 0.XX
}
\`\`\`

confidence_score (0.50-1.00): set organically — confidence measures your read against the price, not the shortness of the price.`;

async function main() {
  const games = await oddsService.getUpcomingGames('baseball_mlb');
  const game = (games || []).find(g => String(g.bdl_game_id ?? g.id) === String(gameId));
  if (!game) { console.error('game not found/not upcoming'); process.exit(1); }
  const homeTeam = game.home_team?.full_name || game.home_team;
  const awayTeam = game.away_team?.full_name || game.away_team;
  console.log(`════ [Sol-native/${MODEL}/xhigh] ${awayTeam} @ ${homeTeam} ════`);

  const rows = await ballDontLieService.getOddsV2({ game_ids: [game.bdl_game_id ?? game.id] }, 'baseball_mlb').catch(() => []);
  const board = (rows || []).map(r =>
    `${r.vendor}: ML ${awayTeam} ${r.moneyline_away_odds} / ${homeTeam} ${r.moneyline_home_odds}` +
    (r.spread_home_value != null ? ` | Run line ${awayTeam} ${r.spread_away_value} (${r.spread_away_odds}) / ${homeTeam} ${r.spread_home_value} (${r.spread_home_odds})` : '')
  ).join('\n') || 'No board rows.';

  const scout = await buildScoutReport(game, 'baseball_mlb', {});
  const scoutText = scout.garyText || scout.text;

  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  let constitution = getConstitution('baseball_mlb');
  const fix = (x) => typeof x === 'string' ? x.replace(/{{CURRENT_DATE}}/g, today) : x;
  if (typeof constitution === 'object') { for (const k of Object.keys(constitution)) constitution[k] = fix(constitution[k]); }
  else constitution = fix(constitution);
  const systemPrompt = buildSystemPrompt(constitution, 'baseball_mlb').replace(/{{CURRENT_DATE}}/g, today);

  const session = await createOpenAISession({ modelName: MODEL, systemPrompt, tools: toolDefinitions.filter(t => ['fetch_stats', 'fetch_narrative_context'].includes(t.function?.name)), thinkingLevel: 'xhigh' });

  const corpus = [{ content: scoutText }, { content: board }];
  const toolLog = [];
  let grounding = 0;
  let message = `## SCOUT REPORT — ${awayTeam} @ ${homeTeam}\n${scoutText}\n\n## TONIGHT'S BOARD\n${board}\n${DECISION_ASK(homeTeam, awayTeam)}`;
  let isFn = false;
  const usage = { in: 0, out: 0 };
  let finalText = null;

  for (let i = 0; i < MAX_ITER; i++) {
    const res = await sendToOpenAISession(session, message, { isFunctionResponse: isFn });
    usage.in += res.usage?.prompt_tokens || 0;
    usage.out += res.usage?.completion_tokens || 0;
    if (res.toolCalls?.length) {
      const outs = [];
      for (const tc of res.toolCalls) {
        const name = tc.function?.name;
        let a = {}; try { a = JSON.parse(tc.function?.arguments || '{}'); } catch {}
        if (name === 'fetch_stats' && (a.token || a.stat_type)) {
          try {
            const r = await fetchStats('baseball_mlb', a.token || a.stat_type, homeTeam, awayTeam, { game });
            const sum = summarizeStatForContext(r, a.token || a.stat_type, homeTeam, awayTeam);
            corpus.push({ content: sum }); toolLog.push(a.token || a.stat_type);
            outs.push({ name, content: sum });
          } catch (e) { outs.push({ name, content: `Error: ${e.message}` }); }
        } else if (name === 'fetch_narrative_context') {
          if (grounding >= MAX_GROUNDING) { outs.push({ name, content: `Search limit reached (${MAX_GROUNDING}).` }); continue; }
          grounding++;
          try { const r = await geminiGroundingSearch(a.query || '', { maxTokens: 1500 }); const t = r?.data || 'No results.'; corpus.push({ content: t }); outs.push({ name, content: t }); }
          catch (e) { outs.push({ name, content: `Search error: ${e.message}` }); }
        } else outs.push({ name: name || '?', content: 'Tool not available.' });
      }
      message = outs; isFn = true; continue;
    }
    finalText = res.content; break;
  }
  if (finalText == null) {
    const res = await sendToOpenAISession(session, 'Stop investigating — with what you already have, return your final JSON now.', { isFunctionResponse: false });
    usage.in += res.usage?.prompt_tokens || 0; usage.out += res.usage?.completion_tokens || 0;
    finalText = res.content;
  }

  const parse = (t) => { try { const m = t.match(/```json\s*([\s\S]*?)```/i) || t.match(/(\{[\s\S]*\})/); const o = JSON.parse(m[1]); return o.final_pick ? o : null; } catch { return null; } };
  let parsed = parse(finalText || '');
  if (!parsed) { console.error('no valid final JSON'); process.exit(1); }

  const auditAll = (r) => {
    const a = auditPickRationale({ rationale: r }, corpus);
    const c = scout.recentScores ? auditCountClaims(r, scout.recentScores) : [];
    return [...a.retryable, ...c];
  };
  let issues = auditAll(parsed.rationale);
  if (issues.length) {
    console.warn(`[Rail] ${issues.length} issue(s) — one corrective retry`);
    const res = await sendToOpenAISession(session, buildStatAuditRetryMessage(issues), { isFunctionResponse: false });
    usage.in += res.usage?.prompt_tokens || 0; usage.out += res.usage?.completion_tokens || 0;
    const rp = parse(res.content || '');
    if (!rp || auditAll(rp.rationale).length) { console.error('still failing rails — no pick'); process.exit(1); }
    parsed = rp;
  }

  const cost = (usage.in * 5 + usage.out * 30) / 1e6;
  console.log(`✅ ${parsed.final_pick} (conf ${parsed.confidence_score}) | tools: ${toolLog.join(', ') || 'none'} | grounding: ${grounding} | ${usage.in.toLocaleString()} in / ${usage.out.toLocaleString()} out ≈ $${cost.toFixed(2)}`);
  console.log(`\n===== CARD =====\n${parsed.rationale}\n================`);

  await picksService.storeTestPicks([{
    pick: parsed.final_pick, rationale: parsed.rationale, confidence: parsed.confidence_score,
    homeTeam, awayTeam, league: 'MLB', sport: 'baseball_mlb',
    bdl_game_id: game.bdl_game_id ?? game.id, commence_time: game.commence_time,
    pick_id: `sol-native-${todayEST()}-${game.bdl_game_id ?? game.id}`, test_arm: 'sol-native',
  }], 'sol-native', `Sol-native run ${new Date().toISOString()}`);
  console.log('stored → test_daily_picks (sol-native)');
}
main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
