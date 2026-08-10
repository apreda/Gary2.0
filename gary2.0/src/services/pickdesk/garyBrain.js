/**
 * THE BRAIN — one xhigh session over the complete desk, three turns
 * (spec docs/superpowers/specs/2026-07-26-mlb-pick-rebuild-design.md;
 * seal-the-pick split: founder GO, Aug 4 2026; blind split: founder GO,
 * Aug 5 2026).
 *
 * No tools, no passes, no research assistant: the desk is Gary's entire
 * evidence, his full reasoning budget goes to weighing it, and the pick is a
 * pure function of the desk (stored per pick for audits). Turn 1 reads the
 * desk with NO LINES on it and seals the winner — the read exists before any
 * price does. Turn 2 shows THE LINES and outputs the ticket — price thinking
 * lives only here. Turn 3 writes Gary's Take on the same session with the
 * ticket already committed.
 *
 * Brain cascade (founder, Jul 29 2026): Sol first; if a brain THROWS —
 * dead balance/429 like the Jul 28 outage, or a provider hard-down — the
 * same desk re-runs on the Gemini fallbacks at their top thinking level.
 * Parse/rails failures do NOT cascade: those are contained no-pick errors,
 * unchanged. Sessions route through the sessionManager provider seam.
 *
 * Rails unchanged (prevent fabrication, never detect-and-ship): statAudit +
 * count-claim rail, ONE corrective retry, then null — no pick stored.
 */
import { createHash } from 'crypto';
import { buildMlbDesk } from './mlbDesk.js';
import { GAME_PICK_MODEL, DESK_FALLBACK_MODELS, DESK_COST_PER_M } from '../agentic/orchestrator/orchestratorConfig.js';
import { createGeminiSession, sendToSessionWithRetry } from '../agentic/orchestrator/sessionManager.js';
import { auditPickRationale, auditCountClaims, buildStatAuditRetryMessage } from '../agentic/orchestrator/statAudit.js';

// ═══════════════════════════════════════════════════════════════════════════
// THE ZERO-BASED PROMPT SURFACE (founder + Claude, Jul 26 2026).
// Entry rule: a sentence exists here only if it is (a) something a frontier
// model cannot know — product contracts, our environment, today's date — or
// (b) a law the founder has set. No tutoring, no persona essays, no doctrine.
// The desk is the system; these ~1,100 characters are the contract around it.
// ═══════════════════════════════════════════════════════════════════════════

// THE PRICE SENTENCE IS GONE (founder, Aug 5 2026). "The line is the market's
// opinion of tonight, not a measurement of it" was the only lens pre-loaded
// before Gary ever read the desk — and it was a VALUE lens. Measured effect:
// price framing led 10 of 12 cards, the same "line moved with no news → take
// the widening side" beat ran three times in one night (all three trailing),
// and clear sides got passed over for prices. Founder: "the value should be
// secondary. Gary should still be answering who wins the game... value can be
// totally thrown out the window if Gary just thinks a certain team is going to
// win regardless of the odds." The price still reaches him — it's on the desk
// and it's half of the ticket contract (a bet is a side AND its price). What's
// removed is us handing him a way to think about it before he starts.
export const buildGarySystemPrompt = (dateLong) => `Today is ${dateLong}. You are Gary — the bettor whose picks publish in this app. You write as yourself, never as an AI or a system, and you have no favorite team.

Your training data is old; the desk is current.`;

// THE BLIND SPLIT (founder GO, Aug 5 2026): the read seals BEFORE the lines
// exist. Under the priced surface (board-first desk, "a bet is a side and its
// price" leading the ask), value-hunting was obedience — the same fade ran
// six Nationals-side tickets in seven days (1-5), and the Aug 3-4 slates went
// 6-18. Founder: "what we're asking Gary is who he thinks is gonna win the
// game tonight" — so turn 1 asks exactly that, with THE LINES held off the
// desk entirely. No margin/scoreline field: the founder rejected asking a
// model to predict margins outright (same class as the banned predict-the-
// spread), so the read is the winner and the why. The ticket may still land
// either side of the lines in turn 2 — nothing locks the jersey; the ledger
// reads the crossings.
export const THE_READ_ASK = `Who wins tonight? Your answer seals before you see any lines.

Injuries: an absence already games old is already in the team's recent results; fresh news — today's scratch — is the exception.

Output only:

\`\`\`json
{ "winner": "[Team]", "read": "why — a few sentences" }
\`\`\``;

// THE SEAL (founder GO, Aug 4 2026), now the second seal of the session: the
// ticket is decided and output BEFORE any card prose exists. The read is
// already committed; the lines arrive here and only here, so the price can
// buy the instrument (ML vs run line, and what it costs) but never author
// the read. Whatever any later turn emits, the stored pick is this turn's —
// mechanically.
export const buildTicketAsk = (winner, boardText) => `Your winner is sealed: ${winner}.

${boardText}

Take your bet. Output only:

\`\`\`json
{ "final_pick": "[Team] [bet] [exact odds]", "confidence_score": 0.XX }
\`\`\`

confidence_score (0.50–1.00): your conviction in this bet at its price — the bet, not the outcome.`;

// THE RUN-LINE GAME, rebuilt (founder GO, Aug 10 2026 — supersedes the
// Aug 6 single-turn ask): the weekend's forced-RL lane laid -1.5 five of
// seven times and the 30-day lay class sits 8-20 — the one lane where Gary
// never formed a view of the GAME before facing a price. Now an RL game is
// blind like every other game: turn 1 reads the game (no board anywhere),
// and only the ticket turn reveals that the moneyline is off tonight's
// board. The ticket must price a read that already exists — "the RL pick
// has to still be in line with what gary actually thinks about the game."
// No mechanics lecture (Jul 26 razor), no side framed, crossing allowed.
export const buildRunLineTicketAsk = (winner, runLineBoard) => `Your winner is sealed: ${winner}.

${runLineBoard}

The moneyline is off the board tonight — the run line is the only market. Take your bet. Output only:

\`\`\`json
{ "final_pick": "[Team] [+1.5 or -1.5] [exact odds]", "confidence_score": 0.XX }
\`\`\`

confidence_score (0.50–1.00): your conviction in this bet at its price — the bet, not the outcome.`;

// The card contract travels WITH the card ask (Aug 4 evening fix — the first
// sealed-era card opened with an internal process note: "Pitcher assignment
// settled off internal evidence, not the contradictory web layer". These are
// the SAME founder-approved sentences that lived in the system prompt since
// Jul 26, relocated to the moment of composition; the only forced composition
// rule remains the founder's law: the open sets the stage.)
export const buildCardAsk = (finalPick) => `Your ticket is sealed: ${finalPick}.

Write "Gary's Take" — your published card: three paragraphs, opening with a line or two setting the stage like a broadcast — the reasoning is yours. No emojis. Never mention data feeds, tools, or missing data.`;

const parseJsonBlock = (t) => {
  try {
    const m = String(t || '').match(/```json\s*([\s\S]*?)```/i) || String(t || '').match(/(\{[\s\S]*\})/);
    return JSON.parse(m[1]);
  } catch { return null; }
};
const parseFinalJson = (t) => { const o = parseJsonBlock(t); return o?.final_pick ? o : null; };
const parseReadJson = (t) => { const o = parseJsonBlock(t); return o?.winner ? o : null; };

/** The card arrives as prose. A rails retry may answer in the old JSON shape
 *  — accept its rationale field; never accept a bare JSON blob as a card.
 *  Under 200 chars is not a card (a real Take runs 1,000+). */
const extractCard = (t) => {
  const s = String(t || '').trim();
  if (!s) return null;
  const m = s.match(/```json\s*([\s\S]*?)```/i) || (s.startsWith('{') ? s.match(/(\{[\s\S]*\})/) : null);
  if (m) {
    try {
      const o = JSON.parse(m[1]);
      return o.rationale && String(o.rationale).trim().length >= 200 ? String(o.rationale).trim() : null;
    } catch { /* fall through to prose */ }
  }
  if (/^\{[\s\S]*\}$/.test(s)) return null;
  return s.length >= 200 ? s : null;
};

/** Cards publish under the "Gary's Take" masthead (display contract, owned in
 *  code — never re-litigated in the prompt). Strip a model-invented header
 *  line that names the sealed ticket (smoke, Aug 4: "THE CARD — Orioles ML
 *  -150"), then ensure the masthead. */
const normalizeCardHead = (card, finalPick) => {
  let s = String(card).trim();
  // A markdown-dressed masthead ("## Gary's Take", "**Gary's Take**" — live
  // catch, Aug 4 regen) normalizes to the plain one; cards are plain text.
  s = s.replace(/^[#*\s]*gary'?s take[*\s]*$/im, "Gary's Take").trim();
  if (/^gary'?s take\b/i.test(s)) return s;
  const nl = s.indexOf('\n');
  const first = (nl === -1 ? s : s.slice(0, nl)).trim();
  const isHeader = /^the card\b/i.test(first) || (finalPick && first.includes(finalPick));
  if (isHeader && nl !== -1) s = s.slice(nl + 1).trim();
  return `Gary's Take\n\n${s}`;
};

/** Map the brain's final_pick text onto the chassis contract fields. */
export function mapFinalPick(parsed, meta) {
  // Normalize "(−126)" → "−126": every downstream parser (grading, ledgers,
  // F-5 text rules) expects bare trailing odds.
  const fp = String(parsed.final_pick || '').replace(/\(\s*([+-]\d{3,4})\s*\)/g, '$1').replace(/\s{2,}/g, ' ').trim();
  const isSpread = /run\s*line|[+-]1\.5/i.test(fp);
  const fpLower = fp.toLowerCase();
  const homeSide = fpLower.includes(String(meta.homeTeam || '').toLowerCase().split(' ').pop());
  const oddsM = fp.trim().match(/([+-]\d{3,4})$/);
  const metaOdds = isSpread
    ? (homeSide ? meta.spreadHomeOdds : meta.spreadAwayOdds)
    : (homeSide ? meta.moneylineHome : meta.moneylineAway);
  return {
    pick: fp,
    type: isSpread ? 'spread' : 'moneyline',
    odds: oddsM ? parseInt(oddsM[1], 10) : (metaOdds ?? null),
    spread: isSpread ? (homeSide ? meta.spreadHome : meta.spreadAway) : null,
    spreadOdds: isSpread ? (homeSide ? meta.spreadHomeOdds : meta.spreadAwayOdds) : null,
  };
}

const todayLong = () => new Date().toLocaleDateString('en-US', {
  weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'America/New_York',
});

// Prompt-era fingerprint (founder GO, Jul 29): every stored pick carries the
// hash of the contract TEMPLATE it was made under (date placeholder, so the
// hash only moves when the words move). This is what makes before/after
// readable when contract wording changes — eras join in SQL, never inferred
// from timestamps again. Register new eras in the prompt_eras table.
export const PROMPT_SHA = createHash('sha256')
  .update(buildGarySystemPrompt('{date}') + THE_READ_ASK + buildTicketAsk('{winner}', '{board}') + buildRunLineTicketAsk('{winner}', '{board}') + buildCardAsk('{pick}'))
  .digest('hex')
  .slice(0, 12);

// OpenAI's and the Claude CLI's effort ladders reach xhigh; Gemini's
// thinkingLevel tops at high.
const topThinkingLevel = (modelName) => (modelName.startsWith('gemini') ? 'high' : 'xhigh');

/**
 * One full brain pass on one model, three turns on one session: blind desk →
 * read (first seal), lines → ticket (second seal), then card ask → prose,
 * rails on the card with ONE corrective retry. Returns { parsed, usage,
 * warnings } or a contained { error } (parse/rails). Provider/quota failures
 * THROW — the cascade in analyzeGameDesk owns those.
 */
async function runBrainPass(modelName, systemPrompt, firstMessage, boardText, auditAll, runLineGame = false) {
  const session = await createGeminiSession({
    modelName,
    systemPrompt,
    tools: [],
    thinkingLevel: topThinkingLevel(modelName),
  });

  const usage = { in: 0, out: 0 };
  const bump = (res) => { usage.in += res.usage?.prompt_tokens || 0; usage.out += res.usage?.completion_tokens || 0; };
  const logCost = () => {
    const [inRate, outRate] = DESK_COST_PER_M[modelName] || [0, 0];
    const cost = (usage.in * inRate + usage.out * outRate) / 1e6;
    console.log(`   [Brain] one call (${modelName}), ${usage.in.toLocaleString()} in / ${usage.out.toLocaleString()} out ≈ $${cost.toFixed(3)}`);
  };

  let read = null;
  let ticket = null;
  const isRunLineTicket = (t) => /[+-]1\.5|run\s*line/i.test(String(t?.final_pick || ''));

  // TURN 1 — THE READ. The blind desk in (no lines anywhere), the winner
  // out. No price exists yet, so no price can author this. RL games read
  // blind exactly like every other game (founder GO, Aug 10) — the game
  // question first, the market shape only at the ticket.
  let res1 = await sendToSessionWithRetry(session, firstMessage, {});
  bump(res1);
  read = parseReadJson(res1.content);
  if (!read) {
    res1 = await sendToSessionWithRetry(session, 'Return your read JSON now.', {});
    bump(res1);
    read = parseReadJson(res1.content);
    if (!read) { logCost(); return { error: 'parse: no read JSON after re-ask' }; }
  }

  // TURN 2 — THE TICKET. The lines arrive with the read already sealed.
  // RL games get the RL-only board and the moneyline-off sentence.
  const ticketAsk = runLineGame
    ? buildRunLineTicketAsk(read.winner, boardText)
    : buildTicketAsk(read.winner, boardText);
  let res2 = await sendToSessionWithRetry(session, ticketAsk, {});
  bump(res2);
  ticket = parseFinalJson(res2.content);
  if (!ticket) {
    res2 = await sendToSessionWithRetry(session, 'Return your final JSON now.', {});
    bump(res2);
    ticket = parseFinalJson(res2.content);
    if (!ticket) { logCost(); return { error: 'parse: no ticket JSON after re-ask' }; }
  }
  if (runLineGame) {
    // RL rail: the only market tonight is the ±1.5 — one corrective
    // re-ask, then a contained no-pick.
    if (!isRunLineTicket(ticket)) {
      res2 = await sendToSessionWithRetry(session, 'The moneyline is off the board tonight — the run line is the only market. Return your final JSON.', {});
      bump(res2);
      const rt = parseFinalJson(res2.content);
      if (!rt || !isRunLineTicket(rt)) { logCost(); return { error: 'rails: run-line game produced a non-run-line ticket' }; }
      ticket = rt;
    }
  } else {
    // Belt-and-suspenders cap (threshold -179, founder): a heavy-ML game
    // normally routes run-line pre-flight; the only way a past-cap ML can
    // reach this flow is the no-spread-on-board fallback. Never pay it.
    const mlPastCap = (t) => {
      const fp = String(t?.final_pick || '');
      if (/[+-]1\.5|run\s*line/i.test(fp)) return false;
      const m = fp.replace(/\(\s*([+-]\d{3,4})\s*\)/g, '$1').trim().match(/([+-]\d{3,4})$/);
      return m ? parseInt(m[1], 10) < -179 : false;
    };
    if (mlPastCap(ticket)) {
      res2 = await sendToSessionWithRetry(session, 'House limit: no moneyline heavier than -179. Return your final JSON.', {});
      bump(res2);
      const rt = parseFinalJson(res2.content);
      if (!rt || mlPastCap(rt)) { logCost(); return { error: 'rails: moneyline past the -179 house limit' }; }
      ticket = rt;
    }
  }
  let res;

  // THE SEAL: from here on, ticket.final_pick is the pick. Turn 3 and any
  // rails retry write prose only — a different final_pick in a later reply
  // is ignored by construction.
  res = await sendToSessionWithRetry(session, buildCardAsk(ticket.final_pick), {});
  bump(res);
  let card = extractCard(res.content);
  if (!card) {
    res = await sendToSessionWithRetry(session, 'Write your card now.', {});
    bump(res);
    card = extractCard(res.content);
    if (!card) { logCost(); return { error: 'parse: no card after re-ask' }; }
  }

  let { issues, warnings } = auditAll(card);
  if (issues.length) {
    console.warn(`   [Rail] ${issues.length} issue(s) — one corrective retry`);
    res = await sendToSessionWithRetry(session, buildStatAuditRetryMessage(issues), {});
    bump(res);
    const rc = extractCard(res.content);
    const second = rc ? auditAll(rc) : { issues: [{ fatal: true }] };
    if (!rc || second.issues.length) { logCost(); return { error: 'rails: card failed statAudit after retry' }; }
    card = rc;
    warnings = second.warnings;
  }

  logCost();
  return {
    parsed: {
      ...ticket,
      read_winner: read.winner,
      game_read: read.read ?? null,
      rationale: normalizeCardHead(card, ticket.final_pick),
    },
    usage,
    warnings,
  };
}

/**
 * The MLB game brain. Same result contract analyzeGame carried — the runner
 * chassis (tiers, gates, store, tape, plain layer) does not change.
 */
export async function analyzeGameDesk(game, options = {}) {
  const desk = await buildMlbDesk(game, options);
  const { homeTeam, awayTeam } = desk.meta;

  const systemPrompt = buildGarySystemPrompt(todayLong());
  // EVERY game reads blind (founder GO, Aug 10 — supersedes the Aug 6
  // un-blind RL fork): the read turn sees the blind desk only. What the
  // pre-flight fork still decides is which BOARD the ticket turn reveals —
  // the full lines, or the RL-only board with the moneyline off.
  const firstMessage = `## THE DESK — ${awayTeam} @ ${homeTeam}\n\n${desk.deskTextBlind}\n\n${THE_READ_ASK}`;

  // NO LINES, NO TICKET (Aug 6 night — the Padres degenerate pick: the BDL
  // odds fetch came back empty, THE LINES said so, and the ticket turn
  // faithfully produced "Padres moneyline — odds unavailable" @ 0.50, which
  // the app then displayed verbatim). A board with no prices cannot seal a
  // bet: contained no-pick, and the later tiers retry once the book posts.
  if (!desk.runLineGame && desk.meta.moneylineHome == null && desk.meta.moneylineAway == null) {
    return { error: 'no lines on the board — odds fetch empty; retry tier owns it' };
  }
  // Same law for the RL fork (Aug 10): a run-line game whose RL board came
  // back empty cannot seal a bet — contained no-pick, retry tier owns it.
  if (desk.runLineGame && !desk.boardTextRunLine) {
    return { error: 'no run line on the board — odds fetch empty; retry tier owns it' };
  }

  const corpus = [{ content: desk.deskText }];
  const auditAll = (rationale) => {
    const a = auditPickRationale({ rationale }, corpus);
    const c = desk.recentScores ? auditCountClaims(rationale, desk.recentScores) : [];
    return { issues: [...a.retryable, ...c], warnings: a.warnOnly?.length ? a.warnOnly : null };
  };

  const cascade = [GAME_PICK_MODEL, ...DESK_FALLBACK_MODELS];
  let pass = null;
  let respondingModel = null;
  for (let i = 0; i < cascade.length; i++) {
    const modelName = cascade[i];
    try {
      pass = await runBrainPass(modelName, systemPrompt, firstMessage, desk.runLineGame ? desk.boardTextRunLine : desk.boardText, auditAll, desk.runLineGame);
      respondingModel = modelName;
      if (i > 0) console.warn(`   [Brain] FALLBACK brain produced this pass: ${modelName}`);
      break;
    } catch (err) {
      const reason = err?.isQuotaError ? 'quota/429' : (err?.message || 'provider error');
      if (i < cascade.length - 1) {
        console.warn(`   [Brain] ${modelName} failed (${reason}) — cascading to ${cascade[i + 1]}`);
        continue;
      }
      console.error(`   [Brain] ${modelName} failed (${reason}) — cascade exhausted`);
      throw err; // runner's per-game catch owns the miss, unchanged
    }
  }
  if (pass.error) return { error: pass.error };
  const { parsed, usage, warnings } = pass;

  return {
    ...mapFinalPick(parsed, desk.meta),
    confidence: parsed.confidence_score ?? null,
    // THE BLIND SPLIT: the pre-lines seal — who Gary said wins before any
    // price existed, and his why. Stored per pick; the ledger reads whether
    // the ticket crossed the read's side once the lines appeared.
    read_winner: parsed.read_winner ?? null,
    game_read: parsed.game_read ?? null,
    rationale: parsed.rationale,
    homeTeam,
    awayTeam,
    moneylineHome: desk.meta.moneylineHome,
    moneylineAway: desk.meta.moneylineAway,
    book: desk.meta.book ?? null,
    total: desk.meta.total,
    verifiedTaleOfTape: desk.verifiedTaleOfTape,
    recentScores: desk.recentScores,
    deskText: desk.deskText,
    _statAuditWarnings: warnings,
    _usage: usage,
    _promptSha: PROMPT_SHA,
    // The brain that actually answered (post-cascade) — the stored `model`
    // column must record the responder, never the configured primary
    // (Aug 10 2026: a cascaded slate would otherwise stamp as Opus).
    _modelUsed: respondingModel,
  };
}
