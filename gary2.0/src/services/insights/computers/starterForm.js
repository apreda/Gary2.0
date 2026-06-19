// gary2.0/src/services/insights/computers/starterForm.js
//
// LANE: starterForm  (category token emitted: starter_form)
// "Tonight's probable starter is on a heater or in a skid — his last 3 starts
//  look nothing like his season line, and most lines price off the season line."
//
// Approach (documented BDL methods only):
//   - For each slate game, take BOTH probable starters from getMlbLineups(gameId)
//     (pitcher per side; skip silently when the lineup/pitcher isn't posted).
//   - getMlbPlayerGameRowsChrono(playerId, season): the starter's completed-game
//     box rows oldest -> newest (STATUS_FINAL, non-spring only; verified shape:
//     ip thirds-decimal, er, p_k, p_bb, p_hits, p_runs, p_hr — probed live
//     2026-06-10). Rows for TONIGHT'S slate game are excluded, and slate games
//     that are ALREADY FINAL are skipped entirely (a BDL slate date is a UTC
//     date, so last night's finals share it — a "tonight's starter" row about
//     a finished game is dead content and would grade with hindsight).
//   - Window = the last 3 pitching rows (ip > 0). Recent ERA/WHIP computed
//     exactly from summed ER / IP (thirds convention) / hits+walks.
//   - Season baseline from getMlbPlayerSeasonStats({ season, playerIds }) —
//     pitching_era / pitching_whip on the per-player record.
//   - Guards FAIL CLOSED: need 3 full window starts, >= MIN_WINDOW_IP innings in
//     the window, >= MIN_SEASON_STARTS total pitching rows, and a finite season
//     ERA. Edge = seasonEra - recentEra; |edge| >= MIN_ERA_EDGE surfaces.
//
// Tone: HOT when the recent ERA is well under the season mark (dealing),
// COLD when it is well over (getting hit). Grading (run-grade-insights.js)
// reads the BDL player_id straight off the row: HOT rows confirm on a clean
// outing (ER bands), COLD rows on a rough one.
//
// Defensive: any missing piece -> skip that starter silently; never throws.
// Emits a one-line examined/emitted summary for 0-row diagnosability.

import {
  makeRow, TONES, scoreFromEdge, round, parseIpThirds, pickVariant,
} from '../shared.js';

// Tunables.
const WINDOW_STARTS = 3;        // "last 3 starts" window
const MIN_WINDOW_IP = 12;       // require a real innings sample across the window
const MIN_SEASON_STARTS = 7;    // require a season body of work beyond the window
const MIN_ERA_EDGE = 1.40;      // recent ERA must beat/trail season by this much
const MAX_ROWS = 6;             // slate-wide cap, relevance-ranked
const RELEVANCE_SCALE = 13;     // 1.4-run gap -> ~62, 2.5 -> ~71, 4+ -> ~80+

export async function computeStarterForm(ctx) {
  const { games, season, bdl, helpers } = ctx;
  const candidates = [];
  const stats = { examined: 0, emitted: 0 };

  for (const game of games) {
    try {
      candidates.push(...(await starterFormForGame(
        game, { season, bdl, gameLabel: helpers.gameLabel, stats },
      )));
    } catch (err) {
      console.error('[starterForm] game error:', err?.message || err);
    }
  }

  // Slate-wide cap, biggest form swing first.
  candidates.sort((a, b) => b.relevance_score - a.relevance_score);
  const rows = candidates.slice(0, MAX_ROWS);
  stats.emitted = rows.length;
  console.log(`[starterForm] examined ${stats.examined}, emitted ${stats.emitted}`);
  return rows;
}

async function starterFormForGame(game, { season, bdl, gameLabel, stats }) {
  const gameId = game?.id;
  if (gameId == null) return [];
  if (String(game?.status || '').toUpperCase().includes('FINAL')) return [];
  const label = gameLabel(game);

  const lineups = await bdl.getMlbLineups(gameId);
  if (!lineups || typeof lineups !== 'object') return [];

  const sides = [
    { abbr: game?.home_team?.abbreviation, teamId: game?.home_team?.id },
    { abbr: game?.visitor_team?.abbreviation, teamId: game?.visitor_team?.id },
  ];

  const out = [];
  for (const { abbr, teamId } of sides) {
    const pitcher = abbr ? lineups[abbr]?.pitcher : null;
    const playerId = pitcher?.playerId;
    if (playerId == null) continue;
    if (stats) stats.examined += 1;

    // Completed pitching rows, oldest -> newest, excluding tonight's game.
    let chrono = [];
    try {
      chrono = (await bdl.getMlbPlayerGameRowsChrono(playerId, season)) || [];
    } catch (err) {
      console.error('[starterForm] chrono error:', err?.message || err);
      continue;
    }
    const pitched = chrono.filter((r) => r.game_id !== gameId && parseIpThirds(r.ip) > 0);
    if (pitched.length < MIN_SEASON_STARTS) continue;

    const window = pitched.slice(-WINDOW_STARTS);
    if (window.length < WINDOW_STARTS) continue;

    let ip = 0; let er = 0; let hits = 0; let bb = 0; let k = 0;
    for (const r of window) {
      ip += parseIpThirds(r.ip);
      er += Number(r.er) || 0;
      hits += Number(r.p_hits) || 0;
      bb += Number(r.p_bb) || 0;
      k += Number(r.p_k) || 0;
    }
    if (ip < MIN_WINDOW_IP) continue;

    const recentEra = (er / ip) * 9;
    const recentWhip = (hits + bb) / ip;

    // Season baseline — FAIL CLOSED on a missing/zero season ERA.
    let seasonEra = null;
    let seasonWhip = null;
    try {
      const seasonRows = (await bdl.getMlbPlayerSeasonStats({ season, playerIds: [playerId] })) || [];
      const rec = seasonRows.find((r) => r?.player?.id === playerId) || seasonRows[0];
      const e = Number(rec?.pitching_era);
      const w = Number(rec?.pitching_whip);
      if (Number.isFinite(e) && e > 0) seasonEra = e;
      if (Number.isFinite(w) && w > 0) seasonWhip = w;
    } catch (err) {
      console.error('[starterForm] season stats error:', err?.message || err);
    }
    if (seasonEra == null) continue;

    const edge = seasonEra - recentEra; // positive = heater, negative = skid
    if (Math.abs(edge) < MIN_ERA_EDGE) continue;

    const hot = edge > 0;
    const name = pitcher.name || 'Starter';
    const reEra = round(recentEra, 2).toFixed(2);
    const seEra = round(seasonEra, 2).toFixed(2);
    const reWhip = round(recentWhip, 2).toFixed(2);
    const ipDisp = round(ip, 1);

    const headline = `${name}: ${reEra} ERA over his last ${WINDOW_STARTS} starts`;

    const whipClause = seasonWhip != null
      ? ` with a ${reWhip} WHIP (${round(seasonWhip, 2).toFixed(2)} season)`
      : ` with a ${reWhip} WHIP`;
    const variants = hot ? [
      `Across his last ${WINDOW_STARTS} starts (${ipDisp} IP) he has a ${reEra} ERA${whipClause} and ${k} strikeouts — his season mark is ${seEra}, and that is where most lines still price him.`,
      `The last ${WINDOW_STARTS} times out: ${ipDisp} innings, ${er} earned runs, ${k} Ks. That ${reEra} ERA sits ${round(Math.abs(edge), 2)} runs under his ${seEra} season number.`,
      `He has allowed ${er} earned runs over his last ${ipDisp} innings (${reEra} ERA)${whipClause} — a different pitcher than the ${seEra} season line says.`,
    ] : [
      `Across his last ${WINDOW_STARTS} starts (${ipDisp} IP) he has been tagged for ${er} earned runs — a ${reEra} ERA${whipClause} against a ${seEra} season mark.`,
      `The last ${WINDOW_STARTS} times out: ${ipDisp} innings, ${er} earned runs, ${hits} hits. That ${reEra} ERA runs ${round(Math.abs(edge), 2)} over his ${seEra} season number.`,
      `He is carrying a ${reEra} ERA over his last ${ipDisp} innings${whipClause} — the ${seEra} season line is doing a lot of work for him right now.`,
    ];

    out.push(makeRow({
      category: 'starterForm',
      headline,
      detail: pickVariant(variants, playerId),
      game: label,
      value: reEra,
      tone: hot ? TONES.HOT : TONES.COLD,
      spark: [round(seasonEra, 2), round(recentEra, 2)],
      relevance_score: scoreFromEdge(edge, { scale: RELEVANCE_SCALE, base: 45 }),
      player_id: playerId,
      team_id: teamId,
      game_id: gameId,
      meta: {
        kind: 'starter_form',
        window_starts: WINDOW_STARTS,
        window_ip: round(ip, 1),
        window_er: er,
        window_k: k,
        recent_era: round(recentEra, 2),
        recent_whip: round(recentWhip, 2),
        season_era: round(seasonEra, 2),
        ...(seasonWhip != null ? { season_whip: round(seasonWhip, 2) } : {}),
      },
    }));
  }
  return out;
}

export default { computeStarterForm };
