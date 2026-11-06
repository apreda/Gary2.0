/**
 * THE GAME PACKET ON NFL DARTS (founder, Nov 6 2026: "all picks should get the same packet"). The same game read the side
 * pick and the props read (nflRead.js), built from the same desk; the news desk reads it and its report rides beside it.
 * The Zay Flowers over of Nov 5 named Joe Fagnano from a game row, and Fagnano's 91 passing yards sat on another ask's sheet.
 *
 * One-game boards only for now (founder GO on the order: the one-game Monday first, then check usage before a Sunday): a
 * 12-game morning could spend the Claude weekly limit before the picks run. GARY_DARTS_PACKET_MAX_GAMES moves the limit.
 */
import { oddsService } from '../../providers/oddsService.js';
import { buildScoutReport } from '../agentic/scoutReport/scoutReportBuilder.js';
import { buildNflReadStory } from '../agentic/orchestrator/nflRead.js';
import { etDate } from './dartsCommon.js';

export const packetOn = (games) => games <= Number(process.env.GARY_DARTS_PACKET_MAX_GAMES ?? 1);

/** The game as the side pick reads it, for one frame of the NFL board. Throws when the game or its desk can't be built. */
export async function nflGamePacket(frame) {
  const date = etDate(Date.parse(frame.commence));
  const games = await oddsService.getUpcomingGames('americanfootball_nfl', { targetDate: date, gameId: String(frame.gameId) });
  const game = (games || []).find((g) => String(g.bdl_game_id ?? g.id) === String(frame.gameId));
  if (!game) throw new Error(`game ${frame.gameId} is not in the odds feed`);
  const scout = await buildScoutReport(game, 'americanfootball_nfl', {});
  const desk = scout?.garyText || scout?.text || '';
  if (!desk) throw new Error('the scout report rendered empty');
  const { story } = await buildNflReadStory(desk, { homeTeam: game.home_team, awayTeam: game.away_team, gameId: frame.gameId, gameDate: date });
  return story;
}
