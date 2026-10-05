// THE BET TURN (founder GO, Oct 4 2026): "Gary's picks, Gary's bets, Gary's amounts, full agency for him to
// bet like a solo human; then we steer it like we steer game picks."
//
// What was wrong with the bet step in garyBet.js for football game picks:
//  - It was a separate call that saw only the case Gary wrote. Everything he read to make the pick was gone.
//  - He was asked "are you putting money on it, and how much?" and a hidden $300 line decided Winners. He
//    called a $300 bet "a modest bet, not a big one" on the day it put a pick on the board.
//  - Nothing told him how his picks and bets had done.
// The bet turn is asked INSIDE the pick session, right after the pick, with the whole desk still in front of
// him. Two decisions in order: Winners or pass, then how much. He sees his board (what is already on Winners
// and how much) and his cash. The awareness section names things to notice and never what to conclude.
//
// His record is NOT part of the ask (founder, Oct 4 2026): shown "Laying points 5-11", he passed on a pick
// because "laying points has been where I've lost this year". A favorite laying points can be the better bet
// than an underdog getting them; the bet comes from his read of this game. public.gary_bet_ledger and the
// reason tags (jev/pickReasons.js) stay as the founder's own reporting.
//
// A missing or malformed answer returns null and the caller falls back to garyBet.js.
import { BET_MIN_DOLLARS, parlaySection } from './garyBet.js';

const dollars = (n) => `$${Math.round(Number(n) || 0).toLocaleString('en-US')}`;

// OFF until the founder signs off on the wording below; GARY_BET_IN_SESSION=1 opens it for a run.
export const betTurnLive = () => process.env.GARY_BET_IN_SESSION === '1';

export const BET_AWARENESS = [
  'The pick and the bet are separate decisions.',
  'A bet needs the team you are backing to do something. Know what that is and who has to do it.',
];

export function buildBetTurn({ pick, bankroll = null, parlay = null }) {
  const cash = bankroll && bankroll.cash_on_hand_dollars != null && Number.isFinite(Number(bankroll.cash_on_hand_dollars))   // a missing balance is not $0
    ? `Cash on hand: ${dollars(bankroll.cash_on_hand_dollars)} of your $10,000 bankroll.`
    : 'Cash on hand: the live balance is unavailable right now; your bankroll started at $10,000.';
  const open = (bankroll?.open_plays || []).map((p) => `- ${p.pick_text} (${p.league}${p.kind === 'prop' ? ' prop' : ''}), ${dollars(p.stake_dollars)}`);
  const section = parlaySection(parlay);
  return [
    `You have made your pick: ${pick}. Now the bet, while everything you read for this game is still in front of you.`,
    '',
    'Winners is your real-money board: the picks you are actually betting. Two decisions, in this order:',
    '1. Does this pick go on Winners, or do you pass on betting it?',
    `2. If it goes on Winners, how much are you putting on it? At least ${dollars(BET_MIN_DOLLARS)}, in whole dollars, and there is no maximum.`,
    '',
    cash,
    open.length ? `On your Winners board and not yet settled:\n${open.join('\n')}` : 'Nothing is on your Winners board yet.',
    '',
    'BETTING AWARENESS',
    ...BET_AWARENESS.map((line) => `- ${line}`),
    ...(section ? ['', section] : []),
    '',
    'Your why is in words: no hit rates, no percentages, no probabilities, no break-even math, nothing about what a price asks for.',
    `Answer with JSON only: {"winners":true,"stake_dollars":${BET_MIN_DOLLARS},"why":"one or two sentences in your voice"${section ? ',"parlay":false,"parlay_line":"when parlay is true, one sentence for the ticket in your voice"' : ''}}. For a pass, "winners": false and no stake.${section ? ' The parlay mark is its own decision.' : ''} No fact, number or name that was not in front of you for this game.`,
  ].join('\n');
}

/** The decision, or null when the answer is not the JSON asked for. */
export function parseBetTurn(raw) {
  let parsed = null;
  try {
    const text = String(raw || '');
    const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    const body = fenced ? fenced[1] : text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1);
    parsed = JSON.parse(body.trim());
  } catch { return null; }
  if (!parsed || typeof parsed.winners !== 'boolean') return null;
  const stake = parsed.stake_dollars;
  const winners = parsed.winners === true && typeof stake === 'number' && Number.isInteger(stake) && stake >= BET_MIN_DOLLARS;
  if (parsed.winners === true && !winners) return null;                       // "on Winners" without a real stake is not an answer
  const parlay = parsed.parlay === true;
  return { winners, stake_dollars: winners ? stake : null, why: String(parsed.why ?? '').trim(), parlay, parlay_line: parlay ? String(parsed.parlay_line ?? '').trim() : '' };
}

/** The stored shape on a pick. `play` stays for everything that already reads it. */
export const betTurnRecord = (bet, model) => ({
  play: !!bet?.winners, winners: !!bet?.winners,
  stake_dollars: bet?.winners ? bet.stake_dollars : null,
  why: bet?.why || '', parlay: !!bet?.parlay, parlay_line: bet?.parlay ? bet.parlay_line || '' : '',
  model: model || null, asked: 'in_session', decided_at: new Date().toISOString(),
});

async function rpc(name, args, log) {
  try {
    const { supabaseAdmin, supabase } = await import('../../supabaseClient.js');
    const { data, error } = await (supabaseAdmin || supabase).rpc(name, args);
    if (error) throw error;
    return data;
  } catch (e) {
    log.warn(`[Bet turn] ${name} unavailable (${e?.message || e})`);
    return null;
  }
}

/**
 * Ask the bet turn in the pick's own session. `send(text)` sends one message into that session and resolves
 * with the reply text. Returns the stored record, or null when there is no usable answer (the caller then
 * runs the separate bet call).
 */
export async function askBetInSession({ send, pick, model = null, date = null, log = console } = {}) {
  try {
    const day = date || new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
    const [bankroll, parlay] = await Promise.all([rpc('winners_cash_position', undefined, log), rpc('parlay_ticket_state', { p_date: day }, log)]);
    const reply = await send(buildBetTurn({ pick, bankroll, parlay }));
    const bet = parseBetTurn(reply);
    if (!bet) { log.warn('[Bet turn] the answer was not the JSON asked for'); return null; }
    return betTurnRecord(bet, model);
  } catch (e) {
    if (e?.name === 'AbortError') throw e;
    log.warn(`[Bet turn] failed: ${e?.message || e}`);
    return null;
  }
}
