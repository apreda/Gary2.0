/**
 * PAIRED PROP-BOARD BENCH — legacy board (arm A) vs market-first board V2
 * (arm B), same games, same raw feed, same brain, same contract. Aug 3 2026.
 *
 * Both arms run the REAL props brain path (analyzeMlbPropsDesk) and the REAL
 * chassis semantics (odds reconciliation, hard gate, 2-per-game cap) mirrored
 * from run-agentic-props-cli.js — arm A reproduces the legacy split-row
 * reconciliation faithfully, INCLUDING its find-first defect (an under pick
 * on a market whose over side also survived resolves against the over row's
 * null under_odds and dies "unverified"). Arm B reconciles against market
 * rows and enforces the -200..+400 window as bet permission.
 *
 * STORES NOTHING. Prints per-game arm summaries and a final report with the
 * pre-registered gates below; full JSON lands in the scratchpad for reading.
 *
 * PRE-REGISTERED GATES (set before the run, Aug 3 2026 ~11:30 AM ET):
 *   G1  arm B under-share of brain picks ≥ 15%       (arm A baseline ~5%)
 *   G2  arm B shipped picks on two-sided markets ≥ 60%
 *   G3  arm B shipped volume within 0.5×–1.5× arm A
 *   G4  parse failures: 0 in both arms
 *   G5  arm B gate-drop rate ≤ arm A gate-drop rate + 10 pts
 * A failed gate pauses the cutover for the founder's read — it does not
 * auto-ship and does not auto-abort; the numbers decide nothing on their own.
 *
 * Usage: GARY_PROPS_MODEL_OVERRIDE=claude-sonnet-5 GARY_GROUNDING_VIA_CLAUDE=1 \
 *          node scripts/replay-prop-boards.js [--games=N]
 */
import '../src/loadEnv.js';
import fs from 'fs';
import { oddsService } from '../src/services/oddsService.js';
import { propOddsService } from '../src/services/propOddsService.js';
import { analyzeMlbPropsDesk, buildPropBoard, buildPropBoardV2 } from '../src/services/pickdesk/propsBrain.js';
const { applyPropsPerGameConstraint } = await import('../src/services/agentic/propsSharedUtils.js');

const OUT_JSON = '/private/tmp/claude-501/-Users-adam-preda/d0a95eae-a1d8-4613-b2e3-4ab7608b4dcd/scratchpad/prop-bench-results.json';
const maxGames = (() => {
  const a = process.argv.find(x => x.startsWith('--games='));
  return a ? parseInt(a.split('=')[1], 10) : Infinity;
})();

/** Chassis mirror: odds reconciliation + hard gate + per-game cap. */
function chassis(picks, rows, { enforceWindow }) {
  const dropped = [];
  let mapped = picks.map(pick => {
    const side = (pick.bet || '').toLowerCase();
    const over = side === 'over' || side === 'yes';
    const prop = String(pick.prop || '').trim();
    const line = pick.line;
    const row = rows.find(pp =>
      (pp.player || '').toLowerCase() === (pick.player || '').toLowerCase() &&
      (pp.prop_type || '').toLowerCase() === prop.toLowerCase() &&
      (line == null || Number(pp.line) === Number(line))
    );
    const providerOdds = row ? (over ? row.over_odds : row.under_odds) : null;
    return { ...pick, _row: row ?? null, _providerOdds: providerOdds, _over: over };
  });

  mapped = mapped.filter(p => {
    if (p._providerOdds == null) { dropped.push({ pick: p, reason: 'unverified' }); return false; }
    if (enforceWindow && !propOddsService.isOddsTakeable(p._providerOdds, String(p.prop || '').trim())) {
      dropped.push({ pick: p, reason: `off-window (${p._providerOdds})` });
      return false;
    }
    return true;
  });

  const { constrainedPicks } = applyPropsPerGameConstraint(mapped, 'BENCH-post');
  return { shipped: constrainedPicks, dropped };
}

const share = (n, d) => (d ? `${Math.round((100 * n) / d)}%` : '—');

function armStats(name, brainPicks, shipped, dropped, marketByKey) {
  const unders = (arr) => arr.filter(p => (p.bet || '').toLowerCase() === 'under').length;
  const twoSided = shipped.filter(p => {
    const mk = `${(p.player || '').toLowerCase()}|${String(p.prop || '').toLowerCase()}|${p.line}`;
    const m = marketByKey.get(mk);
    return m && m.over_odds != null && m.under_odds != null;
  }).length;
  const odds = shipped.map(p => Number(p._providerOdds)).filter(Number.isFinite);
  const plus = odds.filter(o => o > 0).length;
  return {
    name,
    brain: brainPicks.length,
    brainUnders: unders(brainPicks),
    shipped: shipped.length,
    shippedUnders: unders(shipped),
    gateDropped: dropped.length,
    twoSidedShipped: twoSided,
    plusMoneyShipped: plus,
    avgOdds: odds.length ? Math.round(odds.reduce((a, b) => a + b, 0) / odds.length) : null,
  };
}

// Today's ET slate only (getUpcomingGames spans into tomorrow).
const etDate = (iso) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso));
const todayEt = etDate(new Date().toISOString());
const games = (await oddsService.getUpcomingGames('baseball_mlb'))
  .filter(g => g.commence_time && etDate(g.commence_time) === todayEt)
  .slice(0, maxGames);
console.log(`\n═══ PROP BOARD BENCH — ${games.length} game(s) on ET ${todayEt}, model=${process.env.GARY_PROPS_MODEL_OVERRIDE || '(config default)'} ═══\n`);

const results = [];
let parseFailures = 0;

for (const game of games) {
  const matchup = `${game.away_team} @ ${game.home_team}`;
  const gameId = game.bdl_game_id ?? game.id ?? null;
  console.log(`\n──── ${matchup} (game ${gameId}) ────`);
  try {
    const markets = await propOddsService.getMlbPlayerPropMarkets(gameId);
    if (!markets.length) { console.log('  no props posted yet — skipped'); continue; }
    const legacyRows = propOddsService.filterPropsByOddsValue(markets);
    const marketByKey = new Map(markets.map(m => [`${(m.player || '').toLowerCase()}|${(m.prop_type || '').toLowerCase()}|${m.line}`, m]));

    // Arm A — the LEGACY system (split rows + V1 board, passed explicitly:
    // since the Aug 3 cutover the production default is V2).
    const resA = await analyzeMlbPropsDesk(game, legacyRows, { buildBoard: buildPropBoard });
    if (resA.error) parseFailures++;
    const chA = chassis(resA.picks || [], legacyRows, { enforceWindow: false });

    // Arm B — market rows + V2 board through the same brain (= production).
    const resB = await analyzeMlbPropsDesk(game, markets, { buildBoard: buildPropBoardV2 });
    if (resB.error) parseFailures++;
    const chB = chassis(resB.picks || [], markets, { enforceWindow: true });

    const a = armStats('A legacy', resA.picks || [], chA.shipped, chA.dropped, marketByKey);
    const b = armStats('B market', resB.picks || [], chB.shipped, chB.dropped, marketByKey);
    for (const s of [a, b]) {
      console.log(`  ${s.name}: brain ${s.brain} (${s.brainUnders}U) → shipped ${s.shipped} (${s.shippedUnders}U, ${s.twoSidedShipped} two-sided, avg odds ${s.avgOdds ?? '—'}), gate dropped ${s.gateDropped}`);
    }
    results.push({
      matchup, gameId,
      marketCounts: { raw: markets.length, legacyRows: legacyRows.length },
      armA: { stats: a, picks: chA.shipped, droppedByGate: chA.dropped.map(d => ({ p: `${d.pick.player} ${d.pick.bet} ${d.pick.prop} ${d.pick.line}`, reason: d.reason })), brainPicks: resA.picks },
      armB: { stats: b, picks: chB.shipped, droppedByGate: chB.dropped.map(d => ({ p: `${d.pick.player} ${d.pick.bet} ${d.pick.prop} ${d.pick.line}`, reason: d.reason })), brainPicks: resB.picks },
    });
    fs.writeFileSync(OUT_JSON, JSON.stringify(results, null, 2));
  } catch (err) {
    console.error(`  BENCH ERROR for ${matchup}: ${err.message}`);
    results.push({ matchup, gameId, error: err.message });
    fs.writeFileSync(OUT_JSON, JSON.stringify(results, null, 2));
  }
}

// ─── Final report + pre-registered gates ───
const ok = results.filter(r => !r.error);
const sum = (f) => ok.reduce((acc, r) => acc + f(r), 0);
const A = {
  brain: sum(r => r.armA.stats.brain), brainU: sum(r => r.armA.stats.brainUnders),
  ship: sum(r => r.armA.stats.shipped), shipU: sum(r => r.armA.stats.shippedUnders),
  drop: sum(r => r.armA.stats.gateDropped), two: sum(r => r.armA.stats.twoSidedShipped), plus: sum(r => r.armA.stats.plusMoneyShipped),
};
const B = {
  brain: sum(r => r.armB.stats.brain), brainU: sum(r => r.armB.stats.brainUnders),
  ship: sum(r => r.armB.stats.shipped), shipU: sum(r => r.armB.stats.shippedUnders),
  drop: sum(r => r.armB.stats.gateDropped), two: sum(r => r.armB.stats.twoSidedShipped), plus: sum(r => r.armB.stats.plusMoneyShipped),
};
console.log(`\n═══ BENCH TOTALS (${ok.length} game(s), ${results.length - ok.length} errored) ═══`);
console.log(`arm A legacy: brain ${A.brain} picks (${share(A.brainU, A.brain)} under) → shipped ${A.ship} (${share(A.shipU, A.ship)} under, ${share(A.two, A.ship)} two-sided, ${share(A.plus, A.ship)} plus-money), gate dropped ${A.drop}`);
console.log(`arm B market: brain ${B.brain} picks (${share(B.brainU, B.brain)} under) → shipped ${B.ship} (${share(B.shipU, B.ship)} under, ${share(B.two, B.ship)} two-sided, ${share(B.plus, B.ship)} plus-money), gate dropped ${B.drop}`);

const g1 = B.brain > 0 && B.brainU / B.brain >= 0.15;
const g2 = B.ship > 0 && B.two / B.ship >= 0.60;
const g3 = A.ship > 0 && B.ship >= 0.5 * A.ship && B.ship <= 1.5 * A.ship;
const g4 = parseFailures === 0;
const g5 = (B.brain === 0 || A.brain === 0) ? true : (B.drop / B.brain) <= (A.drop / A.brain) + 0.10;
console.log(`\nPRE-REGISTERED GATES:`);
console.log(`  G1 under-share of B brain picks ≥ 15%: ${g1 ? 'PASS' : 'FAIL'} (${share(B.brainU, B.brain)})`);
console.log(`  G2 B shipped two-sided ≥ 60%:          ${g2 ? 'PASS' : 'FAIL'} (${share(B.two, B.ship)})`);
console.log(`  G3 B volume 0.5×–1.5× A:               ${g3 ? 'PASS' : 'FAIL'} (A ${A.ship} vs B ${B.ship})`);
console.log(`  G4 zero parse failures:                ${g4 ? 'PASS' : 'FAIL'} (${parseFailures})`);
console.log(`  G5 B gate-drop rate ≤ A + 10pts:       ${g5 ? 'PASS' : 'FAIL'} (A ${share(A.drop, A.brain)} vs B ${share(B.drop, B.brain)})`);
console.log(`\nFull JSON: ${OUT_JSON}`);
console.log('BENCH COMPLETE');
