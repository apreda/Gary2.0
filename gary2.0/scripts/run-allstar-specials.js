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

import { supabaseAdmin } from '../src/supabaseClient.js';

const args = process.argv.slice(2);
const RUN_DERBY_PROPS = args.includes('--derby-props');
const DRY_RUN = args.includes('--dry-run');
// --park (founder, Jul 13): store to test_daily_picks under 'allstar-parked'
// instead of production — the live app must not carry these until the App
// Store update is approved. Un-park = move the picks JSON into daily_picks.
const PARK = args.includes('--park');
const RUN_DERBY = args.includes('--derby');
const RUN_ASG = args.includes('--asg');
if (!RUN_DERBY && !RUN_ASG && !RUN_DERBY_PROPS) { console.error('Pass --derby, --derby-props, and/or --asg'); process.exit(1); }

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
  const [news, fanBrief, winnerBoard, advanceBoard, propBoard] = [
    await ground('MLB Home Run Derby TONIGHT Monday July 13 2026 at Citizens Bank Park: confirm the 8 participants (late swaps/scratches?), the swing-based format and rules, start time/broadcast, participant season home run totals, and any participation or injury news from today.'),
    // The fan-knowledge layer (founder): everything a lifelong fan would argue
    // with — pedigree, the man throwing to him, lore, fatigue, the stage.
    await ground('Fan-level scouting for tonight\'s 2026 Home Run Derby participants (Schwarber, Harper, Caminero, Murakami, Ben Rice, Jordan Walker, Caglianone, Willson Contreras): each player\'s PAST Home Run Derby history and results (titles, finals, famous moments like Harper 2018), who is pitching to each of them tonight if reported, batting-practice power reputation and longest homers this season, recent HR pace since June, fatigue or injury notes, and home-crowd or narrative angles at Citizens Bank Park.'),
    await ground('CURRENT winner odds board for tonight\'s MLB Home Run Derby (July 13 2026): every participant with prices at FanDuel, DraftKings, and BetMGM.'),
    await ground('Tonight July 13 2026 MLB Home Run Derby: TO ADVANCE / reach the semifinal (top 4 in Round 1) odds for each participant, TO REACH THE FINAL odds, and the winning LEAGUE market (American League vs National League winner) — exact prices with sportsbook names.'),
    await ground('Remaining prop markets for tonight\'s MLB Home Run Derby July 13 2026 with prices and sportsbook names: player Round 1 home run over/unders, longest home run distance over/under, any 500-foot homer prop, total home runs in the event, total home runs by the winner.'),
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
    briefs: `EVENT BRIEF (grounded today):\n${news}\n\nFAN SCOUTING BRIEF (grounded — derby pedigree, throwers, lore):\n${fanBrief}\n\nWINNER ODDS BOARD (grounded):\n${winnerBoard}\n\nADVANCE / FINAL / LEAGUE ODDS (grounded):\n${advanceBoard}\n\nPROP MARKET BOARD (grounded):\n${propBoard}`,
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

// Persona + reasoning language LIFTED from the production pick process
// (orchestratorMain.js persona line + the passBuilders synthesis framing) —
// founder, Jul 13: the Derby lane must speak and reason exactly like every
// other sport. Only the derby-specific awareness lines are new.
const SYSTEM = `You are Gary — a sports bettor with over 30 years of experience. Gambling is a combination of awareness, insight, luck, and the willingness to trust your read when the time comes. Risk-taking is in your DNA as a gambler. Your 30 years taught you that the sum of the data tells one story, and a specific edge can tell another — your risk-taking is calculated. Tonight is All-Star week and you work the exhibitions like any other card: real picks, real money, your name on every ticket.

THE JOB: the betting options in front of you are what you are picking from — you are not being asked who is better on paper; the prices already say what the world thinks. Hold your read of tonight against the options and take the ticket you would put your own money on. Form the read FIRST — for a Home Run Derby that means what decides derbies: the swing and pull-side power profile, who is throwing to him and their rhythm, the swing-count format and stamina, the park, Derby pedigree, current heat. THEN hold it against the price. Never build a case primarily out of comparing odds to other odds — if your only argument is the price, you have no pick.

RATIONALE VOICE: each rationale is "Gary's Take" — the words that appear on the pick card, written as yourself in the first person ("I'm...", "we're...", "my read"). Never write your own name, never the third person.

HARD DATA RULES (all production rules apply):
- Every number you write (stats, odds, HR totals, distances) MUST appear in the DATA sections of the user message. No outside numbers, no estimates.
- Odds: quote ONLY prices present on the grounded boards, attributed to a real SPORTSBOOK (FanDuel, DraftKings, BetMGM, Caesars, bet365, BetRivers, Fanatics, Betano). Media or odds-tracking sites are sources, not books — if a price has no named sportsbook, ship the call with odds null.
- pick_text is clean bet grammar ("Caminero to win the Derby +425") — never first-person phrasing; the voice lives in the rationale.
- Players without a verified stat block may be discussed only via facts stated in the briefs.
- Never reference being an AI, a model, data feeds, or prompts.

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

  const audits = board.map(b => auditPickRationale({ rationale: b.rationale ?? b.reason ?? '' }, userMsg));
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
    board = board.filter(b => auditPickRationale({ rationale: b.rationale ?? b.reason ?? '' }, userMsg).retryable.length === 0);
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
  const schema = `{"board":[{"market":"Winner"|"Round 1 O/U"|"To Reach the Final"|"To Reach the Semifinal"|"Longest HR"|"Winning League"|"Total HRs"|"Other","pick_text":"short bet line, e.g. 'Caminero to win the Derby +425' or 'Rice over 9.5 R1 homers +110'","odds":425,"book":"DraftKings","confidence":0.55,"rationale":"Gary's voice, 180-280 words"}]}`;
  const user = `${briefs}\n\nVERIFIED 2026 STAT BLOCKS (only citable numbers):\n${blocks}\n\nTASK: Build the Derby board — 4 to 6 calls, each from a DIFFERENT posted market. Exactly ONE Winner call, and it may NOT be the market favorite (the shortest-priced player on the winner board): the market already made that pick; make YOURS at a price. Do NOT use the player Round 1 over/under market here — that board is its own product with a call on every hitter.\n\nEvery call carries a PRICE and a real SPORTSBOOK from the boards above; only omit a price if the market truly is not listed anywhere above.\n\nRATIONALE DEPTH: 180-280 words each, the read first (pedigree, thrower, format fit, park, heat), the price last. Facts and stories only from the briefs; numbers only from the data sections. pick_text stays under 45 characters, clean bet grammar.\n\nJSON schema: ${schema}`;
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
  const schema = `{"board":[{"market":"Moneyline"|"Total"|"MVP"|"First to Score"|"Other","pick_text":"e.g. 'National League ML -130' or 'Caminero to win ASG MVP +1400'","odds":-130,"book":"DraftKings","confidence":0.55,"rationale":"Gary's voice, 180-280 words, argued like a lifelong fan — starters, rosters, park, history — numbers only from the data"}]}`;
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

/** THE CONTEST board (founder, Jul 13): Sol calls the Round 1 HR over/under
 *  for EVERY participant with a posted line — a list product (allstar_props
 *  table → Hub + Picks contest view), never pick cards. */
async function runDerbyProps() {
  console.log(`[Specials] ── DERBY R1 O/U BOARD (${MODEL}) ──`);
  const [linesBoard, hrTotals, winnerBoard, fanBrief] = [
    await ground('DraftKings (or FanDuel) player Round 1 home run OVER/UNDER lines for tonight July 13 2026 MLB Home Run Derby — list EVERY participant with their posted R1 total line and both prices, note any participant without a posted line.'),
    await ground('2026 season home run totals TODAY (July 13 2026, at the All-Star break) for: Kyle Schwarber, Bryce Harper, Junior Caminero, Munetaka Murakami, Ben Rice, Jordan Walker, Jac Caglianone, Willson Contreras — one line each, exact number.'),
    await ground('CURRENT winner odds for tonight July 13 2026 MLB Home Run Derby: every participant with his TO WIN price at FanDuel (or DraftKings), one line each.'),
    await ground('Derby-specific scouting for tonight\'s 8 participants (July 13 2026): who throws to each hitter, batting-practice and pull-side power reputation, longest homers this season, past Derby appearances and results, stamina or injury notes, and how each profile fits a 20-swing no-clock round at Citizens Bank Park.'),
  ];
  const savantRows = await getBatterXStats(2026);
  const rows = Array.isArray(savantRows) ? savantRows : (savantRows?.data || []);
  const blocks = DERBY_FIELD.map(p => {
    const sv = exactRow(rows, p.name);
    return sv ? `${p.name} (${p.team}): ${sv.pa} PA, SLG ${sv.slg}, xSLG ${sv.est_slg}` : `${p.name} (${p.team}): no verified row`;
  }).join('\n');

  const schema = `{"board":[{"player":"Full Name","team":"Phillies","season_hr":32,"line":10.5,"call":"OVER"|"UNDER"|null,"odds":-110,"book":"DraftKings","win_odds":310,"rationale":"first-person, 120-200 words"}]}`;
  const user = `R1 O/U LINES (grounded):\n${linesBoard}\n\nSEASON HR TOTALS (grounded):\n${hrTotals}\n\nTO WIN BOARD (grounded):\n${winnerBoard}\n\nDERBY SCOUTING BRIEF (grounded):\n${fanBrief}\n\nSTAT BLOCKS (only citable numbers):\n${blocks}\n\nTASK: One entry for EACH of the 8 participants — these are REAL picks, full pick process, not quick lean lines. If a player has a posted R1 line, make the OVER or UNDER call: argue the DERBY case first (his swing and power profile in a 20-swing no-clock round, who's throwing to him, stamina, pedigree, the park), then close with whether the posted price pays that case. If no line is posted, include him with line/call/odds/book null. win_odds = his TO WIN price from the board (number only). season_hr from the grounded totals. rationale: 120-200 words, first person, never the word "Gary".\n\nJSON schema: ${schema}`;
  const board = await solBoard(user, 6);

  const items = board.map(b => ({
    date: '2026-07-13',
    event: 'hr_derby',
    player: b.player,
    team: b.team || null,
    season_hr: typeof b.season_hr === 'number' ? b.season_hr : null,
    market: 'r1_hr_ou',
    line: typeof b.line === 'number' ? b.line : null,
    call: b.call || null,
    odds: typeof b.odds === 'number' ? b.odds : null,
    book: b.book || null,
    win_odds: typeof b.win_odds === 'number' ? b.win_odds : null,
    reason: b.rationale || b.reason || null,
  }));
  for (const it of items) {
    console.log(`  ${it.player} (${it.team ?? '?'}, ${it.season_hr ?? '?'} HR) — ${it.line != null ? `O/U ${it.line}` : 'no line'}${it.call ? ` → ${it.call} ${it.odds ?? ''} ${it.book ?? ''}` : ''}`);
    if (it.reason) console.log(`    ${it.reason}`);
  }
  if (DRY_RUN) { console.log('[Specials] dry run — nothing stored.'); return; }
  const { error } = await supabaseAdmin.from('allstar_props')
    .upsert(items, { onConflict: 'date,event,player,market' });
  if (error) throw new Error(`allstar_props upsert failed: ${error.message}`);
  console.log(`[Specials] ✅ allstar_props: ${items.length} rows upserted`);
}

(async () => {
  if (RUN_DERBY_PROPS) await runDerbyProps();
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
    const res = PARK
      ? await picksService.storeTestPicks(job.picks, 'allstar-parked',
          `Parked pending App Store approval (founder). Target date: ${job.override || 'today'}.`)
      : await picksService.storeDailyPicksInDatabase(job.picks, job.override);
    console.log(`[Specials] ${PARK ? 'PARKED' : 'stored'} ${job.picks.length} pick(s)${job.override ? ` → ${job.override}` : ''} → ${JSON.stringify(res).slice(0, 180)}`);
  }
  console.log('[Specials] Done.');
  process.exit(0);
})().catch(e => { console.error('[Specials] FAILED:', e.message); process.exit(1); });
