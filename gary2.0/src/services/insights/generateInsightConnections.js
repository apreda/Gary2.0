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
import fifaWorldCupService from '../fifaWorldCupService.js';
import { todayStr, gameLabel, clampScore } from './shared.js';

// MLB connection computers (one file per lane under ./computers/).
import { computeHeatCheck } from './computers/heatCheck.js';
import { computeGaryHrThreats } from './computers/garyHrThreats.js';
import { computePlatoonEdge } from './computers/platoonEdge.js';
import { computeBallparkShift } from './computers/ballparkShift.js';
import { computeRegressionWatch } from './computers/regressionWatch.js';
import { computeHitterRegression } from './computers/hitterRegression.js';
import { computeBeneficiary } from './computers/beneficiary.js';
import { computeRestFatigue } from './computers/restFatigue.js';
import { computeOwned } from './computers/owned.js';
import { computeCoolingOff } from './computers/coolingOff.js';
import { computeStarterForm } from './computers/starterForm.js';
import { computeStreaking } from './computers/streaking.js';
import { computeFirstInning } from './computers/firstInning.js';
import { computeRunningGame } from './computers/runningGame.js';
import { computeParkWeather } from './computers/parkWeather.js';

// NBA connection computers.
import { computeNbaRestFatigue } from './computers/nbaRestFatigue.js';
import { computeNbaStreak } from './computers/nbaStreak.js';
import { computeNbaBeneficiary } from './computers/nbaBeneficiary.js';
import { computeNbaOwned } from './computers/nbaOwned.js';

// World Cup connection computers (raw FIFA match objects, fifaWorldCupService).
import { computeWcForm } from './computers/wcForm.js';
import { computeWcH2h } from './computers/wcH2h.js';
import { computeWcStakes } from './computers/wcStakes.js';

// World Cup PREVIEW computers — pre-tournament / rest-day content (groups,
// pedigree, upcoming-opener history) shown whenever no WC match plays today
// but future fixtures exist. Hands off to the normal lanes on match days.
import { computeWcPreviewGroups } from './computers/wcPreviewGroups.js';
import { computeWcPedigree } from './computers/wcPedigree.js';
import { computeWcOpeners } from './computers/wcOpeners.js';

// Sharp-angle WC lanes (research-backed: rest differentials, venue altitude/
// heat, group-winner market value) — run in BOTH preview and match-day modes.
import { computeWcRestEdge } from './computers/wcRestEdge.js';
import { computeWcVenueEdge } from './computers/wcVenueEdge.js';
import { computeWcGroupValue } from './computers/wcGroupValue.js';
// Tournament-wide knockout/title context — runs in BOTH modes so the Hub stays
// dense once the group stage starts and the rich preview lanes drop away.
import { computeWcKnockoutPath } from './computers/wcKnockoutPath.js';
// xG / possession recap of the most recent completed match day. Silent ([])
// pre-tournament; lights up once matches are played.
import { computeWcXg } from './computers/wcXg.js';
// Forward-looking xG regression — who's over/under-finishing their chances, applied
// to today's fixtures (the FORWARD counterpart to wcXg's recap). Silent pre-tournament.
import { computeWcXgRegression } from './computers/wcXgRegression.js';
// Group-stage advancement odds — the bookmakers' 'to qualify from group' market per team.
import { computeWcAdvancementOdds } from './computers/wcAdvancementOdds.js';
import { computeWcConfirmedXI } from './computers/wcConfirmedXI.js';

/**
 * Registry of computers per league. Each entry is an async fn:
 *   (ctx) => Promise<row[]>
 * where ctx = { date, season, league, games, helpers }.
 * Order is irrelevant — they run concurrently and results are merged/sorted.
 */
const MLB_COMPUTERS = [
  computeHeatCheck,
  computeGaryHrThreats,
  computePlatoonEdge,
  computeBallparkShift,
  computeRegressionWatch,
  computeHitterRegression,
  computeBeneficiary,
  computeRestFatigue,
  computeOwned,
  computeCoolingOff,
  computeStarterForm,
  computeStreaking,
  computeFirstInning,
  computeRunningGame,
  computeParkWeather,
];

const NBA_COMPUTERS = [
  computeNbaRestFatigue,
  computeNbaStreak,
  computeNbaBeneficiary,
  computeNbaOwned,
];

const WC_COMPUTERS = [
  computeWcForm,
  computeWcH2h,
  computeWcStakes,
  computeWcRestEdge,
  computeWcVenueEdge,
  computeWcGroupValue,
  computeWcKnockoutPath,
  computeWcXg,
  computeWcXgRegression,
  computeWcAdvancementOdds,
  computeWcConfirmedXI, // confirmed-XI shape/availability edges (match-day only — needs posted lineups)
];

const WC_PREVIEW_COMPUTERS = [
  computeWcPreviewGroups,
  computeWcPedigree,
  computeWcOpeners,
  computeWcRestEdge,
  computeWcVenueEdge,
  computeWcGroupValue,
  computeWcKnockoutPath,
  computeWcXg,
  computeWcXgRegression,
  computeWcAdvancementOdds,
];

const COMPUTERS_BY_LEAGUE = {
  mlb: MLB_COMPUTERS,
  nba: NBA_COMPUTERS,
  wc: WC_COMPUTERS,
};

/**
 * Generate insight_connections rows for a slate.
 *
 * @param {object} args
 * @param {string} [args.date]   YYYY-MM-DD. Defaults to today (local tz).
 * @param {string} [args.league] e.g. 'mlb'. Defaults to 'mlb'.
 * @param {object} [args.options]
 * @param {number} [args.options.maxRows]         cap on returned rows (default 120)
 * @param {number} [args.options.minRelevance]    drop rows below this (default 35)
 * @param {number} [args.options.maxPerCategory]  cap rows per category so one hot
 *                                                lane can't flood the hub (default 8)
 * @returns {Promise<object>} { date, league, season, gameCount, connections: row[] }
 */
export async function generateInsightConnections({ date, league = 'mlb', options = {} } = {}) {
  const dateStr = date || todayStr();
  const leagueKey = String(league || 'mlb').toLowerCase();
  const maxRows = Number.isFinite(options.maxRows) ? options.maxRows : 120;
  const minRelevance = Number.isFinite(options.minRelevance) ? options.minRelevance : 35;
  const maxPerCategory = Number.isFinite(options.maxPerCategory) ? options.maxPerCategory : 8;

  let computers = COMPUTERS_BY_LEAGUE[leagueKey];
  if (!computers) {
    console.warn(`[insights] No computers registered for league "${leagueKey}" — returning empty.`);
    return { date: dateStr, league: leagueKey, season: seasonForDate(dateStr, leagueKey), gameCount: 0, connections: [] };
  }

  // 1. Resolve today's slate ONCE. Every computer scores ONLY against games
  //    on this slate; an empty slate short-circuits everything.
  //    MLB: "getMlbGamesForDate(dateStr) — single positional arg (YYYY-MM-DD)."
  //    NBA: getNbaGamesForDate(dateStr) — same contract.
  //    WC:  fifaWorldCupService.getMatchesForDate(dateStr) — RAW FIFA match
  //         objects (home_team/away_team are team objects with `abbreviation`
  //         = the 3-letter FIFA code); the WC computers own that shape.
  let games = [];
  let preview = false;
  try {
    if (leagueKey === 'wc') {
      games = (await fifaWorldCupService.getMatchesForDate(dateStr)) || [];
      if (games.length === 0) {
        // PREVIEW MODE: no WC match today. If future fixtures still exist
        // (pre-tournament look-ahead, or a knockout rest day), run the
        // preview lanes against the FULL fixture list instead. After the
        // final, no future fixtures remain and this self-terminates.
        const all = (await fifaWorldCupService.getMatches({ seasons: [2026] })) || [];
        const hasFuture = all.some((m) =>
          String(m?.status || '').toLowerCase() === 'scheduled'
          && String(m?.datetime || '').slice(0, 10) >= dateStr);
        if (hasFuture) {
          games = all;
          computers = WC_PREVIEW_COMPUTERS;
          preview = true;
          console.log(`[insights] WC preview mode — no match today, ${all.length} fixtures in scope.`);
        }
      }
    } else if (leagueKey === 'nba') {
      games = (await ballDontLieService.getNbaGamesForDate(dateStr)) || [];
    } else {
      games = (await ballDontLieService.getMlbGamesForDate(dateStr)) || [];
    }
  } catch (err) {
    console.error('[insights] Failed to load slate:', err?.message || err);
    games = [];
  }

  if (!Array.isArray(games) || games.length === 0) {
    console.log(`[insights] No ${leagueKey.toUpperCase()} games found for ${dateStr} — nothing to compute.`);
    return { date: dateStr, league: leagueKey, season: seasonForDate(dateStr, leagueKey), gameCount: 0, connections: [] };
  }

  // BDL game objects expose `away_team` (MLB) or `visitor_team` (NBA); the
  // computers read either. Alias both directions so team abbr/id lookups and
  // gameLabel resolve (no 'AWY'). WC matches are RAW FIFA shape — the WC
  // computers read home_team/away_team natively, but the alias is applied for
  // them too so the postProcess slate filter and any shared helpers see a
  // consistent pair of keys (it only fills the MISSING alias, never mutates).
  for (const g of games) {
    if (g && typeof g === 'object') {
      if (g.away_team && !g.visitor_team) g.visitor_team = g.away_team;
      if (g.visitor_team && !g.away_team) g.away_team = g.visitor_team;
    }
  }

  const season = seasonForDate(dateStr, leagueKey);

  // Shared, read-only context handed to every computer. The set of BDL game
  // ids on the slate lets each computer enforce "only games on today's slate".
  const slateGameIds = new Set(games.map((g) => g?.id).filter((x) => x != null));
  const ctx = {
    date: dateStr,
    season,
    league: leagueKey,
    games,
    slateGameIds,
    preview,
    bdl: ballDontLieService,
    helpers: { gameLabel },
  };

  // 2. Fan out concurrently, isolating failures so one bad lane can't sink the run.
  const settled = await Promise.allSettled(
    computers.map(async (fn) => {
      const name = fn.name || 'computer';
      try {
        const rows = await fn(ctx);
        // Per-lane diagnostics: a 0-row lane should be visible in the log, not
        // silently absorbed into the aggregate (a 157-line lane once shipped 0
        // rows for weeks because nothing surfaced which gate killed it).
        console.log(`[insights]   ${name}: ${Array.isArray(rows) ? rows.length : 0} row(s)`);
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

  const connections = postProcess(raw, { slateGameIds, minRelevance, maxRows, maxPerCategory });

  console.log(
    `[insights] ${leagueKey.toUpperCase()} ${dateStr}: ${games.length} games, ` +
      `${raw.length} raw connections -> ${connections.length} after filter/sort/cap.`,
  );

  return { date: dateStr, league: leagueKey, season, gameCount: games.length, connections };
}

/**
 * Validate rows against the table contract, enforce slate membership when a
 * game_id is present, drop low-relevance noise, sort best-edge-first, de-dupe
 * near-identical rows (same category + game + value), and cap each category so
 * one prolific lane (25 hot bats on a full slate) can't crowd out the others.
 */
function postProcess(rows, { slateGameIds, minRelevance, maxRows, maxPerCategory = 8 }) {
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

  // Keep only the strongest N per category (list is already best-first).
  const perCategory = new Map();
  const capped = [];
  for (const row of out) {
    const n = perCategory.get(row.category) ?? 0;
    if (n >= maxPerCategory) continue;
    perCategory.set(row.category, n + 1);
    capped.push(row);
  }

  return capped.slice(0, maxRows);
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
 * BDL "season" for a date string, per league.
 * MLB: the calendar year of the regular season (getMlbStandings /
 *      getMlbPlayerSeasonStats / splits / xStats all key on this).
 * NBA: the season's START year — a June 2026 Finals game belongs to season
 *      2025 (the 2025-26 season). Sept (mo 9) is the cutover.
 * WC:  the tournament's calendar year (2026) — same as the default.
 */
function seasonForDate(dateStr, leagueKey = 'mlb') {
  const y = Number(String(dateStr).slice(0, 4));
  const year = Number.isFinite(y) ? y : new Date().getFullYear();
  if (leagueKey === 'nba') {
    const mo = Number(String(dateStr).slice(5, 7)) || 1;
    return mo >= 9 ? year : year - 1;
  }
  return year;
}

export default { generateInsightConnections };
