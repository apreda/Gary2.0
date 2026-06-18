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
// A stalled connection to the Gemini API otherwise hangs the whole nightly
// run — observed during the June 10 backfill (calls hung 8+ minutes).
const REQUEST_TIMEOUT_MS = 90_000;

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
  const lg = String(pick.league || '').toLowerCase();
  const isWC = lg.includes('world_cup') || lg === 'wc' || lg.includes('soccer_world_cup');
  // 2026 World Cup games are at NEUTRAL venues — except the three host nations,
  // who genuinely play at home. Everyone else has no home-field edge.
  const homeIsHost = ['united states', 'usa', ' usmnt', 'canada', 'mexico']
    .some((h) => String(pick.homeTeam || '').toLowerCase().includes(h.trim()));
  const neutralNote = (isWC && !homeIsHost)
    ? `NEUTRAL SITE: this is a 2026 World Cup match at a neutral venue — do NOT say either ` +
      `team is playing "at home", and do NOT cite home-field, home-crowd, or travel advantage. ` +
      `The "(home)" tag below is only bracket bookkeeping for which side is listed where.\n`
    : '';
  return (
    `You write a short, ESPN-style recap of a finished game FROM THE BETTING PERSPECTIVE — ` +
    `the voice of a sharp friend recapping last night: the drama, the prices, and how the bet fared, ` +
    `woven into one tight story.\n\n` +
    `GAME: ${pick.awayTeam} (away) @ ${pick.homeTeam} (home) — ${pick.league}\n` +
    neutralNote +
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
    `- "headline": a clean, professional game headline in plain English — the result and the one ` +
    `thing that decided it. 6-12 words. Lead with the team and what they actually did. ` +
    `NO betting jargon ("dogs", "chalk", "cover", "cashes"), NO hype verbs ("explodes", "erupts", ` +
    `"power show", "roll"), NO odds or prices in the headline, NO cliches or clickbait. ` +
    `Good: "Tigers take down the Astros behind Colt Keith's three homers". ` +
    `Bad: "Tigers roll as +106 dogs behind Colt Keith power show". No ending period.\n` +
    `- "recap": the 2-4 sentence body.\n` +
    `- "bullets": 2-4 short stat lines from the game — the night's hard numbers. ` +
    `Each bullet is at most ${MAX_BULLET_CHARS} characters. Facts STRICTLY from the evidence above. ` +
    `Add the betting lens ONLY where that exact price appears in the evidence: ` +
    `"Matt Olson 2 HR (+340 to homer)" is allowed only if a home-run prop price for Olson is ` +
    `listed in the evidence — otherwise the bullet is just "Matt Olson 2 HR". ` +
    `Other examples: "Burns 7 K over 5.1 IP"; "Over 9.5 cashed by 1.5 runs" (only if the total ` +
    `line is the bet above). Never invent a price, a line, or a stat.\n` +
    `- A player-prop bullet (shots, saves, goals, assists, tackles, passes, K's, HR) may carry a ` +
    `price ONLY if that exact player's prop price is printed in the evidence above. Soccer / World ` +
    `Cup games here have NO prop prices — so for those, every bullet is a plain stat line ` +
    `("Harry Kane 7 shots", "Livaković 7 saves"), NEVER "(over 4 at +115)". Do not attach a market ` +
    `that is not in the evidence.\n\n` +
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
 * Enforce "no invented prices" deterministically: a bullet may only carry a
 * betting price (American odds like +115 / -130) that LITERALLY appears in the
 * evidence. Flash sometimes invents prop odds for sports it has strong priors on
 * — soccer shots/saves especially — despite the prompt forbidding it (verified:
 * a WC recap shipped "Harry Kane 7 shots (over 4 at +115)" with no such prop in
 * existence). WC games carry no props, so any odds there are fabricated.
 *
 * This is NOT a heuristic fabrication detector (which guesses and would block a
 * pick) — it removes only a price the evidence provably does not contain, so a
 * made-up line can never reach the card. A real graded-prop price IS in the
 * evidence, so it survives. A spread/total like "+2.5" is untouched: \d{2,4}
 * requires a 2-to-4-digit American price, so "+2.5" / "9.5" never match.
 */
export function sanitizeBulletPrices(bullet, evidence) {
  const ev = String(evidence || '');
  const inEv = (p) => ev.includes(p);
  let out = String(bullet);
  // Drop any (...) group containing a price the evidence lacks ("(over 4 at +115)").
  out = out.replace(/\s*\([^()]*\)/g, (grp) => {
    const prices = grp.match(/[+-]\d{2,4}\b/g) || [];
    return prices.some((p) => !inEv(p)) ? '' : grp;
  });
  // Drop a bare "at +115" / "at -130" whose price isn't in the evidence.
  out = out.replace(/\s*\bat\s+([+-]\d{2,4})\b/gi, (m, p) => (inEv(p) ? m : ''));
  // Strip any remaining stray fabricated price token.
  out = out.replace(/[+-]\d{2,4}\b/g, (p) => (inEv(p) ? p : ''));
  return out.replace(/\s{2,}/g, ' ').replace(/\s+([.,;)])/g, '$1').trim();
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
  }, { timeout: REQUEST_TIMEOUT_MS });

  const prompt = buildPrompt({ pick, result, evidence });
  let response;
  try {
    response = await model.generateContent(prompt);
  } catch (e) {
    // One retry — covers the stalled-connection timeout above and transient 5xx.
    console.warn(`    [GameRecap] Flash call failed (${e.message}) — retrying once`);
    response = await model.generateContent(prompt);
  }
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
        .map((b) => sanitizeBulletPrices(b, evidence)) // strip any price the evidence can't source
        .filter(Boolean)
        .map((b) => (b.length > MAX_BULLET_CHARS ? b.slice(0, MAX_BULLET_CHARS).trimEnd() : b))
        .slice(0, MAX_BULLETS)
    : [];

  return { headline, recap, bullets };
}
