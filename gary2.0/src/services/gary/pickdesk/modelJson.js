/**
 * Read the JSON object out of a model answer.
 *
 * Every Winners lane was written when Codex was its only reader, and Codex
 * returns the bare object the ask requests. The Claude rungs added Sep 18 2026
 * answer just as correctly but narrate first ("I cross-checked all four props'
 * rationales... Here is the ranked assessment.\n\n```json\n{...}"), so a strip
 * anchored at position 0 never matched and a complete, correct comparison was
 * thrown away as "not a JSON object".
 *
 * This is the same scan gameRecap.parseRecapResponse and factCheck already use.
 * Order matters: a fenced block is tried before the outermost braces, because a
 * preamble can itself contain a brace and would otherwise poison the slice.
 * Nothing here repairs or rewrites an answer — it only finds the object the
 * model actually wrote. Returns null when nothing parses to an object.
 */
export function readModelJson(raw) {
  if (raw && typeof raw === 'object') return Array.isArray(raw) ? null : raw;
  const text = String(raw || '');
  const candidates = [];
  const fenceRe = /```(?:json)?\s*([\s\S]*?)```/gi;
  let m;
  while ((m = fenceRe.exec(text)) !== null) if (m[1]) candidates.push(m[1].trim());
  const first = text.indexOf('{'), last = text.lastIndexOf('}');
  if (first !== -1 && last > first) candidates.push(text.slice(first, last + 1));
  candidates.push(text.trim());
  for (const c of candidates) {
    try {
      const parsed = JSON.parse(c);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
    } catch { /* try the next candidate */ }
  }
  return null;
}
