/**
 * Pure string helpers for reshaping the scout report text into THE DESK
 * (spec 2026-07-26). Section headers are the ═══ markers we own in
 * scoutReport/sports/mlb.js — these helpers never invent content, they
 * only move or annotate existing sections.
 */

/** Pull one ═══-headed section out of the report. Returns the section text
 *  (header included) and the report without it. Missing header → null + unchanged. */
export function extractSection(text, header) {
  const i = text.indexOf(header);
  if (i < 0) return { section: null, rest: text };
  const after = text.indexOf('\n═══', i + header.length);
  const end = after < 0 ? text.length : after;
  return { section: text.slice(i, end).trimEnd(), rest: (text.slice(0, i) + text.slice(end)).trim() };
}

/** Insert annotation lines directly under a section header. Missing header → unchanged. */
export function insertAfterHeader(text, header, lines) {
  const i = text.indexOf(header);
  if (i < 0) return text;
  const nl = text.indexOf('\n', i);
  if (nl < 0) return text + '\n' + lines;
  return text.slice(0, nl + 1) + lines + '\n' + text.slice(nl + 1);
}
