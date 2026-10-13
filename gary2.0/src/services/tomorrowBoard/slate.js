/** The board's slate and lines, and keeping a league whose refresh failed (split from tomorrowService.js, Oct 13 2026). */
import { buildLeagueRows, SLATE_SPORTS_LIST } from '../dailySlateService.js';
import { sourceFailure } from '../sourceFailurePolicy.js';

/* ───────────────────────────── 1. SLATE + LINES ─────────────────────────── */

export async function buildSlate(etDateStr) {
  const board = [];
  const byLeague = {};
  const failures = [];
  for (const sport of SLATE_SPORTS_LIST) {
    try {
      const rows = await buildLeagueRows(sport, etDateStr);
      byLeague[sport.league] = rows.length;
      board.push(...rows);
    } catch (e) {
      const message = e?.message || String(e);
      failures.push(sourceFailure(sport.league, e));
      console.warn(`[TomorrowBoard] ${sport.league} slate fetch failed (healthy leagues continue): ${message}`);
    }
  }
  // Non-franchise events (the All-Star Game rides BDL with UNK teams) would
  // render "Unknown @ Unknown" on the Tomorrow tab — drop any row whose team
  // names never resolved; dedicated surfaces cover those events. Recount
  // byLeague so the published game_count matches what actually shows.
  const named = board.filter(r =>
    r.away_team && r.home_team && r.away_team !== 'Unknown' && r.home_team !== 'Unknown');
  for (const lg of Object.keys(byLeague)) {
    const n = named.filter(r => r.league === lg).length;
    if (n) byLeague[lg] = n; else delete byLeague[lg];
  }
  // Doubleheader-safe (Jul 22 2026, founder-directed): commence_time is part
  // of a game's identity — a same-matchup doubleheader is TWO board rows.
  // Only exact duplicates (an odds feed emitting the same game twice)
  // collapse here. Rows carry bdl_game_id via dailySlateService.buildLeagueRows.
  const deduped = Object.values(
    named.reduce((acc, r) => {
      const identity = r.league === 'NCAAF' && r.bdl_game_id != null
        ? `game:${r.bdl_game_id}`
        : `time:${r.commence_time}`;
      const k = `${r.league}|${r.away_team}|${r.home_team}|${identity}`;
      if (!acc[k]) acc[k] = r;
      return acc;
    }, {}),
  );
  return { rows: deduped, byLeague, failures };
}

export const PRESERVED_BOARD_ROW = Symbol('preservedTomorrowBoardRow');

/**
 * Restore only failed leagues from the same-date persisted snapshot. Fresh
 * rows always belong to healthy leagues, so this cannot overwrite a current
 * provider result. The hidden source row lets presentation keep every prior
 * field (arms, rail extras, etc.) rather than rebuilding a thinner fallback.
 */
export function mergeFailedTomorrowLeagues(freshRows, failures, existingBoard) {
  const failed = new Set((failures || [])
    .filter((failure) => failure?.transient_external === true)
    .map(({ league }) => String(league || '').toUpperCase()));
  const merged = [...(Array.isArray(freshRows) ? freshRows : [])];
  for (const prior of Array.isArray(existingBoard) ? existingBoard : []) {
    if (!failed.has(String(prior?.league || '').toUpperCase())) continue;
    const internal = {
      ...prior,
      line_vendor: prior?.line_vendor ?? prior?.ml_book ?? null,
    };
    Object.defineProperty(internal, PRESERVED_BOARD_ROW, {
      value: { ...prior },
      enumerable: false,
    });
    merged.push(internal);
  }
  return merged;
}

export class TomorrowBoardSourceError extends Error {
  constructor(result) {
    const failed = (result?.failures || []).map(({ league }) => league).join(', ');
    const outcome = result?.source_health === 'degraded'
      ? 'healthy leagues were persisted and same-date transient last-good rows were retained where available'
      : 'snapshot was not overwritten because the failure was not a transient external outage';
    super(`Tomorrow board source failure for ${failed || 'unknown league'}; ${outcome}`);
    this.name = 'TomorrowBoardSourceError';
    this.result = result;
    this.failures = result?.failures || [];
  }
}
