/**
 * Ball Don't Lie Odds (V2) Service
 * Fetches game-level betting odds and joins to NBA games by date.
 */
import axios from 'axios';
import { ballDontLieService, getApiKey, BALLDONTLIE_API_BASE_URL } from './ballDontLieService.js';
import { waitForBdlRequestSlot } from './bdlRequestGate.js';
import { classifyNcaafFbsGames, resolveNcaafKickoff } from './ncaafGamePolicy.js';

const BDL_NFL_ODDS_V1 = `${BALLDONTLIE_API_BASE_URL}/nfl/v1/odds`;
const BDL_NHL_ODDS_V1 = `${BALLDONTLIE_API_BASE_URL}/nhl/v1/odds`;
const BDL_NCAAF_ODDS_V1 = `${BALLDONTLIE_API_BASE_URL}/ncaaf/v1/odds`;

// getApiKey imported from ballDontLieService.js
// Player props endpoints removed — callers use ballDontLieService methods instead

const toNumber = (value) => {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const mapTeamName = (team) => {
  if (!team) return '';
  if (typeof team === 'string') return team;
  return team.full_name || team.name || team.short_name || team.city || '';
};

function nflBookmakersForGame(game, oddsRows) {
  const homeTeam = mapTeamName(game?.home_team);
  const awayTeam = mapTeamName(game?.visitor_team || game?.away_team);
  return (oddsRows || []).map((row) => {
    const h2hOutcomes = [];
    const mlHome = toNumber(row?.moneyline_home_odds);
    const mlAway = toNumber(row?.moneyline_away_odds);
    if (mlHome !== null) h2hOutcomes.push({ name: homeTeam, price: mlHome });
    if (mlAway !== null) h2hOutcomes.push({ name: awayTeam, price: mlAway });

    const spreadOutcomes = [];
    const homeSpread = toNumber(row?.spread_home_value);
    const awaySpread = toNumber(row?.spread_away_value);
    const homeSpreadOdds = toNumber(row?.spread_home_odds);
    const awaySpreadOdds = toNumber(row?.spread_away_odds);
    if (homeSpread !== null && homeSpreadOdds !== null) {
      spreadOutcomes.push({ name: homeTeam, point: homeSpread, price: homeSpreadOdds });
    }
    if (awaySpread !== null && awaySpreadOdds !== null) {
      spreadOutcomes.push({ name: awayTeam, point: awaySpread, price: awaySpreadOdds });
    }

    const totalOutcomes = [];
    const total = toNumber(row?.total_value);
    const overOdds = toNumber(row?.total_over_odds);
    const underOdds = toNumber(row?.total_under_odds);
    if (total !== null && overOdds !== null) {
      totalOutcomes.push({ name: 'Over', point: total, price: overOdds });
    }
    if (total !== null && underOdds !== null) {
      totalOutcomes.push({ name: 'Under', point: total, price: underOdds });
    }

    const markets = [];
    if (h2hOutcomes.length) markets.push({ key: 'h2h', outcomes: h2hOutcomes });
    if (spreadOutcomes.length) markets.push({ key: 'spreads', outcomes: spreadOutcomes });
    if (totalOutcomes.length) markets.push({ key: 'totals', outcomes: totalOutcomes });
    return {
      key: row?.vendor || 'Unknown',
      title: row?.vendor || 'Unknown',
      markets,
    };
  });
}

function normalizeExactNflGame(game, oddsRows) {
  if (!game) return null;
  let commenceTime = game.datetime || game.start_time_utc || game.date || null;
  let estimatedTime = false;
  if (typeof commenceTime === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(commenceTime)) {
    commenceTime = `${commenceTime}T20:00:00.000Z`;
    estimatedTime = true;
  }
  if (!commenceTime) return null;

  return {
    id: game.id,
    season: game.season ?? null,
    week: game.week ?? null,
    season_type: game.season_type ?? null,
    postseason: game.postseason === true,
    sport_key: 'americanfootball_nfl',
    home_team: mapTeamName(game.home_team),
    away_team: mapTeamName(game.visitor_team || game.away_team),
    home_team_id: game.home_team?.id ?? game.home_team_id ?? null,
    away_team_id: (game.visitor_team || game.away_team)?.id ?? game.visitor_team_id ?? game.away_team_id ?? null,
    commence_time: commenceTime,
    estimated_time: estimatedTime,
    venue: game.venue || null,
    bookmakers: nflBookmakersForGame(game, oddsRows),
  };
}

function normalizeExactNcaafGame(game, oddsRows) {
  if (!game) return null;
  const kickoff = resolveNcaafKickoff(game);
  if (!kickoff.iso) return null;

  return {
    id: game.id,
    season: game.season ?? null,
    week: game.week ?? null,
    postseason: game.postseason === true,
    sport_key: 'americanfootball_ncaaf',
    home_team: mapTeamName(game.home_team),
    away_team: mapTeamName(game.visitor_team || game.away_team),
    home_team_id: game.home_team?.id ?? game.home_team_id ?? null,
    away_team_id: (game.visitor_team || game.away_team)?.id ?? game.visitor_team_id ?? game.away_team_id ?? null,
    commence_time: kickoff.iso,
    estimated_time: kickoff.estimated,
    venue: game.venue || null,
    // This stamp is only emitted after the exact provider game passes the
    // shared FBS classifier below. It lets the pick runner preserve that gate
    // without downloading the complete teams/slate catalog a second time.
    ncaaf_fbs_verified: true,
    ncaaf_fbs_verification_source: 'provider_exact',
    bookmakers: nflBookmakersForGame(game, oddsRows),
  };
}

async function fetchNflOddsBySeasonWeek(season, week) {
  const apiKey = getApiKey();
  if (!apiKey) throw new Error('Missing Ball Don\'t Lie API key for odds');
  if (!season || week == null) return [];
  try {
    await waitForBdlRequestSlot(`nfl:v1:odds:${season}:${week}`);
    const resp = await axios.get(BDL_NFL_ODDS_V1, {
      params: { season, week, per_page: 100 },
      headers: { Authorization: apiKey }
    });
    return Array.isArray(resp?.data?.data) ? resp.data.data : [];
  } catch (e) {
    console.warn('[BallDonLieOdds] NFL season/week odds fetch failed:', e?.response?.data || e?.message || e);
    return [];
  }
}

async function fetchAllNcaafOdds(params, label, apiKey) {
  const rows = [];
  const seenCursors = new Set();
  let cursor = params?.cursor ?? null;
  let pageCount = 0;

  for (;;) {
    await waitForBdlRequestSlot(`${label}:page:${pageCount + 1}`);
    const pageParams = cursor == null ? { ...params } : { ...params, cursor };
    const response = await axios.get(BDL_NCAAF_ODDS_V1, {
      params: pageParams,
      headers: { Authorization: apiKey },
    });
    rows.push(...(Array.isArray(response?.data?.data) ? response.data.data : []));
    pageCount += 1;

    const nextCursor = response?.data?.meta?.next_cursor ?? null;
    if (nextCursor == null) break;
    const cursorKey = String(nextCursor);
    if (seenCursors.has(cursorKey)) {
      throw new Error(`NCAAF odds pagination repeated cursor ${cursorKey}`);
    }
    seenCursors.add(cursorKey);
    cursor = nextCursor;
    if (pageCount >= 100) {
      throw new Error('NCAAF odds pagination exceeded 100 pages');
    }
  }

  return rows;
}

function dedupeNcaafOddsRows(rows) {
  const byIdentity = new Map();
  for (const row of rows || []) {
    const gameId = row?.game_id;
    if (gameId == null) continue;
    const identity = row?.id != null
      ? `id:${row.id}`
      : `game:${gameId}:vendor:${row?.vendor || row?.bookmaker || 'unknown'}`;
    byIdentity.set(identity, row);
  }
  return [...byIdentity.values()];
}

export const ballDontLieOddsService = {
  /**
   * Scheduler-only NFL fast path: one exact game transport and one exact odds
   * transport. It never opens a date page or a season/week odds feed.
   */
  async getNflGameWithOddsById(gameId) {
    if (gameId === null || gameId === undefined || String(gameId).trim() === '') return [];
    const targetId = String(gameId);
    const game = await ballDontLieService.getGame('americanfootball_nfl', gameId, 1);
    if (!game) return [];
    if (String(game.id) !== targetId) {
      throw new Error(`NFL exact-game identity mismatch: requested ${targetId}, received ${game.id}`);
    }

    // Match fetchSportsbookOdds()'s parameter shape so the analysis phase gets
    // an in-process cache hit instead of booking a second BDL odds transport.
    const rows = await ballDontLieService.getOddsV2({ game_ids: [gameId] }, 'nfl');
    const exactRows = (rows || []).filter((row) => String(row?.game_id) === targetId);
    const normalized = normalizeExactNflGame(game, exactRows);
    return normalized ? [normalized] : [];
  },

  /**
   * Scheduler-only NCAAF fast path. Resolve one canonical provider game and
   * its game-id-scoped odds, while retaining the same fail-closed FBS policy
   * as full-slate discovery.
   */
  async getNcaafGameWithOddsById(gameId) {
    if (gameId === null || gameId === undefined || String(gameId).trim() === '') return [];
    const targetId = String(gameId);
    const game = await ballDontLieService.getGame('americanfootball_ncaaf', gameId, 1);
    if (!game) return [];
    if (String(game.id) !== targetId) {
      throw new Error(`NCAAF exact-game identity mismatch: requested ${targetId}, received ${game.id}`);
    }

    let classified = classifyNcaafFbsGames([game]);
    if (classified.unresolved.length > 0) {
      const teams = await ballDontLieService.getTeams('americanfootball_ncaaf');
      classified = classifyNcaafFbsGames([game], teams);
    }
    if (classified.unresolved.length > 0) {
      throw new Error(`NCAAF FBS identity unresolved for exact game ${targetId}`);
    }
    if (classified.rejected.length > 0) {
      console.log(`[BDL NCAAF] Excluded exact non-FBS game ${targetId}`);
      return [];
    }

    // This matches fetchSportsbookOdds()'s exact parameter shape, so the
    // later analysis fetch reuses the in-process provider response.
    const rows = await ballDontLieService.getOddsV2({ game_ids: [gameId] }, 'ncaaf');
    const exactRows = (rows || []).filter((row) => String(row?.game_id) === targetId);
    const normalized = normalizeExactNcaafGame(game, exactRows);
    return normalized ? [normalized] : [];
  },

  /**
   * Generic: get games with odds for any supported sport key using BDL V1 games + V2 odds
   * @param {string} sportKey - e.g., 'basketball_nba', 'americanfootball_nfl', 'icehockey_nhl', 'baseball_mlb'
   * @param {string} dateStr - YYYY-MM-DD
   * @returns {Promise<Array>} games with bookmakers/markets in a unified shape
   */
  async getGamesWithOddsForSport(sportKey, dateStr) {
    // NCAAF: v1 odds start from 2025 Week 9; use game_ids (preferred) and fallback to season/week
    if (sportKey === 'americanfootball_ncaaf') {
      const apiKey = getApiKey();
      const nextDate = new Date(`${dateStr}T00:00:00Z`);
      nextDate.setUTCDate(nextDate.getUTCDate() + 1);
      const utcDates = [dateStr, nextDate.toISOString().slice(0, 10)];
      const rawGames = await ballDontLieService.getGames(
        'americanfootball_ncaaf',
        { dates: utcDates, per_page: 100 },
        10,
      );
      const seenGameIds = new Set();
      const uniqueGames = (rawGames || []).filter((game) => {
        if (game?.id == null) return false;
        const gameKey = String(game.id);
        if (seenGameIds.has(gameKey)) return false;
        seenGameIds.add(gameKey);
        return true;
      });
      let classified = classifyNcaafFbsGames(uniqueGames);
      if (classified.unresolved.length > 0) {
        const teams = await ballDontLieService.getTeams('americanfootball_ncaaf');
        classified = classifyNcaafFbsGames(uniqueGames, teams);
      }
      if (classified.unresolved.length > 0) {
        throw new Error(
          `NCAAF FBS identity unresolved for ${classified.unresolved.length} game(s); refusing a partial slate`,
        );
      }
      if (classified.rejected.length > 0) {
        console.log(`[BDL NCAAF] Excluded ${classified.rejected.length} non-FBS matchup(s)`);
      }
      const kickoffByGame = new Map();
      const games = classified.accepted.filter((game) => {
        const kickoff = resolveNcaafKickoff(game);
        if (!kickoff.iso) return true;
        kickoffByGame.set(String(game.id), kickoff);
        return new Date(kickoff.iso).toLocaleDateString('en-CA', { timeZone: 'America/New_York' }) === dateStr;
      });
      const ids = (games || []).map(g => g.id).filter(id => id != null);
      let oddsRows = [];
      // Try by game_ids first to align games to odds precisely
      if (ids.length > 0) {
        try {
          for (let index = 0; index < ids.length; index += 100) {
            const batch = ids.slice(index, index + 100);
            const rows = await fetchAllNcaafOdds(
              { 'game_ids[]': batch, per_page: 100 },
              `ncaaf:v1:odds:games:${index / 100 + 1}:${batch.length}`,
              apiKey,
            );
            oddsRows.push(...rows);
          }
          oddsRows = dedupeNcaafOddsRows(oddsRows);
        } catch (e) {
          console.warn('[BallDonLieOdds][NCAAF] game_ids v1 odds fetch failed:', e?.response?.data || e?.message || e);
          // Never keep a truncated first batch/page. The season/week path can
          // recover the complete odds feed; a partial result would silently
          // make late-slate games look like they have no market.
          oddsRows = [];
        }
      }
      // Fallback: fetch by unique (season, week) pairs present in games
      if ((!Array.isArray(oddsRows) || oddsRows.length === 0) && Array.isArray(games)) {
        const seenPairs = new Set();
        for (const g of games) {
          const season = g?.season;
          const week = g?.week;
          if (!season || week == null) continue;
          const key = `${season}-${week}`;
          if (seenPairs.has(key)) continue;
          seenPairs.add(key);
          try {
            const rows = await fetchAllNcaafOdds(
              { season, week, per_page: 100 },
              `ncaaf:v1:odds:${season}:${week}`,
              apiKey,
            );
            if (rows.length) {
              oddsRows = (oddsRows || []).concat(rows);
            }
          } catch (e) {
            console.warn('[BallDonLieOdds][NCAAF] season/week v1 odds fetch failed:', e?.response?.data || e?.message || e);
          }
        }
        oddsRows = dedupeNcaafOddsRows(oddsRows);
      }
      // Index odds by game
      const byGame = oddsRows.reduce((acc, r) => {
        const gameKey = String(r.game_id);
        const list = acc.get(gameKey) || [];
        list.push(r);
        acc.set(gameKey, list);
        return acc;
      }, new Map());
      const mapTeamName = (t) => (typeof t === 'string' ? t : (t?.full_name || t?.name || t?.short_name || ''));
      return (games || []).map(g => {
        const vendors = byGame.get(String(g.id)) || [];
        const bookmakers = vendors.map(v => {
          const totalsOutcomes = [];
          const totalPoint = toNumber(v.total_value);
          const totalOver = toNumber(v.total_over_odds);
          const totalUnder = toNumber(v.total_under_odds);
          if (totalPoint !== null && totalOver !== null) totalsOutcomes.push({ name: 'Over', point: totalPoint, price: totalOver });
          if (totalPoint !== null && totalUnder !== null) totalsOutcomes.push({ name: 'Under', point: totalPoint, price: totalUnder });
          const spreadsOutcomes = [];
          const homeSpreadPoint = toNumber(v.spread_home_value);
          const homeSpreadPrice = toNumber(v.spread_home_odds);
          if (homeSpreadPoint !== null && homeSpreadPrice !== null) {
            spreadsOutcomes.push({ name: mapTeamName(g.home_team), point: homeSpreadPoint, price: homeSpreadPrice });
          }
          const awaySpreadPoint = toNumber(v.spread_away_value);
          const awaySpreadPrice = toNumber(v.spread_away_odds);
          if (awaySpreadPoint !== null && awaySpreadPrice !== null) {
            spreadsOutcomes.push({ name: mapTeamName(g.visitor_team || g.away_team), point: awaySpreadPoint, price: awaySpreadPrice });
          }
          const h2hOutcomes = [];
          const homeMl = toNumber(v.moneyline_home_odds);
          if (homeMl !== null) h2hOutcomes.push({ name: mapTeamName(g.home_team), price: homeMl });
          const awayMl = toNumber(v.moneyline_away_odds);
          if (awayMl !== null) h2hOutcomes.push({ name: mapTeamName(g.visitor_team || g.away_team), price: awayMl });
          const markets = [];
          if (h2hOutcomes.length) markets.push({ key: 'h2h', outcomes: h2hOutcomes });
          if (spreadsOutcomes.length) markets.push({ key: 'spreads', outcomes: spreadsOutcomes });
          if (totalsOutcomes.length) markets.push({ key: 'totals', outcomes: totalsOutcomes });
          return { key: v.vendor, title: v.vendor, markets };
        });
        const kickoff = kickoffByGame.get(String(g.id)) || resolveNcaafKickoff(g);
        if (!kickoff.iso) {
          console.warn(`[BDL NCAAF] Game ${g.id} has no date/time — skipping`);
          return null;
        }
        if (kickoff.estimated) {
          console.log(`[BDL NCAAF] Estimated 3:00 PM ET kickoff for game ${g.id}: ${kickoff.iso}`);
        }
        return {
          id: g.id,
          sport_key: sportKey,
          home_team: mapTeamName(g.home_team),
          away_team: mapTeamName(g.visitor_team || g.away_team),
          home_team_id: g.home_team?.id ?? null,
          away_team_id: (g.visitor_team || g.away_team)?.id ?? null,
          commence_time: kickoff.iso,
          estimated_time: kickoff.estimated,
          ncaaf_fbs_verified: true,
          bookmakers
        };
      }).filter(Boolean);
    }
    // NCAAB: use sport-specific v1 odds endpoint; odds start 2025-26 and not guaranteed per docs
    // NCAAB FIX: BDL stores games by UTC date, but we want EST date
    // Games at 7pm+ EST are stored under the NEXT UTC date (e.g., 7pm EST Jan 27 = midnight UTC Jan 28)
    // So we must query BOTH today AND tomorrow's UTC dates to get all EST games for today
    if (sportKey === 'basketball_ncaab') {
      const apiKey = getApiKey();

      // Calculate tomorrow's date in UTC
      const todayDate = new Date(dateStr);
      const tomorrowDate = new Date(todayDate.getTime() + 24 * 60 * 60 * 1000);
      const tomorrowStr = tomorrowDate.toISOString().split('T')[0]; // YYYY-MM-DD

      console.log(`[NCAAB] Fetching games for BOTH ${dateStr} AND ${tomorrowStr} (UTC) to capture all EST games`);

      // Fetch games for both dates
      const [gamesToday, gamesTomorrow] = await Promise.all([
        ballDontLieService.getGames('basketball_ncaab', { dates: [dateStr], per_page: 100 }, 10),
        ballDontLieService.getGames('basketball_ncaab', { dates: [tomorrowStr], per_page: 100 }, 10)
      ]);

      // Combine and deduplicate by game ID
      const allGamesMap = new Map();
      for (const g of [...(gamesToday || []), ...(gamesTomorrow || [])]) {
        if (g?.id && !allGamesMap.has(g.id)) {
          allGamesMap.set(g.id, g);
        }
      }
      const games = Array.from(allGamesMap.values());
      console.log(`[NCAAB] Combined: ${gamesToday?.length || 0} from ${dateStr} + ${gamesTomorrow?.length || 0} from ${tomorrowStr} = ${games.length} unique games`);

      const ids = (games || []).map(g => g.id).filter(Boolean);
      let oddsRows = [];
      try {
        // Use paginated getOddsV2 (auto-paginates via cursor, up to 10 pages)
        const [rowsToday, rowsTomorrow] = await Promise.all([
          ballDontLieService.getOddsV2({ dates: [dateStr], per_page: 100 }, 'basketball_ncaab'),
          ballDontLieService.getOddsV2({ dates: [tomorrowStr], per_page: 100 }, 'basketball_ncaab')
        ]);
        oddsRows = [...(rowsToday || []), ...(rowsTomorrow || [])];
        console.log(`[NCAAB] Odds: ${rowsToday?.length || 0} from ${dateStr} + ${rowsTomorrow?.length || 0} from ${tomorrowStr} (paginated)`);
      } catch (e) {
        console.warn('[BallDonLieOdds][NCAAB] date-based v1 odds fetch failed:', e?.response?.data || e?.message || e);
      }
      // Fallback: fetch by game_ids for games still missing odds
      if (ids.length > 0) {
        const coveredGameIds = new Set(oddsRows.map(r => r.game_id));
        const missingIds = ids.filter(id => !coveredGameIds.has(id));
        if (missingIds.length > 0) {
          console.log(`[NCAAB] ${missingIds.length} games missing odds after date fetch — fetching by game_ids...`);
          try {
            // Fetch in batches of 100
            for (let i = 0; i < missingIds.length; i += 100) {
              const batch = missingIds.slice(i, i + 100);
              const byIds = await ballDontLieService.getOddsV2({ game_ids: batch, per_page: 100 }, 'basketball_ncaab');
              if (Array.isArray(byIds) && byIds.length) {
                oddsRows = oddsRows.concat(byIds);
                console.log(`[NCAAB] Recovered odds for ${byIds.length} rows via game_ids fallback (batch ${Math.floor(i / 100) + 1})`);
              }
            }
          } catch (e) {
            console.warn('[BallDonLieOdds][NCAAB] game_ids v1 odds fetch failed:', e?.response?.data || e?.message || e);
          }
        }
      }
      // Index odds by game
      const byGame = oddsRows.reduce((acc, r) => {
        const list = acc.get(r.game_id) || [];
        list.push(r);
        acc.set(r.game_id, list);
        return acc;
      }, new Map());
      const mapTeamName = (t) => (typeof t === 'string' ? t : (t?.full_name || t?.name || t?.short_name || ''));
      return (games || []).map(g => {
        const vendors = byGame.get(g.id) || [];
        const bookmakers = vendors.map(v => {
          const totalsOutcomes = [];
          const totalPoint = toNumber(v.total_value);
          const totalOver = toNumber(v.total_over_odds);
          const totalUnder = toNumber(v.total_under_odds);
          if (totalPoint !== null && totalOver !== null) totalsOutcomes.push({ name: 'Over', point: totalPoint, price: totalOver });
          if (totalPoint !== null && totalUnder !== null) totalsOutcomes.push({ name: 'Under', point: totalPoint, price: totalUnder });
          const spreadsOutcomes = [];
          const homeSpreadPoint = toNumber(v.spread_home_value);
          const homeSpreadPrice = toNumber(v.spread_home_odds);
          if (homeSpreadPoint !== null && homeSpreadPrice !== null) {
            spreadsOutcomes.push({ name: mapTeamName(g.home_team), point: homeSpreadPoint, price: homeSpreadPrice });
          }
          const awaySpreadPoint = toNumber(v.spread_away_value);
          const awaySpreadPrice = toNumber(v.spread_away_odds);
          if (awaySpreadPoint !== null && awaySpreadPrice !== null) {
            spreadsOutcomes.push({ name: mapTeamName(g.visitor_team || g.away_team), point: awaySpreadPoint, price: awaySpreadPrice });
          }
          const h2hOutcomes = [];
          const homeMl = toNumber(v.moneyline_home_odds);
          if (homeMl !== null) h2hOutcomes.push({ name: mapTeamName(g.home_team), price: homeMl });
          const awayMl = toNumber(v.moneyline_away_odds);
          if (awayMl !== null) h2hOutcomes.push({ name: mapTeamName(g.visitor_team || g.away_team), price: awayMl });
          const markets = [];
          if (h2hOutcomes.length) markets.push({ key: 'h2h', outcomes: h2hOutcomes });
          if (spreadsOutcomes.length) markets.push({ key: 'spreads', outcomes: spreadsOutcomes });
          if (totalsOutcomes.length) markets.push({ key: 'totals', outcomes: totalsOutcomes });
          return { key: v.vendor, title: v.vendor, markets };
        });

        let commenceTime = g.start_time_utc || g.datetime || g.game_date || g.date || g.commence_time || null;
        if (!commenceTime) {
          console.warn(`[BDL NCAAB] Game ${g.id} has no date/time — skipping`);
          return null;
        }

        // Date-only → estimated time (22:00 UTC = 5 PM EST, typical NCAAB evening game)
        let estimated_time = false;
        if (typeof commenceTime === 'string' && commenceTime.length === 10 && !commenceTime.includes('T')) {
          commenceTime = `${commenceTime}T22:00:00.000Z`;
          estimated_time = true;
          console.log(`[BDL NCAAB] Estimated time for game ${g.id}: ${commenceTime}`);
        }

        return {
          id: g.id,
          sport_key: sportKey,
          home_team: mapTeamName(g.home_team),
          away_team: mapTeamName(g.visitor_team || g.away_team),
          commence_time: commenceTime,
          estimated_time,
          bookmakers
        };
      }).filter(Boolean);
    }
    // NHL: Use dual-date fetching like NCAAB to capture all EST games
    // Games at 7pm+ EST are stored under the NEXT UTC date
    if (sportKey === 'icehockey_nhl') {
      const apiKey = getApiKey();

      // Calculate tomorrow's date in UTC
      const todayDate = new Date(dateStr);
      const tomorrowDate = new Date(todayDate.getTime() + 24 * 60 * 60 * 1000);
      const tomorrowStr = tomorrowDate.toISOString().split('T')[0];

      console.log(`[NHL] Fetching games for BOTH ${dateStr} AND ${tomorrowStr} (UTC) to capture all EST games`);

      // Fetch games for both dates
      let gamesToday = [];
      let gamesTomorrow = [];
      try {
        [gamesToday, gamesTomorrow] = await Promise.all([
          ballDontLieService.getGames('icehockey_nhl', { dates: [dateStr], per_page: 100 }, 10),
          ballDontLieService.getGames('icehockey_nhl', { dates: [tomorrowStr], per_page: 100 }, 10)
        ]);
      } catch (e) {
        console.warn(`[NHL] Games fetch failed, trying individual dates:`, e?.message || e);
        // Fallback: try individually
        try { gamesToday = await ballDontLieService.getGames('icehockey_nhl', { dates: [dateStr], per_page: 100 }, 10) || []; } catch { gamesToday = []; }
        try { gamesTomorrow = await ballDontLieService.getGames('icehockey_nhl', { dates: [tomorrowStr], per_page: 100 }, 10) || []; } catch { gamesTomorrow = []; }
      }

      // Combine and deduplicate by game ID
      const allGamesMap = new Map();
      for (const g of [...(gamesToday || []), ...(gamesTomorrow || [])]) {
        if (g?.id && !allGamesMap.has(g.id)) {
          allGamesMap.set(g.id, g);
        }
      }
      const games = Array.from(allGamesMap.values());
      console.log(`[NHL] Combined: ${gamesToday?.length || 0} from ${dateStr} + ${gamesTomorrow?.length || 0} from ${tomorrowStr} = ${games.length} unique games`);

      const ids = (games || []).map(g => g.id).filter(Boolean);
      let oddsRows = [];
      try {
        // Fetch odds for both dates
        const [respToday, respTomorrow] = await Promise.all([
          axios.get(BDL_NHL_ODDS_V1, {
            params: { 'dates[]': [dateStr], per_page: 100 },
            headers: { Authorization: apiKey }
          }),
          axios.get(BDL_NHL_ODDS_V1, {
            params: { 'dates[]': [tomorrowStr], per_page: 100 },
            headers: { Authorization: apiKey }
          })
        ]);
        const rowsToday = Array.isArray(respToday?.data?.data) ? respToday.data.data : [];
        const rowsTomorrow = Array.isArray(respTomorrow?.data?.data) ? respTomorrow.data.data : [];
        oddsRows = [...rowsToday, ...rowsTomorrow];
        console.log(`[NHL] Odds: ${rowsToday.length} from ${dateStr} + ${rowsTomorrow.length} from ${tomorrowStr}`);
      } catch (e) {
        console.warn('[BallDonLieOdds][NHL] date-based v1 odds fetch failed:', e?.response?.data || e?.message || e);
      }

      // Index odds by game
      const byGame = oddsRows.reduce((acc, r) => {
        const list = acc.get(r.game_id) || [];
        list.push(r);
        acc.set(r.game_id, list);
        return acc;
      }, new Map());
      const mapTeamName = (t) => (typeof t === 'string' ? t : (t?.full_name || t?.name || t?.short_name || ''));
      return (games || []).map(g => {
        const vendors = byGame.get(g.id) || [];
        const bookmakers = vendors.map(v => {
          const totalsOutcomes = [];
          const totalPoint = toNumber(v.total_value);
          const totalOver = toNumber(v.total_over_odds);
          const totalUnder = toNumber(v.total_under_odds);
          if (totalPoint !== null && totalOver !== null) totalsOutcomes.push({ name: 'Over', point: totalPoint, price: totalOver });
          if (totalPoint !== null && totalUnder !== null) totalsOutcomes.push({ name: 'Under', point: totalPoint, price: totalUnder });
          const spreadsOutcomes = [];
          const homeSpreadPoint = toNumber(v.spread_home_value);
          const homeSpreadPrice = toNumber(v.spread_home_odds);
          if (homeSpreadPoint !== null && homeSpreadPrice !== null) {
            spreadsOutcomes.push({ name: mapTeamName(g.home_team), point: homeSpreadPoint, price: homeSpreadPrice });
          }
          const awaySpreadPoint = toNumber(v.spread_away_value);
          const awaySpreadPrice = toNumber(v.spread_away_odds);
          if (awaySpreadPoint !== null && awaySpreadPrice !== null) {
            spreadsOutcomes.push({ name: mapTeamName(g.visitor_team || g.away_team), point: awaySpreadPoint, price: awaySpreadPrice });
          }
          const h2hOutcomes = [];
          const homeMl = toNumber(v.moneyline_home_odds);
          if (homeMl !== null) h2hOutcomes.push({ name: mapTeamName(g.home_team), price: homeMl });
          const awayMl = toNumber(v.moneyline_away_odds);
          if (awayMl !== null) h2hOutcomes.push({ name: mapTeamName(g.visitor_team || g.away_team), price: awayMl });
          const markets = [];
          if (h2hOutcomes.length) markets.push({ key: 'h2h', outcomes: h2hOutcomes });
          if (spreadsOutcomes.length) markets.push({ key: 'spreads', outcomes: spreadsOutcomes });
          if (totalsOutcomes.length) markets.push({ key: 'totals', outcomes: totalsOutcomes });
          return { key: v.vendor, title: v.vendor, markets };
        });

        let commenceTime = g.start_time_utc || g.datetime || g.commence_time || g.game_date || g.date || null;
        if (!commenceTime) {
          console.warn(`[BDL NHL] Game ${g.id} has no date/time — skipping`);
          return null;
        }
        let estimated_time = false;
        if (typeof commenceTime === 'string' && commenceTime.length === 10 && !commenceTime.includes('T')) {
          commenceTime = `${commenceTime}T00:00:00.000Z`;
          estimated_time = true;
          console.log(`[BDL NHL] Estimated time for game ${g.id}: ${commenceTime}`);
        }

        return {
          id: g.id,
          sport_key: sportKey,
          home_team: mapTeamName(g.home_team),
          away_team: mapTeamName(g.visitor_team || g.away_team),
          commence_time: commenceTime,
          estimated_time,
          bookmakers
        };
      }).filter(Boolean);
    }
    // Evening EST games are stored under the NEXT UTC date in BDL
    // (e.g., 8pm ET March 25 = midnight UTC March 26). Fetch both dates and deduplicate.
    const hasUtcDateBleed = sportKey === 'baseball_mlb' || sportKey === 'americanfootball_nfl';
    let fetchDates = [dateStr];
    if (hasUtcDateBleed) {
      const nextDate = new Date(new Date(dateStr).getTime() + 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      fetchDates = [dateStr, nextDate];
    }

    // Fetch games and deduplicate by game ID
    const rawGames = (await Promise.all(
      fetchDates.map(d => {
        const params = { dates: [d], per_page: 100 };
        if (sportKey === 'americanfootball_nfl') params.season_type = [1, 2, 3];
        return ballDontLieService.getGames(sportKey, params, 10).catch(() => []);
      })
    )).flat();
    const seenIds = new Set();
    const games = rawGames.filter(g => {
      if (!g?.id || seenIds.has(g.id)) return false;
      seenIds.add(g.id);
      return true;
    });

    // Use unified helper to get odds appropriate for sport
    // NOTE: NFL v1 odds endpoint does NOT support 'dates', so we skip this initial fetch for NFL.
    let odds = [];
    if (sportKey !== 'americanfootball_nfl') {
      odds = (await Promise.all(
        fetchDates.map(d => ballDontLieService.getOddsV2({ dates: [d], per_page: 100 }, sportKey).catch(() => []))
      )).flat();
    }

    // NBA: If date-based v2 odds are sparse or missing ML/Spreads, fetch v2 odds by game_ids for precision
    if (sportKey === 'basketball_nba') {
      try {
        const apiKey = getApiKey();
        const uniqueGameIds = (games || []).map(g => g?.id).filter(id => id != null);
        const hasAnyRowsForGames = Array.isArray(odds) && odds.some(r => uniqueGameIds.includes(r?.game_id));

        // Check specifically for missing ML/Spreads in the odds we got back
        const rowsByGame = new Map();
        for (const r of Array.isArray(odds) ? odds : []) {
          if (r?.game_id == null) continue;
          const list = rowsByGame.get(r.game_id) || [];
          list.push(r);
          rowsByGame.set(r.game_id, list);
        }

        const missingMlOrSpreadIds = uniqueGameIds.filter(gid => {
          const rows = rowsByGame.get(gid) || [];
          if (rows.length === 0) return true; // No odds at all

          // Check if any row has ML OR Spread
          const hasMl = rows.some(x => toNumber(x?.moneyline_home_odds) !== null || toNumber(x?.moneyline_away_odds) !== null);
          const hasSpread = rows.some(x => toNumber(x?.spread_home_value) !== null || toNumber(x?.spread_away_value) !== null);
          return !(hasMl || hasSpread);
        });

        // If we have missing odds, try fetching by game_ids
        if (uniqueGameIds.length && missingMlOrSpreadIds.length > 0) {
          console.log(`[NBA] Found ${missingMlOrSpreadIds.length} games missing odds. Fetching by game_ids...`);
          const targetIds = missingMlOrSpreadIds; // fetch for all missing
          const byIds = await ballDontLieService.getOddsV2({ game_ids: targetIds.slice(0, 100), per_page: 100 }, 'nba');

          if (byIds.length) {
            console.log(`[NBA] Recovered odds for ${byIds.length} games via game_ids fallback.`);
            // Merge: prefer new rows for the targeted game_ids
            const targeted = new Set(targetIds);
            const retained = (Array.isArray(odds) ? odds : []).filter(x => !targeted.has(x?.game_id));
            odds = retained.concat(byIds);
          } else {
            console.log(`[NBA] game_ids fallback returned 0 rows for ${targetIds.length} games.`);
          }
        }
      } catch (e) {
        console.warn('[BallDonLieOdds][NBA] v2 odds by game_ids fallback failed:', e?.response?.data || e?.message || e);
      }
    }

    // NFL: if date-based odds are sparse, fall back to querying by game_ids (covers season/week cases)
    if (sportKey === 'americanfootball_nfl') {
      try {
        const uniqueGameIds = (games || []).map(g => g?.id).filter(id => id != null);
        const hasVendors = Array.isArray(odds) && odds.some(r => uniqueGameIds.includes(r?.game_id));
        if (uniqueGameIds.length && !hasVendors) {
          const byIds = await ballDontLieService.getOddsV2({ game_ids: uniqueGameIds, per_page: 100 }, 'nfl');
          if (Array.isArray(byIds) && byIds.length) {
            odds = byIds;
          }
        }
        if (!Array.isArray(odds) || odds.length === 0) {
          const seasonWeekPairs = [];
          for (const g of games || []) {
            const season = g?.season;
            const week = g?.week;
            if (season && week != null) {
              const key = `${season}-${week}`;
              if (!seasonWeekPairs.find(p => p.key === key)) {
                seasonWeekPairs.push({ key, season, week });
              }
            }
          }
          for (const pair of seasonWeekPairs) {
            const seasonWeekOdds = await fetchNflOddsBySeasonWeek(pair.season, pair.week);
            if (Array.isArray(seasonWeekOdds) && seasonWeekOdds.length) {
              odds = (odds || []).concat(seasonWeekOdds);
            }
          }
        }
      } catch (e) {
        console.warn('[OddsService][NFL] Fallback by game_ids failed:', e?.message || e);
      }
    }

    // Index odds by game_id
    const gameIdToVendors = new Map();
    odds.forEach(row => {
      const list = gameIdToVendors.get(row.game_id) || [];
      list.push(row);
      gameIdToVendors.set(row.game_id, list);
    });

    // NFL per-game fallback: if specific game rows exist but lack ML/spread, pull season/week odds and merge
    if (sportKey === 'americanfootball_nfl' && Array.isArray(games)) {
      for (const g of games) {
        const rows = gameIdToVendors.get(g.id) || [];
        const hasMlInRows = rows.some(r => {
          const h = toNumber(r?.moneyline_home_odds);
          const a = toNumber(r?.moneyline_away_odds);
          return h !== null || a !== null;
        });
        const hasSpreadInRows = rows.some(r => {
          const sh = toNumber(r?.spread_home_value);
          const sa = toNumber(r?.spread_away_value);
          return sh !== null || sa !== null;
        });
        if (!hasMlInRows && !hasSpreadInRows) {
          try {
            const season = g?.season;
            const week = g?.week;
            if (season && week != null) {
              const v1Rows = await fetchNflOddsBySeasonWeek(season, week);
              const forGame = (v1Rows || []).filter(r => r?.game_id === g.id);
              if (forGame.length) {
                const existing = gameIdToVendors.get(g.id) || [];
                gameIdToVendors.set(g.id, existing.concat(forGame));
                console.log(`[BallDonLieOdds][NFL] v1 fallback merged for game ${g.id} (${(g.visitor_team?.name || g.away_team?.name || '')} @ ${(g.home_team?.name || '')})`);
              } else {
                console.warn(`[BallDonLieOdds][NFL] v1 fallback returned no rows for game ${g.id} (season ${season}, week ${week})`);
              }
            }
          } catch (e) {
            console.warn('[BallDonLieOdds][NFL] per-game v1 fallback failed:', e?.message || e);
          }
        }
      }
    }

    const mapTeamName = (teamObjOrName) => {
      if (!teamObjOrName) return '';
      if (typeof teamObjOrName === 'string') return teamObjOrName;
      return teamObjOrName.full_name || teamObjOrName.name || teamObjOrName.city || '';
    };

    return (games || []).map(g => {
      const vendors = gameIdToVendors.get(g.id) || [];
      const bookmakers = vendors.map(v => {
        const totalsOutcomes = [];
        const totalPoint = toNumber(v.total_value);
        const totalOver = toNumber(v.total_over_odds);
        const totalUnder = toNumber(v.total_under_odds);
        if (totalPoint !== null && totalOver !== null) {
          totalsOutcomes.push({ name: 'Over', point: totalPoint, price: totalOver });
        }
        if (totalPoint !== null && totalUnder !== null) {
          totalsOutcomes.push({ name: 'Under', point: totalPoint, price: totalUnder });
        }
        const spreadsOutcomes = [];
        const homeSpreadPoint = toNumber(v.spread_home_value);
        const homeSpreadPrice = toNumber(v.spread_home_odds);
        if (homeSpreadPoint !== null && homeSpreadPrice !== null) {
          spreadsOutcomes.push({ name: mapTeamName(g.home_team), point: homeSpreadPoint, price: homeSpreadPrice });
        }
        const awaySpreadPoint = toNumber(v.spread_away_value);
        const awaySpreadPrice = toNumber(v.spread_away_odds);
        if (awaySpreadPoint !== null && awaySpreadPrice !== null) {
          spreadsOutcomes.push({ name: mapTeamName(g.visitor_team || g.away_team), point: awaySpreadPoint, price: awaySpreadPrice });
        }
        const h2hOutcomes = [];
        const mlHome = toNumber(v.moneyline_home_odds);
        if (mlHome !== null) {
          h2hOutcomes.push({ name: mapTeamName(g.home_team), price: mlHome });
        }
        const mlAway = toNumber(v.moneyline_away_odds);
        if (mlAway !== null) {
          h2hOutcomes.push({ name: mapTeamName(g.visitor_team || g.away_team), price: mlAway });
        }
        if (typeof v.moneyline_draw_odds !== 'undefined') {
          h2hOutcomes.push({ name: 'Draw', price: v.moneyline_draw_odds });
        }

        const markets = [];
        if (h2hOutcomes.length) markets.push({ key: 'h2h', outcomes: h2hOutcomes });
        if (spreadsOutcomes.length) markets.push({ key: 'spreads', outcomes: spreadsOutcomes });
        if (totalsOutcomes.length) markets.push({ key: 'totals', outcomes: totalsOutcomes });

        return {
          key: v.vendor,
          title: v.vendor,
          markets
        };
      });

      // Normalize away/visitor for non-NBA sports
      const awayTeamName = mapTeamName(g.visitor_team || g.away_team);
      const homeTeamName = mapTeamName(g.home_team);

      // Use proper datetime fields for accurate timezone handling
      // BDL returns for NFL: date="2026-01-25T20:00:00.000Z" (ISO with actual game time!)
      // But datetime/start_time_utc are often undefined, and status is human-readable
      // Priority: date (if ISO) > datetime > start_time_utc > fallback

      // DEBUG: Log what BDL returns for NFL games
      if (sportKey === 'americanfootball_nfl') {
        console.log(`[BDL Odds] NFL Game ${g.id}: date=${g.date}, datetime=${g.datetime}, status=${g.status}, start_time_utc=${g.start_time_utc}`);
      }

      let commenceTime = g.datetime || g.start_time_utc;

      // NFL FIX: BDL returns the actual game time in g.date as an ISO string (e.g., "2026-01-25T20:00:00.000Z")
      // Check if g.date contains 'T' indicating it's an ISO datetime, not just a date
      if (!commenceTime && g.date && g.date.includes('T')) {
        commenceTime = g.date;
        console.log(`[BDL Odds] Using g.date as ISO datetime: ${commenceTime}`);
      }

      // Fallback: If date is just YYYY-MM-DD format, add reasonable game time
      let estimated_time = false;
      if (!commenceTime && g.date) {
        if (!g.date.includes('T')) {
          const dateParts = g.date.split('-');
          const gameDate = new Date(Date.UTC(parseInt(dateParts[0]), parseInt(dateParts[1]) - 1, parseInt(dateParts[2]), 20, 0, 0));
          commenceTime = gameDate.toISOString();
          estimated_time = true;
          console.log(`[BDL Odds] Estimated time for game ${g.id}: ${g.date} -> ${commenceTime}`);
        }
      }

      if (!commenceTime) {
        console.warn(`[BDL Odds] Game ${g.id} (${awayTeamName} @ ${homeTeamName}) has no date/time — skipping`);
        return null;
      }

      // DEBUG: Log final commence_time
      if (sportKey === 'americanfootball_nfl') {
        console.log(`[BDL Odds] NFL Game ${g.id}: FINAL commence_time = ${commenceTime}`);
      }

      const result = {
        id: g.id,
        season: g.season ?? null,
        week: g.week ?? null,
        season_type: g.season_type ?? null,
        sport_key: sportKey,
        home_team: homeTeamName,
        away_team: awayTeamName,
        commence_time: commenceTime,
        estimated_time,
        venue: g.venue || null,
        bookmakers
      };
      if (sportKey === 'americanfootball_nfl') {
        const hasMl = bookmakers.some(b => (b.markets || []).some(m => m.key === 'h2h' && m.outcomes?.some(o => typeof o.price === 'number')));
        const hasSpread = bookmakers.some(b => (b.markets || []).some(m => m.key === 'spreads' && m.outcomes?.some(o => typeof o.price === 'number' && typeof o.point === 'number')));
        if (!hasMl || !hasSpread) {
          console.warn(`[OddsService][NFL] Missing odds data for ${awayTeamName} @ ${homeTeamName} (ML=${hasMl}, spread=${hasSpread})`);
        }
      }
      return result;
    }).filter(Boolean);
  }
  // getNflPlayerProps, getNhlPlayerProps, getNbaPlayerProps, normalizePlayerProps removed — dead code (callers use ballDontLieService instead)
};
