// THE BET TURN (founder GO, Oct 4 2026): "Gary's picks, Gary's bets, Gary's amounts, full agency for him to
// bet like a solo human; then we steer it like we steer game picks."
//
// What was wrong with the bet step in garyBet.js for football game picks:
//  - It was a separate call that saw only the case Gary wrote. Everything he read to make the pick was gone.
//  - He was asked "are you putting money on it, and how much?" and a hidden $300 line decided Winners. He
//    called a $300 bet "a modest bet, not a big one" on the day it put a pick on the board.
//  - Nothing told him how his picks and bets had done.
// The bet turn is asked INSIDE the pick session, right after the pick, with the whole desk still in front of
// him. Two decisions in order: Winners or it stays a pick, then how much. He sees his board (what is already on
// Winners and how much), his cash, and his league's THE BET text (constitution `betAwareness`): a bet is
// trusting a team with money, more money means more trust, and how much he trusts this team is his read.
//
// What is deliberately NOT in the ask (all tried and withdrawn on Oct 4 2026):
//  - His record. Shown "Laying points 5-11", he passed on a pick because "laying points has been where I've
//    lost this year". Record splits stay the founder's own reporting (public.gary_bet_ledger, jev/pickReasons.js).
//  - Any line naming a kind of case, team or game. He applies a named factor to every game.
//  - Risk labels or tiers to sort a bet into. He answers in his own words.
//
// A missing or malformed answer returns null and the caller falls back to garyBet.js.
import { parlaySection } from './garyBet.js';

// THE BET's amounts start at $200 (founder, Oct 4 2026: "$200-300, $300-400, $400+").
export const BET_TURN_MIN_DOLLARS = 200;

const dollars = (n) => `$${Math.round(Number(n) || 0).toLocaleString('en-US')}`;

// ON since the founder signed off on THE BET (Oct 4 2026). GARY_BET_IN_SESSION=0 closes it and football
// goes back to the separate bet call.
export const betTurnLive = () => process.env.GARY_BET_IN_SESSION !== '0';

export function buildBetTurn({ pick, awareness, bankroll = null, parlay = null }) {
  const cash = bankroll && bankroll.cash_on_hand_dollars != null && Number.isFinite(Number(bankroll.cash_on_hand_dollars))   // a missing balance is not $0
    ? `Cash on hand: ${dollars(bankroll.cash_on_hand_dollars)}. Your bankroll started at $10,000.`
    : 'Cash on hand: the live balance is unavailable right now; your bankroll started at $10,000.';
  const open = (bankroll?.open_plays || []).map((p) => `- ${p.pick_text} (${p.league}${p.kind === 'prop' ? ' prop' : ''}), ${dollars(p.stake_dollars)}`);
  const section = parlaySection(parlay);
  return [
    `You have made your pick: ${pick}. Now the bet, while everything you read for this game is still in front of you.`,
    '',
    'Winners is your real-money board: the picks you are actually betting. Two decisions, in this order:',
    '1. Does this pick go on Winners, or does it stay a pick?',
    '2. If it goes on Winners, how much are you putting on it, in whole dollars?',
    '',
    cash,
    open.length ? `On your Winners board and not yet settled:\n${open.join('\n')}` : 'Nothing is on your Winners board yet.',
    '',
    String(awareness).trim(),
    ...(section ? ['', section] : []),
    '',
    'Your why is in words: no hit rates, no percentages, no probabilities, no break-even math, nothing about what a price asks for.',
    `Answer with JSON only: {"winners":true,"stake_dollars":N,"why":"one or two sentences in your voice"${section ? ',"parlay":false,"parlay_line":"when parlay is true, one sentence for the ticket in your voice"' : ''}}, where N is your amount as a whole number. For a pick that stays a pick, "winners": false and no stake.${section ? ' The parlay mark is its own decision.' : ''} No fact, number or name that was not in front of you for this game.`,
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
  const winners = parsed.winners === true && typeof stake === 'number' && Number.isInteger(stake) && stake >= BET_TURN_MIN_DOLLARS;
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
export async function askBetInSession({ send, pick, awareness, model = null, date = null, log = console } = {}) {
  if (!String(awareness || '').trim()) return null;                              // no THE BET text for this league: the separate call stands in
  try {
    const day = date || new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
    const [bankroll, parlay] = await Promise.all([rpc('winners_cash_position', undefined, log), rpc('parlay_ticket_state', { p_date: day }, log)]);
    const reply = await send(buildBetTurn({ pick, awareness, bankroll, parlay }));
    const bet = parseBetTurn(reply);
    if (!bet) { log.warn('[Bet turn] the answer was not the JSON asked for'); return null; }
    return betTurnRecord(bet, model);
  } catch (e) {
    log.warn(`[Bet turn] failed: ${e?.message || e}`);
    return null;
  }
}
