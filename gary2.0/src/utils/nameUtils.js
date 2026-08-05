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
