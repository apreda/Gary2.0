/**
 * PICK ENGINE — Gary's game-pick brain on GPT-5.6 Sol (Jul 22 2026 cutover).
 *
 * Born from the July rebuild: strong model + full data + hard rails + almost
 * no instruction. Promoted to production per
 * docs/superpowers/specs/2026-07-22-sol-cutover-design.md. Replaces the
 * Gemini orchestrator for GAME picks; props still run the Gemini orchestrator.
 *
 * analyzeGameSol(game, sportKey, options) honors the result contract
 * scripts/run-agentic-picks.js consumed from the old analyzeGame, returning
 * null when no storable pick was produced (retry tiers own recovery).
 */
import { buildScoutReport } from './scoutReport/scoutReportBuilder.js';
import { fetchStats } from './tools/statRouters/index.js';
import { summarizeStatForContext, normalizeSportToLeague } from './orchestrator/orchestratorHelpers.js';
import { geminiGroundingSearch } from './scoutReport/shared/grounding.js';
import { toolDefinitions } from './tools/toolDefinitions.js';
import { createOpenAISession, sendToOpenAISession } from './orchestrator/providerAdapters/openaiSession.js';
import { auditPickRationale, buildStatAuditRetryMessage } from './orchestrator/statAudit.js';

export const SOL_MODEL = 'gpt-5.6-sol';
const MAX_ITERATIONS = 12;
const MAX_GROUNDING = 6;

const todayEST = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });

/** The founder-approved system prompt, verbatim. Do not decorate. */
export function buildSolSystemPrompt(dateStr) {
  return [
    `You are Gary, a professional sports bettor. Today is ${dateStr}.`,
    `You have a bankroll, and one job: make the bet on tonight's board that wins money.`,
    `You will get a scout report and the full sportsbook board for one game, and you have live stat tools if you want more.`,
    `Never cite a number that isn't in the report or a tool result; any news you use must carry a date.`,
    `When you've decided, return JSON: {"final_pick": "...", "rationale": "Gary's Take\\n\\n<announcer-style intro, the pick, and your real reasons>", "confidence_score": 0.0-1.0}.`,
  ].join(' ');
}

const fmtOdds = (v) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return String(v ?? '—');
  return n > 0 ? `+${n}` : `${n}`;
};

/**
 * The board Sol sees = the product menu: ML + run line per book. Totals are
 * NOT offered (the game-pick product can't ship them; rendering them invites
 * a pick the runner would filter — silent lost coverage). No -200 strip.
 */
export function renderMenuBoard({ homeTeam, awayTeam, boardRows = [] } = {}) {
  const lines = [];
  for (const b of boardRows) {
    const bits = [];
    if (b.ml_away != null || b.ml_home != null) {
      bits.push(`ML: ${awayTeam} ${fmtOdds(b.ml_away)} / ${homeTeam} ${fmtOdds(b.ml_home)}`);
    }
    if (b.spread_away != null || b.spread_home != null) {
      const away = `${awayTeam} ${Number(b.spread_away) > 0 ? '+' : ''}${b.spread_away} (${fmtOdds(b.spread_away_odds)})`;
      const home = `${homeTeam} ${Number(b.spread_home) > 0 ? '+' : ''}${b.spread_home} (${fmtOdds(b.spread_home_odds)})`;
      bits.push(`Run line: ${away} / ${home}`);
    }
    if (bits.length) lines.push(`${b.vendor || b.displayName || 'book'}: ${bits.join(' | ')}`);
  }
  return lines.join('\n') || 'No sportsbook rows available.';
}

/** Tolerant finalize-JSON extraction: fenced block first, then bare object. */
export function parseSolFinal(text) {
  if (typeof text !== 'string' || !text) return null;
  const candidates = [];
  const fenced = text.match(/```json\s*([\s\S]*?)```/i);
  if (fenced) candidates.push(fenced[1]);
  const bare = text.match(/\{[\s\S]*\}/);
  if (bare) candidates.push(bare[0]);
  for (const c of candidates) {
    try {
      const obj = JSON.parse(c);
      if (obj && typeof obj.final_pick === 'string' && obj.final_pick.trim()) {
        return {
          final_pick: obj.final_pick.trim(),
          rationale: typeof obj.rationale === 'string' ? obj.rationale : '',
          confidence_score: Number.isFinite(Number(obj.confidence_score)) ? Number(obj.confidence_score) : null,
        };
      }
    } catch { /* try next candidate */ }
  }
  return null;
}

/**
 * F-5 discipline: bind Sol's pick text to a REAL board row. The stored price
 * is the best book price for the picked side/bet type — never Sol's prose.
 * Returns null when the pick can't be bound (runner treats as no pick).
 */
export function bindPickToBoard(finalPick, { homeTeam, awayTeam, boardRows = [] } = {}) {
  if (!finalPick || !boardRows.length) return null;
  const text = String(finalPick).toLowerCase();
  const matches = (team) => {
    if (!team) return false;
    const t = String(team).toLowerCase();
    return text.includes(t) || text.includes(t.split(' ').pop());
  };
  const homeHit = matches(homeTeam);
  const awayHit = matches(awayTeam);
  if (homeHit === awayHit) return null; // neither, or ambiguous both
  const side = homeHit ? 'home' : 'away';
  const team = homeHit ? homeTeam : awayTeam;

  const isRunLine = /run\s*line|[+-]\d+\.5\b/i.test(finalPick) && !/\bml\b|moneyline/i.test(finalPick);

  if (isRunLine) {
    let best = null;
    for (const b of boardRows) {
      const spread = side === 'home' ? b.spread_home : b.spread_away;
      const odds = side === 'home' ? b.spread_home_odds : b.spread_away_odds;
      if (spread == null || odds == null) continue;
      if (!best || Number(odds) > best.odds) {
        best = { spread: Number(spread), odds: Number(odds), book: b.vendor || b.displayName || null };
      }
    }
    if (!best) return null;
    const s = best.spread > 0 ? `+${best.spread}` : `${best.spread}`;
    return { pick: `${team} ${s} ${fmtOdds(best.odds)}`, type: 'spread', odds: best.odds, spread: best.spread, spreadOdds: best.odds, book: best.book, side };
  }

  let best = null;
  for (const b of boardRows) {
    const odds = side === 'home' ? b.ml_home : b.ml_away;
    if (odds == null) continue;
    if (!best || Number(odds) > best.odds) best = { odds: Number(odds), book: b.vendor || b.displayName || null };
  }
  if (!best) return null;
  return { pick: `${team} ML ${fmtOdds(best.odds)}`, type: 'moneyline', odds: best.odds, spread: null, spreadOdds: null, book: best.book, side };
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
      state.toolCallHistory.push({ token, quality: 'ok' });
      return { name, content: summary };
    } catch (e) {
      state.toolCallHistory.push({ token, quality: 'unavailable' });
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
  return { name: name || 'unknown', content: 'Tool not available.' };
}

const bestAcrossBooks = (values) => {
  let best = null;
  for (const v of values) {
    const n = Number(v);
    if (!Number.isFinite(n)) continue;
    if (best === null || n > best) best = n; // American odds: numerically larger = better payout
  }
  return best;
};

/**
 * Analyze one game with Sol. Returns the production result contract, or null
 * when no storable pick was produced (a lineup-gate throw from the scout
 * builder propagates — the runner logs it and the next tier retries).
 */
export async function analyzeGameSol(game, sportKey, options = {}) {
  const homeTeam = game.home_team?.full_name || game.home_team?.name || game.home_team;
  const awayTeam = game.away_team?.full_name || game.away_team?.name || game.away_team;
  const boardRows = Array.isArray(options.sportsbookOdds) ? options.sportsbookOdds : [];
  if (!boardRows.length) {
    console.warn(`[PickEngine] ${awayTeam} @ ${homeTeam}: no sportsbook rows — no pick this tier (odds discipline).`);
    return null;
  }

  const scout = await buildScoutReport(game, sportKey, { sportsbookOdds: options.sportsbookOdds });
  const scoutText = scout.garyText || scout.text || '';
  const board = renderMenuBoard({ homeTeam, awayTeam, boardRows });

  const session = await createOpenAISession({
    modelName: SOL_MODEL,
    systemPrompt: buildSolSystemPrompt(todayEST()),
    tools: toolDefinitions,
    thinkingLevel: 'high',
  });

  const state = { corpus: [{ content: scoutText }, { content: board }], toolCallHistory: [], grounding: 0 };
  let message = [
    `## SCOUT REPORT — ${awayTeam} @ ${homeTeam}`,
    scoutText,
    '',
    "## TONIGHT'S BOARD",
    board,
    '',
    `${awayTeam} @ ${homeTeam}. What's your best bet on this board?`,
  ].join('\n');
  let isFunctionResponse = false;
  const usage = { in: 0, out: 0 };
  let finalText = null;

  for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
    const res = await sendToOpenAISession(session, message, { isFunctionResponse });
    usage.in += res.usage?.prompt_tokens || 0;
    usage.out += res.usage?.completion_tokens || 0;
    if (res.toolCalls?.length) {
      const responses = [];
      for (const tc of res.toolCalls) responses.push(await executeToolCall(tc, sportKey, homeTeam, awayTeam, game, state));
      message = responses;
      isFunctionResponse = true;
      continue;
    }
    finalText = res.content;
    break;
  }

  let parsed = parseSolFinal(finalText);
  if (!parsed) {
    console.warn(`[PickEngine] ${awayTeam} @ ${homeTeam}: no valid final JSON — no pick this tier.`);
    return null;
  }

  // Hard rail: anti-fabrication. One corrective retry, then no pick this tier.
  let audit = auditPickRationale({ rationale: parsed.rationale }, state.corpus);
  if (audit.retryable.length > 0) {
    console.warn(`[PickEngine] statAudit: ${audit.retryable.length} untraceable claim(s) — one corrective retry`);
    const res = await sendToOpenAISession(session, buildStatAuditRetryMessage(audit.retryable), { isFunctionResponse: false });
    usage.in += res.usage?.prompt_tokens || 0;
    usage.out += res.usage?.completion_tokens || 0;
    const reparsed = parseSolFinal(res.content);
    const reaudit = reparsed ? auditPickRationale({ rationale: reparsed.rationale }, state.corpus) : null;
    if (!reparsed || reaudit.retryable.length > 0) {
      console.warn(`[PickEngine] still untraceable after retry — no pick this tier.`);
      return null;
    }
    parsed = reparsed;
    audit = reaudit;
  }

  const bound = bindPickToBoard(parsed.final_pick, { homeTeam, awayTeam, boardRows });
  if (!bound) {
    console.warn(`[PickEngine] "${parsed.final_pick}" did not bind to the board (off-menu or ambiguous) — no pick this tier.`);
    return null;
  }

  const cost = (usage.in * 5 + usage.out * 30) / 1e6;
  console.log(`[PickEngine/Sol] ✅ ${bound.pick} (conf ${parsed.confidence_score}) — ${usage.in.toLocaleString()} in / ${usage.out.toLocaleString()} out ≈ $${cost.toFixed(2)} @ ${bound.book}`);

  return {
    pick: bound.pick,
    type: bound.type,
    odds: bound.odds,
    confidence: parsed.confidence_score,
    homeTeam,
    awayTeam,
    league: normalizeSportToLeague(sportKey),
    sport: sportKey,
    rationale: parsed.rationale,
    spread: bound.spread ?? bestAcrossBooks(boardRows.map(b => b.spread_home)),
    spreadOdds: bound.spreadOdds,
    moneylineHome: bestAcrossBooks(boardRows.map(b => b.ml_home)),
    moneylineAway: bestAcrossBooks(boardRows.map(b => b.ml_away)),
    total: boardRows.find(b => b.total != null && b.total !== '')?.total ?? null,
    totalOdds: null,
    toolCallHistory: state.toolCallHistory,
    verifiedTaleOfTape: scout.verifiedTaleOfTape ?? null,
    injuries: scout.injuries ?? null,
    venue: scout.venue ?? null,
    _statAuditWarnings: audit.warnOnly.length ? audit.warnOnly : null,
    agentic: true,
  };
}
