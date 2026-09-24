// THE PLAYER A GAME-LOG CALL ASKS FOR (bug fix, founder GO Sep 24 2026).
// Both June game-log tools found an MLB player through BDL's /players search,
// which matches a single name token, is accent-sensitive, and returns 25 rows
// across every player in history. "Cristopher Sánchez", "Sánchez" and even
// "Cristopher Sanchez" returned nobody; a common last name could push the
// current player off the page; the last-name fallback could take the wrong
// Hernández. Accented names failed 8 of 12 calls Sep 15-23 (3% otherwise).
// The MLB lookup the Hub already uses answers instead: the active-player name
// index (accent-folded, ambiguity-safe), then the exact-name search for a
// player BDL flags inactive (IL, transactions).

import { ballDontLieService } from '../../../ballDontLieService.js';

const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[.']/g, '').trim().toLowerCase();

/**
 * The BDL player for an MLB name, shaped for the June tools' own matching
 * (first/last as the caller spelled them, so its exact-name check passes on
 * the confirmed identity), or null when no single player matches.
 */
export async function resolveMlbToolPlayer(name) {
  const key = norm(name);
  if (!key) return null;
  let hit = null;
  try { hit = (await ballDontLieService.getMlbActivePlayerNameIndex())?.get(key) || null; } catch { hit = null; }
  if (!hit) {
    try { hit = await ballDontLieService.findMlbPlayerIdByExactName(name); } catch { hit = null; }
  }
  if (!hit?.id) return null;
  const parts = String(name).trim().split(/\s+/);
  return { id: hit.id, first_name: parts.slice(0, -1).join(' '), last_name: parts.at(-1), team: hit.teamAbbr ? { abbreviation: hit.teamAbbr } : null };
}
