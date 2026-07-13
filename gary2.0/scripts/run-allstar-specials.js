#!/usr/bin/env node
/**
 * ALL-STAR SPECIALS — Gary's board for the 2026 HR Derby + All-Star Game.
 * Founder, Jul 13 2026: "its not an all-star break for Gary" + "lets do a ton
 * of them" + "help gary not pick chalk — betting isnt about taking the most
 * likely option on paper" + "use GPT 5.6 Sol for these".
 *
 * ISOLATED BY DESIGN: no sport constitutions, no agentLoop, no scheduler hook.
 * Grounded market briefs + exact-name Savant blocks → ONE Sol call returning a
 * multi-market BOARD → per-pick statAudit gate → production store.
 *
 * Fabrication guards:
 *   - Stat blocks only from exact first+last-name Savant matches (Christian-vs-
 *     Jordan Walker and William-vs-Willson Contreras both hit during recon —
 *     near-misses are OMITTED, never substituted).
 *   - Prices must be copied from the grounded boards with the book named, or
 *     the call ships priceless. statAudit enforces number-traceability.
 *
 * Anti-chalk (founder-ordered product rule for this lane):
 *   - The Derby WINNER call may not be the market favorite. Everywhere else,
 *     favorites must earn the call with a case — hunt the price, not the name.
 *
 * Usage:
 *   node scripts/run-allstar-specials.js --derby            # tonight's board
 *   node scripts/run-allstar-specials.js --asg              # game-day board
 *   node scripts/run-allstar-specials.js --derby --dry-run  # print, don't store
 */
import 'dotenv/config';
import { geminiGroundingSearch } from '../src/services/agentic/scoutReport/shared/grounding.js';
import { getBatterXStats, getPitcherXStats } from '../src/services/baseballSavantService.js';
import { auditPickRationale, buildStatAuditRetryMessage } from '../src/services/agentic/orchestrator/statAudit.js';
import { createOpenAISession, sendToOpenAISession } from '../src/services/agentic/orchestrator/providerAdapters/openaiSession.js';
import { picksService } from '../src/services/picksService.js';

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const RUN_DERBY = args.includes('--derby');
const RUN_ASG = args.includes('--asg');
if (!RUN_DERBY && !RUN_ASG) { console.error('Pass --derby and/or --asg'); process.exit(1); }

const MODEL = process.env.SPECIALS_MODEL || 'gpt-5.6-sol';

// 2026 Derby field — verified Jul 13 2026 against grounding + Savant. A late
// swap shows up in the fresh runtime brief; the swap-in just has no stat block.
const DERBY_FIELD = [
  { name: 'Kyle Schwarber', team: 'Phillies' },
  { name: 'Bryce Harper', team: 'Phillies' },
  { name: 'Junior Caminero', team: 'Rays' },
  { name: 'Munetaka Murakami', team: 'White Sox' },
  { name: 'Ben Rice', team: 'Yankees' },
  { name: 'Jordan Walker', team: 'Cardinals' },
  { name: 'Jac Caglianone', team: 'Royals' },
  { name: 'Willson Contreras', team: 'Red Sox' },
];

const norm = (s) => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const exactRow = (rows, fullName) =>
  rows.find(r => norm(`${r.first_name} ${r.last_name}`) === norm(fullName)) || null;
const groundedText = (r) => (typeof r === 'string' ? r : (r?.data || r?.raw || ''));

async function ground(q) { return groundedText(await geminiGroundingSearch(q, { sport: 'baseball_mlb' })); }

async function buildDerbyData() {
  const [news, winnerBoard, propBoard] = [
    await ground('MLB Home Run Derby TONIGHT Monday July 13 2026 at Citizens Bank Park: confirm the 8 participants (late swaps/scratches?), the swing-based format and rules, start time/broadcast, participant season home run totals, and any participation or injury news from today.'),
    await ground('CURRENT winner odds board for tonight\'s MLB Home Run Derby (July 13 2026): every participant with prices at FanDuel, DraftKings, and BetMGM.'),
    await ground('ALL other prop markets posted for tonight\'s MLB Home Run Derby July 13 2026 with prices and sportsbook names: head-to-head matchups, player Round 1 home run over/unders, to-reach-the-final odds, longest home run distance over/under, winning league AL vs NL, total combined home runs, 500-foot homer props, anything else.'),
  ];

  const savantRows = await getBatterXStats(2026);
  const rows = Array.isArray(savantRows) ? savantRows : (savantRows?.data || []);
  const blocks = DERBY_FIELD.map(p => {
    const sv = exactRow(rows, p.name);
    return sv
      ? `${p.name} (${p.team})\n  Statcast 2026: ${sv.pa} PA, SLG ${sv.slg}, xSLG ${sv.est_slg}, wOBA ${sv.woba ?? 'n/a'}${sv.est_woba != null ? `, xwOBA ${sv.est_woba}` : ''}`
      : `${p.name} (${p.team})\n  (no verified 2026 stat row — do not cite numbers for this player)`;
  }).join('\n');

  return {
    briefs: `EVENT BRIEF (grounded today):\n${news}\n\nWINNER ODDS BOARD (grounded):\n${winnerBoard}\n\nPROP MARKET BOARD (grounded):\n${propBoard}`,
    blocks,
  };
}

async function buildAsgData() {
  const [news, oddsBoard] = [
    await ground('MLB All-Star Game Tuesday July 14 2026 at Citizens Bank Park: confirmed starting pitchers and lineups for AL and NL, roster scratches/replacements, and relevant news today.'),
    await ground('ALL betting markets posted for the MLB All-Star Game July 14 2026 with prices and sportsbook names: moneyline AL vs NL, total runs over/under, the FULL All-Star Game MVP odds board, first team to score, team totals, anything else.'),
  ];
  const savantRows = await getPitcherXStats(2026);
  const rows = Array.isArray(savantRows) ? savantRows : (savantRows?.data || []);
  const blocks = ['Dylan Cease', 'Cristopher Sanchez', 'Cristopher Sánchez'].map(n => {
    const sv = exactRow(rows, n);
    return sv ? `${n}: Statcast 2026 — ${sv.pa} PA against, ERA ${sv.era ?? 'n/a'}, xERA ${sv.est_era ?? sv.xera ?? 'n/a'}, wOBA-against ${sv.woba ?? 'n/a'}` : null;
  }).filter(Boolean).join('\n');
  return {
    briefs: `EVENT BRIEF (grounded today):\n${news}\n\nMARKET BOARD (grounded):\n${oddsBoard}`,
    blocks,
  };
}

const SYSTEM = `You are Gary — the sharp, confident betting character behind the Gary app. All-Star week: you work the exhibitions with real calls, in your voice, for fans who follow every pick.

HOW YOU BET (non-negotiable):
- Betting is not taking the most likely name on paper — it is taking the right PRICE. A favorite must EARN a call with a real case; never submit a pick just because it is the shortest number on the board.
- Build a BOARD: one call per market, each market a genuinely different bet. Skip any market where you have no real read — fewer, sharper calls beat filler.

HARD DATA RULES (non-negotiable):
- Every number you write (stats, odds, HR totals) MUST appear in the DATA sections of the user message. No outside numbers, no estimates.
- Odds: quote ONLY prices present on the grounded boards and name the sportsbook. No usable price for a call = odds null, no prices in that rationale.
- Players without a verified stat block may be discussed only via facts stated in the briefs.
- Never reference being an AI, a model, data feeds, or prompts. You are Gary.

OUTPUT: strict JSON only, no markdown fences, matching the schema in the user message.`;

function parseJsonLoose(text) {
  const m = String(text).match(/\{[\s\S]*\}/);
  if (!m) throw new Error('no JSON object in model output');
  return JSON.parse(m[0]);
}

/** One Sol call → board array; per-pick statAudit with one collective retry. */
async function solBoard(userMsg, minPicks) {
  const session = await createOpenAISession({
    modelName: MODEL,
    systemPrompt: SYSTEM,
    tools: [],
    thinkingLevel: 'high',
  });
  const usage = { in: 0, out: 0 };
  let res = await sendToOpenAISession(session, userMsg, { isFunctionResponse: false });
  usage.in += res.usage?.prompt_tokens || 0; usage.out += res.usage?.completion_tokens || 0;
  let parsed = parseJsonLoose(res.content);
  let board = Array.isArray(parsed.board) ? parsed.board : [];

  const audits = board.map(b => auditPickRationale({ rationale: b.rationale }, userMsg));
  const failing = board.filter((_, i) => audits[i].retryable.length > 0);
  if (failing.length) {
    const claims = audits.flatMap(a => a.retryable);
    console.log(`[Specials] statAudit: ${claims.length} untraceable claim(s) across ${failing.length} call(s) — one corrective retry`);
    res = await sendToOpenAISession(session, buildStatAuditRetryMessage(claims), { isFunctionResponse: false });
    usage.in += res.usage?.prompt_tokens || 0; usage.out += res.usage?.completion_tokens || 0;
    try {
      parsed = parseJsonLoose(res.content);
      if (Array.isArray(parsed.board)) board = parsed.board;
    } catch { /* keep first board; failures drop below */ }
    board = board.filter(b => auditPickRationale({ rationale: b.rationale }, userMsg).retryable.length === 0);
  }
  console.log(`[Specials] ${MODEL}: ${usage.in} in / ${usage.out} out — ${board.length} call(s) passed audit`);
  if (board.length < minPicks) throw new Error(`board too thin after audit: ${board.length} < ${minPicks}`);
  return board;
}

const baseSpecial = (over) => ({
  type: 'special',
  league: 'MLB',
  sport: 'baseball_mlb',
  venue: 'Citizens Bank Park',
  statsUsed: [], statsData: [], injuries: null,
  ...over,
});

async function runDerby() {
  console.log(`[Specials] ── HOME RUN DERBY BOARD (${MODEL}) ──`);
  const { briefs, blocks } = await buildDerbyData();
  const schema = `{"board":[{"market":"Winner"|"Head-to-Head"|"Round 1 O/U"|"To Reach the Final"|"Longest HR"|"Winning League"|"Total HRs"|"Other","pick_text":"short bet line, e.g. 'Caminero to win the Derby +425' or 'Rice over 6.5 R1 homers -115'","odds":425,"book":"DraftKings","confidence":0.55,"rationale":"Gary's voice, 60-120 words"}]}`;
  const user = `${briefs}\n\nVERIFIED 2026 STAT BLOCKS (only citable numbers):\n${blocks}\n\nTASK: Build Gary's Derby board — 4 to 6 calls, each from a DIFFERENT posted market. Exactly ONE Winner call, and it may NOT be the market favorite (the shortest-priced player on the winner board): the market already made that pick; make YOURS at a price. For every other market, only call it if you have a real read from the data. pick_text stays under 45 characters.\n\nJSON schema: ${schema}`;
  const board = await solBoard(user, 3);

  // Mechanical anti-chalk guards (founder order, Jul 13): exactly ONE winner
  // call, and tonight it cannot be Schwarber — the market favorite on every
  // grounded board today, and the exact chalk call the founder rejected.
  const winners = board.filter(b => /winner/i.test(b.market || ''));
  if (winners.length !== 1) throw new Error(`board must carry exactly 1 Winner call, got ${winners.length}`);
  if (/schwarber/i.test(winners[0].pick_text || '')) throw new Error('Winner call came back as the market favorite (Schwarber) — anti-chalk rule violated');

  return board.map((b, i) => baseSpecial({
    pick: b.pick_text,
    odds: typeof b.odds === 'number' ? b.odds : null,
    time: '8:00 PM',
    awayTeam: 'Home Run Derby',
    homeTeam: 'Citizens Bank Park',
    tournamentContext: 'All-Star Week',
    // Winner keeps 20260713 — the store's replace-by-game_id retires the old
    // chalk call in the same write. Others take the 202607130x series.
    game_id: /winner/i.test(b.market || '') ? 20260713 : 2026071302 + i,
    confidence: b.confidence ?? 0.5,
    rationale: b.rationale,
    bestLineBook: b.book || null,
  }));
}

async function runAsg() {
  console.log(`[Specials] ── ALL-STAR GAME BOARD (${MODEL}) ──`);
  const { briefs, blocks } = await buildAsgData();
  const schema = `{"board":[{"market":"Moneyline"|"Total"|"MVP"|"First to Score"|"Other","pick_text":"e.g. 'National League ML -130' or 'Caminero to win ASG MVP +1400'","odds":-130,"book":"DraftKings","confidence":0.55,"rationale":"Gary's voice, 60-120 words"}]}`;
  const user = `${briefs}\n\nVERIFIED 2026 STAT BLOCKS (only citable numbers):\n${blocks}\n\nTASK: Build Gary's All-Star Game board — 3 to 5 calls, each from a DIFFERENT posted market (Moneyline, Total, MVP, others as posted). Favorites must earn the call — hunt the price. MVP is where the board pays: if you make an MVP call, make it a conviction shot at a real number, not the shortest name. pick_text under 45 characters.\n\nJSON schema: ${schema}`;
  const board = await solBoard(user, 2);

  return board.map((b, i) => baseSpecial({
    pick: b.pick_text,
    odds: typeof b.odds === 'number' ? b.odds : null,
    type: /moneyline/i.test(b.market || '') ? 'moneyline' : 'special',
    time: '8:00 PM',
    awayTeam: 'American League',
    homeTeam: 'National League',
    tournamentContext: 'All-Star Game',
    // ML keeps the real BDL id; the rest take the 202607140x series.
    game_id: /moneyline/i.test(b.market || '') ? 8712499 : 2026071402 + i,
    confidence: b.confidence ?? 0.5,
    rationale: b.rationale,
    bestLineBook: b.book || null,
  }));
}

(async () => {
  const jobs = [];
  if (RUN_DERBY) jobs.push({ picks: await runDerby(), override: null });
  if (RUN_ASG) jobs.push({ picks: await runAsg(), override: '2026-07-14' });

  for (const job of jobs) {
    for (const p of job.picks) {
      console.log('\n──────── PICK ────────');
      console.log(`${p.pick}  (conf ${p.confidence}${p.bestLineBook ? `, ${p.bestLineBook}` : ''}, gid ${p.game_id})`);
      console.log(p.rationale);
    }
  }
  if (DRY_RUN) { console.log('\n[Specials] dry run — nothing stored.'); process.exit(0); }
  for (const job of jobs) {
    const res = await picksService.storeDailyPicksInDatabase(job.picks, job.override);
    console.log(`[Specials] store ${job.picks.length} pick(s)${job.override ? ` → ${job.override}` : ''} → ${JSON.stringify(res).slice(0, 180)}`);
  }
  console.log('[Specials] Done.');
  process.exit(0);
})().catch(e => { console.error('[Specials] FAILED:', e.message); process.exit(1); });
