/**
 * THE JUNE ENGINE (founder, Sep 11 2026: "we just have to go back to June…
 * the only difference between June and now for MLB should be the models").
 *
 * Every file in this folder is the June 15 2026 tree (commit c27db5f0) —
 * the scout report, the research assistant's checklist, Gary's constitution,
 * the Pass 1 / Pass 2.5 / Pass 3 turns, the stat audit, the response parser —
 * lifted verbatim. The lines that differ are marked ADAPTED at the top of
 * each file and are of exactly three kinds: model names (Gemini is retired),
 * import paths (this folder sits beside the September orchestrator, and the
 * data layer underneath is today's repaired one), and the other sports'
 * modules this lane never loads. Beyond those, what Gary or his research
 * assistant reads changes only by a founder-approved exception, each marked
 * ADAPTED where it lands with its date: the bullpen evidence (Sep 16 2026),
 * team form and the game stories (Sep 2026), and on Oct 4 2026 the
 * postseason desk and instructions, web reading, the moneyline-only pick and
 * the baseball-only base rules.
 *
 * The MLB game lane enters here; NFL, NCAAF and NBA never do.
 */
export { analyzeGame } from './orchestratorMain.js';
export { mlbJuneEraSha } from './eraSha.js';
