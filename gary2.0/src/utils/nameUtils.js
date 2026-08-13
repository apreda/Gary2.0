/**
 * Cross-source player-name folding (founder GO, Aug 5 2026 — the Luzardo
 * outage). The MLB Stats API carries diacritics ("Jesús Luzardo"); BDL mostly
 * doesn't ("Jesus Luzardo") — and a feed's spelling can differ day to day, so
 * the failure is intermittent. Every cross-source name join folds BOTH sides
 * through this: accents off (NFD + combining marks stripped), punctuation off,
 * case off, whitespace collapsed. Never compare raw name strings across sources.
 */
export const foldName = (s) => String(s || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/[.\-'’]/g, '')
  .replace(/\s+/g, ' ')
  .trim();

/**
 * The surname alone, generational suffix stripped (Aug 13 2026). Joining on
 * `name.split(' ').pop()` takes "Jr." as the last name, so "Jazz Chisholm Jr."
 * never matched a feed carrying last_name "Chisholm" — an everyday bat dropped
 * out of the desk's xStats silently. Any cross-source join that keys on a
 * surname folds through this, never through a bare `.pop()`.
 */
const NAME_SUFFIXES = new Set(['jr', 'sr', 'ii', 'iii', 'iv', 'v']);
export const lastNameOf = (s) => {
  const parts = foldName(s).split(' ').filter(Boolean);
  while (parts.length > 1 && NAME_SUFFIXES.has(parts[parts.length - 1])) parts.pop();
  return parts[parts.length - 1] || '';
};
