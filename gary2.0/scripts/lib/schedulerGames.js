import { getESTDate as getETDateStr, shiftDateKey as addDaysISO } from '../../src/utils/dateUtils.js';
import { requireNonFootballStart } from './schedulerSourcePolicy.js';
import { classifyNcaafCoveredGames, ncaafSlateDateForKickoff, resolveNcaafKickoff } from '../../src/services/ncaafGamePolicy.js';
import { nflSlateDateForKickoff, resolveNflKickoff } from '../../src/services/nflGamePolicy.js';
import { partitionNcaafKickoffReadiness, partitionNflKickoffReadiness } from './schedulerPolicy.js';

function extractStartTimeIso(game, sportKey) {
  if (sportKey === 'basketball_nba') return game.datetime;
  if (sportKey === 'icehockey_nhl') return game.start_time_utc;
  if (sportKey === 'baseball_mlb') return game.date;
  if (sportKey === 'americanfootball_nfl') return resolveNflKickoff(game).iso;
  if (sportKey === 'americanfootball_ncaaf') return resolveNcaafKickoff(game).iso;
  throw new Error(`extractStartTimeIso: unknown sportKey ${sportKey}`);
}

/** Bounded provider discovery, isolated from daemon startup and scheduling.
 * null means a failed snapshot; retryGameIds retains missing exact identities.
 * The loader stays lazy so scheduler environment setup precedes API creation.
 */
export function createScheduleLookup({ log = () => {}, loadProvider = () => import('../../src/services/ballDontLieService.js') } = {}) {
  return async function fetchGamesForETDate(sportKey, etDateStr, { gameIds = [] } = {}) {
  const { ballDontLieService } = await loadProvider();
  const dates = [etDateStr, addDaysISO(etDateStr, 1)];
  const supportsExactKickoffRetry = sportKey === 'americanfootball_ncaaf'
    || sportKey === 'americanfootball_nfl';
  const exactFootballGameIds = supportsExactKickoffRetry
    ? [...new Set(
        (Array.isArray(gameIds) ? gameIds : [])
          .filter((id) => id !== null && id !== undefined && String(id).trim() !== '')
          .map(String),
      )].sort()
    : [];
  // /games supports dates[], but not game_ids[]. An unsupported ID filter
  // returns the historical catalog; NCAAF then follows 100 cursor pages.
  // Refresh this bounded date window and match requested IDs locally. A
  // missing ID stays in retryGameIds below, never becomes another matchup.
  const params = {
    dates,
    per_page: 100,
    ...(exactFootballGameIds.length > 0 ? { paginationMaxPages: 5 } : {}),
  };
  // BDL's NFL games endpoint defaults away from preseason. August would then
  // look like a dark league even while real games are on the board.
  if (sportKey === 'americanfootball_nfl') {
    params.season_type = [1, 2, 3];
  }
  let games;
  // Includes shared-gate waits, every cursor page and retry backoff. A page
  // count alone cannot bound a waiter that repeatedly loses a request slot.
  const lookupController = new AbortController();
  const lookupTimer = setTimeout(() => lookupController.abort(
    new DOMException('Schedule lookup exceeded its 120-second deadline', 'AbortError'),
  ), 120_000);
  try {
    games = await ballDontLieService.getGames(
      sportKey,
      params,
      exactFootballGameIds.length > 0 ? 0 : 10,
      { signal: lookupController.signal },
    );
  } catch (e) {
    const scope = exactFootballGameIds.length > 0
      ? `game_ids ${exactFootballGameIds.join(',')}`
      : dates.join(',');
    log(`  ❌ ${sportKey}: BDL fetch failed for ${scope}: ${e.message}`);
    return null; // null = transport failed; a result object may still carry exact pending IDs
  } finally {
    clearTimeout(lookupTimer);
  }
  if (!Array.isArray(games)) games = [];
  if (supportsExactKickoffRetry && exactFootballGameIds.length > 0) {
    const requestedIds = new Set(exactFootballGameIds);
    games = games.filter((game) => game?.id != null && requestedIds.has(String(game.id)));
  }

  const retryGameIds = [];
  let retryAll = false;
  if (supportsExactKickoffRetry && exactFootballGameIds.length > 0) {
    const returnedIds = new Set(games
      .filter((game) => game?.id !== null && game?.id !== undefined)
      .map((game) => String(game.id)));
    for (const id of exactFootballGameIds) {
      if (!returnedIds.has(id)) retryGameIds.push(id);
    }
  }
  if (sportKey === 'americanfootball_nfl') {
    const targetDateGames = games.filter((game) => {
      const kickoff = resolveNflKickoff(game);
      const slateDate = nflSlateDateForKickoff(game);
      return !kickoff.scheduledDate || slateDate === etDateStr;
    });
    const readiness = partitionNflKickoffReadiness(targetDateGames, etDateStr);
    retryGameIds.push(...readiness.retryGameIds);
    retryAll ||= readiness.retryAll;
    for (const { raw, kickoff } of readiness.pending) {
      const reason = kickoff.scheduledDate ? 'TIME TBD' : 'kickoff date unavailable';
      log(`  ⏳ ${sportKey} game ${raw?.id}: ${reason} — retrying this exact id without scheduling a deadline`);
    }

    const seen = new Set();
    return {
      games: readiness.confirmed.filter(({ raw }) => {
        const key = String(raw.id);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      }),
      retryGameIds: [...new Set(retryGameIds)].sort(),
      retryAll,
    };
  }
  if (sportKey === 'americanfootball_ncaaf') {
    // The adjacent UTC-date query can include tomorrow's daytime games. Keep
    // those out before FBS classification so one unrelated row cannot block
    // today's confirmed slate. Unknown dates remain retryable by exact id.
    const targetDateGames = games.filter((game) => {
      const kickoff = resolveNcaafKickoff(game);
      const slateDate = ncaafSlateDateForKickoff(game);
      return !kickoff.scheduledDate || slateDate === etDateStr;
    });
    let classified = classifyNcaafCoveredGames(targetDateGames);
    if (classified.unresolved.length > 0) {
      try {
        const teams = await ballDontLieService.getTeams('americanfootball_ncaaf');
        classified = classifyNcaafCoveredGames(targetDateGames, teams);
      } catch (error) {
        // Embedded provider identity can still verify part of the slate. Keep
        // those games schedulable and retry only the unresolved exact ids.
        log(`  ⚠️ ${sportKey}: team-directory lookup failed; retaining verified games and retrying unresolved ids (${error.message})`);
      }
    }
    if (classified.unresolved.length > 0) {
      for (const game of classified.unresolved) {
        if (game?.id !== null && game?.id !== undefined) retryGameIds.push(String(game.id));
        else retryAll = true;
      }
      log(`  ⏳ ${sportKey}: ${classified.unresolved.length} game(s) lack provider-grounded conference identity — confirmed games stay scheduled; unresolved ids retry independently`);
    }
    if (classified.rejected.length > 0) {
      log(`  ⏭️ ${sportKey}: excluded ${classified.rejected.length} matchup(s) outside the major-conference/Notre Dame scope`);
    }
    const readiness = partitionNcaafKickoffReadiness(classified.accepted, etDateStr);
    retryGameIds.push(...readiness.retryGameIds);
    retryAll ||= readiness.retryAll;
    for (const { raw, kickoff } of readiness.pending) {
      const reason = kickoff.scheduledDate ? 'TIME TBD' : 'kickoff date unavailable';
      log(`  ⏳ ${sportKey} game ${raw?.id}: ${reason} — retrying this exact id without scheduling a deadline`);
    }

    const seen = new Set();
    return {
      games: readiness.confirmed.filter(({ raw }) => {
        const key = String(raw.id);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      }),
      retryGameIds: [...new Set(retryGameIds)].sort(),
      retryAll,
    };
  }

  const filtered = [];
  try {
    for (const g of games) {
      const startIso = extractStartTimeIso(g, sportKey);
      const start = requireNonFootballStart(g, sportKey, startIso);
      if (getETDateStr(start) !== etDateStr) continue;
      filtered.push({ raw: g, startTime: start });
    }
  } catch (error) {
    // A decoded provider row is part of the authoritative sport snapshot. If
    // its required clock is malformed, treating that row as absent creates a
    // false clean slate and permanently drops its pick windows. Fail only this
    // sport so buildPlan queues the same isolated retry used for transport
    // failures; football's explicit date-only/exact-id policy above is intact.
    log(`  ❌ ${sportKey}: malformed schedule snapshot — isolated sport retry queued (${error.message})`);
    return null;
  }
  // Dedupe in case a game appears in both UTC date queries (rare but possible)
  const seen = new Set();
  const dedupedGames = filtered.filter(({ raw }) => {
    const key = String(raw.id);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return {
    games: dedupedGames,
    retryGameIds: [...new Set(retryGameIds)].sort(),
    retryAll,
  };
};
}
