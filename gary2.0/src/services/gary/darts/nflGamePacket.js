/**
 * THE GAME PACKET ON NFL DARTS (founder, Nov 6 2026: "all picks should get the same packet"). The same game read the side
 * pick and the props read (nflRead.js), built from the same desk; the news desk reads it and its report rides beside it.
 * The Zay Flowers over of Nov 5 named Joe Fagnano from a game row, and Fagnano's 91 passing yards sat on another ask's sheet.
 *
 * Every board from Nov 10 2026 (founder: "if its not done do it"): Sundays and the NBA too (nbaGamePacket.js). An ask
 * that carries more games than one ask can hold keeps each read's newest games (readFit.js). It began on one-game
 * boards (Nov 6). GARY_DARTS_PACKET_MAX_GAMES brings a limit back.
 *
 * No fallback that gives different data (founder, Oct 23 2026, and Nov 6 on this one: "it really shouldnt fail to build"):
 * three tries here, then the league's run fails before any ask and the next run tries again, as a failed desk does on props.
 */
import { oddsService } from '../../providers/oddsService.js';
import { buildScoutReport } from '../agentic/scoutReport/scoutReportBuilder.js';
import { buildNflReadStory } from '../agentic/orchestrator/nflRead.js';
import { etDate } from './dartsCommon.js';

export const packetOn = (games) => games <= Number(process.env.GARY_DARTS_PACKET_MAX_GAMES ?? 99);

const TRIES = 3;
const TRY_GAP_MS = 60 * 1000;

/** The game as the side pick reads it, for one frame of the NFL board. Throws when three tries can't build it. */
export async function nflGamePacket(frame, { log = console.log, gapMs = TRY_GAP_MS } = {}) {
  for (let attempt = 1; ; attempt++) {
    try { return await buildPacket(frame); } catch (e) {
      if (attempt >= TRIES) throw new Error(`game packet for ${frame.matchup}: ${e.message}`);
      log(`NFL: game packet for ${frame.matchup}, try ${attempt} failed (${e.message}); trying again`);
      await new Promise((done) => setTimeout(done, gapMs));
    }
  }
}

async function buildPacket(frame) {
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
