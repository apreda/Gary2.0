// GARY'S BET (founder GO, Sep 24 2026): after the case, the same brain decides
// whether it is betting the ticket with real money, and how much. The ask
// carries product facts only: the bankroll, the minimum, what is already at
// risk. No rule for when to play, no favorite or dog preference, no target
// count. A missing or malformed answer is a pass; the free pick is untouched.
// Never fatal. Stored on the pick as `gary_bet` (props keep `bet` for the side).
//
// THE PARLAY QUESTION (founder GO, Sep 24 2026 night): the parlay of the day
// is built by the brain that makes the picks, at pick time. The same ask
// carries the ticket so far and the ticket's product facts, and he answers
// per ticket whether it is one for today's parlay (gary_bet.parlay, with one
// sentence for the ticket's line). SQL (parlay_lock) builds and locks the
// ticket from his yeses. No probabilities, no target price, no rule about who.
import { generateSolText } from '../insights/solText.js';
import { APP_WRITING_MODEL } from '../agentic/orchestrator/orchestratorConfig.js';

export const BET_MIN_DOLLARS = 100;
const dollars = (n) => `$${Math.round(Number(n) || 0).toLocaleString('en-US')}`;
const price = (p) => (Number(p) > 0 ? `+${Number(p)}` : String(Number(p)));

const clock = (iso) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? null : `${d.toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit' })} ET`; };

/** The parlay section of the ask, from public.parlay_ticket_state; empty once the ticket is locked. */
export function parlaySection(state) {
  if (!state || state.locked) return null;
  const legs = Array.isArray(state.legs) ? state.legs : [];
  const first = legs.map((l) => Date.parse(l.commence_time)).filter(Number.isFinite).sort((a, b) => a - b)[0];
  const lines = legs.map((l) => `- ${l.text} (${price(l.odds)})${l.matchup ? ` · ${l.matchup}` : ''}${clock(l.commence_time) ? ` · ${clock(l.commence_time)}` : ''}`);
  return [
    "TODAY'S PARLAY OF THE DAY: one ticket a day on the Darts page, for fun, never on your record.",
    legs.length ? `The ticket so far:
${lines.join('\n')}` : 'The ticket so far: no legs yet.',
    `It takes three to five legs; ${Math.max(0, 5 - legs.length)} more can go on. ${state.games_to_pick ?? '?'} of today's ${state.slate_games ?? '?'} games are still to be picked. The ticket locks 25 minutes before its first leg starts${first ? ` (${clock(new Date(first).toISOString())})` : ''}.`,
    "A leg can be a game, a prop or a dart. Two legs from one game only when they go together, like a quarterback and his receiver or a team and its starter; never two legs that need opposite things; every leg is a bet you would place on its own; the ticket is built to cash.",
  ].join('\n');
}

export function buildBetAsk({ league, tickets, bankroll, parlay = null }) {
  const section = parlaySection(parlay);
  const cash = bankroll && Number.isFinite(Number(bankroll.cash_on_hand_dollars))
    ? `Cash on hand: ${dollars(bankroll.cash_on_hand_dollars)} of your $10,000 bankroll.`
    : 'Cash on hand: the live balance is unavailable right now; your bankroll started at $10,000.';
  const open = (bankroll?.open_plays || []).map((p) => `- ${p.pick_text} (${p.league}${p.kind === 'prop' ? ' prop' : ''}), ${dollars(p.stake_dollars)} at risk`);
  const lines = tickets.map((t) => [
    `TICKET ${t.id}: ${t.pick} (${price(t.price)})${t.matchup ? ` — ${t.matchup}` : ''}${t.starts && clock(t.starts) ? `, ${clock(t.starts)}` : ''}`,
    'YOUR CASE:',
    String(t.rationale || '').trim(),
    t.case_away ? `THE AWAY SIDE'S CASE:\n${String(t.case_away).trim()}` : null,
    t.case_home ? `THE HOME SIDE'S CASE:\n${String(t.case_home).trim()}` : null,
  ].filter(Boolean).join('\n'));
  return [
    `You are Gary. You just made ${tickets.length === 1 ? 'this pick' : 'these picks'} and wrote the case for ${tickets.length === 1 ? 'it' : 'each one'}. Winners is your real money.`,
    cash,
    open.length ? `Already at risk today:\n${open.join('\n')}` : 'Nothing at risk yet today.',
    `A play is at least ${dollars(BET_MIN_DOLLARS)}, in whole dollars, and there is no maximum.`,
    '',
    lines.join('\n\n'),
    '',
    ...(section ? [section, ''] : []),
    `For each ticket, decide as the bettor: are you putting your money on it, and how much?${section ? ' And is it one for today\'s parlay?' : ''}`,
    'Your why is in words: no hit rates, no percentages, no probabilities, no break-even math, nothing about what a price asks for.',
    `Answer with JSON only: {"bets":[{"id":"...","play":true,"stake_dollars":${BET_MIN_DOLLARS},"why":"one or two sentences in your voice"${section ? ',"parlay":false,"parlay_line":"when parlay is true, one sentence for the ticket in your voice"' : ''}}]}. For a pass, "play": false and no stake. No fact, number or name that is not in your case.`,
  ].join('\n');
}

const pass = (why = '', parlay = false, parlayLine = '') => ({ play: false, stake_dollars: null, why, parlay, parlay_line: parlayLine });

export function parseBets(raw, tickets) {
  const out = new Map(tickets.map((t) => [t.id, pass()]));
  let parsed = null;
  try {
    const text = String(raw || '');
    const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    const body = fenced ? fenced[1] : text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1);
    parsed = JSON.parse(body.trim());
  } catch {
    return out;
  }
  for (const b of Array.isArray(parsed?.bets) ? parsed.bets : []) {
    const id = String(b?.id ?? '');
    if (!out.has(id)) continue;
    const why = String(b?.why ?? '').trim();
    const stake = b?.stake_dollars;
    const play = b?.play === true && typeof stake === 'number' && Number.isInteger(stake) && stake >= BET_MIN_DOLLARS;
    const parlay = b?.parlay === true;
    const parlayLine = parlay ? String(b?.parlay_line ?? '').trim() : '';
    out.set(id, play ? { play: true, stake_dollars: stake, why, parlay, parlay_line: parlayLine } : pass(why, parlay, parlayLine));
  }
  return out;
}

async function cashPosition(log) {
  try {
    const { supabaseAdmin, supabase } = await import('../../supabaseClient.js');
    const { data, error } = await (supabaseAdmin || supabase).rpc('winners_cash_position');
    if (error) throw error;
    return data;
  } catch (e) {
    log.warn(`[Bet] cash position unavailable (${e?.message || e}); Gary decides on the bankroll's start`);
    return null;
  }
}

async function parlayState(date, log) {
  try {
    const { supabaseAdmin, supabase } = await import('../../supabaseClient.js');
    const { data, error } = await (supabaseAdmin || supabase).rpc('parlay_ticket_state', { p_date: date });
    if (error) throw error;
    return data;
  } catch (e) {
    log.warn(`[Bet] parlay ticket unavailable (${e?.message || e}); no parlay question this time`);
    return null;
  }
}

/**
 * Gary's decision on each ticket of one game. `model` is the brain that wrote
 * the case; the app's writing model stands behind it. Returns a Map by ticket
 * id; every ticket is a pass on any failure.
 */
export async function writeGaryBets({ league, tickets, model, date = null, log = console } = {}) {
  const passes = () => new Map((tickets || []).map((t) => [t.id, pass()]));
  if (!tickets?.length) return { bets: passes(), model: model || APP_WRITING_MODEL };
  const day = date || new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
  const [bankroll, parlay] = await Promise.all([cashPosition(log), parlayState(day, log)]);
  const ask = buildBetAsk({ league, tickets, bankroll, parlay });
  for (const writer of [...new Set([model, APP_WRITING_MODEL].filter(Boolean))]) {
    try {
      const text = await generateSolText(ask, { model: writer, effort: 'medium', maxTokens: 1200 });
      const bets = parseBets(text, tickets);
      if (![...bets.values()].some((b) => b.play) && !/"bets"/.test(String(text))) {
        log.warn(`[Bet] ${writer}: the answer was not the JSON asked for`);
        continue;
      }
      return { bets, model: writer };
    } catch (e) {
      log.warn(`[Bet] ${writer} failed: ${e?.message || e}`);
    }
  }
  return { bets: passes(), model: model || APP_WRITING_MODEL };
}

/** The stored shape on a pick. */
export const betRecord = (bet, model) => ({
  play: !!bet?.play,
  stake_dollars: bet?.play ? bet.stake_dollars : null,
  why: bet?.why || '',
  parlay: !!bet?.parlay,
  parlay_line: bet?.parlay ? bet.parlay_line || '' : '',
  model: model || null,
  decided_at: new Date().toISOString(),
});
