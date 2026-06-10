/**
 * Game Recap — ESPN-style 2-4 sentence recap of a settled game Gary picked,
 * told from the betting perspective: the price Gary took, how the game swung,
 * and the bet's fate, in the voice of a sharp friend recapping the night.
 *
 * One cheap Flash call per graded game pick (no grounding, no tools): the model
 * gets the pick + odds + graded result and the same evidence pack the fact
 * checker grades against (final score plus, for MLB, the BDL per-game player
 * stats we already pull at grading time). Every fact in the recap must come
 * from that evidence — the model is forbidden from inventing innings, stats,
 * or prices it wasn't given. Other leagues get the final score only, so their
 * recaps stay score-and-price stories. Mirrors src/services/factCheck.js.
 *
 * Rows land in `game_recaps` (see supabase/migrations/
 * 20260610_create_game_recaps.sql); the iOS app reads them under the anon role
 * to tell last night's story on the Home morning view.
 *
 * Callers: scripts/run-all-results.js (nightly, after results grading) and
 * scripts/run-game-recaps.js (manual/backfill).
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import {
  GEMINI_FLASH_MODEL,
  GEMINI_SAFETY_SETTINGS,
} from './agentic/orchestrator/orchestratorConfig.js';

const MAX_HEADLINE_CHARS = 90;
const MAX_RECAP_CHARS = 700;
const MAX_BULLET_CHARS = 45;
const MAX_BULLETS = 4;

let genAI = null;
function getClient() {
  if (genAI) return genAI;
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;
  genAI = new GoogleGenerativeAI(apiKey);
  return genAI;
}

// ─────────────────────────────────────────────────────────────────────────────
// Prompt + Flash call
// ─────────────────────────────────────────────────────────────────────────────

function describeBetForPrompt(pick) {
  const parts = [pick.pick];
  if (pick.odds != null && String(pick.odds).trim()) {
    const raw = String(pick.odds).trim();
    const american = raw.startsWith('-') || raw.startsWith('+') ? raw : `+${raw}`;
    parts.push(`(odds ${american})`);
  }
  return parts.join(' ');
}

function buildPrompt({ pick, result, evidence }) {
  return (
    `You write a short, ESPN-style recap of a finished game FROM THE BETTING PERSPECTIVE — ` +
    `the voice of a sharp friend recapping last night: the drama, the prices, and how the bet fared, ` +
    `woven into one tight story.\n\n` +
    `GAME: ${pick.awayTeam} (away) @ ${pick.homeTeam} (home) — ${pick.league}\n` +
    `THE BET: ${describeBetForPrompt(pick)}\n` +
    `BET RESULT: ${String(result).toUpperCase()}\n\n` +
    `WHAT ACTUALLY HAPPENED — this is the ONLY source of facts you may use:\n${evidence}\n\n` +
    `RULES:\n` +
    `- Every fact (scores, names, stat lines, who homered, pitching lines) must appear in the ` +
    `evidence above. NEVER invent innings, sequences, stats, players, or anything else the evidence ` +
    `does not state. If the evidence is thin, write a shorter recap around the score and the price.\n` +
    `- The only betting price you know is the one in THE BET line. Do not invent other odds.\n` +
    `- Weave the bet's fate into the story (a +102 dog winning outright, a favorite that never ` +
    `showed up, a sweat that held on late). State prices naturally ("as a -130 favorite", "at +102").\n` +
    `- Voice: sharp, conversational, confident. No hedging, no exclamation points, no emojis, ` +
    `no cliches like "in a thrilling contest".\n` +
    `- Never use the words "we", "our", or "I" — the bettor is "Gary" if named at all.\n\n` +
    `OUTPUT:\n` +
    `- "headline": a punchy 6-12 word betting headline (e.g. "Angels roll as +102 dogs, Gary cashes"). ` +
    `No ending period.\n` +
    `- "recap": the 2-4 sentence body.\n` +
    `- "bullets": 2-4 short stat lines from the game — the night's hard numbers. ` +
    `Each bullet is at most ${MAX_BULLET_CHARS} characters. Facts STRICTLY from the evidence above. ` +
    `Add the betting lens ONLY where that exact price appears in the evidence: ` +
    `"Matt Olson 2 HR (+340 to homer)" is allowed only if a home-run prop price for Olson is ` +
    `listed in the evidence — otherwise the bullet is just "Matt Olson 2 HR". ` +
    `Other examples: "Burns 7 K over 5.1 IP"; "Over 9.5 cashed by 1.5 runs" (only if the total ` +
    `line is the bet above). Never invent a price, a line, or a stat.\n\n` +
    `Output STRICT JSON only (no markdown fences, no prose):\n` +
    `{"headline":"...","recap":"...","bullets":["...","..."]}`
  );
}

/**
 * Pull the {headline, recap} object out of the model text. Tolerates ```json
 * fences and stray prose by scanning for the outermost {...} (same approach as
 * parseFactCheckResponse in factCheck.js). Returns null if nothing parses.
 */
function parseRecapResponse(text) {
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
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
    } catch {
      /* try next candidate */
    }
  }
  return null;
}

/**
 * Filter prop_results rows down to the ones belonging to one game, by matching
 * the row's matchup string ("Cardinals @ Mets") against the pick's home/away
 * team names. Tries full-name containment first, then last-word ("Mets",
 * "Golden Knights" → "knights") so short and full team-name styles both match.
 * Callers fetch the date's prop_results once and filter per game.
 */
export function filterPropsForGame(propRows, homeTeam, awayTeam) {
  const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
  const h = norm(homeTeam);
  const a = norm(awayTeam);
  if (!h || !a) return [];
  const hLast = h.split(' ').pop();
  const aLast = a.split(' ').pop();
  return (propRows || []).filter((r) => {
    const m = norm(r.matchup);
    if (!m) return false;
    return (m.includes(h) || m.includes(hLast)) && (m.includes(a) || m.includes(aLast));
  });
}

/**
 * Generate the betting recap for one graded game pick. ONE Flash call, low
 * temperature, evidence only — no tools, no search, no fabrication.
 *
 * Evidence comes from buildGameEvidence() in factCheck.js — callers build it
 * once and can share it with factCheckPick(). When the evidence includes the
 * game's graded props (with real prices), the bullets may carry the betting
 * lens; otherwise they stay plain stat lines.
 *
 * @param {object} args
 * @param {object} args.pick     pick object from daily_picks (homeTeam, awayTeam, league, pick, odds)
 * @param {string} args.result   'won' | 'lost' | 'push'
 * @param {string} args.evidence evidence string from buildGameEvidence()
 * @returns {Promise<{headline: string, recap: string, bullets: string[]} | null>}
 */
export async function generateRecap({ pick, result, evidence }) {
  if (!pick?.pick || !evidence) return null;
  const client = getClient();
  if (!client) {
    console.warn('    [GameRecap] GEMINI_API_KEY missing — skipping recap.');
    return null;
  }

  const model = client.getGenerativeModel({
    model: GEMINI_FLASH_MODEL,
    safetySettings: GEMINI_SAFETY_SETTINGS,
    generationConfig: {
      temperature: 0.3,
      responseMimeType: 'application/json',
    },
  });

  const response = await model.generateContent(buildPrompt({ pick, result, evidence }));
  const parsed = parseRecapResponse(response.response.text());
  if (!parsed) return null;

  const headline = parsed.headline != null
    ? String(parsed.headline).trim().replace(/\.$/, '').slice(0, MAX_HEADLINE_CHARS)
    : '';
  const recap = parsed.recap != null
    ? String(parsed.recap).trim().slice(0, MAX_RECAP_CHARS)
    : '';
  if (!headline || !recap) return null;

  const bullets = Array.isArray(parsed.bullets)
    ? parsed.bullets
        .map((b) => String(b).trim())
        .filter(Boolean)
        .map((b) => (b.length > MAX_BULLET_CHARS ? b.slice(0, MAX_BULLET_CHARS).trimEnd() : b))
        .slice(0, MAX_BULLETS)
    : [];

  return { headline, recap, bullets };
}
