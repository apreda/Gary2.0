// GARY'S CARD (founder GO, Oct 12 2026 evening: "fix the judge yourself ... he ranks them, then we send the
// best rank one to winners"). Right after the bet step, the same brain places the pick it just made on today's
// card: his picks of the day so far, top to bottom, each in his own words from when he made it. Slot 1 is the
// pick he would hand a friend who can make only one bet today. The earlier picks never move and nobody re-judges
// an old pick; the day's first pick takes slot 1 with no call. Placements run one at a time (SQL
// card_claim_turn, a three-minute lease) so every placement sees every earlier one. A missing or malformed
// answer goes to the bottom, flagged, and never touches the pick or the bet. The seating rule lives in SQL
// (seat_the_card) and is never in anything he reads: no stakes, no results, no counts, no mention of Winners.
import { setTimeout as sleep } from 'node:timers/promises';
import { generateSolText } from '../insights/solText.js';
import { APP_WRITING_MODEL } from '../agentic/orchestrator/orchestratorConfig.js';
import { REASONS_SHAPE, reasonsAsk, selectionReasons } from './winnersSelectionReasons.js';

export const CARD_POLICY = 'winners-card-v1';
const TURN_WAIT_MS = 4 * 60_000;
const TURN_POLL_MS = 5_000;

const price = (p) => (Number(p) > 0 ? `+${Number(p)}` : String(Number(p)));
const clock = (iso) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? null : `${d.toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit' })} ET`; };
const words = (pick) => String(pick?.weighing || pick?.rationale || '').trim();

/** The ask: this pick in his words, then the card in his words. */
export function buildCardAsk({ league, pick, card }) {
  const when = clock(pick.commence_time);
  const matchup = pick.awayTeam && pick.homeTeam ? `${pick.awayTeam} @ ${pick.homeTeam}` : '';
  const lines = (card || []).map((c, i) => {
    const kickoff = clock(c.commence_time);
    return `${i + 1}. ${c.pick_text} (${price(c.odds)})${c.matchup ? ` — ${c.matchup}` : ''}${kickoff ? `, ${kickoff}` : ''}\n   What you said: ${String(c.words || '').trim() || '(no note)'}`;
  });
  return [
    `You are Gary. You just made this ${league} pick and wrote the case for it.`,
    `THIS PICK: ${pick.pick} (${price(pick.odds)})${matchup ? ` — ${matchup}` : ''}${when ? `, ${when}` : ''}`,
    `What you said: ${words(pick) || '(no note)'}`,
    '',
    "TODAY'S CARD, your picks of the day so far, top to bottom, each with what you said when you made it:",
    ...lines,
    '',
    'Where does this pick go on the card? Slot 1 is the pick you would hand a friend who can make only one bet today. The picks already on the card keep their order; you are placing this one among them.',
    `Answer with JSON only: {"slot": N, "why": "one sentence in your voice", ${REASONS_SHAPE}} where N is a whole number from 1 (the top) to ${(card || []).length + 1} (the bottom). ${reasonsAsk('this ticket')}`,
  ].join('\n');
}

/** The slot if it parses, else null. */
export function parseCardPlacement(raw, cardSize) {
  try {
    const text = String(raw || '');
    const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    const body = fenced ? fenced[1] : text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1);
    const v = JSON.parse(body.trim());
    const slot = v?.slot;
    if (!(typeof slot === 'number' && Number.isInteger(slot) && slot >= 1 && slot <= cardSize + 1)) return null;
    return { slot, why: String(v?.why ?? '').trim(), reasons: selectionReasons(v?.reasons) };
  } catch {
    return null;
  }
}

async function claimTurn(client, date, holder, log) {
  const until = Date.now() + TURN_WAIT_MS;
  while (Date.now() < until) {
    const { data, error } = await client.rpc('card_claim_turn', { p_date: date, p_holder: holder });
    if (error) throw error;
    if (data === true) return true;
    await sleep(TURN_POLL_MS);
  }
  log.warn(`[Card] ${holder}: no turn in ${TURN_WAIT_MS / 60_000} minutes; placing unserialized`);
  return false;
}

/**
 * Place a just-published game pick on today's card. Never throws; a failure is logged and the pick stands.
 * `client` is the service-role Supabase client; `pick` is the stored pick (pick, odds, teams, kickoff, weighing,
 * rationale); `model` is the brain that made it.
 */
export async function placeOnCard(client, { league, gameId, pick, model, log = console, generate = generateSolText } = {}) {
  const holder = `${process.pid}-${league}-${gameId}`;
  let date = null; let serialized = false;
  try {
    const { data: state, error } = await client.rpc('card_state', { p_league: league, p_game_id: String(gameId) });
    if (error) throw error;
    if (!state?.found) { log.warn(`[Card] ${league} ${gameId}: no Winners candidate to place`); return null; }
    if (state.placed) return { already: true };
    date = state.game_date;
    serialized = await claimTurn(client, date, holder, log);
    // The card may have grown while waiting for the turn.
    const fresh = serialized ? await client.rpc('card_state', { p_league: league, p_game_id: String(gameId) }) : { data: state };
    if (fresh.error) throw fresh.error;
    const card = Array.isArray(fresh.data?.card) ? fresh.data.card : [];
    let placement = null; let writer = null; let isDefault = false;
    if (card.length === 0) {
      placement = { slot: 1, why: '', reasons: null };   // the day's first pick: the top, no call
    } else {
      const ask = buildCardAsk({ league, pick, card });
      for (const m of [...new Set([model, APP_WRITING_MODEL].filter(Boolean))]) {
        try {
          const text = await generate(ask, { model: m, effort: 'medium', maxTokens: 1200 });
          placement = parseCardPlacement(text, card.length);
          if (placement) { writer = m; break; }
          log.warn(`[Card] ${m}: the answer was not the JSON asked for`);
        } catch (e) {
          log.warn(`[Card] ${m} failed: ${e?.message || e}`);
        }
      }
      if (!placement) { placement = { slot: card.length + 1, why: '', reasons: null }; isDefault = true; }
    }
    const above = placement.slot <= card.length ? card[placement.slot - 1].candidate_id : null;
    const { data: placed, error: placeError } = await client.rpc('card_place', {
      p_candidate_id: state.candidate_id, p_above: above, p_slot: card.length ? placement.slot : null, p_card_size: card.length,
      p_why: placement.why, p_is_default: isDefault, p_serialized: serialized, p_model: writer,
    });
    if (placeError) throw placeError;
    if (placement.reasons) {
      const { error: reasonsError } = await client.from('winners_reasons')
        .upsert({ candidate_id: state.candidate_id, reasons: placement.reasons, model: writer }, { onConflict: 'candidate_id', ignoreDuplicates: true });
      if (reasonsError) log.warn(`[Card] reasons not stored: ${reasonsError.message}`);
    }
    log.log(`🃏 GARY'S CARD: ${pick.pick} → slot ${placed?.slot ?? '?'} of ${placed?.of ?? '?'}${isDefault ? ' (no answer; the bottom)' : ''}${placement.why ? ` — ${placement.why}` : ''}`);
    return placed;
  } catch (e) {
    log.warn(`[Card] ${league} ${gameId}: not placed (${e?.message || e}); the pick and the bet stand`);
    return null;
  } finally {
    if (serialized && date) await client.rpc('card_release_turn', { p_date: date, p_holder: holder }).catch(() => {});
  }
}
