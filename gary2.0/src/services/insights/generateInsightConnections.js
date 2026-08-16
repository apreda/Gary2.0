// gary2.0/src/services/insights/generateInsightConnections.js
//
// Orchestrator for the insight_connections feature.
//
// generateInsightConnections({ date, league }) loads today's slate ONCE,
// then fans out to a set of independent per-connection "computer" functions.
// Each computer is responsible for its own data fetching and returns rows that
// already match the insight_connections table contract. Ordinary lane failures
// are isolated; source-integrity failures in NCAAF dark-day discovery propagate
// so a provider outage cannot masquerade as an honest empty future schedule.
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
import { todayStr, gameLabel, clampScore, etDateStr } from './shared.js';
import { footballSeasonForDate, loadFootballSlate } from './footballData.js';

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
import { computeStarterTeamRecord } from './computers/starterTeamRecord.js';
import { computeBullpenFatigue } from './computers/bullpenFatigue.js';
import { computeStreaking } from './computers/streaking.js';
import { computeFirstInning } from './computers/firstInning.js';
import { computeHeadToHead } from './computers/headToHead.js';
import { computeRunningGame } from './computers/runningGame.js';
import { computeParkWeather } from './computers/parkWeather.js';
import { computeFantasyPickups } from './computers/fantasyPickups.js';
import { computeTwoStartWeek } from './computers/twoStartWeek.js';
import { computeCloserWatch } from './computers/closerWatch.js';
import { computeReturnWatch } from './computers/returnWatch.js';
import { computeCutList } from './computers/cutList.js';

// NBA connection computers.
import { computeNbaRestFatigue } from './computers/nbaRestFatigue.js';
import { computeNbaStreak } from './computers/nbaStreak.js';
import { computeNbaBeneficiary } from './computers/nbaBeneficiary.js';
import { computeNbaOwned } from './computers/nbaOwned.js';

// NFL/NCAAF computers. These consume only BDL team-game boxes and BDL odds;
// unsupported football concepts remain absent instead of being synthesized.
import { computeFootballTeamEdges } from './computers/footballTeamEdges.js';
import { computeFootballMarketEdges } from './computers/footballMarketEdges.js';
import { computeFootballMarketRange } from './computers/footballMarketRange.js';
import { computeNflFantasyEdges } from './computers/nflFantasyEdges.js';
import { computeNcaafFantasyEdges } from './computers/ncaafFantasyEdges.js';
import { computeNcaafNextSlate } from './computers/ncaafNextSlate.js';

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
  computeStarterTeamRecord,
  computeBullpenFatigue,
  computeStreaking,
  computeFirstInning,
  computeHeadToHead,
  computeRunningGame,
  computeParkWeather,
  computeFantasyPickups,
  computeTwoStartWeek,
  computeCloserWatch,
  computeReturnWatch,
  computeCutList,
];

const NBA_COMPUTERS = [
  computeNbaRestFatigue,
  computeNbaStreak,
  computeNbaBeneficiary,
  computeNbaOwned,
];

const FOOTBALL_COMPUTERS = [
  computeFootballTeamEdges,
  computeFootballMarketEdges,
  computeFootballMarketRange,
];

const NFL_COMPUTERS = [
  ...FOOTBALL_COMPUTERS,
  computeNflFantasyEdges,
];

const NCAAF_COMPUTERS = [
  ...FOOTBALL_COMPUTERS,
  computeNcaafFantasyEdges,
];

const COMPUTERS_BY_LEAGUE = {
  mlb: MLB_COMPUTERS,
  nba: NBA_COMPUTERS,
  nfl: NFL_COMPUTERS,
  ncaaf: NCAAF_COMPUTERS,
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
  const isFootball = leagueKey === 'nfl' || leagueKey === 'ncaaf';
  // A Saturday college slate can carry 40+ games. Football's defaults retain
  // per-game evidence rather than letting the baseball-oriented category cap
  // silently remove later kickoffs. Explicit caller caps still win.
  const maxRows = Number.isFinite(options.maxRows) ? options.maxRows : (isFootball ? 360 : 120);
  const minRelevance = Number.isFinite(options.minRelevance) ? options.minRelevance : 35;
  const maxPerCategory = Number.isFinite(options.maxPerCategory) ? options.maxPerCategory : (isFootball ? 100 : 8);

  let computers = COMPUTERS_BY_LEAGUE[leagueKey];
  if (!computers) {
    console.warn(`[insights] No computers registered for league "${leagueKey}" — returning empty.`);
    return { date: dateStr, league: leagueKey, season: seasonForDate(dateStr, leagueKey), gameCount: 0, connections: [] };
  }

  // 1. Resolve today's slate ONCE. Every game-level computer scores ONLY
  //    against games on this slate. An empty NCAAF slate runs the dedicated
  //    verified next-slate context computer; other empty slates short-circuit.
  //    MLB: "getMlbGamesForDate(dateStr) — single positional arg (YYYY-MM-DD)."
  //    NBA: getNbaGamesForDate(dateStr) — same contract.
  let games = [];
  try {
    if (isFootball) {
      games = await loadFootballSlate({ bdl: ballDontLieService, league: leagueKey, date: dateStr });
    } else if (leagueKey === 'nba') {
      games = (await ballDontLieService.getNbaGamesForDate(dateStr)) || [];
    } else {
      // BDL dates by UTC instant, so an 8pm+ ET game lands on the NEXT UTC day.
      // Fetch BOTH UTC days and keep only this ET slate — otherwise the late games
      // never get insights (same bug as poll-live-scores).
      const nextUtc = (() => { const d = new Date(`${dateStr}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + 1); return d.toISOString().slice(0, 10); })();
      const seenG = new Set();
      games = [
        ...((await ballDontLieService.getMlbGamesForDate(dateStr)) || []),
        ...((await ballDontLieService.getMlbGamesForDate(nextUtc)) || []),
      ].filter((g) => { const id = String(g?.id); if (seenG.has(id)) return false; seenG.add(id); return true; })
       .filter((g) => etDateStr(g?.date) === dateStr);
    }
  } catch (err) {
    // A real dark day is represented by a successful empty response below.
    // A provider failure is operationally different and must reach the runner
    // so GitHub/local automation cannot report a false-green 0-row success.
    throw new Error(`[insights] Failed to load ${leagueKey.toUpperCase()} slate: ${err?.message || err}`);
  }

  if (!Array.isArray(games) || games.length === 0) {
    if (leagueKey === 'ncaaf') {
      const season = seasonForDate(dateStr, leagueKey);
      let raw;
      try {
        raw = await computeNcaafNextSlate({
          date: dateStr,
          season,
          league: leagueKey,
          games: [],
          slateGameIds: new Set(),
          bdl: ballDontLieService,
          helpers: { gameLabel },
        });
      } catch (err) {
        throw new Error(`[insights] Failed to discover next NCAAF slate: ${err?.message || err}`);
      }
      const connections = postProcess(raw, {
        slateGameIds: new Set(),
        minRelevance,
        maxRows,
        maxPerCategory,
      });
      console.log(
        `[insights] No NCAAF games found for ${dateStr}; ` +
          `${connections.length ? 'published the next verified slate.' : 'no verified slate found in the discovery window.'}`,
      );
      return {
        date: dateStr,
        league: leagueKey,
        season,
        gameCount: 0,
        connections,
        failures: [],
      };
    }
    console.log(`[insights] No ${leagueKey.toUpperCase()} games found for ${dateStr} — nothing to compute.`);
    return { date: dateStr, league: leagueKey, season: seasonForDate(dateStr, leagueKey), gameCount: 0, connections: [] };
  }

  // BDL game objects expose `away_team` (MLB) or `visitor_team` (NBA); the
  // computers read either. Alias both directions so team abbr/id lookups and
  // gameLabel resolve (no 'AWY'). Only fills the MISSING alias, never mutates.
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
    bdl: ballDontLieService,
    helpers: { gameLabel },
  };

  // 2. Fan out concurrently, isolating failures so one bad lane can't sink the run.
  const settled = await Promise.allSettled(
    computers.map(async (fn) => {
      const name = fn.name || 'computer';
      const rows = await fn(ctx);
      // Per-lane diagnostics: a 0-row lane should be visible in the log, not
      // silently absorbed into the aggregate.
      console.log(`[insights]   ${name}: ${Array.isArray(rows) ? rows.length : 0} row(s)`);
      return Array.isArray(rows) ? rows : [];
    }),
  );

  // 3. Flatten + validate + filter to the slate + sort + de-dupe + cap.
  const raw = [];
  const failures = [];
  settled.forEach((r, index) => {
    if (r.status === 'fulfilled' && Array.isArray(r.value)) raw.push(...r.value);
    if (r.status === 'rejected') {
      const computer = computers[index]?.name || `computer_${index + 1}`;
      const message = r.reason?.message || String(r.reason);
      failures.push({ computer, message });
      console.error(`[insights] computer "${computer}" threw: ${message}`);
    }
  });

  const connections = postProcess(raw, { slateGameIds, minRelevance, maxRows, maxPerCategory });

  // Tap-through contract (Jul 27 2026): back-fill missing player ids so every
  // player name on the hub opens its card. Exact-name hits only; MLB only.
  if (leagueKey === 'mlb' && connections.length) {
    try {
      const { resolveInsightIds } = await import('./resolveIds.js');
      await resolveInsightIds(connections);
    } catch (e) {
      console.warn(`[insights] id resolver skipped: ${e.message}`);
    }
  }

  console.log(
    `[insights] ${leagueKey.toUpperCase()} ${dateStr}: ${games.length} games, ` +
      `${raw.length} raw connections -> ${connections.length} after filter/sort/cap.`,
  );

  return { date: dateStr, league: leagueKey, season, gameCount: games.length, connections, failures };
}

/**
 * Validate rows against the table contract, enforce slate membership when a
 * game_id is present, drop low-relevance noise, sort best-edge-first, de-dupe
 * near-identical rows (same category + game + value), and cap each category so
 * one prolific lane (25 hot bats on a full slate) can't crowd out the others.
 */
export function insightConnectionIdentity(row) {
  if (row?.category === 'the_sweat') {
    const pickId = String(row?.meta?.pick_id ?? '');
    const factor = String(row?.meta?.factor_code ?? '');
    if (row?.game_id != null && pickId && factor) {
      return `the_sweat|${row.game_id}|${pickId}|${factor}`;
    }
  }
  if (row?.category === 'after_gary') {
    const pickId = String(row?.meta?.pick_id ?? '');
    if (row?.game_id != null && pickId) return `after_gary|${row.game_id}|${pickId}`;
  }
  return `${row?.category}|${row?.game}|${row?.player_id ?? ''}|${row?.value}`;
}

function postProcess(rows, { slateGameIds, minRelevance, maxRows, maxPerCategory = 8 }) {
  const seen = new Set();
  const out = [];

  for (const row of rows) {
    if (!isValidRow(row)) continue;

    // If a computer tagged a game_id, it MUST be on today's slate.
    if (row.game_id != null && slateGameIds.size && !slateGameIds.has(row.game_id)) continue;

    row.relevance_score = clampScore(row.relevance_score);
    if (row.relevance_score < minRelevance) continue;

    const dedupeKey = insightConnectionIdentity(row);
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
 */
function seasonForDate(dateStr, leagueKey = 'mlb') {
  const y = Number(String(dateStr).slice(0, 4));
  const year = Number.isFinite(y) ? y : new Date().getFullYear();
  if (leagueKey === 'nba') {
    const mo = Number(String(dateStr).slice(5, 7)) || 1;
    return mo >= 9 ? year : year - 1;
  }
  if (leagueKey === 'nfl' || leagueKey === 'ncaaf') {
    return footballSeasonForDate(dateStr);
  }
  return year;
}

export default { generateInsightConnections };
