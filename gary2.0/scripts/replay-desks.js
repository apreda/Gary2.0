#!/usr/bin/env node
/**
 * Offline contract replay bench (founder GO, Jul 29 2026).
 *
 * Re-runs STORED desks (pick_desks) through the desk brain under two contract
 * arms — A = current wording, B = candidate — same model, same pinned effort,
 * no store, zero production surface. Paired design: the same desk goes through
 * both arms, so a side flip is attributable to the wording, not the game.
 *
 * GATE (pre-registered, see prompt_eras): the candidate ships only if flips
 * concentrate in the COIN_FLIP/LEAN bands and the STRONG/HELD flip rate
 * stays ~0. Flips should skew TOWARD plus-money, not away.
 *
 * Usage:
 *   GARY_MODEL_OVERRIDE=claude-fable-5 node scripts/replay-desks.js --n=36 --days=9 --conc=4
 */
import '../src/loadEnv.js';
import { writeFileSync, mkdirSync } from 'fs';
import { createClient } from '@supabase/supabase-js';
import { buildGarySystemPrompt, THE_ASK } from '../src/services/pickdesk/garyBrain.js';
import { createGeminiSession, sendToSessionWithRetry } from '../src/services/agentic/orchestrator/sessionManager.js';

const args = Object.fromEntries(process.argv.slice(2).map((a) => {
  const m = a.match(/^--([^=]+)=(.*)$/); return m ? [m[1], m[2]] : [a.replace(/^--/, ''), '1'];
}));
const N = parseInt(args.n || '36', 10);
const DAYS = parseInt(args.days || '9', 10);
const CONC = parseInt(args.conc || '4', 10);
const MODEL = process.env.GARY_MODEL_OVERRIDE || 'claude-fable-5';

// ── The two arms ────────────────────────────────────────────────────────────
// Arm B is CURRENT text + exactly the two-line candidate diff, built by
// replacement so any other contract line stays byte-identical across arms.
const ASK_A = THE_ASK;
const ASK_B = THE_ASK
  .replace('Pick the bet you want to take.', 'Pick the bet you want to take — a bet is a side and its price.')
  .replace(/confidence_score \(0\.50–1\.00\):[^\n]*/,
    'confidence_score (0.50–1.00): your conviction in this bet at its price — the bet, not the outcome.');
if (ASK_B === ASK_A) { console.error('candidate diff did not apply — aborting'); process.exit(1); }

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY,
);

const todayLong = () => new Date().toLocaleDateString('en-US', {
  weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'America/New_York',
});
const parseFinalJson = (t) => {
  try {
    const m = String(t || '').match(/```json\s*([\s\S]*?)```/i) || String(t || '').match(/(\{[\s\S]*\})/);
    const o = JSON.parse(m[1]);
    return o.final_pick ? o : null;
  } catch { return null; }
};

const implied = (o) => (o < 0 ? Math.abs(o) / (Math.abs(o) + 100) : 100 / (o + 100));
function parseBoard(desk, matchup) {
  const [awayTeam, homeTeam] = String(matchup).split(' @ ').map((s) => s?.trim());
  const m = String(desk).match(/═══ THE LINES[^\n]*\n.*? ML ([+\-]\d+) \| .*? ML ([+\-]\d+)/);
  if (!m) return { awayTeam, homeTeam, band: 'UNKNOWN', mlAway: null, mlHome: null };
  const mlAway = parseInt(m[1], 10), mlHome = parseInt(m[2], 10);
  const pa = implied(mlAway), ph = implied(mlHome);
  const fav = Math.max(pa, ph) / (pa + ph);
  const band = fav <= 0.55 ? 'COIN_FLIP' : fav <= 0.625 ? 'LEAN' : fav <= 0.725 ? 'HELD' : 'STRONG';
  return { awayTeam, homeTeam, band, mlAway, mlHome };
}
const lastWord = (s) => String(s || '').toLowerCase().trim().split(/\s+/).pop();
function pickedSide(finalPick, board) {
  const fp = String(finalPick || '').toLowerCase();
  const home = fp.includes(lastWord(board.homeTeam));
  const away = fp.includes(lastWord(board.awayTeam));
  if (home === away) return null; // both (shared mascot) or neither — unusable
  return home ? 'home' : 'away';
}

async function runArm(desk, matchup, ask) {
  const session = await createGeminiSession({
    modelName: MODEL,
    systemPrompt: buildGarySystemPrompt(todayLong()),
    tools: [],
    thinkingLevel: 'xhigh',
  });
  const res = await sendToSessionWithRetry(session, `## THE DESK — ${matchup}\n\n${desk}\n\n${ask}`, {});
  return parseFinalJson(res.content);
}

async function main() {
  const cutoff = new Date(Date.now() - DAYS * 86400000).toISOString().slice(0, 10);
  const { data, error } = await sb.from('pick_desks')
    .select('game_date, matchup, pick, desk, created_at')
    .gte('game_date', cutoff)
    .order('created_at', { ascending: false })
    .limit(400);
  if (error) throw new Error(`pick_desks fetch: ${error.message}`);

  const seen = new Set();
  const desks = [];
  for (const r of data || []) {
    const k = `${r.game_date}|${r.matchup}`;
    if (seen.has(k)) continue;
    seen.add(k);
    desks.push(r);
    if (desks.length >= N) break;
  }
  console.log(`Replaying ${desks.length} desks (${cutoff}+) on ${MODEL}, two arms, conc ${CONC}`);

  const rows = [];
  let idx = 0;
  async function worker(wid) {
    while (idx < desks.length) {
      const i = idx++;
      const d = desks[i];
      const board = parseBoard(d.desk, d.matchup);
      try {
        const [a, b] = [await runArm(d.desk, d.matchup, ASK_A), await runArm(d.desk, d.matchup, ASK_B)];
        const aSide = a ? pickedSide(a.final_pick, board) : null;
        const bSide = b ? pickedSide(b.final_pick, board) : null;
        const sideMl = (s) => (s === 'home' ? board.mlHome : s === 'away' ? board.mlAway : null);
        const row = {
          date: d.game_date, matchup: d.matchup, band: board.band,
          a_pick: a?.final_pick ?? null, b_pick: b?.final_pick ?? null,
          a_side: aSide, b_side: bSide,
          a_conf: a?.confidence_score ?? null, b_conf: b?.confidence_score ?? null,
          flip: !!(aSide && bSide && aSide !== bSide),
          a_plus: aSide ? (sideMl(aSide) > 0) : null,
          b_plus: bSide ? (sideMl(bSide) > 0) : null,
        };
        rows.push(row);
        console.log(`[${rows.length}/${desks.length}] ${d.matchup} (${board.band}) A=${row.a_pick} B=${row.b_pick}${row.flip ? '  ← FLIP' : ''}`);
      } catch (e) {
        console.error(`[w${wid}] ${d.matchup}: ${e.message}`);
        rows.push({ date: d.game_date, matchup: d.matchup, band: board.band, error: e.message });
      }
    }
  }
  await Promise.all(Array.from({ length: CONC }, (_, w) => worker(w)));

  const bands = ['COIN_FLIP', 'LEAN', 'HELD', 'STRONG', 'UNKNOWN'];
  console.log('\n══ REPLAY SUMMARY ══');
  for (const band of bands) {
    const bs = rows.filter((r) => r.band === band && !r.error && r.a_side && r.b_side);
    if (!bs.length) continue;
    const flips = bs.filter((r) => r.flip);
    const aPlus = bs.filter((r) => r.a_plus).length;
    const bPlus = bs.filter((r) => r.b_plus).length;
    console.log(`${band.padEnd(10)} pairs=${bs.length}  flips=${flips.length}  plus-money A=${aPlus} → B=${bPlus}`);
  }
  mkdirSync('outputs', { recursive: true });
  const out = `outputs/replay-${Date.now()}.json`;
  writeFileSync(out, JSON.stringify({ model: MODEL, n: desks.length, ask_b_diff: ASK_B, rows }, null, 1));
  console.log(`\nSaved ${out}`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
