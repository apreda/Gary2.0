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
