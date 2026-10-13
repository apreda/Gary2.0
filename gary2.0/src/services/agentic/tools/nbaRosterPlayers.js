/**
 * The BDL player ids for an NBA team's active roster, or for one named player on it. BDL's player search matches a
 * first or last name only, so "Shai Gilgeous-Alexander" found nobody, and the team filter on /players returned
 * every player in franchise history (audit, Oct 13 2026). The active roster is one cached read.
 */
import { ballDontLieService } from '../../ballDontLieService.js';

const plain = (name) => String(name || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/[^a-z ]/g, '').replace(/\s+/g, ' ').trim();

export async function nbaPlayerIdsFor(teamId, playerName) {
  const roster = await ballDontLieService.getActivePlayersComplete('basketball_nba', teamId);
  if (!playerName) return roster.map((p) => p.id);
  const wanted = plain(playerName);
  const found = roster.find((p) => plain(`${p.first_name} ${p.last_name}`) === wanted);
  if (!found) throw new Error(`NBA player identity unavailable: ${playerName}`);
  return [found.id];
}
