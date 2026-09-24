// SEARCH TEXT, WITHOUT THE SCAFFOLDING (founder GO, Sep 24 2026). Search
// answers reached the desk with the model narrating its own process ("I'll
// verify this strictly against fresh coverage…"), full link URLs Gary cannot
// open, and, in the pen reports, lists of what the search could not find.
// Applied to the text handed to a caller, after every refusal/problem check
// has read the raw answer. Reporting, outlets, dates and quotes stay.

const NARRATION = /^(?:I[’']ll|I will|I[’']m going to|I am going to|Let me)\b/;

/** The first sentence, when it only narrates the search. */
function dropNarration(text) {
  const lead = text.match(/^\s*([^\n]*?[.!?])(\s+|$)/);
  if (!lead || !NARRATION.test(lead[1].trim()) || lead[1].length > 400) return text;
  return text.slice(lead[0].length);
}

export function cleanSearchText(text) {
  if (typeof text !== 'string' || !text.trim()) return text;
  let out = dropNarration(text);
  out = out.replace(/\[([^\]\n]+)\]\((https?:\/\/[^)\s]+)\)/g, '$1');
  out = out.replace(/[ \t]*\((?:source:\s*)?https?:\/\/[^)\s]+\)/gi, '');
  out = out.replace(/<https?:\/\/[^>\s]+>/g, '');
  out = out.replace(/(^|[\s(])https?:\/\/[^\s)<>\]]+/g, '$1');
  return out.replace(/[ \t]+$/gm, '').replace(/\n{3,}/g, '\n\n').trim();
}

/** A { success, data } search result with its text cleaned; anything else unchanged. */
export function withCleanText(result) {
  return result && typeof result === 'object' && typeof result.data === 'string'
    ? { ...result, data: cleanSearchText(result.data) }
    : result;
}

/**
 * Pen reports only: drop the "## … unknown …" sections. The pen ledger above
 * them already states every arm's availability is UNKNOWN unless a report
 * says otherwise, so the list repeats that line arm by arm.
 */
export function dropUnknownSections(text) {
  if (typeof text !== 'string') return text;
  const parts = text.split(/(?=^#{1,4} )/m);
  return parts.filter((part) => !/^#{1,4} [^\n]*unknown/i.test(part)).join('').replace(/\n{3,}/g, '\n\n').trim();
}
