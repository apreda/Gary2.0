// GARY'S BRIEF (founder, Sep 23 2026): once Gary has written the full case for
// a game pick, he breaks it down himself: the three most important reasons,
// short enough for the Winners unveil's split-flap board, and a very short
// summary. The full case is never touched; it stays whole on the back of the
// pick card. Asked after the pick, of the same brain that wrote it, from the
// case alone (no new facts). Never fatal: a pick without a brief publishes as
// it always has and the unveil falls back to the stored reasons.

import { generateSolText } from '../insights/solText.js';
import { APP_WRITING_MODEL } from '../agentic/orchestrator/orchestratorConfig.js';

// Short enough for the flaps: 23 cells a line, two or three lines at most.
export const BRIEF_LIMITS = { reasons: 3, reasonWords: 8, reasonChars: 48, summaryWords: 30 };

const words = (s) => String(s || '').trim().split(/\s+/).filter(Boolean).length;

export function buildBriefAsk({ pick, matchup, rationale }) {
  const L = BRIEF_LIMITS;
  return [
    `You are Gary. You just made this pick and wrote the case for it.`,
    ``,
    `PICK: ${pick}`,
    matchup ? `GAME: ${matchup}` : null,
    ``,
    `YOUR CASE:`,
    String(rationale || '').trim(),
    ``,
    `Now break your case down for a fan who has a few seconds.`,
    `- "reasons": exactly ${L.reasons}, the ${L.reasons} most important things in your case, most important first. Each one is ${L.reasonWords} words or fewer (${L.reasonChars} characters at most), a plain line a fan gets at a glance. They are three different reasons, not one reason said three ways.`,
    `- "summary": one sentence of ${L.summaryWords} words or fewer: the whole case, in your voice.`,
    `Everything comes from your case above: no fact, number or name that is not in it. No internal labels or field names.`,
    ``,
    `Answer with JSON only: {"reasons":["...","...","..."],"summary":"..."}`,
  ].filter((l) => l !== null).join('\n');
}

/** The brief if it keeps every limit, else the problems with it. */
export function checkBrief(text) {
  const L = BRIEF_LIMITS;
  let obj;
  try {
    const raw = String(text || '');
    obj = JSON.parse(raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1));
  } catch {
    return { problems: ['the answer was not the JSON asked for'] };
  }
  const reasons = Array.isArray(obj?.reasons) ? obj.reasons.map((r) => String(r ?? '').trim()).filter(Boolean) : [];
  const summary = String(obj?.summary ?? '').trim();
  const problems = [];
  if (reasons.length !== L.reasons) problems.push(`"reasons" needs exactly ${L.reasons} lines (got ${reasons.length})`);
  reasons.forEach((r, i) => {
    if (words(r) > L.reasonWords || r.length > L.reasonChars) problems.push(`reason ${i + 1} is ${words(r)} words and ${r.length} characters; keep it to ${L.reasonWords} words and ${L.reasonChars} characters`);
  });
  if (!summary) problems.push('"summary" is missing');
  else if (words(summary) > L.summaryWords) problems.push(`the summary is ${words(summary)} words; keep it to ${L.summaryWords}`);
  return problems.length ? { problems } : { brief: { reasons, summary } };
}

/**
 * Gary's brief for one game pick, or null. `model` is the brain that wrote the
 * case; the app's writing model stands behind it. One re-ask names exactly
 * what missed a limit.
 */
export async function writeGaryBrief({ pick, matchup, rationale, model, log = console } = {}) {
  if (!pick || !String(rationale || '').trim()) return null;
  const ask = buildBriefAsk({ pick, matchup, rationale });
  for (const writer of [...new Set([model, APP_WRITING_MODEL].filter(Boolean))]) {
    try {
      let text = await generateSolText(ask, { model: writer, effort: 'medium', maxTokens: 1500 });
      let checked = checkBrief(text);
      if (checked.problems) {
        text = await generateSolText(`${ask}\n\nYour last answer missed: ${checked.problems.join('; ')}. Answer again, JSON only.`,
          { model: writer, effort: 'medium', maxTokens: 1500 });
        checked = checkBrief(text);
      }
      if (checked.brief) return { ...checked.brief, model: writer };
      log.warn(`[Brief] ${writer}: ${checked.problems.join('; ')}`);
    } catch (e) {
      log.warn(`[Brief] ${writer} failed: ${e?.message || e}`);
    }
  }
  return null;
}
