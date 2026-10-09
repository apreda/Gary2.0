// GARY'S AMOUNT ON A DART (founder GO, Oct 8 2026: "He already ranks them, and his order works ... We have our
// system for which ones to send to winners"). The rule is ours, never his: in MLB his FIRST dart in H+R+RBI and
// his first in total bases go on Winners (his order at the throw), plus the one first-inning dart he chooses; in the
// NFL his first receiving-yards dart (founder GO, Oct 9 2026: "lets just do receiving yards then for now"). He
// is asked only the amount: money at risk, whole dollars, $100 minimum, no maximum, his cash on hand and what is
// already riding in front of him. The ask is product facts only: no units, caps, odds rules or sizing advice.
// A pass or an unusable answer books nothing (founder, Oct 6 2026: nothing defaults to an amount). Home runs are
// never offered. Booking: the first-inning dart at the throw; an MLB player dart when the posted lineup confirms
// him, an NFL dart once the inactives are out and he is not ruled out (dartsScratch.js), through SQL admit_dart.
// Never fatal to the throw.
import { createModelSession, sendToSessionWithRetry } from '../agentic/orchestrator/sessionManager.js';
import { buildDartsSystemPrompt, dartWords, DARTS_MODEL, DARTS_EFFORT, REASON_WORDS, FORMULA_FILL } from './dartsBrain.js';
import { CATEGORY_LABEL } from './dartsScreen.js';

export const DART_BET_MIN = 100;
export const WINNERS_DART_KINDS = { MLB: ['hrr', 'tb', 'first_inning'], NFL: ['recyds'] };
const TIMEOUT_MS = 5 * 60 * 1000;
const dollars = (n) => `$${Math.round(Number(n) || 0).toLocaleString('en-US')}`;
const price = (p) => (Number(p) > 0 ? `+${Number(p)}` : String(Number(p)));
const clock = (iso) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? null : `${d.toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit' })} ET`; };
const cleanId = (v) => String(v || '').trim().replace(/^\[|\]$/g, '').toUpperCase();

async function cashPosition(supabase, log) {
  try {
    const { data, error } = await supabase.rpc('winners_cash_position');
    if (error) throw error;
    return data;
  } catch (e) {
    log.warn(`[Darts bet] cash position unavailable (${e?.message || e}); Gary decides on the bankroll's start`);
    return null;
  }
}

/** The ask: the dart(s), the bankroll, the question. */
export function buildDartBetAsk({ kind, darts, bankroll }) {
  const label = CATEGORY_LABEL[kind] || kind;
  const cash = bankroll && Number.isFinite(Number(bankroll.cash_on_hand_dollars))
    ? `Cash on hand: ${dollars(bankroll.cash_on_hand_dollars)} of your $10,000 bankroll.`
    : 'Cash on hand: the live balance is unavailable right now; your bankroll started at $10,000.';
  const open = (bankroll?.open_plays || []).map((p) => `- ${p.pick_text} (${p.league}${p.kind === 'prop' ? ' prop' : ''}), ${dollars(p.stake_dollars)} at risk`);
  const lines = darts.map((d) => [
    `[D${d.id}] ${dartWords(d)} (${price(d.odds)})${d.matchup ? ` — ${d.matchup}` : ''}${clock(d.commence_time) ? `, ${clock(d.commence_time)}` : ''}`,
    `YOUR REASON: ${String(d.reason || '').trim()}`,
  ].join('\n'));
  const first = kind === 'first_inning';
  return [
    first ? 'One of your first-inning darts today goes on Winners. Winners is your real money.'
      : `Your first ${label} dart today goes on Winners. Winners is your real money.`,
    cash,
    open.length ? `Already at risk today:\n${open.join('\n')}` : 'Nothing at risk yet today.',
    '',
    lines.join('\n\n'),
    '',
    first ? `Which one do you put your money on, and how much? Money at risk, in whole dollars, at least ${dollars(DART_BET_MIN)}, and there is no maximum. If none of them, say so.`
      : `How much do you put on it? Money at risk, in whole dollars, at least ${dollars(DART_BET_MIN)}, and there is no maximum.`,
    `Your why is one or two sentences in your voice. ${REASON_WORDS}`,
    `Answer with JSON only: {"bets":[{"id":"D${darts[0].id}","stake_dollars":${DART_BET_MIN},"why":"one or two sentences"}]}${first ? ' For none of them: {"bets":[]}, with a "why" line.' : ''}`,
  ].join('\n');
}

/** The answer if it holds: { dart, stake, why }, { pass: true, why } for none, or null. */
export function parseDartBet(raw, darts) {
  let parsed = null;
  try {
    const text = String(raw || '');
    const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    const body = fenced ? fenced[1] : text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1);
    parsed = JSON.parse(body.trim());
  } catch { return null; }
  if (!parsed || !Array.isArray(parsed.bets)) return null;
  if (!parsed.bets.length) return { pass: true, why: String(parsed.why ?? '').trim() };
  for (const b of parsed.bets) {
    const dart = darts.find((d) => `D${d.id}` === cleanId(b?.id));
    const stake = b?.stake_dollars;
    if (!dart || typeof stake !== 'number' || !Number.isInteger(stake) || stake < DART_BET_MIN) continue;
    return { dart, stake, why: String(b?.why ?? '').trim() };
  }
  return null;
}

/** Ask Gary the amount on these darts (one of them for first inning); store it on the dart. Never throws. */
export async function askDartBet({ supabase, kind, darts, dateLong, log = console }) {
  if (!darts?.length) return null;
  const label = CATEGORY_LABEL[kind] || kind;
  try {
    const bankroll = await cashPosition(supabase, log);
    const session = await createModelSession({
      modelName: DARTS_MODEL, systemPrompt: buildDartsSystemPrompt(dateLong), tools: [],
      thinkingLevel: DARTS_EFFORT, breakerLane: 'content', timeoutMs: TIMEOUT_MS,
    });
    let message = buildDartBetAsk({ kind, darts, bankroll });
    let model = DARTS_MODEL;
    for (let attempt = 0; attempt < 2; attempt++) {
      const res = await sendToSessionWithRetry(session, message, {});
      model = res.model || session.modelName || model;
      const parsed = parseDartBet(res.content, darts);
      if (parsed?.pass) {
        log.log(`[Darts bet] ${label}: Gary puts money on none of them${parsed.why ? ` — ${parsed.why}` : ''}`);
        return { pass: true, model };
      }
      if (parsed?.dart) {
        const bet = { play: true, stake_dollars: parsed.stake, why: parsed.why, model, decided_at: new Date().toISOString() };
        const { error } = await supabase.from('darts').update({ gary_bet: bet }).eq('id', parsed.dart.id).is('gary_bet', null);
        if (error) throw new Error(`darts gary_bet: ${error.message}`);
        log.log(`💵 [Darts bet] ${label}: ${dollars(parsed.stake)} on ${dartWords(parsed.dart)}${parsed.why ? ` — ${parsed.why}` : ''}`);
        return { dart: parsed.dart, bet };
      }
      message = `That was not the JSON asked for. Answer with JSON only: {"bets":[{"id":"D${darts[0].id}","stake_dollars":${DART_BET_MIN},"why":"one or two sentences"}]}`;
    }
    log.warn(`[Darts bet] ${label}: no usable amount; nothing goes on Winners`);
  } catch (e) {
    log.warn(`[Darts bet] ${label} failed: ${e?.message || e}; nothing goes on Winners`);
  }
  return null;
}

/** Book a dart on Winners (SQL admit_dart). Returns the SQL answer ('admitted', 'already', ...). Never throws. */
export async function bookDart(supabase, dartId, log = console) {
  try {
    const { data, error } = await supabase.rpc('admit_dart', { p_dart_id: dartId });
    if (error) throw error;
    if (data === 'admitted') log.log(`🏆 [Darts bet] D${dartId} is on Winners`);
    else if (data !== 'already') log.warn(`[Darts bet] D${dartId} not booked: ${data}`);
    return data;
  } catch (e) {
    log.warn(`[Darts bet] D${dartId} booking failed: ${e?.message || e}`);
    return 'error';
  }
}

/**
 * After the day's first throw of a category: Gary's amount on his #1 (H+R+RBI, total bases) or his one
 * first-inning dart. The first-inning dart is booked now; a player dart waits for the posted lineup.
 */
export async function betOnDarts({ supabase, date, dateLong, kinds, league = 'MLB', log = console }) {
  for (const kind of (kinds || []).filter((k) => (WINNERS_DART_KINDS[league] || []).includes(k))) {
    const label = CATEGORY_LABEL[kind] || kind;
    const { data: rows, error } = await supabase.from('darts')
      .select('id, kind, player, matchup, prop, bet, odds, reason, commence_time, rank, gary_bet, winners_candidate_id, model')
      .eq('game_date', date).eq('league', league).eq('kind', kind).is('scratched_at', null).order('rank', { ascending: true });
    if (error) { log.warn(`[Darts bet] ${label}: darts read failed (${error.message})`); continue; }
    if (!rows?.length) continue;
    if (rows.some((r) => r.gary_bet)) continue;   // asked already today
    const darts = kind === 'first_inning' ? rows : rows.slice(0, 1);
    if (kind !== 'first_inning' && String(darts[0].model || '').startsWith(FORMULA_FILL)) {
      log.log(`[Darts bet] ${label}: the first dart was the list's order, not Gary's; nothing goes on Winners`);
      continue;
    }
    const r = await askDartBet({ supabase, kind, darts, dateLong, log });
    if (r?.dart && kind === 'first_inning') await bookDart(supabase, r.dart.id, log);
  }
}
