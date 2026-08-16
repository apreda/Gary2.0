/**
 * Gary's voice pass for the hub (founder, Jul 27 2026): a hub row never ships
 * as a bare mechanical line ("xERA worse than ERA → regression"). Every row
 * leaves carrying BOTH the computer's evidence AND Gary's read on tonight —
 * written by Sol over that evidence and the matchup, nothing else.
 *
 * The computed sentence is preserved in meta.evidence (the expanded card's
 * factual basis); `detail` becomes Gary's read. A failed pass changes nothing
 * — template details ship, the hub is never blocked.
 *
 * Jul 29: routed through the sessionManager provider seam. On the
 * subscription bridge GARY_CONTENT_MODEL_OVERRIDE (claude-sonnet-5 in the
 * insights plist) writes the reads at $0; with balances live it follows
 * GAME_PICK_MODEL (Sol) exactly as before.
 */
import { createGeminiSession, sendToSessionWithRetry } from '../agentic/orchestrator/sessionManager.js';
import { contentModel, contentModelCascade } from './solText.js';

// Lanes whose detail is already Gary's prose (sourced from a pick rationale or
// written by their own Sol pass) — rewriting them would launder better copy.
const SKIP_CATEGORIES = new Set([
  'gary_hr_threats', 'closer_watch', 'cut_list', 'fantasy_pickups',
  'two_start_week', 'return_watch',
  // Deterministic NFL fantasy evidence must keep its measured comparison copy;
  // a generic voice rewrite could introduce an unsupported role or matchup fact.
  'fantasy_usage', 'fantasy_trend', 'fantasy_matchup',
]);

// Football Hub rows are deliberately written as literal, provider-grounded
// comparisons. Until there is a football-specific fact-fenced prose pass, keep
// those details intact instead of asking a generic model to add matchup color
// that is not present in the evidence.
const DETERMINISTIC_LEAGUES = new Set(['nfl', 'ncaaf']);

const CHUNK = 60;

const systemPrompt = (dateLong) => `Today is ${dateLong}. You are Gary — the bettor whose picks publish in this app. You write as yourself, never as an AI or a system, and you have no favorite team.

Your training data is old; the evidence in front of you is current.

These are your hub reads — a sentence to three for each item, in your voice, about tonight. No emojis. Never mention data feeds, tools, or missing data.`;

const theAsk = (items) => `Tonight's hub items — each with its lane, subject, matchup, and the evidence behind it.

${JSON.stringify(items, null, 1)}

Write your read for each. Output:

\`\`\`json
{ "reads": [ { "i": 0, "take": "..." } ] }
\`\`\``;

const parseReads = (t) => {
  try {
    const m = String(t || '').match(/```json\s*([\s\S]*?)```/i) || String(t || '').match(/(\{[\s\S]*\})/);
    const o = JSON.parse(m[1]);
    return Array.isArray(o.reads) ? o.reads : null;
  } catch { return null; }
};

const todayLong = () => new Date().toLocaleDateString('en-US', {
  weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'America/New_York',
});

/**
 * Rewrite eligible rows' detail as Gary's read; keep evidence in meta.
 * Returns the same array (order preserved). Throws only on total failure of
 * every chunk — partial results apply partially.
 */
export async function applyGaryVoice(rows, { league = 'mlb' } = {}) {
  if (DETERMINISTIC_LEAGUES.has(String(league || '').trim().toLowerCase())) return rows;

  const eligible = rows
    .map((r, idx) => ({ r, idx }))
    .filter(({ r }) => r && r.detail && !SKIP_CATEGORIES.has(String(r.category || '')));
  if (!eligible.length) return rows;

  let applied = 0;
  for (let start = 0; start < eligible.length; start += CHUNK) {
    const slice = eligible.slice(start, start + CHUNK);
    const items = slice.map(({ r }, i) => ({
      i,
      lane: r.category,
      subject: r.headline,
      matchup: r.game || undefined,
      value: r.value || undefined,
      evidence: r.detail,
      facts: r.meta?.key_stats || undefined,
    }));

    let reads = null;
    for (const modelName of contentModelCascade()) {
      try {
        const session = await createGeminiSession({
          modelName,
          systemPrompt: systemPrompt(todayLong()),
          tools: [],
          thinkingLevel: 'high',
        });
        let res = await sendToSessionWithRetry(session, theAsk(items), {});
        reads = parseReads(res.content);
        if (!reads) {
          res = await sendToSessionWithRetry(session, 'Return your final JSON now.', {});
          reads = parseReads(res.content);
        }
        if (!reads) throw new Error('no valid reads JSON');
        if (modelName !== contentModel()) console.warn(`[Gary voice] provider recovered on ${modelName}`);
        break;
      } catch (error) {
        console.warn(`[Gary voice] ${modelName} failed — trying the next provider: ${error?.message || error}`);
      }
    }
    if (!reads) continue; // this chunk ships with template details

    for (const rd of reads) {
      const slot = slice[rd.i];
      const take = String(rd.take || '').trim();
      if (!slot || !take) continue;
      const row = slot.r;
      row.meta = { ...(row.meta || {}), evidence: row.detail };
      row.detail = take;
      applied++;
    }
  }
  console.log(`   [Gary voice] ${applied}/${eligible.length} ${league} rows carry Gary's read`);
  return rows;
}

export default { applyGaryVoice };
