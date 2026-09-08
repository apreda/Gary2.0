import { buildMlbJudgmentTickets, runMlbJudgment, MLB_JUDGMENT_POLICY } from './mlbJudgment.js';
import { pickSideOf, pickPointOf } from '../../closingLine.js';

/** A partial market must not make the only priced team Gary's forced winner. */
export function mlbJudgmentMarketError(game, sport) {
  if (!/^(?:baseball_)?mlb$/i.test(sport)) return null;
  const menu = buildMlbJudgmentTickets(game, game?.home_team, game?.away_team);
  if (menu.allowedTickets.length === 2) return null;
  return { error: 'The original MLB game menu needs both opposing priced outcomes. Refresh the market; missing prices cannot choose Gary\'s side.',
    code: 'market_unavailable', retryModel: false };
}

/** Compose the staged decision with the already-open, unchanged Gary session. */
export async function runMlbJudgmentSession({ game, homeTeam, awayTeam, deskText, researchBriefing, memory,
  originalToolResponses, messages, ask, research, journal, signal }) {
  const menu = buildMlbJudgmentTickets(game, homeTeam, awayTeam);
  const source = { ...menu, game: structuredClone(game), deskText, researchBriefing, memory,
    toolResponses: structuredClone(originalToolResponses), conversation: structuredClone(messages), odds_visibility: 'odds_visible' };
  return runMlbJudgment({ input: { ...menu, gameId: String(game.bdl_game_id ?? game.id),
    gameDate: new Date(game.commence_time).toLocaleDateString('en-CA', { timeZone: 'America/New_York' }), homeTeam, awayTeam },
  ask, research, signal, readMemory: async () => memory ? { text: memory.text, reviewed_games: memory.reviewed_games,
    expectations: memory.expectations, excluded: memory.excluded, unavailable: memory.unavailable } : null,
  record: (phase, envelope) => journal.record(phase, envelope, source) });
}

export function mlbJudgmentCardInstruction(judgment) {
  return `\n\nRECORDED MLB DECISION — FORMAT THIS EXACT CALL. Your sporting judgment and price assessment are saved. The final card must retain this ticket: ${JSON.stringify(judgment.final_ticket)}. Do not choose again or change the side, market, line or price. Explain your recorded whole-game judgment and its key uncertainty in your own voice. Sporting judgment: ${JSON.stringify(judgment.stress)}. Price decision: ${JSON.stringify(judgment.price)}. ${judgment.price.decision === 'decline' ? 'This remains your ordinary game call; state plainly in the rationale why you decline to endorse the wager at this price. Do not call it a recommended bet or a Winners selection.' : 'You endorsed this exact ticket; Winners selection is a later comparison with your other valid calls.'}`;
}

/** Formatting can shorten a team name, but cannot replace Gary's recorded ticket. */
export function attachMlbJudgment(pick, judgment) {
  const ticket = judgment?.final_ticket;
  if (!ticket || !judgment.receipts?.price_assessment || !judgment.run_id) throw new Error('MLB staged judgment incomplete');
  if (pick.type !== ticket.type || pickSideOf(pick) !== ticket.side || Number(pick.odds) !== ticket.odds
      || (ticket.type === 'spread' && (pickPointOf(pick) !== ticket.line || Number(pick.spread) !== ticket.line))) {
    throw new Error('Final MLB card changed the recorded side, market, line or price');
  }
  // Canonical spelling only, after the actual market identity has matched.
  pick.pick = ticket.pick;
  if (ticket.type === 'spread') pick.spreadOdds = ticket.odds;
  Object.assign(pick, { decision_policy: MLB_JUDGMENT_POLICY, judgment_run_id: judgment.run_id,
    price_endorsement: judgment.price.decision, read_winner: judgment.stress.winner === 'home' ? pick.homeTeam : pick.awayTeam,
    game_read: judgment.stress.whole_game_view, odds_visibility: 'odds_visible', _mlbJudgment: judgment });
  return pick;
}
