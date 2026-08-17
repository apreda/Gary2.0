/**
 * Verbatim rationale snippets (founder directive, Aug 17 2026): pick tweets
 * carry ONLY Gary's own words — whole sentences copied character-for-character
 * from the stored pick rationale. The model may SELECT sentences; nothing may
 * write, edit, shorten, or paraphrase them. The app and the feed are the same
 * Gary, word for word.
 */

const ABBREVIATION = /^(?:St|Jr|Sr|Mr|Mrs|Ms|Dr|vs|No)\.$/i;

/** Whole sentences of a rationale, abbreviation- and decimal-safe. */
export function splitSentences(text) {
  const out = [];
  for (const para of String(text ?? '').split(/\n+/)) {
    const t = para.trim();
    if (!t) continue;
    let start = 0;
    for (let i = 0; i < t.length; i++) {
      const ch = t[i];
      if (ch !== '.' && ch !== '!' && ch !== '?') continue;
      const next = t[i + 1];
      // "3.21 ERA" never has whitespace after the mid-number period.
      if (next !== undefined && !/\s/.test(next)) continue;
      const candidate = t.slice(start, i + 1).trim();
      const lastWord = candidate.match(/(\S+)$/)?.[1] ?? '';
      if (ABBREVIATION.test(lastWord)) continue;
      if (candidate) out.push(candidate);
      while (i + 1 < t.length && /\s/.test(t[i + 1])) i += 1;
      start = i + 1;
    }
    const tail = t.slice(start).trim();
    if (tail) out.push(tail);
  }
  return out;
}

const normWs = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();

/** Is `snippet` an exact substring of `rationale`, whitespace aside? */
export function isVerbatimSnippet(rationale, snippet) {
  const s = normWs(snippet);
  return s.length > 0 && normWs(rationale).includes(s);
}

/**
 * Deterministic selection when the model's choice fails verification: the
 * earliest sentence paired with the latest distinct sentence that fit the
 * budget together; a lone fitting sentence when no pair fits; null when
 * nothing fits whole. Sentences are never cut — no ellipsis, ever.
 * @returns {{ opening: string, closing: string } | null}
 */
export function fallbackVerbatimPair(rationale, budget) {
  const sentences = splitSentences(rationale);
  for (const opening of sentences) {
    for (let j = sentences.length - 1; j >= 0; j--) {
      const closing = sentences[j];
      if (closing === opening) continue;
      if (opening.length + closing.length <= budget) return { opening, closing };
    }
  }
  const solo = sentences.find((s) => s.length <= budget);
  return solo ? { opening: solo, closing: '' } : null;
}

// ── REASON-ONLY selection (founder, Aug 17 eve) ─────────────────────────────
// The two tweet lines must be Gary's REASONS — never the scene-setting
// opener, never a sentence that merely restates the bet, stake, or odds
// (the injected pick line between them already says the bet).

const STAKE = /\$\s?\d/;
const ODDS = /[-+]\d{3,4}\b/;
const WAGER_FIRST_PERSON = /\b(i(?:'|\u2019)?ll|i(?:'|\u2019)?m|i am)\b/i;

/** A sentence that carries analysis rather than restating the wager.
 *  Price-critique sentences ("-153 is too much for...") stay — a wrong
 *  price IS a reason; a first-person wager declaration at a price is not. */
export function isReasonSentence(sentence) {
  const t = String(sentence ?? '');
  if (STAKE.test(t)) return false;
  if (ODDS.test(t) && WAGER_FIRST_PERSON.test(t)) return false;
  return true;
}

/** The rationale's reason-bearing sentences, whole and in order. */
export function reasonCandidates(rationale) {
  return splitSentences(rationale).filter(isReasonSentence);
}

const digitGroups = (s) => (String(s).match(/\d[\d.,%]*/g) || []).length;

/**
 * Deterministic reason pair: stat-dense sentences first (concrete numbers
 * beat atmosphere), stable by position, original order preserved between the
 * two chosen. Sentences are never cut; nothing fitting returns null.
 * @returns {{ opening: string, closing: string } | null}
 */
export function fallbackReasonPair(rationale, budget) {
  const cands = reasonCandidates(rationale);
  if (!cands.length) return fallbackVerbatimPair(rationale, budget);
  const ranked = cands
    .map((s, i) => ({ s, i, d: digitGroups(s) }))
    .sort((a, b) => (b.d - a.d) || (a.i - b.i));
  for (const first of ranked) {
    for (const second of ranked) {
      if (second.s === first.s) continue;
      if (first.s.length + second.s.length <= budget) {
        const [a, b] = first.i < second.i ? [first, second] : [second, first];
        return { opening: a.s, closing: b.s };
      }
    }
  }
  const solo = ranked.find((r) => r.s.length <= budget);
  return solo ? { opening: solo.s, closing: '' } : null;
}
