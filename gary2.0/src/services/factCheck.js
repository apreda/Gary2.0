/**
 * Fact Check — grades Gary's pre-game rationale claim-by-claim against what
 * actually happened in the game.
 *
 * One cheap Flash call per graded game pick (no grounding, no tools): the model
 * gets the rationale, the pick + result, and an evidence pack (final score plus
 * whatever one cheap fetch provides — for MLB, the BDL per-game player stats we
 * already pull at grading time). It extracts the 3-6 most load-bearing
 * factual/predictive claims and grades each: right / wrong / unclear.
 * "unclear" means the evidence doesn't cover it — the model must never guess,
 * and notes may only cite the provided evidence.
 *
 * Rows land in `pick_fact_checks` (see supabase/migrations/
 * 20260610_create_pick_fact_checks.sql); the iOS app reads them under the anon
 * role to show "what Gary got right" on last night's picks.
 *
 * Callers: scripts/run-all-results.js (nightly, after results grading) and
 * scripts/run-fact-checks.js (manual/backfill).
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import {
  GEMINI_FLASH_MODEL,
  GEMINI_SAFETY_SETTINGS,
} from './agentic/orchestrator/orchestratorConfig.js';

const VALID_VERDICTS = new Set(['right', 'wrong', 'unclear']);
const MAX_CLAIM_CHARS = 90;

let genAI = null;
function getClient() {
  if (genAI) return genAI;
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;
  genAI = new GoogleGenerativeAI(apiKey);
  return genAI;
}

// ─────────────────────────────────────────────────────────────────────────────
// Evidence pack
// ─────────────────────────────────────────────────────────────────────────────

/** Format a BDL MLB ip value (5.2 = 5 innings + 2 outs) for display. */
function formatIp(ip) {
  return ip != null ? String(ip) : '?';
}

/**
 * Build the evidence string the model grades against. v1 evidence = the final
 * score (aligned to the pick's home/away) + for MLB, key lines from the BDL
 * per-game player stats (pitcher lines, home runs, multi-hit games, team hit
 * totals). Other leagues get the final score only — claims the score can't
 * answer come back "unclear", which is correct behavior.
 *
 * Optional: gradedProps (prop_results rows for this game) appends Gary's graded
 * props WITH their real betting prices — the recap pipeline uses this so slide
 * bullets can carry the betting lens ("+340 to homer") without inventing odds.
 * Fact-check callers don't pass it; their evidence is unchanged.
 *
 * @param {object} args
 * @param {string} args.league        e.g. 'MLB'
 * @param {string} args.homeTeam      pick's home team
 * @param {string} args.awayTeam      pick's away team
 * @param {number} args.homeScore     final score aligned to pick's home team
 * @param {number} args.awayScore     final score aligned to pick's away team
 * @param {Array|null} [args.mlbStats] BDL /mlb/v1/stats rows for this game (optional)
 * @param {Array|null} [args.gradedProps] prop_results rows for this game (optional):
 *   { player_name, bet, line_value, prop_type, odds, result, actual_value }
 */
export function buildGameEvidence({ league, homeTeam, awayTeam, homeScore, awayScore, mlbStats, gradedProps }) {
  const lines = [
    `FINAL SCORE: ${awayTeam} (away) ${awayScore} — ${homeTeam} (home) ${homeScore}`,
  ];

  if (league === 'MLB' && Array.isArray(mlbStats) && mlbStats.length > 0) {
    const teamHits = new Map();

    const pitchers = mlbStats.filter((s) => s.ip != null);
    if (pitchers.length) {
      lines.push('', 'PITCHING LINES:');
      // Highest workload first per team — the starter leads naturally.
      pitchers.sort((a, b) =>
        a.team_name === b.team_name
          ? (b.pitch_count || 0) - (a.pitch_count || 0)
          : String(a.team_name).localeCompare(String(b.team_name))
      );
      for (const p of pitchers) {
        const name = p.player?.full_name || `${p.player?.first_name || ''} ${p.player?.last_name || ''}`.trim();
        lines.push(
          `- ${name} (${p.team_name}): ${formatIp(p.ip)} IP, ${p.p_hits ?? 0} H, ` +
          `${p.p_runs ?? 0} R, ${p.er ?? 0} ER, ${p.p_bb ?? 0} BB, ${p.p_k ?? 0} K, ` +
          `${p.p_hr ?? 0} HR allowed${p.pitch_count != null ? `, ${p.pitch_count} pitches` : ''}`
        );
      }
    }

    const batters = mlbStats.filter((s) => s.at_bats != null);
    const hrLines = [];
    const notableLines = [];
    for (const b of batters) {
      teamHits.set(b.team_name, (teamHits.get(b.team_name) || 0) + (b.hits || 0));
      const name = b.player?.full_name || `${b.player?.first_name || ''} ${b.player?.last_name || ''}`.trim();
      if ((b.hr || 0) > 0) {
        hrLines.push(`- ${name} (${b.team_name}): ${b.hr} HR, ${b.rbi ?? 0} RBI`);
      } else if ((b.hits || 0) >= 2 || (b.rbi || 0) >= 2 || (b.stolen_bases || 0) >= 1) {
        const extras = [];
        if (b.doubles) extras.push(`${b.doubles} 2B`);
        if (b.triples) extras.push(`${b.triples} 3B`);
        if (b.rbi) extras.push(`${b.rbi} RBI`);
        if (b.stolen_bases) extras.push(`${b.stolen_bases} SB`);
        notableLines.push(
          `- ${name} (${b.team_name}): ${b.hits || 0}-for-${b.at_bats}` +
          (extras.length ? `, ${extras.join(', ')}` : '')
        );
      }
    }
    if (hrLines.length) lines.push('', 'HOME RUNS:', ...hrLines);
    if (notableLines.length) lines.push('', 'NOTABLE BATTING LINES:', ...notableLines);
    if (teamHits.size) {
      lines.push('', `TEAM HITS: ${[...teamHits.entries()].map(([t, h]) => `${t} ${h}`).join(', ')}`);
    }
  }

  if (Array.isArray(gradedProps) && gradedProps.length > 0) {
    lines.push('', "GARY'S GRADED PROPS FOR THIS GAME — these prices are real:");
    for (const p of gradedProps) {
      const raw = p.odds != null ? String(p.odds).trim() : '';
      const odds = raw ? (raw.startsWith('-') || raw.startsWith('+') ? raw : `+${raw}`) : null;
      lines.push(
        `- ${p.player_name} ${p.bet} ${p.line_value} ${p.prop_type}` +
        (odds ? ` (${odds})` : '') +
        ` — ${String(p.result || '').toUpperCase()}` +
        (p.actual_value != null ? ` (actual: ${p.actual_value})` : '')
      );
    }
  }

  return lines.join('\n');
}

// ─────────────────────────────────────────────────────────────────────────────
// Prompt + Flash call
// ─────────────────────────────────────────────────────────────────────────────

function buildPrompt({ pick, result, evidence }) {
  return (
    `You grade a sports betting analyst's PRE-GAME rationale against what ACTUALLY happened in the game.\n\n` +
    `GAME: ${pick.awayTeam} @ ${pick.homeTeam} (${pick.league})\n` +
    `THE PICK: ${pick.pick} — final result of the bet: ${String(result).toUpperCase()}\n\n` +
    `THE PRE-GAME RATIONALE:\n"""\n${pick.rationale}\n"""\n\n` +
    `WHAT ACTUALLY HAPPENED — this is the ONLY evidence you may use:\n${evidence}\n\n` +
    `TASK:\n` +
    `1. Extract the 3-6 most load-bearing FACTUAL/PREDICTIVE claims from the rationale — ` +
    `pre-game claims about what WOULD happen in this game or WHY the pick would win ` +
    `(e.g. a pitcher getting hurt by right-handed power, a bullpen holding late, an offense breaking out). ` +
    `Skip throwaway hedging; prefer the claims the pick actually leaned on.\n` +
    `2. Grade each claim STRICTLY against the evidence above:\n` +
    `   - "right": the evidence clearly shows the claim played out\n` +
    `   - "wrong": the evidence clearly shows it did not\n` +
    `   - "unclear": the evidence does not cover it. NEVER guess — if the evidence doesn't ` +
    `address the claim, the verdict is "unclear" even if you believe you know the answer.\n` +
    `3. For each claim write a short paraphrase (max ${MAX_CLAIM_CHARS} characters) and a one-line note ` +
    `explaining the verdict. The note may ONLY cite facts from the evidence above — no outside ` +
    `knowledge, no invented numbers. For "unclear", the note says what the evidence is missing.\n` +
    `4. Classify each claim's TYPE:\n` +
    `   - "data": the claim rests on cited statistics or verifiable facts (splits, xERA/xG, records, rest days, injuries, lineups)\n` +
    `   - "judgment": the claim rests on the analyst's own read — a spot, momentum, team character, a star's influence, ` +
    `a game-script call, or a view that the market/public over- or under-reacted\n\n` +
    `Output STRICT JSON only (no markdown fences, no prose):\n` +
    `{"claims":[{"claim":"...","verdict":"right","note":"...","claim_type":"data"}]}`
  );
}

/**
 * Pull the claims object out of the model text. Tolerates ```json fences and
 * stray prose by scanning for the outermost {...} (same approach as
 * parseWireItems in run-wire-items.js). Returns null if nothing parses.
 */
function parseFactCheckResponse(text) {
  if (!text || typeof text !== 'string') return null;
  const candidates = [];
  const fenceRe = /```(?:json)?\s*([\s\S]*?)```/gi;
  let m;
  while ((m = fenceRe.exec(text)) !== null) {
    if (m[1]) candidates.push(m[1].trim());
  }
  const first = text.indexOf('{');
  const last = text.lastIndexOf('}');
  if (first !== -1 && last > first) candidates.push(text.slice(first, last + 1));
  candidates.push(text.trim());

  for (const c of candidates) {
    try {
      const parsed = JSON.parse(c);
      if (parsed && Array.isArray(parsed.claims)) return parsed;
      if (Array.isArray(parsed)) return { claims: parsed };
    } catch {
      /* try next candidate */
    }
  }
  return null;
}

/** Coerce one parsed claim into a normalized {claim, verdict, note} (or null). */
function toClaim(item) {
  if (!item || typeof item !== 'object') return null;
  const verdict = String(item.verdict || '').trim().toLowerCase();
  if (!VALID_VERDICTS.has(verdict)) return null;
  const claim = item.claim != null ? String(item.claim).trim().slice(0, MAX_CLAIM_CHARS) : '';
  if (!claim) return null;
  const note = item.note != null && String(item.note).trim() ? String(item.note).trim() : null;
  // J-6 (judgment scoreboard): every claim carries its type so judgment-call
  // accuracy can be tracked separately from data-claim accuracy.
  const rawType = String(item.claim_type || '').trim().toLowerCase();
  const claim_type = rawType === 'judgment' ? 'judgment' : 'data';
  return { claim, verdict, note, claim_type };
}

/**
 * Fact-check one graded game pick. ONE Flash call, low temperature, evidence
 * only — no tools, no search, no fabrication.
 *
 * @param {object} args
 * @param {object} args.pick     pick object from daily_picks (homeTeam, awayTeam, league, pick, rationale)
 * @param {string} args.result   'won' | 'lost' | 'push'
 * @param {string} args.evidence evidence string from buildGameEvidence()
 * @returns {Promise<{claims: Array, right_count: number, wrong_count: number} | null>}
 */
export async function factCheckPick({ pick, result, evidence }) {
  if (!pick?.rationale || !String(pick.rationale).trim()) return null;
  const client = getClient();
  if (!client) {
    console.warn('    [FactCheck] GEMINI_API_KEY missing — skipping fact check.');
    return null;
  }

  const model = client.getGenerativeModel({
    model: GEMINI_FLASH_MODEL,
    safetySettings: GEMINI_SAFETY_SETTINGS,
    generationConfig: {
      temperature: 0.1,
      responseMimeType: 'application/json',
    },
  });

  const response = await model.generateContent(buildPrompt({ pick, result, evidence }));
  const parsed = parseFactCheckResponse(response.response.text());
  if (!parsed) return null;

  const claims = parsed.claims.map(toClaim).filter(Boolean);
  if (claims.length === 0) return null;

  return {
    claims,
    right_count: claims.filter((c) => c.verdict === 'right').length,
    wrong_count: claims.filter((c) => c.verdict === 'wrong').length,
  };
}
