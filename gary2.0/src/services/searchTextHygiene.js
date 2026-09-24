// SEARCH TEXT, WITHOUT THE SCAFFOLDING (founder GO, Sep 24 2026). Search
// answers reached the desk with the model narrating its own process ("I'll
// verify this strictly against fresh coverage…") and full link URLs Gary
// cannot open. Applied to the text handed to a caller, after every
// refusal/problem check has read the raw answer. Reporting, outlets, dates,
// quotes and every "unknown" statement stay.

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
