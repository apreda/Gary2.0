#!/usr/bin/env node
/**
 * Offline DESK-DATA replay bench — the morning-board line (founder GO, Jul 31,
 * the Mariners/Ohtani trap autopsy).
 *
 * Re-runs STORED desks (pick_desks) through the desk brain under two DESK
 * arms — A = the desk exactly as Gary read it, B = the same desk with the
 * MORNING BOARD line injected into THE LINES (built from that game day's
 * real daily_slate snapshot). The CONTRACT is identical across arms, so a
 * side flip is attributable to the added data, not the wording.
 *
 * GATES (pre-registered before the run):
 *   1. ANCHORING TRIPWIRE (abort): arm B's plus-money take rate must not
 *      fall more than 5 points below arm A's, and B must not flip toward
 *      favorites in games whose line DIDN'T move — more price context must
 *      not mean more line-following.
 *   2. Flips concentrate where the line MOVED (implied-prob delta >= 0.025,
 *      ~a dime at even money); at most one incidental flip among unmoved.
 *   3. Parse/format intact — no error-rate increase across arms.
 *
 * Usage:
 *   GARY_MODEL_OVERRIDE=claude-fable-5 node scripts/replay-desk-lines.js --n=25 --days=3 --conc=4
 */
import '../src/loadEnv.js';
import { writeFileSync, mkdirSync } from 'fs';
import { createClient } from '@supabase/supabase-js';
import { buildGarySystemPrompt } from '../src/services/pickdesk/garyBrain.js';
import { createGeminiSession, sendToSessionWithRetry } from '../src/services/agentic/orchestrator/sessionManager.js';

// STALE twice over: morningBoardLine was deleted from the desk (Aug 4 2026)
// and the blind split (Aug 5 2026) replaced THE_ASK with a three-turn
// contract. Rebuild this bench before running it again.
throw new Error('replay-desk-lines predates the morning-board removal and the blind-split contract — rebuild before use');

const args = Object.fromEntries(process.argv.slice(2).map((a) => {
  const m = a.match(/^--([^=]+)=(.*)$/); return m ? [m[1], m[2]] : [a.replace(/^--/, ''), '1'];
}));
const N = parseInt(args.n || '25', 10);
const DAYS = parseInt(args.days || '3', 10);
const CONC = parseInt(args.conc || '4', 10);
const MODEL = process.env.GARY_MODEL_OVERRIDE || 'claude-fable-5';
const MOVE_EPS = 0.025;   // implied-prob delta that counts as "the line moved"

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
  const [awayTeam, homeTeam] = String(matchup).split(' @ ');
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
  if (home === away) return null;
  return home ? 'home' : 'away';
}

/** Inject the morning line as the LAST row of THE LINES section. */
function injectMorningLine(desk, line) {
  const marker = '\n\n═══ THE STAKES ═══';
  if (!desk.includes(marker)) return null;
  return desk.replace(marker, `\n${line}${marker}`);
}

async function runArm(desk, matchup) {
  const session = await createGeminiSession({
    modelName: MODEL,
    systemPrompt: buildGarySystemPrompt(todayLong()),
    tools: [],
    thinkingLevel: 'xhigh',
  });
  const res = await sendToSessionWithRetry(session, `## THE DESK — ${matchup}\n\n${desk}\n\n${THE_ASK}`, {});
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

  // Morning slate rows for every desk day, one query per day.
  const days = [...new Set(desks.map((d) => d.game_date))];
  const slateByDay = new Map();
  for (const day of days) {
    const { data: rows } = await sb.from('daily_slate')
      .select('home_team,away_team,ml_home,ml_away,spread,total,bdl_game_id,created_at')
      .eq('date', day).eq('league', 'MLB');
    slateByDay.set(day, rows || []);
  }
  const slateFor = (d, board) => (slateByDay.get(d.game_date) || []).find((r) =>
    lastWord(r.home_team) === lastWord(board.homeTeam) && lastWord(r.away_team) === lastWord(board.awayTeam)) || null;

  console.log(`Desk-data replay: ${desks.length} stored desks (${cutoff}+) on ${MODEL}, conc ${CONC}`);

  const rows = [];
  let idx = 0;
  async function worker(wid) {
    while (idx < desks.length) {
      const i = idx++;
      const d = desks[i];
      const board = parseBoard(d.desk, d.matchup);
      const slate = slateFor(d, board);
      const line = slate ? morningBoardLine(slate, board.homeTeam, board.awayTeam) : '';
      const deskB = line ? injectMorningLine(d.desk, line) : null;
      if (!deskB) {
        rows.push({ date: d.game_date, matchup: d.matchup, band: board.band, skipped: 'no morning line/injection point' });
        console.log(`[skip] ${d.matchup} — no morning line`);
        continue;
      }
      // Implied-prob movement between the morning snapshot and the desk's board.
      const dp = (board.mlAway != null && slate.ml_away != null && board.mlHome != null && slate.ml_home != null)
        ? Math.max(Math.abs(implied(board.mlAway) - implied(Number(slate.ml_away))),
                   Math.abs(implied(board.mlHome) - implied(Number(slate.ml_home))))
        : null;
      try {
        const [a, b] = [await runArm(d.desk, d.matchup), await runArm(deskB, d.matchup)];
        const aSide = a ? pickedSide(a.final_pick, board) : null;
        const bSide = b ? pickedSide(b.final_pick, board) : null;
        const sideMl = (s) => (s === 'home' ? board.mlHome : s === 'away' ? board.mlAway : null);
        const row = {
          date: d.game_date, matchup: d.matchup, band: board.band,
          moved: dp != null ? dp >= MOVE_EPS : null, dp: dp != null ? Number(dp.toFixed(4)) : null,
          injected: line,
          a_pick: a?.final_pick ?? null, b_pick: b?.final_pick ?? null,
          a_side: aSide, b_side: bSide,
          a_conf: a?.confidence_score ?? null, b_conf: b?.confidence_score ?? null,
          flip: !!(aSide && bSide && aSide !== bSide),
          a_plus: aSide ? (sideMl(aSide) > 0) : null,
          b_plus: bSide ? (sideMl(bSide) > 0) : null,
        };
        rows.push(row);
        console.log(`[${rows.filter((r) => !r.skipped).length}/${desks.length}] ${d.matchup} (${board.band}, ${row.moved ? 'MOVED' : 'still'} dp=${row.dp}) A=${row.a_pick} B=${row.b_pick}${row.flip ? '  ← FLIP' : ''}`);
      } catch (e) {
        console.error(`[w${wid}] ${d.matchup}: ${e.message}`);
        rows.push({ date: d.game_date, matchup: d.matchup, band: board.band, error: e.message });
      }
    }
  }
  await Promise.all(Array.from({ length: CONC }, (_, w) => worker(w)));

  const ok = rows.filter((r) => !r.error && !r.skipped && r.a_side && r.b_side);
  const moved = ok.filter((r) => r.moved === true);
  const still = ok.filter((r) => r.moved === false);
  const rate = (xs, f) => (xs.length ? (xs.filter(f).length / xs.length) : 0);
  console.log('\n══ DESK-DATA REPLAY SUMMARY ══');
  console.log(`pairs=${ok.length} (moved=${moved.length}, still=${still.length}, skipped=${rows.filter((r) => r.skipped).length}, errors=${rows.filter((r) => r.error).length})`);
  console.log(`MOVED:  flips=${moved.filter((r) => r.flip).length}  plus-money A=${(rate(moved, (r) => r.a_plus) * 100).toFixed(0)}% → B=${(rate(moved, (r) => r.b_plus) * 100).toFixed(0)}%`);
  console.log(`STILL:  flips=${still.filter((r) => r.flip).length}  plus-money A=${(rate(still, (r) => r.a_plus) * 100).toFixed(0)}% → B=${(rate(still, (r) => r.b_plus) * 100).toFixed(0)}%`);
  console.log(`OVERALL plus-money A=${(rate(ok, (r) => r.a_plus) * 100).toFixed(0)}% → B=${(rate(ok, (r) => r.b_plus) * 100).toFixed(0)}%`);
  const confs = (k) => ok.map((r) => Number(r[k])).filter(Number.isFinite);
  const mean = (xs) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : NaN);
  console.log(`conf mean A=${mean(confs('a_conf')).toFixed(3)} B=${mean(confs('b_conf')).toFixed(3)}`);
  for (const r of ok.filter((x) => x.flip)) {
    console.log(`FLIP ${r.date} ${r.matchup} [${r.band}, dp=${r.dp}]: ${r.a_pick} → ${r.b_pick}`);
  }

  mkdirSync('outputs', { recursive: true });
  const out = `outputs/replay-desklines-${Date.now()}.json`;
  writeFileSync(out, JSON.stringify({ model: MODEL, n: desks.length, rows }, null, 1));
  console.log(`\nSaved ${out}`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });