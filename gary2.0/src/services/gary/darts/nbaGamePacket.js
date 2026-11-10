/**
 * THE GAME PACKET ON NBA DARTS (founder, Nov 10 2026: every dart reads the game around the player; the NBA frame was three
 * lines a game). The same game read the side pick and the props desk read (nbaRead.js), built from the same desk, with the
 * day's news beside it, as the NFL darts have had on one-game nights since Nov 6 (nflGamePacket.js).
 *
 * No fallback that gives different data (founder, Oct 23 and Nov 6 2026): three tries here, then the league's run fails
 * before any ask and the next run tries again.
 */
import { oddsService } from '../../providers/oddsService.js';
import { buildScoutReport } from '../agentic/scoutReport/scoutReportBuilder.js';
import { buildNbaReadStory } from '../agentic/orchestrator/nbaRead.js';
import { etDate } from './dartsCommon.js';

const TRIES = 3;
const TRY_GAP_MS = 60 * 1000;

/** The game as the side pick reads it, for one frame of the NBA board: { story, news }. Throws when three tries can't build it. */
export async function nbaGamePacket(frame, { log = console.log, gapMs = TRY_GAP_MS } = {}) {
  for (let attempt = 1; ; attempt++) {
    try { return await buildPacket(frame); } catch (e) {
      if (attempt >= TRIES) throw new Error(`game packet for ${frame.matchup}: ${e.message}`);
      log(`NBA: game packet for ${frame.matchup}, try ${attempt} failed (${e.message}); trying again`);
      await new Promise((done) => setTimeout(done, gapMs));
    }
  }
}

async function buildPacket(frame) {
  const date = etDate(Date.parse(frame.commence));
  const games = await oddsService.getUpcomingGames('basketball_nba', { targetDate: date, gameId: String(frame.gameId) });
  const game = (games || []).find((g) => String(g.bdl_game_id ?? g.id) === String(frame.gameId));
  if (!game) throw new Error(`game ${frame.gameId} is not in the odds feed`);
  const scout = await buildScoutReport(game, 'basketball_nba', {});
  const desk = scout?.garyText || scout?.text || '';
  if (!desk) throw new Error('the scout report rendered empty');
  const read = await buildNbaReadStory(desk, { homeTeam: game.home_team, awayTeam: game.away_team, gameId: frame.gameId });
  if (!read?.story) throw new Error('the game read rendered empty');
  return { story: read.story, news: read.news || null };
}

/** The frame's block with the packet: the game's heading (the packet states the spread), the read, the day's news. */
export function nbaPacketBlock(frame) {
  const head = [frame.head?.game, /^Spread: /m.test(frame.packet.story) ? null : frame.head?.spread, frame.head?.total].filter(Boolean).join(' · ') || String(frame.block).split('\n')[0];
  return [head, frame.packet.story, frame.packet.news ? `TODAY'S NEWS\n${frame.packet.news}` : null].filter(Boolean).join('\n\n');
}
