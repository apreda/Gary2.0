#!/usr/bin/env node
/**
 * ALL-STAR SPECIALS — one-off pick lane for the 2026 HR Derby + All-Star Game.
 * Founder greenlight Jul 13 2026: "its not an all-star break for Gary".
 *
 * ISOLATED BY DESIGN: no sport constitutions, no agentLoop, no scheduler hook.
 * A compact verified-data brief → one Gary (gemini-3.5-flash) call → statAudit
 * gate → picksService.storeDailyPicksInDatabase. Delete or ignore after the
 * break; nothing else imports this.
 *
 * Fabrication guards:
 *   - Participant stat blocks come ONLY from exact first+last-name matches in
 *     Savant xStats / BDL season stats. A near-miss (Christian vs Jordan
 *     Walker, William vs Willson Contreras — both hit during Jul 13 recon) is
 *     OMITTED, never substituted.
 *   - Prices must be copied from the grounded odds board (book named) or the
 *     pick ships priceless. The prompt forbids any number not present in the
 *     provided data; auditPickRationale enforces it after the fact.
 *
 * Usage:
 *   node scripts/run-allstar-specials.js --derby            # tonight's Derby winner
 *   node scripts/run-allstar-specials.js --asg              # ASG side (run on game day)
 *   node scripts/run-allstar-specials.js --derby --dry-run  # print, don't store
 */
import 'dotenv/config';
import { geminiGroundingSearch } from '../src/services/agentic/scoutReport/shared/grounding.js';
import { getBatterXStats, getPitcherXStats } from '../src/services/baseballSavantService.js';
import { auditPickRationale, buildStatAuditRetryMessage } from '../src/services/agentic/orchestrator/statAudit.js';
import { GEMINI_PRO_MODEL } from '../src/services/agentic/orchestrator/orchestratorConfig.js';
import geminiService from '../src/services/geminiService.js';
import { picksService } from '../src/services/picksService.js';

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const RUN_DERBY = args.includes('--derby');
const RUN_ASG = args.includes('--asg');
if (!RUN_DERBY && !RUN_ASG) { console.error('Pass --derby and/or --asg'); process.exit(1); }

// 2026 Derby field — verified Jul 13 2026 against grounding + Savant + BDL.
// If a late swap happens, the fresh grounding brief at runtime says so and
// Gary sees it; the swap-in simply won't have a stat block.
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

// Exact first+last match only — the whole point of this helper.
function exactRow(rows, fullName) {
  const target = norm(fullName);
  return rows.find(r => norm(`${r.first_name} ${r.last_name}`) === target) || null;
}

const groundedText = (r) => (typeof r === 'string' ? r : (r?.data || r?.raw || ''));

async function buildDerbyData() {
  const brief = await geminiGroundingSearch(
    'MLB Home Run Derby TONIGHT Monday July 13 2026 at Citizens Bank Park: confirm the 8 participants (any late swaps/scratches?), the swing-based format and rules, start time and broadcast, season home run totals for the participants, and any injury or participation news from today.',
    { sport: 'baseball_mlb' }
  );
  // Odds get their own dedicated fetch — a combined query sometimes drops the board.
  const oddsBrief = await geminiGroundingSearch(
    'CURRENT betting odds to WIN tonight\'s MLB Home Run Derby (July 13 2026): list each of the 8 participants with their price and the sportsbook name (FanDuel, DraftKings, BetMGM).',
    { sport: 'baseball_mlb' }
  );
  const briefText = `${groundedText(brief)}\n\nODDS BOARD (grounded):\n${groundedText(oddsBrief)}`;

  const savantRows = await getBatterXStats(2026);
  const rows = Array.isArray(savantRows) ? savantRows : (savantRows?.data || []);

  const blocks = DERBY_FIELD.map(p => {
    const sv = exactRow(rows, p.name);
    const lines = [`${p.name} (${p.team})`];
    if (sv) {
      lines.push(`  Statcast 2026: ${sv.pa} PA, SLG ${sv.slg}, xSLG ${sv.est_slg}, wOBA ${sv.woba ?? 'n/a'}${sv.est_woba != null ? `, xwOBA ${sv.est_woba}` : ''}`);
    } else {
      lines.push('  (no verified 2026 stat row — do not cite numbers for this player)');
    }
    return lines.join('\n');
  }).join('\n');

  return { briefText, blocks };
}

async function buildAsgData() {
  const brief = await geminiGroundingSearch(
    'MLB All-Star Game Tuesday July 14 2026 at Citizens Bank Park: confirmed starting pitchers and lineups for AL and NL, roster scratches/replacements, and any relevant news today.',
    { sport: 'baseball_mlb' }
  );
  const oddsBrief = await geminiGroundingSearch(
    'CURRENT moneyline odds for the MLB All-Star Game July 14 2026 (American League vs National League) with sportsbook names (FanDuel, DraftKings, BetMGM), plus the total (over/under) if posted.',
    { sport: 'baseball_mlb' }
  );
  const briefText = `${groundedText(brief)}\n\nODDS BOARD (grounded):\n${groundedText(oddsBrief)}`;

  const savantRows = await getPitcherXStats(2026);
  const rows = Array.isArray(savantRows) ? savantRows : (savantRows?.data || []);
  const blocks = ['Dylan Cease', 'Cristopher Sanchez', 'Cristopher Sánchez'].map(n => {
    const sv = exactRow(rows, n);
    return sv ? `${n}: Statcast 2026 — ${sv.pa} PA against, ERA ${sv.era ?? 'n/a'}, xERA ${sv.est_era ?? sv.xera ?? 'n/a'}, wOBA-against ${sv.woba ?? 'n/a'}` : null;
  }).filter(Boolean).join('\n');

  return { briefText, blocks };
}

const SYSTEM = `You are Gary — the sharp, confident betting character behind the Gary app. Tonight you're working All-Star week: real calls on the exhibition events, in your voice, for fans who follow every pick.

HARD DATA RULES (non-negotiable):
- Every number you write (stats, odds, counts) MUST appear in the DATA sections of the user message. No outside numbers, no estimates, no "roughly".
- Odds: quote ONLY a price that appears on the provided odds board, and name the sportsbook it came from. If no usable price exists for your pick, set odds to null and omit prices from the rationale.
- Players without a verified stat block may be discussed only via facts stated in the EVENT BRIEF.
- Never reference being an AI, a model, data feeds, or prompts. You are Gary.

OUTPUT: strict JSON only, no markdown fences, matching the schema in the user message.`;

function parseJsonLoose(text) {
  const m = String(text).match(/\{[\s\S]*\}/);
  if (!m) throw new Error('no JSON object in model output');
  return JSON.parse(m[0]);
}

async function garyCall(userMsg) {
  const messages = [
    { role: 'system', content: SYSTEM },
    { role: 'user', content: userMsg },
  ];
  const out = await geminiService.generateResponse(messages, { model: GEMINI_PRO_MODEL, maxTokens: 6000 });
  const text = typeof out === 'string' ? out : (out?.text || out?.content || JSON.stringify(out));
  let parsed = parseJsonLoose(text);

  // Stat-integrity gate — same auditor + retry pattern as the scratch arm:
  // gate on the `retryable` array; one corrective retry, then hard fail.
  const corpus = userMsg;
  let audit = auditPickRationale({ rationale: parsed.rationale }, corpus);
  if (audit.retryable.length > 0) {
    console.log(`[Specials] statAudit: ${audit.retryable.length} untraceable claim(s) — one corrective retry`);
    const retryOut = await geminiService.generateResponse(
      [...messages, { role: 'assistant', content: text }, { role: 'user', content: buildStatAuditRetryMessage(audit.retryable) }],
      { model: GEMINI_PRO_MODEL, maxTokens: 6000 }
    );
    const retryText = typeof retryOut === 'string' ? retryOut : (retryOut?.text || retryOut?.content || '');
    parsed = parseJsonLoose(retryText);
    audit = auditPickRationale({ rationale: parsed.rationale }, corpus);
    if (audit.retryable.length > 0) throw new Error(`statAudit still failing after retry: ${JSON.stringify(audit.retryable).slice(0, 400)}`);
  }
  return parsed;
}

async function runDerby() {
  console.log('[Specials] ── HOME RUN DERBY ──');
  const { briefText, blocks } = await buildDerbyData();
  const schema = `{"pick_player": "Full Name", "pick_text": "e.g. Schwarber to win the Derby +310", "odds": 310, "book": "FanDuel", "confidence": 0.55, "rationale": "Gary's voice, 180-260 words"}`;
  const user = `EVENT BRIEF (grounded today):\n${briefText}\n\nVERIFIED 2026 STAT BLOCKS (only citable numbers):\n${blocks}\n\nTASK: Pick ONE winner of tonight's Home Run Derby. Weigh raw power (SLG/xSLG, HR), the 20-swing format, and the Citizens Bank Park home crowd angle if the brief supports it. pick_text stays under 40 characters, format "<LastName> to win the Derby +NNN" (omit +NNN if odds are null).\n\nJSON schema: ${schema}`;
  const p = await garyCall(user);
  console.log(`[Specials] ✅ DERBY PICK: ${p.pick_text} (conf ${p.confidence})${p.book ? ` @ ${p.book}` : ''}`);
  return {
    pick: p.pick_text,
    odds: typeof p.odds === 'number' ? p.odds : null,
    type: 'special',
    league: 'MLB',
    sport: 'baseball_mlb',
    time: '8:00 PM',
    awayTeam: 'Home Run Derby',
    homeTeam: 'Citizens Bank Park',
    venue: 'Citizens Bank Park',
    tournamentContext: 'All-Star Week',
    // Numeric synthetic id — the shipped iOS GaryPick decodes game_id as Int?,
    // so a string here would drop to nil (or worse in strict decode paths).
    // 20260713 sits far above BDL's MLB id range (~8.7M) — no collision.
    game_id: 20260713,
    commence_time: '2026-07-14T00:00:00.000Z',
    confidence: p.confidence ?? 0.5,
    rationale: p.rationale,
    bestLineBook: p.book || null,
    statsUsed: [], statsData: [], injuries: null,
  };
}

async function runAsg() {
  console.log('[Specials] ── ALL-STAR GAME ──');
  const { briefText, blocks } = await buildAsgData();
  const schema = `{"pick_side": "National League" | "American League", "pick_text": "e.g. National League ML -130", "odds": -130, "book": "DraftKings", "confidence": 0.55, "rationale": "Gary's voice, 180-260 words"}`;
  const user = `EVENT BRIEF (grounded today):\n${briefText}\n\nVERIFIED 2026 STAT BLOCKS (only citable numbers):\n${blocks}\n\nTASK: Pick a side in tomorrow's All-Star Game (moneyline). pick_text format "<League> ML -NNN" using a board price with its book.\n\nJSON schema: ${schema}`;
  const p = await garyCall(user);
  console.log(`[Specials] ✅ ASG PICK: ${p.pick_text} (conf ${p.confidence})${p.book ? ` @ ${p.book}` : ''}`);
  return {
    pick: p.pick_text,
    odds: typeof p.odds === 'number' ? p.odds : null,
    type: 'moneyline',
    league: 'MLB',
    sport: 'baseball_mlb',
    time: '8:00 PM',
    awayTeam: 'American League',
    homeTeam: 'National League',
    venue: 'Citizens Bank Park',
    tournamentContext: 'All-Star Game',
    // Real BDL game id for the 2026 ASG (verified Jul 13) — numeric for the
    // shipped iOS decoder, and joins if BDL ever carries the box score.
    game_id: 8712499,
    commence_time: '2026-07-15T00:00:00.000Z',
    confidence: p.confidence ?? 0.5,
    rationale: p.rationale,
    bestLineBook: p.book || null,
    statsUsed: [], statsData: [], injuries: null,
  };
}

(async () => {
  const picks = [];
  const overrides = new Map();
  if (RUN_DERBY) picks.push(await runDerby());
  if (RUN_ASG) {
    const asg = await runAsg();
    picks.push(asg);
    overrides.set(asg.game_id, '2026-07-14'); // ASG lives in its game day's row
  }
  for (const p of picks) {
    console.log('\n──────── PICK OBJECT ────────');
    console.log(JSON.stringify({ ...p, rationale: `${(p.rationale || '').slice(0, 120)}…` }, null, 2));
    console.log('──────── RATIONALE ────────');
    console.log(p.rationale);
  }
  if (DRY_RUN) { console.log('\n[Specials] dry run — nothing stored.'); process.exit(0); }
  for (const p of picks) {
    const res = await picksService.storeDailyPicksInDatabase([p], overrides.get(p.game_id) || null);
    console.log(`[Specials] store ${p.game_id} → ${JSON.stringify(res).slice(0, 200)}`);
  }
  console.log('[Specials] Done.');
  process.exit(0);
})().catch(e => { console.error('[Specials] FAILED:', e.message); process.exit(1); });
