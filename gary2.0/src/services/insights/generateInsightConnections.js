// gary2.0/src/services/insights/generateInsightConnections.js
//
// Orchestrator for the insight_connections feature.
//
// generateInsightConnections({ date, league }) loads today's slate ONCE,
// then fans out to a set of independent per-connection "computer" functions.
// Each computer is responsible for its own data fetching, is fully defensive
// (returns [] and never throws when data is missing), and returns rows that
// already match the insight_connections table contract.
//
// The orchestrator's only jobs:
//   1. Resolve the slate (so every computer scores against the SAME games).
//   2. Run computers concurrently, isolating failures (Promise.allSettled).
//   3. Flatten, de-dupe, sort by relevance, and hand the rows back.
//
// It does NOT write to Supabase or shape prose — computers own the content,
// the caller owns persistence (service-role upsert into insight_connections,
// per the supa conventions doc).
//
// Data source of truth: ballDontLieService.getMlbGamesForDate(dateStr)
//   "Returns Array of BDL game objects. The `id` field is the BDL game id —
//    this is what getMlbGameOdds, getMlbLineups, getMlbPlayerProps,
//    getMlbPlateAppearances all require."

import { ballDontLieService } from '../ballDontLieService.js';
import { todayStr, gameLabel, clampScore } from './shared.js';

// MLB connection computers (one file per lane under ./computers/).
import { computeHeatCheck } from './computers/heatCheck.js';
import { computePlatoonEdge } from './computers/platoonEdge.js';
import { computeBallparkShift } from './computers/ballparkShift.js';
import { computeRegressionWatch } from './computers/regressionWatch.js';
import { computeBeneficiary } from './computers/beneficiary.js';
import { computeRestFatigue } from './computers/restFatigue.js';
import { computeOwned } from './computers/owned.js';
import { computeCoolingOff } from './computers/coolingOff.js';

/**
 * Registry of computers per league. Each entry is an async fn:
 *   (ctx) => Promise<row[]>
 * where ctx = { date, season, league, games, helpers }.
 * Order is irrelevant — they run concurrently and results are merged/sorted.
 */
const MLB_COMPUTERS = [
  computeHeatCheck,
  computePlatoonEdge,
  computeBallparkShift,
  computeRegressionWatch,
  computeBeneficiary,
  computeRestFatigue,
  computeOwned,
  computeCoolingOff,
];

const COMPUTERS_BY_LEAGUE = {
  mlb: MLB_COMPUTERS,
};

/**
 * Generate insight_connections rows for a slate.
 *
 * @param {object} args
 * @param {string} [args.date]   YYYY-MM-DD. Defaults to today (local tz).
 * @param {string} [args.league] e.g. 'mlb'. Defaults to 'mlb'.
 * @param {object} [args.options]
 * @param {number} [args.options.maxRows]       cap on returned rows (default 60)
 * @param {number} [args.options.minRelevance]  drop rows below this (default 35)
 * @returns {Promise<object>} { date, league, season, gameCount, connections: row[] }
 */
export async function generateInsightConnections({ date, league = 'mlb', options = {} } = {}) {
  const dateStr = date || todayStr();
  const leagueKey = String(league || 'mlb').toLowerCase();
  const maxRows = Number.isFinite(options.maxRows) ? options.maxRows : 120;
  const minRelevance = Number.isFinite(options.minRelevance) ? options.minRelevance : 35;

  const computers = COMPUTERS_BY_LEAGUE[leagueKey];
  if (!computers) {
    console.warn(`[insights] No computers registered for league "${leagueKey}" — returning empty.`);
    return { date: dateStr, league: leagueKey, season: seasonForDate(dateStr), gameCount: 0, connections: [] };
  }

  // 1. Resolve today's slate ONCE. Every computer scores ONLY against games
  //    on this slate; an empty slate short-circuits everything.
  //    "getMlbGamesForDate(dateStr) — single positional arg (YYYY-MM-DD)."
  let games = [];
  try {
    games = (await ballDontLieService.getMlbGamesForDate(dateStr)) || [];
  } catch (err) {
    console.error('[insights] Failed to load slate:', err?.message || err);
    games = [];
  }

  if (!Array.isArray(games) || games.length === 0) {
    console.log(`[insights] No ${leagueKey.toUpperCase()} games found for ${dateStr} — nothing to compute.`);
    return { date: dateStr, league: leagueKey, season: seasonForDate(dateStr), gameCount: 0, connections: [] };
  }

  // BDL MLB game objects expose `away_team`; the computers read `visitor_team`.
  // Alias both directions so team abbr/id lookups and gameLabel resolve (no 'AWY').
  for (const g of games) {
    if (g && typeof g === 'object') {
      if (g.away_team && !g.visitor_team) g.visitor_team = g.away_team;
      if (g.visitor_team && !g.away_team) g.away_team = g.visitor_team;
    }
  }

  const season = seasonForDate(dateStr);

  // Shared, read-only context handed to every computer. The set of BDL game
  // ids on the slate lets each computer enforce "only games on today's slate".
  const slateGameIds = new Set(games.map((g) => g?.id).filter((x) => x != null));
  const ctx = {
    date: dateStr,
    season,
    league: leagueKey,
    games,
    slateGameIds,
    bdl: ballDontLieService,
    helpers: { gameLabel },
  };

  // 2. Fan out concurrently, isolating failures so one bad lane can't sink the run.
  const settled = await Promise.allSettled(
    computers.map(async (fn) => {
      const name = fn.name || 'computer';
      try {
        const rows = await fn(ctx);
        return Array.isArray(rows) ? rows : [];
      } catch (err) {
        // Defensive contract: a throwing computer is logged and dropped, never fatal.
        console.error(`[insights] computer "${name}" threw:`, err?.message || err);
        return [];
      }
    }),
  );

  // 3. Flatten + validate + filter to the slate + sort + de-dupe + cap.
  const raw = [];
  for (const r of settled) {
    if (r.status === 'fulfilled' && Array.isArray(r.value)) raw.push(...r.value);
  }

  const connections = postProcess(raw, { slateGameIds, minRelevance, maxRows });

  console.log(
    `[insights] ${leagueKey.toUpperCase()} ${dateStr}: ${games.length} games, ` +
      `${raw.length} raw connections -> ${connections.length} after filter/sort/cap.`,
  );

  return { date: dateStr, league: leagueKey, season, gameCount: games.length, connections };
}

/**
 * Validate rows against the table contract, enforce slate membership when a
 * game_id is present, drop low-relevance noise, sort best-edge-first, and
 * de-dupe near-identical rows (same category + game + value).
 */
function postProcess(rows, { slateGameIds, minRelevance, maxRows }) {
  const seen = new Set();
  const out = [];

  for (const row of rows) {
    if (!isValidRow(row)) continue;

    // If a computer tagged a game_id, it MUST be on today's slate.
    if (row.game_id != null && slateGameIds.size && !slateGameIds.has(row.game_id)) continue;

    row.relevance_score = clampScore(row.relevance_score);
    if (row.relevance_score < minRelevance) continue;

    const dedupeKey = `${row.category}|${row.game}|${row.player_id ?? ''}|${row.value}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);

    out.push(row);
  }

  out.sort((a, b) => b.relevance_score - a.relevance_score);
  return out.slice(0, maxRows);
}

/** Minimal table-contract validation. */
function isValidRow(row) {
  return (
    row &&
    typeof row === 'object' &&
    typeof row.category === 'string' && row.category.length > 0 &&
    typeof row.headline === 'string' && row.headline.length > 0 &&
    typeof row.detail === 'string' && row.detail.length > 0 &&
    typeof row.game === 'string' && row.game.length > 0 &&
    row.value != null &&
    typeof row.tone === 'string' &&
    Number.isFinite(Number(row.relevance_score))
  );
}

/**
 * MLB "season" for a date string. The BDL season is the calendar year of the
 * regular season; getMlbStandings / getMlbPlayerSeasonStats / splits / xStats
 * all key on this. Default to the YYYY of the date.
 */
function seasonForDate(dateStr) {
  const y = Number(String(dateStr).slice(0, 4));
  return Number.isFinite(y) ? y : new Date().getFullYear();
}

export default { generateInsightConnections };
