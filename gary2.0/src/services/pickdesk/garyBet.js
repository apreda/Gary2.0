// GARY'S BET STEP (founder GO, Oct 6 2026). Gary as an independent bettor, end to end:
//   1. the pick: every game gets one because the app needs one (unchanged, every sport);
//   2. the bet: is this a pick he actually bets on Winners, or a pass;
//   3. the bankroll: how much, from $10,000 he manages himself.
// What was wrong before: the bet was one quick question after the case he had just argued (a separate call at
// medium effort for MLB and props), hidden $300 lines and a reader grade decided Winners, and he said yes to
// nearly everything. His bets and his passes won at the same rate (Sep 25 to Oct 5).
//
// The step is built the way the pick is built. He writes the case for betting each pick and the case for
// passing on it, then decides bet or pass and the amount. He reads only what he cannot know: the product fact
// (the pick is required, the bet is not), his goal and his bankroll (start, now, the season, the last seven days,
// yesterday's bets, what is riding). No notebook since Oct 7 2026 (founder: "I don't want him to write a plan ...
// that just corrupts future Gary's brain with no connection to what past Gary's brain really did"): his Oct 6 and
// Oct 7 entries had turned into sizing rules the step read back on every bet. No amount limits (founder, Oct 6 2026: "Gary should be able to manage
// his own bankroll completely on his own"); the bankroll trigger trims only to the cash he has. No record split
// by kind of bet, no rule about which picks, no parlay question (straight bets only for now).
//
// Asked inside the pick's own session wherever one exists (football games in agentLoop.js, props in every sport
// in propsBrain.js), at xhigh, while everything he read is still in front of him. MLB game picks (June engine,
// frozen) and recoveries ask it as a separate call carrying the case. A broken answer is a pass, never a bet.
// Playoff game picks are always on Winners, in every sport (founder, Oct 6 2026: "he can not pass on MLB game
// picks so he need to put his own amount on them it cant default to an amount"; "this is our playoff rules for
// every sport"). For them the step has no pass: he may say he would pass if he could, but he names his own amount,
// and an answer without one is asked again; nothing books a default. A playoff game is the slate's postseason flag
// (isPlayoffGame), the same test the Winners gate uses.
// Stored on the pick as `gary_bet` (props keep `bet` for the side).
//
// TWO ROUNDS (founder GO, Oct 7 2026: "I like this system ... put it in fully"). Round one: he writes the case for
// betting each pick and the case for passing on it (for a playoff game, the case for and against), then decides bet
// or pass. Round two, only for what he bets: "You're betting it. How much?", with his goal and bankroll in front of
// him. The cases calibrate the decision; the amount is its own question, not the line after the case against (his
// Oct 6-7 amounts fell to $100-$150, e.g. "accept that an early exit is the way this loses ... a normal-sized
// stake"). Both rounds run in one session, so the amount question still has both cases above it.
// START CLEAN, same GO: his bankroll shows no dollar amount he could copy: no last-7-days line, yesterday's bets and
// what is riding without their stakes; the start, now, season, his arc and the riding total stay.
import { createModelSession, sendToSessionWithRetry } from '../agentic/orchestrator/sessionManager.js';
import { APP_WRITING_MODEL } from '../agentic/orchestrator/orchestratorConfig.js';

export const BET_STEP = 'bet-step-oct6';
// GARY_BET_IN_SESSION=0 closes the in-session step; every pick then takes the separate call.
export const betTurnLive = () => process.env.GARY_BET_IN_SESSION !== '0';
export const BET_EFFORT = 'xhigh';

const dollars = (n) => `$${Math.round(Math.abs(Number(n) || 0)).toLocaleString('en-US')}`;
const price = (p) => (Number(p) > 0 ? `+${Number(p)}` : String(Number(p)));
const day = (d, opts = { month: 'short', day: 'numeric' }) => {
  const t = new Date(`${String(d).slice(0, 10)}T12:00:00Z`);
  return Number.isNaN(t.getTime()) ? String(d) : t.toLocaleDateString('en-US', { timeZone: 'UTC', ...opts });
};
const record = (r) => `${r?.won ?? 0}-${r?.lost ?? 0}${r?.push ? `-${r.push}` : ''}`;
const upDown = (r) => `${Number(r?.net) < 0 ? 'down' : 'up'} ${dollars(r?.net)} on ${dollars(r?.risked)} bet`;
const priced = (p) => p !== null && p !== undefined && p !== '' && Number.isFinite(Number(p));
const tag = (b) => `(${b.league}${b.kind === 'prop' ? ' prop' : ''}${b.automatic_pass ? ', automatic MLB game you passed on' : ''})`;
const ticketLine = (t) => `${t.pick}${priced(t.price) ? ` (${price(t.price)})` : ''}${t.matchup ? ` — ${t.matchup}` : ''}`;

export const WINNERS_FACT = {
  game: 'Every game gets a pick because the app needs one.',
  prop: 'Every game gets its prop picks because the app needs them.',
};
const FACT_REST = "Winners is your real-money board: only the picks you would bet even if you didn't have to make a pick go there. A pass costs nothing; the pick still shows in the app.";

export const AUTOMATIC_FACT = 'Every playoff game pick goes on Winners, so this pick is a bet whatever you decide. If it is one you would pass on if you could, say so; it is still a bet, and your decision is how much you put on it.';

// Founder, Oct 7 2026 ("I'm good with that goal"): no week in it. "Every week should end with more in it than the week
// started with" made a down week a reason to bet small ("after a losing week I'm keeping the stake small") or to chase;
// "a pass costs nothing, and a losing bet costs every dollar you put on it" read as be careful.
export const GOAL = 'YOUR GOAL: make money with your bankroll. You are measured in dollars won and lost, not in how many picks win.';

/** Gary's bankroll as he reads it, from public.winners_bankroll_brief(). A ledger pick_text carries its price. */
export function bankrollBlock(brief) {
  if (!brief || !Number.isFinite(Number(brief.equity_dollars))) {
    return 'YOUR BANKROLL: the live numbers are unavailable right now. It started at $10,000.';
  }
  const lines = [
    'YOUR BANKROLL',
    `You started with ${dollars(brief.start_dollars)} on ${day(brief.started_on, { month: 'long', day: 'numeric', year: 'numeric' })}. You have ${dollars(brief.equity_dollars)} now: ${dollars(brief.cash_dollars)} in cash and ${dollars(brief.riding_dollars)} riding on bets that have not settled.`,
    `Season: ${record(brief.season)}, ${upDown(brief.season)}.`,
  ];
  // His arc (founder, Oct 7 2026: "just so he fully understands his own arc, his own graph"): the bankroll at the end
  // of each day with a settled bet, and the season's high and low.
  const arc = brief.arc;
  if (Array.isArray(arc?.days) && arc.days.length) {
    lines.push(`Your bankroll at the end of each day: ${arc.days.map((d) => `${day(d.date)} ${dollars(d.dollars)}`).join(' · ')}.`);
    if (arc.high && arc.low) lines.push(`Season high: ${dollars(arc.high.dollars)} (${day(arc.high.date)}). Season low: ${dollars(arc.low.dollars)} (${day(arc.low.date)}).`);
  }
  const y = brief.yesterday;
  if (y) {
    const bets = Array.isArray(y.bets) ? y.bets : [];
    lines.push(bets.length ? `Yesterday (${day(y.date)}): ${record(y)}.` : `Yesterday (${day(y.date)}): no bets.`);
    for (const b of bets) lines.push(`- ${b.pick_text} ${tag(b)}: ${b.result}`);
  }
  const riding = Array.isArray(brief.riding) ? brief.riding : [];
  lines.push(riding.length ? `Riding right now (${dollars(brief.riding_dollars)} in all):` : 'Nothing riding right now.');
  for (const b of riding) lines.push(`- ${b.pick_text} ${tag(b)}`);
  return lines.join('\n');
}

/**
 * Round one: the cases and the decision. `inSession` = asked in the pick's own session (everything he read is still
 * there); otherwise the ask carries his case and both sides' cases. `kind` is 'game' or 'prop'.
 */
export function buildBetStep({ tickets, inSession = false, kind = 'game', automatic = false }) {
  const one = tickets.length === 1;
  const head = inSession
    ? [`WINNERS: YOUR BET. You made ${one ? 'your pick' : 'these picks'}:`, ...tickets.map((t) => `- TICKET ${t.id}: ${ticketLine(t)}`)]
    : [`You are Gary. You made ${one ? 'this pick' : 'these picks'} and wrote the case for ${one ? 'it' : 'each one'}.`, '',
      tickets.map((t) => [
        `TICKET ${t.id}: ${ticketLine(t)}`,
        'YOUR CASE:',
        String(t.rationale || '').trim(),
        t.case_away ? `THE AWAY SIDE'S CASE:\n${String(t.case_away).trim()}` : null,
        t.case_home ? `THE HOME SIDE'S CASE:\n${String(t.case_home).trim()}` : null,
      ].filter(Boolean).join('\n')).join('\n\n')];
  return [
    ...head,
    '',
    automatic ? AUTOMATIC_FACT : `${WINNERS_FACT[kind] || WINNERS_FACT.game} ${FACT_REST}`,
    '',
    automatic
      ? 'Write the case for this bet, then the case against it. You choose the amount next.'
      : `For ${one ? 'this pick' : 'each pick'}, write the case for betting it, then the case for passing on it. Then decide: bet it or pass. You choose the amount next.`,
    'Your why is in words: no hit rates, no percentages, no probabilities, no break-even math, nothing about what a price asks for.',
    automatic
      ? `Answer with JSON only: {"bets":[{"id":"${tickets[0]?.id ?? 'ticket'}","case_bet":"the case for this bet","case_pass":"the case against it","would_bet":true}]}; "would_bet": false if you would pass on it if you could. No fact, number or name that was not in front of you for this game.`
      : `Answer with JSON only: {"bets":[{"id":"${tickets[0]?.id ?? 'ticket'}","case_bet":"the case for betting it","case_pass":"the case for passing on it","bet":true,"why":"one or two sentences in your voice"}]}, one entry per ticket; for a pass, "bet": false. No fact, number or name that was not in front of you for this game.`,
  ].join('\n');
}

/** Round two, only for the tickets he is betting: how much, with his goal and bankroll in front of him. */
export function buildStakeStep({ tickets, brief = null }) {
  const one = tickets.length === 1;
  return [
    `You're betting ${one ? 'it' : 'these'}:`,
    ...tickets.map((t) => `- TICKET ${t.id}: ${ticketLine(t)}`),
    '',
    GOAL,
    '',
    bankrollBlock(brief),
    '',
    `How much do you put on ${one ? 'it' : 'each one'}? Whole dollars.`,
    'Your why is in words: no hit rates, no percentages, no probabilities, no break-even math, nothing about what a price asks for.',
    `Answer with JSON only: {"bets":[{"id":"${tickets[0]?.id ?? 'ticket'}","stake_dollars":N,"why":"one or two sentences in your voice"}]}, one entry per ticket, N a whole number of dollars.`,
  ].join('\n');
}

const pass = (extra = {}) => ({ bet: false, stake_dollars: null, why: '', case_bet: '', case_pass: '', ...extra });

const readJson = (raw) => {
  try {
    const text = String(raw || '');
    const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    const body = fenced ? fenced[1] : text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1);
    const parsed = JSON.parse(body.trim());
    return Array.isArray(parsed?.bets) ? parsed.bets : null;
  } catch { return null; }
};

/** Round one. { usable, decisions }: per ticket { bet, why, case_bet, case_pass, would_bet? }; a playoff game is a
 * bet whatever he says about passing. usable is false when the answer is not the JSON asked for. */
export function parseBetStep(raw, tickets, { automatic = false } = {}) {
  const decisions = new Map(tickets.map((t) => [t.id, pass()]));
  const answers = readJson(raw);
  if (!answers) return { usable: false, decisions };
  let matched = 0;
  for (const b of answers) {
    const id = String(b?.id ?? '');
    if (!decisions.has(id)) continue;
    matched += 1;
    const said = { why: String(b?.why ?? '').trim(), case_bet: String(b?.case_bet ?? '').trim(), case_pass: String(b?.case_pass ?? '').trim(),
      ...(automatic && typeof b?.would_bet === 'boolean' ? { would_bet: b.would_bet } : {}) };
    decisions.set(id, (automatic || b?.bet === true || b?.play === true) ? { bet: true, ...said } : pass(said));
  }
  return { usable: matched > 0, decisions };
}

/** Round two. { usable, stakes }: per ticket { stake_dollars, why } for a whole-dollar amount above zero.
 * usable is false unless every ticket asked has its amount. */
export function parseStakeStep(raw, tickets) {
  const stakes = new Map();
  for (const b of readJson(raw) || []) {
    const id = String(b?.id ?? '');
    const stake = b?.stake_dollars;
    if (!tickets.some((t) => t.id === id) || typeof stake !== 'number' || !Number.isInteger(stake) || stake <= 0) continue;
    stakes.set(id, { stake_dollars: stake, why: String(b?.why ?? '').trim() });
  }
  return { usable: tickets.length > 0 && tickets.every((t) => stakes.has(t.id)), stakes };
}

/** The decision and the amount together. A bet without its amount is a pass (a broken answer is never a bet). */
export function combineBets(tickets, decisions, stakes = new Map()) {
  return new Map(tickets.map((t) => {
    const d = decisions.get(t.id) || pass();
    const s = stakes.get(t.id);
    if (!d.bet || !s) return [t.id, d.bet ? pass({ ...d, bet: false }) : d];
    return [t.id, { ...d, bet: true, stake_dollars: s.stake_dollars, why: s.why || d.why }];
  }));
}

/** The stored shape on a pick. `play` and `winners` stay for everything that already reads them. */
export const betRecord = (bet, model, asked = 'separate') => ({
  play: !!bet?.bet, winners: !!bet?.bet,
  stake_dollars: bet?.bet ? bet.stake_dollars : null,
  why: bet?.why || '', case_bet: bet?.case_bet || '', case_pass: bet?.case_pass || '',
  ...(typeof bet?.would_bet === 'boolean' ? { would_bet: bet.would_bet } : {}),
  model: model || null, asked, step: BET_STEP, decided_at: new Date().toISOString(),
});

/** A playoff game, by the slate's postseason flag (the Winners gate reads the same row). Unknown is not a playoff game. */
export async function isPlayoffGame({ league, date, gameId }, log = console) {
  if (!league || !date || gameId == null) return false;
  try {
    const { supabaseAdmin, supabase } = await import('../../supabaseClient.js');
    const { data, error } = await (supabaseAdmin || supabase).from('daily_slate').select('postseason')
      .eq('date', date).eq('league', league).eq('bdl_game_id', Number(gameId)).maybeSingle();
    if (error) throw error;
    return data?.postseason === true;
  } catch (e) {
    log.warn(`[Bet] playoff check unavailable (${e?.message || e}); asked as a regular game`);
    return false;
  }
}

/** Gary's bankroll for the step. May be null; the step says so. */
export async function loadBankroll(log = console) {
  try {
    const { supabaseAdmin, supabase } = await import('../../supabaseClient.js');
    const client = supabaseAdmin || supabase;
    const briefRes = await client.rpc('winners_bankroll_brief');
    if (briefRes.error) log.warn(`[Bet] bankroll unavailable (${briefRes.error.message})`);
    return { brief: briefRes.error ? null : briefRes.data };
  } catch (e) {
    log.warn(`[Bet] bankroll unavailable (${e?.message || e})`);
    return { brief: null };
  }
}

const logBets = (tickets, bets, model, where, log) => log.log(`💵 GARY'S BET${tickets.length > 1 ? 'S' : ''} (${model}, ${where}): ${tickets.map((t) => {
  const b = bets.get(t.id);
  return `${t.pick} ${b?.play ? `$${b.stake_dollars}` : 'pass'}${b?.why ? ` — ${b.why}` : ''}`;
}).join(' · ')}`);

/**
 * Ask the step in the pick's own session. `send(text)` sends one message into that session and resolves with
 * the reply text. Returns a Map of stored records by ticket id, or null when there is no usable answer (the
 * caller then runs the separate call).
 */
export async function askBetInSession({ send, tickets, kind = 'game', automatic = false, model = null, log = console } = {}) {
  if (!tickets?.length) return null;
  try {
    const { brief } = await loadBankroll(log);
    const first = parseBetStep(await send(buildBetStep({ tickets, inSession: true, kind, automatic })), tickets, { automatic });
    if (!first.usable) { log.warn('[Bet] the answer in the session was not the JSON asked for'); return null; }
    const betting = tickets.filter((t) => first.decisions.get(t.id)?.bet);
    let stakes = new Map();
    if (betting.length) {
      const second = parseStakeStep(await send(buildStakeStep({ tickets: betting, brief })), betting);
      if (!second.usable && automatic) { log.warn('[Bet] no amount in the session for this playoff game pick'); return null; }
      stakes = second.stakes;
    }
    const bets = combineBets(tickets, first.decisions, stakes);
    const records = new Map(tickets.map((t) => [t.id, betRecord(bets.get(t.id), model, 'in_session')]));
    logBets(tickets, records, model, 'in the pick session', log);
    return records;
  } catch (e) {
    log.warn(`[Bet] the bet step in the session failed (${e?.message || e})`);
    return null;
  }
}

/**
 * The step as its own call, for MLB game picks and recoveries. `model` is the brain that wrote the case; the
 * app's writing model stands behind it. `automatic` (playoff game picks): no pass, and an answer without his own
 * amount is asked again, up to three tries. Returns { bets: Map of stored records, model }; every ticket is a
 * pass when no brain answers, and a playoff game then stays off Winners (nothing books a default).
 */
export async function writeGaryBets({ tickets, kind = 'game', model, automatic = false, log = console } = {}) {
  const passes = (m) => new Map((tickets || []).map((t) => [t.id, betRecord(pass(), m)]));
  if (!tickets?.length) return { bets: passes(model || APP_WRITING_MODEL), model: model || APP_WRITING_MODEL };
  const { brief } = await loadBankroll(log);
  const ask = buildBetStep({ tickets, inSession: false, kind, automatic });
  const writers = [...new Set([model, APP_WRITING_MODEL].filter(Boolean))];
  const tries = automatic ? Math.max(3, writers.length) : writers.length;
  for (let i = 0; i < tries; i++) {
    const writer = writers[i % writers.length];
    try {
      const session = await createModelSession({ modelName: writer, systemPrompt: '', tools: [], thinkingLevel: BET_EFFORT });
      const res = await sendToSessionWithRetry(session, ask, {});
      const first = parseBetStep(res?.content, tickets, { automatic });
      if (!first.usable) { log.warn(`[Bet] ${writer}: the answer was not the JSON asked for`); continue; }
      const betting = tickets.filter((t) => first.decisions.get(t.id)?.bet);
      let stakes = new Map();
      if (betting.length) {
        const res2 = await sendToSessionWithRetry(session, buildStakeStep({ tickets: betting, brief }), {});
        const second = parseStakeStep(res2?.content, betting);
        if (!second.usable && automatic) { log.warn(`[Bet] ${writer}: no amount of his own for this playoff game pick`); continue; }
        stakes = second.stakes;
      }
      const bets = combineBets(tickets, first.decisions, stakes);
      const answered = res?.model || writer;
      const records = new Map(tickets.map((t) => [t.id, betRecord(bets.get(t.id), answered)]));
      logBets(tickets, records, answered, 'separate call', log);
      return { bets: records, model: answered };
    } catch (e) {
      log.warn(`[Bet] ${writer} failed: ${e?.message || e}`);
    }
  }
  log.warn(automatic
    ? '⚠️ [Bet] Gary named no amount for this playoff game pick; it stays off Winners until he does (nothing books a default)'
    : '[Bet] no brain answered the bet step; every ticket is a pass');
  return { bets: passes(model || APP_WRITING_MODEL), model: model || APP_WRITING_MODEL };
}
