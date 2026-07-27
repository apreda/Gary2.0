/**
 * Hub tap-through id resolver (founder, Jul 27 2026): "if I click on a
 * player's name the player card should show up" — for EVERY player. Computers
 * emit rows however they source them; this single pass back-fills missing
 * player_id (and the player's team_id) from the active-player name index.
 *
 * Assignment happens ONLY on an exact normalized-name hit; ambiguous names
 * (two active players sharing one name) are indexed as null and skipped, so
 * the wrong player's card can never open. Rows it can't resolve ship exactly
 * as they arrived.
 */
import { ballDontLieService } from '../ballDontLieService.js';

const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[.']/g, '').trim().toLowerCase();

/** Candidate name strings for a row, most reliable first. */
function nameCandidates(row) {
  const out = [];
  if (row?.meta?.player) out.push(row.meta.player);
  const h = String(row?.headline || '');
  const beforeColon = h.split(':')[0].trim();
  if (beforeColon && beforeColon.length <= 30) out.push(beforeColon);
  // Leading two or three capitalized words ("Luis Castillo has...", "Shea Langeliers: ...")
  const lead = h.match(/^([A-ZÀ-Ž][\w'.-]+(?:\s+[A-ZÀ-Ž][\w'.-]+){1,2})/u);
  if (lead) {
    out.push(lead[1]);
    const two = lead[1].split(/\s+/).slice(0, 2).join(' ');
    if (two !== lead[1]) out.push(two);
  }
  return out;
}

export async function resolveInsightIds(rows) {
  const missing = (rows || []).filter((r) => r && r.player_id == null);
  if (!missing.length) return rows;
  let index;
  try {
    index = await ballDontLieService.getMlbActivePlayerNameIndex();
  } catch (e) {
    console.warn(`   [Resolve ids] index unavailable (${e.message}) — rows ship as-is`);
    return rows;
  }
  let hits = 0;
  for (const row of missing) {
    for (const cand of nameCandidates(row)) {
      let entry = index.get(norm(cand));
      // IL/transacted players sit outside the active index (active=false) —
      // fall through to the exact-name search before giving up on a candidate.
      if (!entry && norm(cand).includes(' ')) {
        entry = await ballDontLieService.findMlbPlayerIdByExactName(cand).catch(() => null);
      }
      if (!entry) continue; // no hit or ambiguous — try next candidate
      row.player_id = entry.id;
      if (row.team_id == null && entry.teamId != null) row.team_id = entry.teamId;
      hits++;
      break;
    }
  }
  if (hits) console.log(`   [Resolve ids] back-filled player_id on ${hits}/${missing.length} rows`);
  return rows;
}

export default { resolveInsightIds };
