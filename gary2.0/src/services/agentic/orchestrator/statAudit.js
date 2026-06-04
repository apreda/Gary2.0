/**
 * Post-generation stat audit
 *
 * The June 4 2026 fact-check traced every wrong stat in shipped rationales to
 * the same mechanism: the model citing a figure (velocity, xwOBA, batter-vs-
 * pitcher line, runs-per-game) that never appeared in the scout report, tool
 * responses, or grounding — i.e. filled in from 2024-era training memory.
 * The prompt rules forbid this but nothing enforced them.
 *
 * This module enforces them: it extracts high-fabrication-risk numeric claims
 * from a pick's rationale and checks each one appears somewhere in the data
 * the model was actually given (every non-assistant message in the session).
 * agentLoop uses the result to request ONE corrected rationale, then ships
 * with warnings attached if claims still don't trace.
 *
 * Matching is presence-based, not positional — a claimed number that appears
 * anywhere in the provided data passes. That allows rare false negatives
 * (right number, wrong attribution) but never false positives on numbers the
 * model could not have gotten from its data.
 */

// Canonicalize a numeric string so ".178", "0.178" and "0.1780" all compare equal.
function canon(numStr) {
  let s = String(numStr).replace(/,/g, '').trim();
  if (s.startsWith('.')) s = '0' + s;
  if (s.includes('.')) s = s.replace(/0+$/, '').replace(/\.$/, '');
  return s;
}

/**
 * Collect every numeric token from the data the model was given.
 * Corpus = all non-assistant messages (system prompt, scout report, tool
 * responses, grounding results, pass prompts). Assistant turns are excluded —
 * the model cannot self-certify a number by having written it earlier.
 */
export function buildNumericCorpus(messages) {
  const corpus = new Set();
  const addForms = (raw) => {
    const c = canon(raw);
    corpus.add(c);
    const n = Number(c);
    if (!Number.isFinite(n)) return;
    if (c.includes('.')) {
      // Rounded 1-decimal form: tool "90.13" supports a claimed "90.1"
      corpus.add(canon(n.toFixed(1)));
      // Cross-form equivalents — the same stat family prints as a rate in one
      // source and a percent in another (NHL "Sv% 90.13%" vs rationale ".901")
      if (n > 0 && n < 1) corpus.add(canon((n * 100).toFixed(1)));
      if (n > 1 && n <= 100) corpus.add(canon((n / 100).toFixed(3)));
    }
  };
  for (const m of (messages || [])) {
    if (!m || m.role === 'assistant') continue;
    const text = typeof m.content === 'string' ? m.content : JSON.stringify(m.content ?? '');
    for (const match of text.matchAll(/\d[\d,]*\.\d+|\.\d+|\d[\d,]*/g)) {
      addForms(match[0]);
    }
  }
  return corpus;
}

// A short context snippet so warnings/retry prompts can name the exact claim.
function snippet(text, index, length) {
  const start = Math.max(0, index - 25);
  const end = Math.min(text.length, index + length + 25);
  return text.slice(start, end).replace(/\s+/g, ' ').trim();
}

/**
 * Extract high-fabrication-risk numeric claims from rationale prose.
 * Deliberately NOT every number — odds, scores, and small counts are noisy
 * and low-risk. Each pattern below maps to a fabrication class observed in
 * the June 4 audit.
 */
// Windowed/derived stats ("over his last 5", ".948 in that span", "since the
// break") are computed by the model from game-level context — no tool emits
// them, so a corrective retry can't replace them with a sourced value.
// Cross-sport measurement on 171 shipped NBA/NHL rationales showed these were
// ~100% of non-MLB audit fires. They get a warning, not a retry.
const WINDOWED_CONTEXT = /\b(?:over|in|across|during|since)\b[^.]{0,40}?\b(?:last|past|recent|that span|the break|stretch|streak)\b|\b(?:last|past)\s+(?:\d+|few|two|three|four|five|six|seven|ten)\s+(?:games?|starts?|outings?|innings|days|weeks)\b/i;

export function extractNumericClaims(text) {
  if (!text || typeof text !== 'string') return [];
  const claims = [];
  const push = (m, value, kind, extra) => {
    const context = snippet(text, m.index, m[0].length);
    // Window detection needs more surrounding text than the display snippet —
    // "±25 chars" can truncate the phrase ("in that spa…") and miss the flag.
    const wideStart = Math.max(0, m.index - 70);
    const wideContext = text.slice(wideStart, m.index + m[0].length + 70);
    claims.push({
      value: canon(value),
      kind,
      context,
      windowed: WINDOWED_CONTEXT.test(wideContext),
      ...extra,
    });
  };

  // Pitch velocity: "95.3 mph" — the stale-training-data signature
  for (const m of text.matchAll(/(\d{2,3}(?:\.\d)?)\s*mph/gi)) push(m, m[1], 'velocity');

  // Three-decimal rate stats: .178 xwOBA, .912 OPS, .553 SLG, .418 BA.
  // Tools sometimes print the same family in percent form (NHL "Sv% 90.13%"
  // vs rationale ".917"), so accept the x100 percent-form as equivalent.
  for (const m of text.matchAll(/(?<![\d.])(0?\.\d{3})(?!\d)/g)) {
    const v = Number(m[1]);
    push(m, m[1], 'rate', {
      altValues: [canon((v * 100).toFixed(1)), canon((v * 100).toFixed(2))],
    });
  }

  // Decimal percentages: 40.8% whiff, 9.7% barrel rate — accept the /100
  // rate-form as equivalent for the same cross-format reason.
  for (const m of text.matchAll(/(\d{1,3}\.\d)\s*%/g)) {
    const v = Number(m[1]);
    push(m, m[1], 'percent', { altValues: [canon((v / 100).toFixed(3))] });
  }

  // Batter-vs-pitcher lines: "2-for-12" — also passes if the data carries the
  // equivalent batting average (tools print "0.167 AVG (12 AB)" not "2-for-12")
  for (const m of text.matchAll(/(\d{1,3})-for-(\d{1,3})/gi)) {
    const hits = Number(m[1]); const ab = Number(m[2]);
    const avgEquiv = ab > 0 ? canon((hits / ab).toFixed(3)) : null;
    push(m, m[2], 'h2h', { altValues: [canon(m[1]), avgEquiv].filter(Boolean), requireAll: [canon(m[1]), canon(m[2])] });
  }

  // Per-game aggregates: "1.8 runs per game", "6.7 RA/gm"
  for (const m of text.matchAll(/(\d{1,2}\.\d)\s*(?:runs per game|runs\/game|r\/g|rs\/gm|ra\/gm)/gi)) {
    push(m, m[1], 'per-game');
  }

  // Sample-size citations: "53 plate appearances", "26 AB" (2+ digits only)
  for (const m of text.matchAll(/(\d{2,3})\s*(?:plate appearances|at-bats|PA\b|AB\b)/g)) {
    push(m, m[1], 'sample');
  }

  return claims;
}

/**
 * Audit a pick's rationale against the session's provided data.
 * Returns { unsupported, retryable, warnOnly, checked }.
 * - retryable: untraceable claims a corrective re-prompt can actually fix
 *   (the sourced value exists or the claim should be dropped) — worth a retry.
 * - warnOnly: untraceable WINDOWED/derived claims (model-computed spans no
 *   tool emits) — a retry can't source these, so they only attach warnings.
 */
export function auditPickRationale(pick, messages) {
  const empty = { unsupported: [], retryable: [], warnOnly: [], checked: 0 };
  const rationale = pick?.rationale;
  if (!rationale || typeof rationale !== 'string') return empty;
  const corpus = buildNumericCorpus(messages);
  if (corpus.size === 0) return empty; // no data → nothing to audit against

  const claims = extractNumericClaims(rationale);
  const unsupported = [];
  const retryable = [];
  const warnOnly = [];
  const seen = new Set();
  for (const c of claims) {
    let ok;
    if (c.requireAll) {
      // X-for-Y: supported when both numbers trace, or the avg-equivalent does
      ok = c.requireAll.every(v => corpus.has(v)) || (c.altValues || []).some(v => corpus.has(v));
    } else {
      ok = corpus.has(c.value) || (c.altValues || []).some(v => corpus.has(v));
    }
    if (!ok && !seen.has(c.context)) {
      seen.add(c.context);
      const entry = `[${c.kind}${c.windowed ? '/windowed' : ''}] "...${c.context}..."`;
      unsupported.push(entry);
      (c.windowed ? warnOnly : retryable).push(entry);
    }
  }
  return { unsupported, retryable, warnOnly, checked: claims.length };
}

/**
 * One corrective re-prompt listing the untraceable figures. Process-level
 * instruction only: same decision, same side, same odds — just fix the prose.
 */
export function buildStatAuditRetryMessage(unsupported) {
  return `STAT AUDIT: The following figures in your rationale do NOT appear anywhere in the scout report, tool responses, or grounding results from this conversation — which means they came from your outdated training memory and may be wrong:

${unsupported.map((u, i) => `${i + 1}. ${u}`).join('\n')}

Rewrite "Gary's Take" with your decision, side, confidence, and odds EXACTLY the same. For each flagged figure: replace it with the correct value from your provided data if one exists, otherwise REMOVE the claim and write around it. Do not introduce any new numbers that are not in your provided data. Output the complete pick JSON again with the corrected rationale.`;
}
