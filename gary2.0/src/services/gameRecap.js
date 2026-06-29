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
    `- "headline": a betting-WIRE headline (not a generic ESPN recap). LEAD with the team + what ` +
    `they actually did (the result), THEN the betting outcome — did the side cover, did the ML ` +
    `clear, did the total go over/under. 6-12 words. You MAY use the price/line from THE BET line ` +
    `("-196 ML", "the -1.5", "the 9.5 total") but NEVER invent another number. This is the GAME'S ` +
    `betting story, NOT the bettor's bet — "Gary cashed" belongs on the receipt, never in the ` +
    `headline. Plain, sharp, no hype verbs ("explodes", "erupts", "power show"), no clickbait, no ` +
    `exclamation, no ending period. ` +
    `Good: "Orioles fail to cover -196 in a 6-4 loss to the Nationals", ` +
    `"Canada win 1-0 but fail to cover the 1.5 spread", "Brazil beat Japan 2-1 as the Over 2.5 hits". ` +
    `Bad (bet-first): "Over 2.5 cashes in Brazil's 2-1 win". ` +
    `Bad (ESPN, no betting angle): "Tigers take down the Astros behind Colt Keith's three homers".\n` +
    `- "recap": the 2-4 sentence body.\n` +
    `- "bullets": 2-4 BETTING EVENTS that hit during the game — the markets that would have cashed: ` +
    `a home run, a strikeout / total prop, a goal scorer, the over/under total result, a player ` +
    `prop that landed. NOT the bettor's specific bet (the receipt covers that) — these are the ` +
    `game's notable betting moments either way. Each at most ${MAX_BULLET_CHARS} characters, facts ` +
    `STRICTLY from the evidence. Carry a price ONLY where that exact price is in the evidence ` +
    `("Matt Olson 2 HR (+340 to homer)" only if Olson's HR prop price is listed; else "Matt Olson ` +
    `2 HR"). The total is a fine bullet on its own: "Over 9.5 hit · 11 runs". Never invent a price, ` +
    `line, or stat.\n` +
    `- SOCCER / WORLD CUP: there is NO per-player box score, so do NOT invent an individual stat ` +
    `line (no "X 7 shots", no "Y 5 saves"). Use TEAM / result betting facts ("Over 2.5 goals hit · ` +
    `3 total", "Both teams to score: no", "Brazil 2, Japan 1") and a goal scorer ONLY if the ` +
    `evidence names who scored. Never invent a player's stat line or a market not in the evidence.\n\n` +
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

const SOCCER_STAT = /\b(\d+)\s+(saves?|shots?|goals?|assists?|tackles?|interceptions?|clearances?|blocks?|passes?|key\s+passes?|chances?|crosses?|dribbles?)\b/i;

/**
 * Deterministic ground-truth enforcement for SOCCER / World Cup recap bullets —
 * the sibling of sanitizeBulletPrices, but for STAT COUNTS. BDL FIFA returns NO
 * per-player box score, so an individual player-stat line in a WC recap is the
 * model inventing a number (verified live: "Nikola Vasilj 1 save" and "Dan Ndoye
 * 2 shots" shipped on a match whose grading flagged those exact stats as NO DATA).
 * For WC games a stat-count bullet survives ONLY if the evidence literally backs
 * the number next to the stat (e.g. a graded team-shots prop "shots ... 14"); a
 * score/result line ("Switzerland 4, Bosnia 1") carries no stat keyword and is
 * always kept. NOT a heuristic detector that blocks a pick — it only removes an
 * unverifiable stat line from recap text. Non-soccer leagues have real box scores,
 * so they always pass.
 */
export function keepRecapBullet(bullet, evidence, league) {
  const lg = String(league || '').toUpperCase();
  const isSoccer = lg === 'WC' || lg.includes('SOCCER') || lg.includes('WORLD CUP');
  if (!isSoccer) return true;
  const m = String(bullet || '').match(SOCCER_STAT);
  if (!m) return true; // score / outcome line — nothing to verify
  const num = m[1];
  const stem = m[2].toLowerCase().slice(0, 4); // save/shot/goal/assi/tack/pass…
  const ev = String(evidence || '').toLowerCase();
  const re = new RegExp(`\\b${num}\\b[^\\n]{0,40}${stem}|${stem}[^\\n]{0,40}\\b${num}\\b`, 'i');
  return re.test(ev);
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
        .filter((b) => keepRecapBullet(b, evidence, pick.league)) // drop unverifiable WC player-stat lines
        .filter(Boolean)
        .map((b) => (b.length > MAX_BULLET_CHARS ? b.slice(0, MAX_BULLET_CHARS).trimEnd() : b))
        .slice(0, MAX_BULLETS)
    : [];

  return { headline, recap, bullets };
}
