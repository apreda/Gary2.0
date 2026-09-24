// GARY'S BET (founder GO, Sep 24 2026): after the case, the same brain decides
// whether it is betting the ticket with real money, and how much. The ask
// carries product facts only: the bankroll, the minimum, what is already at
// risk. No rule for when to play, no favorite or dog preference, no target
// count. A missing or malformed answer is a pass; the free pick is untouched.
// Never fatal. Stored on the pick as `gary_bet` (props keep `bet` for the side).
import { generateSolText } from '../insights/solText.js';
import { APP_WRITING_MODEL } from '../agentic/orchestrator/orchestratorConfig.js';

export const BET_MIN_DOLLARS = 100;
const dollars = (n) => `$${Math.round(Number(n) || 0).toLocaleString('en-US')}`;
const price = (p) => (Number(p) > 0 ? `+${Number(p)}` : String(Number(p)));

export function buildBetAsk({ league, tickets, bankroll }) {
  const cash = bankroll && Number.isFinite(Number(bankroll.cash_on_hand_dollars))
    ? `Cash on hand: ${dollars(bankroll.cash_on_hand_dollars)} of your $10,000 bankroll.`
    : 'Cash on hand: the live balance is unavailable right now; your bankroll started at $10,000.';
  const open = (bankroll?.open_plays || []).map((p) => `- ${p.pick_text} (${p.league}${p.kind === 'prop' ? ' prop' : ''}), ${dollars(p.stake_dollars)} at risk`);
  const lines = tickets.map((t) => [
    `TICKET ${t.id}: ${t.pick} (${price(t.price)})${t.matchup ? ` — ${t.matchup}` : ''}`,
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
    `For each ticket, decide as the bettor: are you putting your money on it, and how much?`,
    `Answer with JSON only: {"bets":[{"id":"...","play":true,"stake_dollars":${BET_MIN_DOLLARS},"why":"one or two sentences in your voice"}]}. For a pass, "play": false and no stake. No fact, number or name that is not in your case.`,
  ].join('\n');
}

const pass = (why = '') => ({ play: false, stake_dollars: null, why });

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
    out.set(id, play ? { play: true, stake_dollars: stake, why } : pass(why));
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

/**
 * Gary's decision on each ticket of one game. `model` is the brain that wrote
 * the case; the app's writing model stands behind it. Returns a Map by ticket
 * id; every ticket is a pass on any failure.
 */
export async function writeGaryBets({ league, tickets, model, log = console } = {}) {
  const passes = () => new Map((tickets || []).map((t) => [t.id, pass()]));
  if (!tickets?.length) return { bets: passes(), model: model || APP_WRITING_MODEL };
  const bankroll = await cashPosition(log);
  const ask = buildBetAsk({ league, tickets, bankroll });
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
  model: model || null,
  decided_at: new Date().toISOString(),
});
