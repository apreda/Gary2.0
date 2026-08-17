/**
 * Team identity matching (leakage-audit findings 1-4, founder GO Aug 17 2026).
 *
 * Every one of the audited leaks came from matching teams by the LAST WORD of
 * their name — and MLB has exactly one collision: Sox. These helpers replace
 * that class with whole-name exact matching (standings) or longest-suffix
 * comparison (free text), so "White Sox" can never resolve to Boston again.
 * The standings payload has carried exact team objects all along; ambiguity
 * returns null — never a guess.
 */

import { foldName } from '../utils/nameUtils.js';

/** fold + strip non-alphanumerics to spaced word tokens: "St. Louis @ N.Y." -> "st louis ny" */
function foldWords(s) {
  return foldName(s).replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
}

/** Padded-substring test on word boundaries. */
function hasPhrase(textWords, phrase) {
  return ` ${textWords} `.includes(` ${phrase} `);
}

/**
 * Exact standings-row lookup by any whole form of the team's name —
 * display/full name, nickname, "location nickname", or abbreviation.
 * No substring matching; no match returns null.
 * @param {Array<{ team?: object }> | null | undefined} standings
 * @param {string} teamName
 */
export function findStandingsRow(standings, teamName) {
  const key = foldWords(teamName);
  if (!key) return null;
  const rows = Array.isArray(standings) ? standings : [];
  const formsOf = (t) => [
    t.display_name,
    t.full_name,
    t.name,
    t.location && t.name ? `${t.location} ${t.name}` : null,
    t.abbreviation,
  ];
  for (const row of rows) {
    if (formsOf(row?.team || {}).some((f) => f && foldWords(f) === key)) return row;
  }
  // Nickname vs display-name-only rows ("White Sox" vs "Chicago White Sox"):
  // a whole-word SUFFIX match is accepted only when it is UNIQUE across the
  // table — "Sox" suffixes both Sox rows and resolves to neither.
  const suffixHits = rows.filter((row) =>
    formsOf(row?.team || {}).some((f) => f && ` ${foldWords(f)}`.endsWith(` ${key}`)));
  return suffixHits.length === 1 ? suffixHits[0] : null;
}

/** Longest word-suffix of `name` present in `textWords`, in words (0 = none). */
function suffixScore(textWords, name) {
  const tokens = foldWords(name).split(' ').filter(Boolean);
  for (let len = tokens.length; len >= 1; len--) {
    if (hasPhrase(textWords, tokens.slice(-len).join(' '))) return len;
  }
  return 0;
}

/**
 * Which side a free-text pick names. Longest-suffix wins, so "White Sox ML"
 * scores 2 words for Chicago and only 1 ("Sox") for Boston. A tie or no
 * match returns null — never a guess.
 * @returns {'home'|'away'|null}
 */
export function pickSideByName(text, homeName, awayName) {
  const t = foldWords(text);
  if (!t) return null;
  const h = suffixScore(t, homeName);
  const a = suffixScore(t, awayName);
  if (h === 0 && a === 0) return null;
  if (h === a) return null;
  return h > a ? 'home' : 'away';
}

/**
 * Does a matchup string name BOTH teams of this game? Each side must match on
 * a suffix that the other side does not share — so in a Sox-vs-Sox week the
 * bare word "Sox" can never stand in for either club.
 */
export function matchupIncludesBothTeams(matchup, homeName, awayName) {
  const m = foldWords(matchup);
  if (!m) return false;
  const sideMatches = (name, otherName) => {
    const tokens = foldWords(name).split(' ').filter(Boolean);
    const otherLast = foldWords(otherName).split(' ').filter(Boolean).pop() || '';
    for (let len = tokens.length; len >= 1; len--) {
      const phrase = tokens.slice(-len).join(' ');
      if (len === 1 && phrase === otherLast) continue; // shared word proves nothing
      if (hasPhrase(m, phrase)) return true;
    }
    return false;
  };
  return sideMatches(homeName, awayName) && sideMatches(awayName, homeName);
}
