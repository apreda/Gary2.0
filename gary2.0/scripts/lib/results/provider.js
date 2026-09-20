/** Per-run provider caches and complete exact-game settlement evidence. */
import { ncaafSlateDateForKickoff } from '../../../src/services/ncaafGamePolicy.js';
import { isFinalGameStatus, nflSeasonTypeForGame } from '../resultsGradingReliability.js';
import { fetchMlbSettlementBox } from '../../../supabase/functions/_shared/mlbPropSettlement.js';
import { buildNflPlaySettlement as buildPlaySettlement } from '../nflPlaySettlement.js';

export function createResultsProvider({ bdlFetch, buildNflPlaySettlement = buildPlaySettlement,
  Date = globalThis.Date, console = globalThis.console }) {
  const cache = { games: new Map(), stats: new Map(), box: new Map() };

  async function fetchGames(league, date) {
    const key = `${league}-${date}`;
    if (cache.games.has(key)) return cache.games.get(key);

    // NBA uses v1/ while others use league/v1/
    const normalizedLeague = league.toUpperCase();
    const path = normalizedLeague === 'NBA' ? 'v1/games' : `${league.toLowerCase()}/v1/games`;
    const params = new URLSearchParams();
    params.append('dates[]', date);
    // BDL's NFL endpoint does not include preseason unless season_type is
    // explicit. Settlement must cover every stored NFL market: preseason (1),
    // regular season (2), and postseason (3).
    if (normalizedLeague === 'NFL') {
      for (const seasonType of [1, 2, 3]) params.append('season_type[]', String(seasonType));
    }
    const data = await bdlFetch(path, params.toString());
    const games = data?.data || [];
    cache.games.set(key, games);
    return games;
  }

  async function fetchNCAAFGames(date) {
    const key = `NCAAF-full-${date}`;
    if (cache.games.has(key)) return cache.games.get(key);

    const nextUtcDate = (() => {
      const next = new Date(`${date}T12:00:00Z`);
      next.setUTCDate(next.getUTCDate() + 1);
      return next.toISOString().slice(0, 10);
    })();

    // A college Saturday can exceed one page, and late ET kickoffs can be filed
    // under the next UTC provider date. Pull both complete provider dates, then
    // filter back to the requested ET slate so tomorrow's games cannot leak in.
    const games = [];
    for (const providerDate of [date, nextUtcDate]) {
      const providerKey = `NCAAF-provider-${providerDate}`;
      let providerGames = cache.games.get(providerKey);
      if (!providerGames) {
        providerGames = [];
        let cursor = null;
        for (let page = 0; page < 10; page += 1) {
          const cursorParam = cursor != null ? `&cursor=${encodeURIComponent(cursor)}` : '';
          const data = await bdlFetch(
            'ncaaf/v1/games',
            `dates[]=${providerDate}&per_page=100${cursorParam}`,
          );
          if (!data) break;
          providerGames.push(...(data.data || []));
          cursor = data?.meta?.next_cursor ?? null;
          if (cursor == null) break;
        }
        cache.games.set(providerKey, providerGames);
      }
      games.push(...providerGames);
    }

    const unique = [...new Map(
      games.filter((game) => game?.id != null).map((game) => [String(game.id), game]),
    ).values()];
    const exactEtSlate = unique.filter((game) => ncaafSlateDateForKickoff(game) === date);
    cache.games.set(key, exactEtSlate);
    return exactEtSlate;
  }

  // MLB-only: BDL indexes games by UTC date. A 9:38 PM ET game on April 18 starts
  // at 01:38 UTC on April 19, so BDL files it under 2026-04-19. To correctly grade
  // picks for "April 18 ET", we query both UTC dates and filter to games whose ET
  // date matches the target. Prevents grading against the wrong day's game.
  async function fetchMlbGamesForETDate(etDateStr) {
    const tomorrow = new Date(etDateStr + 'T00:00:00Z');
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    const tomorrowStr = tomorrow.toISOString().slice(0, 10);

    const [d1, d2] = await Promise.all([
      fetchGames('MLB', etDateStr),
      fetchGames('MLB', tomorrowStr)
    ]);

    const seen = new Set();
    const filtered = [];
    for (const g of [...d1, ...d2]) {
      if (!g || g.id == null) continue;
      if (seen.has(g.id)) continue;
      const iso = g.date; // MLB BDL returns a full ISO datetime in `date`
      if (!iso) continue;
      const gameETDate = new Date(iso).toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
      if (gameETDate !== etDateStr) continue;
      seen.add(g.id);
      filtered.push(g);
    }
    return filtered;
  }

  async function fetchBoxScores(league, date) {
    const key = `${league}-${date}`;
    if (cache.box.has(key)) return cache.box.get(key);

    const path = league.toUpperCase() === 'NBA' ? 'v1/box_scores' : `${league.toLowerCase()}/v1/box_scores`;
    const data = await bdlFetch(path, `date=${date}&dates[]=${date}&per_page=100`);
    const box = data?.data || [];
    cache.box.set(key, box);
    return box;
  }

  /** Exact-game plays are a bounded fallback only for a supported missing stat. */
  async function fetchNFLPlayEvidence(gameId, playerStats) {
    if (!playerStats?.length || playerStats.some(row => row?._football_box_complete !== true
      || String(row?._game_id ?? '') !== String(gameId))) return null;
    const key = `nfl-play-settlement-${gameId}`;
    if (cache.stats.has(key)) return cache.stats.get(key);
    const plays = [];
    const seenPlays = new Set();
    const seenCursors = new Set();
    const deadlineAt = Date.now() + 120_000;
    let cursor = null;
    try {
      for (let page = 0; page < 5; page += 1) {
        if (Date.now() >= deadlineAt) throw new Error('play evidence deadline reached');
        const cursorParam = cursor == null ? '' : `&cursor=${encodeURIComponent(cursor)}`;
        const data = await bdlFetch('nfl/v1/plays', `game_id=${gameId}&per_page=100${cursorParam}`,
          { timeoutMs: 20_000, deadlineAt, rateLimit: true });
        if (!Array.isArray(data?.data)) throw new Error('missing plays page');
        const next = data?.meta?.next_cursor ?? null;
        if (next != null && (!['number', 'string'].includes(typeof next) || !String(next).trim())) {
          throw new Error('invalid plays cursor');
        }
        if (next != null && !data.data.length) throw new Error('empty nonterminal plays page');
        for (const play of data.data) {
          if (!['number', 'string'].includes(typeof play?.id) || !String(play.id).trim()
            || seenPlays.has(String(play.id)) || String(play?.game?.id ?? '') !== String(gameId)
            || (play?.game_id != null && String(play.game_id) !== String(gameId))
            || !isFinalGameStatus(play?.game?.status)) throw new Error('invalid final play identity');
          seenPlays.add(String(play.id));
          plays.push(play);
        }
        if (next == null) {
          if (!plays.length) throw new Error('empty plays evidence');
          const evidence = buildNflPlaySettlement({ gameId, plays, playerStats, playsComplete: true, boxComplete: true });
          cache.stats.set(key, evidence);
          return evidence;
        }
        if (seenCursors.has(String(next))) throw new Error('repeated plays cursor');
        seenCursors.add(String(next));
        cursor = next;
      }
      throw new Error('plays pagination limit reached');
    } catch (error) {
      console.warn(`  ⚠️ NFL ${gameId} play evidence unavailable; leaving its props pending: ${error.message}`);
      return null;
    }
  }

  async function fetchNFLStats(games) {
    if (!games.length) return [];
    const exactGames = [...new Map(games
      .filter((game) => game?.id != null)
      .map((game) => [String(game.id), { gameId: String(game.id), seasonType: nflSeasonTypeForGame(game) }])).values()];
    const key = `nfl-stats-${exactGames.map(({ gameId, seasonType }) => `${gameId}:${seasonType}`).join(',')}`;
    if (cache.stats.has(key)) return cache.stats.get(key);

    // Fetch one game at a time and stamp every row with that exact source id.
    // The NFL endpoint's stat rows do not reliably expose their game id, so a
    // date-wide batch cannot safely attribute a same-name player to one game.
    // `season_type` is mandatory for preseason/postseason; BDL otherwise defaults
    // to regular season and returns a clean-but-empty array for an exact August
    // preseason game id.
    const stats = [];
    let allComplete = true;
    for (const { gameId, seasonType } of exactGames) {
      // A partial page is not a complete box: an absent player may simply be
      // on the next page. Publish rows only after the exact game's final page.
      const gameRows = [];
      const seenPlayers = new Set();
      const seenCursors = new Set();
      let cursor = null;
      let complete = false;
      try {
        for (let page = 0; page < 10; page += 1) {
          const cursorParam = cursor == null ? '' : `&cursor=${encodeURIComponent(cursor)}`;
          const data = await bdlFetch(
            'nfl/v1/stats',
            `game_ids[]=${gameId}&season_type=${seasonType}&per_page=100${cursorParam}`,
          );
          if (!Array.isArray(data?.data)) throw new Error('missing stats page');
          const next = data?.meta?.next_cursor ?? null;
          if (next != null && (!['number', 'string'].includes(typeof next) || !String(next).trim())) {
            throw new Error('invalid stats cursor');
          }
          if (next != null && data.data.length === 0) throw new Error('empty nonterminal stats page');
          for (const row of data.data) {
            const playerId = row?.player?.id ?? row?.player_id;
            const reportedGameIds = [row?.game?.id, row?.game_id].filter(value => value != null);
            if (!['number', 'string'].includes(typeof playerId) || !String(playerId).trim()
              || !Number.isSafeInteger(Number(playerId)) || Number(playerId) <= 0 || seenPlayers.has(String(playerId))
              || reportedGameIds.some(id => String(id) !== gameId)
              || (row?.game?.status != null && !isFinalGameStatus(row.game.status))) {
              throw new Error('invalid game/player identity in stats page');
            }
            seenPlayers.add(String(playerId));
            gameRows.push({ ...row, _game_id: String(gameId), _football_box_complete: true });
          }
          if (next == null) { complete = true; break; }
          if (seenCursors.has(String(next))) throw new Error('repeated stats cursor');
          seenCursors.add(String(next));
          cursor = next;
        }
        if (!complete) throw new Error('stats pagination limit reached');
        stats.push(...gameRows);
      } catch (error) {
        allComplete = false;
        console.warn(`  ⚠️ NFL ${gameId} stats incomplete; leaving its props pending: ${error.message}`);
      }
    }
    // Failed games must be retried, not cached as absent players. Complete
    // games in this batch may still settle independently.
    if (allComplete) cache.stats.set(key, stats);
    return stats;
  }

  async function fetchNCAAFStats(gameIds) {
    if (!gameIds.length) return [];
    gameIds = [...new Set(gameIds.map(String))];
    const key = `ncaaf-stats-${gameIds.join(',')}`;
    if (cache.stats.has(key)) return cache.stats.get(key);

    // As with NFL, fetch and stamp one exact game at a time. A date-wide pool is
    // not sufficient attribution for a college slate with many same-name players.
    const stats = [];
    let allComplete = true;
    for (const gameId of gameIds) {
      const gameRows = [];
      const seenPlayers = new Set();
      const seenCursors = new Set();
      let cursor = null;
      let complete = false;
      try {
        for (let page = 0; page < 10; page += 1) {
          const cursorParam = cursor != null ? `&cursor=${encodeURIComponent(cursor)}` : '';
          const data = await bdlFetch('ncaaf/v1/player_stats', `game_ids[]=${gameId}&per_page=100${cursorParam}`);
          if (!Array.isArray(data?.data)) throw new Error('missing stats page');
          const next = data?.meta?.next_cursor ?? null;
          if (next != null && (!['number', 'string'].includes(typeof next) || !String(next).trim())) {
            throw new Error('invalid stats cursor');
          }
          if (next != null && data.data.length === 0) throw new Error('empty nonterminal stats page');
          for (const row of data.data) {
            // College rows provide an exact game id; conflicting/missing rows
            // invalidate the entire page rather than becoming false absences.
            const playerId = row?.player?.id ?? row?.player_id;
            if (String(row?.game?.id ?? '') !== String(gameId)
              || (row?.game_id != null && String(row.game_id) !== String(gameId))
              || !['number', 'string'].includes(typeof playerId) || !String(playerId).trim()
              || !Number.isSafeInteger(Number(playerId)) || Number(playerId) <= 0 || seenPlayers.has(String(playerId))
              || (row?.game?.status != null && !isFinalGameStatus(row.game.status))) {
              throw new Error('invalid game/player identity in stats page');
            }
            seenPlayers.add(String(playerId));
            gameRows.push({ ...row, _game_id: String(gameId), _football_box_complete: true });
          }
          if (next == null) { complete = true; break; }
          if (seenCursors.has(String(next))) throw new Error('repeated stats cursor');
          seenCursors.add(String(next));
          cursor = next;
        }
        if (!complete) throw new Error('stats pagination limit reached');
        stats.push(...gameRows);
      } catch (error) {
        allComplete = false;
        console.warn(`  ⚠️ NCAAF ${gameId} stats incomplete; leaving its props pending: ${error.message}`);
      }
    }
    if (allComplete) cache.stats.set(key, stats);
    return stats;
  }

  async function fetchMLBStats(gameIds) {
    if (!gameIds.length) return [];
    const key = `mlb-stats-${gameIds.join(',')}`;
    if (cache.stats.has(key)) return cache.stats.get(key);

    // Each game is a complete, validated box before it joins the date pool.
    const allStats = [];
    let complete = true;
    for (const gameId of gameIds) {
      try {
        const rows = await fetchMlbSettlementBox(gameId, cursor => bdlFetch(
          'mlb/v1/stats',
          `game_ids[]=${encodeURIComponent(gameId)}&per_page=100${cursor == null ? '' : `&cursor=${encodeURIComponent(cursor)}`}`,
        ));
        allStats.push(...rows.map(row => ({ ...row, _game_id: String(gameId) })));
      } catch (error) {
        complete = false;
        console.warn(`  [MLB settlement] Game ${gameId} box unavailable: ${error.message}`);
      }
    }
    console.log(`  📊 MLB stats: ${allStats.length} player entries for ${gameIds.length} games`);
    if (complete) cache.stats.set(key, allStats);
    return allStats;
  }

  return { fetchGames, fetchNCAAFGames, fetchMlbGamesForETDate, fetchBoxScores, fetchNFLPlayEvidence, fetchNFLStats, fetchNCAAFStats, fetchMLBStats };
}
