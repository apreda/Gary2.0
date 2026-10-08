// GARY'S NUMBER (founder GO, Oct 8 2026 evening: the judge decides, Gary sizes, his pass never vetoes). A pick the
// judge put on Winners, or a big game (TNF, SNF, MNF, an MLB playoff game, on whatever the judge said), where Gary
// passed on betting it: the house is playing it anyway and the amount is still his. One more question, same voice
// and the same cash-on-hand picture as his bet step. $100 minimum, no maximum, no default; $100 only when he cannot
// be reached before kickoff. The judge's grade is recorded on the board, never shown to him here.
// SQL: claim_big_game_stakes / set_big_game_stake (the gate marks the pick needs_gary_number).
import { generateSolText } from '../insights/solText.js';
import { APP_WRITING_MODEL } from '../agentic/orchestrator/orchestratorConfig.js';
import { BET_MIN_DOLLARS } from './garyBet.js';

export const NET_MINUTES_BEFORE_KICKOFF = 15;
export const MAX_ASK_ATTEMPTS = 3;
export const GARY_MODEL = 'claude-opus-5-5';
const dollars = (n) => `$${Math.round(Number(n) || 0).toLocaleString('en-US')}`;
const price = (p) => (Number(p) > 0 ? `+${Number(p)}` : String(Number(p)));
const clock = (iso) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? null : `${d.toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit' })} ET`; };

export function buildBigGameAsk({ league, ticket, bankroll }) {
  const cash = bankroll && Number.isFinite(Number(bankroll.cash_on_hand_dollars))
    ? `Cash on hand: ${dollars(bankroll.cash_on_hand_dollars)} of your $10,000 bankroll.`
    : 'Cash on hand: the live balance is unavailable right now; your bankroll started at $10,000.';
  const open = (bankroll?.open_plays || []).map((p) => `- ${p.pick_text} (${p.league}${p.kind === 'prop' ? ' prop' : ''}), ${dollars(p.stake_dollars)} at risk`);
  return [
    `You are Gary. You made this ${league} pick and passed on betting it. It is on the board tonight whether you bet it or not, and the amount is yours. Winners is your real money.`,
    cash,
    open.length ? `Already at risk today:\n${open.join('\n')}` : 'Nothing at risk yet today.',
    `A play is at least ${dollars(BET_MIN_DOLLARS)}, in whole dollars, and there is no maximum.`,
    '',
    `THE TICKET: ${ticket.pick} (${price(ticket.price)})${ticket.matchup ? ` — ${ticket.matchup}` : ''}${ticket.starts && clock(ticket.starts) ? `, ${clock(ticket.starts)}` : ''}`,
    'YOUR CASE:',
    String(ticket.rationale || '').trim(),
    ticket.case_away ? `THE AWAY SIDE'S CASE:\n${String(ticket.case_away).trim()}` : null,
    ticket.case_home ? `THE HOME SIDE'S CASE:\n${String(ticket.case_home).trim()}` : null,
    '',
    'How much goes on it, and why?',
    'Your why is in words: no hit rates, no percentages, no probabilities, no break-even math, nothing about what a price asks for.',
    `Answer with JSON only: {"stake_dollars":${BET_MIN_DOLLARS},"why":"one or two sentences in your voice"}. No fact, number or name that is not in your case.`,
  ].filter((l) => l !== null).join('\n');
}

/** His number, or null when the answer is not the JSON asked for. */
export function parseBigGameStake(raw) {
  try {
    const text = String(raw || '');
    const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    const body = fenced ? fenced[1] : text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1);
    const v = JSON.parse(body.trim());
    const stake = v?.stake_dollars;
    if (!(typeof stake === 'number' && Number.isInteger(stake) && stake >= BET_MIN_DOLLARS)) return null;
    return { stake_dollars: stake, why: String(v?.why ?? '').trim() };
  } catch { return null; }
}

export async function askGaryBigGameStake(row, { bankroll = null, log = console, generate = generateSolText } = {}) {
  const ask = buildBigGameAsk({ league: row.league, bankroll,
    ticket: { pick: row.pick_text, price: row.odds, matchup: row.matchup, starts: row.commence_time, rationale: row.rationale, case_home: row.case_home, case_away: row.case_away } });
  for (const writer of [...new Set([GARY_MODEL, APP_WRITING_MODEL].filter(Boolean))]) {
    try {
      const text = await generate(ask, { model: writer, effort: 'medium', maxTokens: 800 });
      const answer = parseBigGameStake(text);
      if (!answer) { log.warn(`[Big game] ${writer}: the answer was not the JSON asked for`); continue; }
      return { ...answer, model: writer };
    } catch (e) { log.warn(`[Big game] ${writer} failed: ${e?.message || e}`); }
  }
  return null;
}

async function cashPosition(client, log) {
  try { const { data, error } = await client.rpc('winners_cash_position'); if (error) throw error; return data; }
  catch (e) { log.warn(`[Big game] cash position unavailable (${e?.message || e}); Gary decides on the bankroll's start`); return null; }
}

/** One pass: every big game waiting for Gary's number gets asked, or the net at the last minutes. Returns the booked count. */
export async function runBigGameStakes(client, date, { ask = askGaryBigGameStake, log = console } = {}) {
  const { data: rows, error } = await client.rpc('claim_big_game_stakes', { p_date: date });
  if (error) throw error;
  let booked = 0;
  for (const row of rows || []) {
    const net = Number(row.minutes_to_kickoff) <= NET_MINUTES_BEFORE_KICKOFF || Number(row.attempts) > MAX_ASK_ATTEMPTS;
    let answer = null;
    if (!net) answer = await ask(row, { bankroll: await cashPosition(client, log), log });
    if (!answer && !net) { log.warn(`[Big game] ${row.league} ${row.pick_text}: no answer on attempt ${row.attempts}; asking again`); continue; }
    const args = answer
      ? { p_id: row.id, p_stake: answer.stake_dollars, p_why: answer.why, p_model: answer.model, p_net: false }
      : { p_id: row.id, p_stake: BET_MIN_DOLLARS, p_why: 'The house plays the big game; Gary could not be reached before kickoff.', p_model: null, p_net: true };
    const { data: saved, error: setError } = await client.rpc('set_big_game_stake', args);
    if (setError) throw setError;
    log.log(`[Big game] ${new Date().toISOString()} ${row.league} ${row.pick_text}: ${answer ? `Gary's number $${answer.stake_dollars}` : 'the $100 net'} → ${saved?.why || 'stale'}${answer?.why ? ` — ${answer.why}` : ''}`);
    if (saved?.admitted) booked++;
  }
  return booked;
}
