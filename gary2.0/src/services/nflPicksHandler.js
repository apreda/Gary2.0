import { oddsService } from './oddsService.js';
import { ballDontLieService } from './ballDontLieService.js';
import { computeRecommendedSportsbook } from './recommendedSportsbook.js';
import { perplexityService } from './perplexityService.js';
import { makeGaryPick } from './garyEngine.js';
import { processGameOnce } from './picksService.js';

const SPORT_KEY = 'americanfootball_nfl';

export async function generateNFLPicks(options = {}) {
  console.log('Processing NFL games');
  if (options.nocache) {
    console.log('NFL nocache mode: clearing Ball Don\'t Lie cache');
    ballDontLieService.clearCache();
  }
  const games = await oddsService.getUpcomingGames(SPORT_KEY, { nocache: options.nocache === true });
  console.log(`Found ${games.length} NFL games from odds service`);

  // Weekly window: include games in the next 6 days (Thu–Tue coverage)
  const now = new Date();
  const end = new Date(now.getTime() + 6 * 24 * 60 * 60 * 1000);
  console.log(`NFL 6-day window: ${now.toISOString()} to ${end.toISOString()}`);

  let todayGames = games.filter(g => {
    const t = new Date(g.commence_time);
    return t >= now && t <= end;
  });
  console.log(`After date filtering: ${todayGames.length} NFL games in next 6 days`);

  if (typeof options.onlyAtIndex === 'number') {
    const idx = options.onlyAtIndex;
    todayGames = idx >= 0 && idx < todayGames.length ? [todayGames[idx]] : [];
  }

  const season = new Date().getFullYear();
  const picks = [];

  for (const game of todayGames) {
    const gameId = `nfl-${game.id}`;

    const result = await processGameOnce(gameId, async () => {
      console.log(`Processing NFL game: ${game.away_team} @ ${game.home_team}`);

      // Map teams to BDL IDs
      const homeTeam = await ballDontLieService.getTeamByNameGeneric(SPORT_KEY, game.home_team);
      const awayTeam = await ballDontLieService.getTeamByNameGeneric(SPORT_KEY, game.away_team);

      if (!homeTeam || !awayTeam) {
        console.warn(`NFL: Could not resolve teams for ${game.away_team} @ ${game.home_team} — skipping.`);
        return null;
      }

      // Fetch team stats and injuries (fail if no stats for both teams)
      const [homeTeamStats, awayTeamStats, injuries] = await Promise.all([
        ballDontLieService.getTeamStats(SPORT_KEY, { seasons: [season], team_ids: [homeTeam.id], per_page: 100 }),
        ballDontLieService.getTeamStats(SPORT_KEY, { seasons: [season], team_ids: [awayTeam.id], per_page: 100 }),
        ballDontLieService.getInjuriesGeneric(SPORT_KEY, { team_ids: [homeTeam.id, awayTeam.id] })
      ]);

      // Strictly scope any returned rows to the actual matchup teams
      const filterByTeamId = (rows, teamId) => {
        if (!Array.isArray(rows)) return [];
        return rows.filter(r => {
          const id = r?.team?.id ?? r?.team_id ?? r?.team?.team_id;
          return id === teamId;
        });
      };
      const homeTeamStatsScoped = filterByTeamId(homeTeamStats, homeTeam.id);
      const awayTeamStatsScoped = filterByTeamId(awayTeamStats, awayTeam.id);

      // Fallback: if scoped team_stats are empty, fetch recent games and query by game_ids
      let finalHomeTeamStats = homeTeamStatsScoped;
      let finalAwayTeamStats = awayTeamStatsScoped;
      if (finalHomeTeamStats.length === 0 || finalAwayTeamStats.length === 0) {
        try {
          const recentWindowStart = new Date();
          recentWindowStart.setDate(recentWindowStart.getDate() - 35); // last ~5 weeks
          const startStr = recentWindowStart.toISOString().slice(0, 10);
          const endStr = new Date().toISOString().slice(0, 10);
          const [homeGames, awayGames] = await Promise.all([
            ballDontLieService.getGames(SPORT_KEY, { seasons: [season], team_ids: [homeTeam.id], start_date: startStr, end_date: endStr, postseason: false, per_page: 100 }, options.nocache ? 0 : 10),
            ballDontLieService.getGames(SPORT_KEY, { seasons: [season], team_ids: [awayTeam.id], start_date: startStr, end_date: endStr, postseason: false, per_page: 100 }, options.nocache ? 0 : 10)
          ]);
          const homeGameIds = (homeGames || []).map(g => g?.id).filter(Boolean).slice(-8);
          const awayGameIds = (awayGames || []).map(g => g?.id).filter(Boolean).slice(-8);
          const [homeByGames, awayByGames] = await Promise.all([
            homeGameIds.length ? ballDontLieService.getTeamStats(SPORT_KEY, { game_ids: homeGameIds, per_page: 100 }) : Promise.resolve([]),
            awayGameIds.length ? ballDontLieService.getTeamStats(SPORT_KEY, { game_ids: awayGameIds, per_page: 100 }) : Promise.resolve([])
          ]);
          const scopedHomeByGames = filterByTeamId(homeByGames, homeTeam.id);
          const scopedAwayByGames = filterByTeamId(awayByGames, awayTeam.id);
          if (finalHomeTeamStats.length === 0 && scopedHomeByGames.length > 0) finalHomeTeamStats = scopedHomeByGames;
          if (finalAwayTeamStats.length === 0 && scopedAwayByGames.length > 0) finalAwayTeamStats = scopedAwayByGames;
          if (finalHomeTeamStats.length === 0 || finalAwayTeamStats.length === 0) {
            console.warn(`NFL fallback by game_ids still empty for ${game.away_team} @ ${game.home_team}`);
          }
        } catch (e) {
          console.warn('NFL team_stats fallback failed:', e?.message || e);
        }
      }

      // Season aggregates for offense/defense summary
      const [homeSeason, awaySeason] = await Promise.all([
        ballDontLieService.getTeamSeasonStats(SPORT_KEY, { teamId: homeTeam.id, season, postseason: false }),
        ballDontLieService.getTeamSeasonStats(SPORT_KEY, { teamId: awayTeam.id, season, postseason: false })
      ]);
      const homeRates = ballDontLieService.deriveNflTeamRates(homeSeason);
      const awayRates = ballDontLieService.deriveNflTeamRates(awaySeason);

      // Require season-level stats (per-game team_stats may be empty on some weeks)
      const hasHomeSeason = Array.isArray(homeSeason) && homeSeason.length > 0;
      const hasAwaySeason = Array.isArray(awaySeason) && awaySeason.length > 0;
      if (!hasHomeSeason || !hasAwaySeason) {
        console.warn(`NFL: Missing required season stats for ${game.away_team} @ ${game.home_team} — skipping.`);
        return null;
      }

      // Identify probable QBs and fetch season stats
      let homeQb = null;
      let awayQb = null;
      let homeQbSeason = [];
      let awayQbSeason = [];
      let homeQbAdvanced = [];
      let awayQbAdvanced = [];
      // Optional skill players with advanced rushing/receiving
      let homeLeadRb = null;
      let awayLeadRb = null;
      let homeLeadWr = null;
      let awayLeadWr = null;
      let homeRbAdvanced = [];
      let awayRbAdvanced = [];
      let homeWrAdvanced = [];
      let awayWrAdvanced = [];
      try {
        let [homeQbs, awayQbs] = await Promise.all([
          ballDontLieService.getPlayersGeneric(SPORT_KEY, { team_ids: [homeTeam.id], position: 'QB', per_page: 5 }),
          ballDontLieService.getPlayersGeneric(SPORT_KEY, { team_ids: [awayTeam.id], position: 'QB', per_page: 5 })
        ]);
        // Some backends ignore the 'position' filter; enforce locally
        const isQB = (p) => {
          const pos = (p?.position || '').toLowerCase();
          const abbr = (p?.position_abbreviation || '').toLowerCase();
          return abbr === 'qb' || pos.includes('quarterback');
        };
        const isRB = (p) => {
          const pos = (p?.position || '').toLowerCase();
          const abbr = (p?.position_abbreviation || '').toLowerCase();
          return abbr === 'rb' || pos.includes('running back');
        };
        const isWR = (p) => {
          const pos = (p?.position || '').toLowerCase();
          const abbr = (p?.position_abbreviation || '').toLowerCase();
          return abbr === 'wr' || pos.includes('wide receiver');
        };
        if (Array.isArray(homeQbs)) homeQbs = homeQbs.filter(isQB);
        if (Array.isArray(awayQbs)) awayQbs = awayQbs.filter(isQB);
        homeQb = Array.isArray(homeQbs) && homeQbs[0] ? homeQbs[0] : null;
        awayQb = Array.isArray(awayQbs) && awayQbs[0] ? awayQbs[0] : null;
        const [homeQbSeasonRes, awayQbSeasonRes, homeQbAdvRes, awayQbAdvRes] = await Promise.all([
          homeQb ? ballDontLieService.getNflPlayerSeasonStats({ playerId: homeQb.id, season, postseason: false }) : Promise.resolve([]),
          awayQb ? ballDontLieService.getNflPlayerSeasonStats({ playerId: awayQb.id, season, postseason: false }) : Promise.resolve([]),
          homeQb ? ballDontLieService.getNflAdvancedPassingStats({ season, playerId: homeQb.id, postseason: false, week: 0 }) : Promise.resolve([]),
          awayQb ? ballDontLieService.getNflAdvancedPassingStats({ season, playerId: awayQb.id, postseason: false, week: 0 }) : Promise.resolve([])
        ]);
        homeQbSeason = homeQbSeasonRes;
        awayQbSeason = awayQbSeasonRes;
        homeQbAdvanced = homeQbAdvRes;
        awayQbAdvanced = awayQbAdvRes;

        // Try to identify a lead RB and WR per team, then pull advanced rushing/receiving (season-level)
        let [homeRbs, awayRbs, homeWrs, awayWrs] = await Promise.all([
          ballDontLieService.getPlayersGeneric(SPORT_KEY, { team_ids: [homeTeam.id], position: 'RB', per_page: 5 }),
          ballDontLieService.getPlayersGeneric(SPORT_KEY, { team_ids: [awayTeam.id], position: 'RB', per_page: 5 }),
          ballDontLieService.getPlayersGeneric(SPORT_KEY, { team_ids: [homeTeam.id], position: 'WR', per_page: 5 }),
          ballDontLieService.getPlayersGeneric(SPORT_KEY, { team_ids: [awayTeam.id], position: 'WR', per_page: 5 })
        ]);
        if (Array.isArray(homeRbs)) homeRbs = homeRbs.filter(isRB);
        if (Array.isArray(awayRbs)) awayRbs = awayRbs.filter(isRB);
        if (Array.isArray(homeWrs)) homeWrs = homeWrs.filter(isWR);
        if (Array.isArray(awayWrs)) awayWrs = awayWrs.filter(isWR);
        homeLeadRb = Array.isArray(homeRbs) && homeRbs[0] ? homeRbs[0] : null;
        awayLeadRb = Array.isArray(awayRbs) && awayRbs[0] ? awayRbs[0] : null;
        homeLeadWr = Array.isArray(homeWrs) && homeWrs[0] ? homeWrs[0] : null;
        awayLeadWr = Array.isArray(awayWrs) && awayWrs[0] ? awayWrs[0] : null;
        const [homeRbAdvRes, awayRbAdvRes, homeWrAdvRes, awayWrAdvRes] = await Promise.all([
          homeLeadRb ? ballDontLieService.getNflAdvancedRushingStats({ season, playerId: homeLeadRb.id, postseason: false, week: 0 }) : Promise.resolve([]),
          awayLeadRb ? ballDontLieService.getNflAdvancedRushingStats({ season, playerId: awayLeadRb.id, postseason: false, week: 0 }) : Promise.resolve([]),
          homeLeadWr ? ballDontLieService.getNflAdvancedReceivingStats({ season, playerId: homeLeadWr.id, postseason: false, week: 0 }) : Promise.resolve([]),
          awayLeadWr ? ballDontLieService.getNflAdvancedReceivingStats({ season, playerId: awayLeadWr.id, postseason: false, week: 0 }) : Promise.resolve([])
        ]);
        homeRbAdvanced = homeRbAdvRes;
        awayRbAdvanced = awayRbAdvRes;
        homeWrAdvanced = homeWrAdvRes;
        awayWrAdvanced = awayWrAdvRes;
      } catch {}

      const statsReport = {
        season,
        home: { team: homeTeam, sample: finalHomeTeamStats.slice(0, 3) },
        away: { team: awayTeam, sample: finalAwayTeamStats.slice(0, 3) },
        injuriesSample: injuries?.slice?.(0, 6) || [],
        seasonSummary: {
          home: homeRates,
          away: awayRates
        },
        qbSeason: {
          home: { qb: homeQb ? { id: homeQb.id, name: homeQb.full_name || `${homeQb.first_name || ''} ${homeQb.last_name || ''}`.trim() } : null, stats: homeQbSeason },
          away: { qb: awayQb ? { id: awayQb.id, name: awayQb.full_name || `${awayQb.first_name || ''} ${awayQb.last_name || ''}`.trim() } : null, stats: awayQbSeason }
        },
        advanced: {
          passing: {
            home: homeQbAdvanced,
            away: awayQbAdvanced
          },
          rushing: {
            home: { player: homeLeadRb ? { id: homeLeadRb.id, name: homeLeadRb.full_name || `${homeLeadRb.first_name || ''} ${homeLeadRb.last_name || ''}`.trim() } : null, stats: homeRbAdvanced },
            away: { player: awayLeadRb ? { id: awayLeadRb.id, name: awayLeadRb.full_name || `${awayLeadRb.first_name || ''} ${awayLeadRb.last_name || ''}`.trim() } : null, stats: awayRbAdvanced }
          },
          receiving: {
            home: { player: homeLeadWr ? { id: homeLeadWr.id, name: homeLeadWr.full_name || `${homeLeadWr.first_name || ''} ${homeLeadWr.last_name || ''}`.trim() } : null, stats: homeWrAdvanced },
            away: { player: awayLeadWr ? { id: awayLeadWr.id, name: awayLeadWr.full_name || `${awayLeadWr.first_name || ''} ${awayLeadWr.last_name || ''}`.trim() } : null, stats: awayWrAdvanced }
          }
        }
      };

      // Odds payload: merge markets across all bookmakers to avoid missing ML/spread
      let oddsData = null;
      if (Array.isArray(game.bookmakers) && game.bookmakers.length > 0) {
        const marketKeyToOutcomes = new Map();
        for (const b of game.bookmakers) {
          const markets = Array.isArray(b?.markets) ? b.markets : [];
          for (const m of markets) {
            if (!m || !m.key || !Array.isArray(m.outcomes)) continue;
            if (!marketKeyToOutcomes.has(m.key)) marketKeyToOutcomes.set(m.key, new Map());
            const outMap = marketKeyToOutcomes.get(m.key);
            for (const o of m.outcomes) {
              if (!o || typeof o?.name !== 'string' || typeof o?.price !== 'number') continue;
              const key = `${o.name}|${typeof o.point === 'number' ? o.point : ''}`;
              // Keep the best (most favorable) price seen; simple override
              if (!outMap.has(key)) {
                outMap.set(key, { name: o.name, price: o.price, ...(typeof o.point === 'number' ? { point: o.point } : {}) });
              }
            }
          }
        }
        const mergedMarkets = [];
        for (const [key, outMap] of marketKeyToOutcomes.entries()) {
          const outcomes = Array.from(outMap.values());
          if (outcomes.length) mergedMarkets.push({ key, outcomes });
        }
        if (mergedMarkets.length) {
          oddsData = { bookmaker: 'merged', markets: mergedMarkets };
        }
      }

      // Compute a simple model-vs-market edge using season scoring/allowing rates
      let modelEdge = null;
      try {
        const spreadsMarket = oddsData?.markets?.find?.(m => m.key === 'spreads');
        const homeOutcome = spreadsMarket?.outcomes?.find?.(o => o.name === game.home_team);
        const marketSpread = typeof homeOutcome?.point === 'number' ? homeOutcome.point : null;
        if (marketSpread !== null &&
            typeof homeRates.pointsPerGame === 'number' &&
            typeof homeRates.oppPointsPerGame === 'number' &&
            typeof awayRates.pointsPerGame === 'number' &&
            typeof awayRates.oppPointsPerGame === 'number') {
          const expectedMargin = (homeRates.pointsPerGame - awayRates.oppPointsPerGame) -
                                 (awayRates.pointsPerGame - homeRates.oppPointsPerGame);
          const edge = expectedMargin - marketSpread;
          modelEdge = { expectedMargin: Number(expectedMargin.toFixed(2)), marketSpread, edge: Number(edge.toFixed(2)) };
        }
      } catch {}

      // Perplexity key findings (trim to 3-4)
      let richKeyFindings = [];
      try {
        const dateStr = new Date(game.commence_time).toISOString().slice(0, 10);
        const rich = await perplexityService.getRichGameContext(game.home_team, game.away_team, 'nfl', dateStr);
        if (Array.isArray(rich?.key_findings)) {
          richKeyFindings = rich.key_findings.slice(0, 4);
        }
      } catch {}

      // QB venue and head-to-head samples (last two seasons)
      let qbVenueH2H = { home: {}, away: {} };
      try {
        const seasons = [season, season - 1];
        const teamGames = await ballDontLieService.getGames(SPORT_KEY, { seasons, team_ids: [homeTeam.id, awayTeam.id], postseason: false, per_page: 100 }, options.nocache ? 0 : 10);
        const isH2H = (g) => {
          const hId = g?.home_team?.id || g?.home_team?.team_id || g?.home_team_id;
          const aId = g?.away_team?.id || g?.away_team?.team_id || g?.away_team_id;
          return (hId === homeTeam.id && aId === awayTeam.id) || (hId === awayTeam.id && aId === homeTeam.id);
        };
        const homeVenue = teamGames.filter(g => {
          const hId = g?.home_team?.id || g?.home_team?.team_id || g?.home_team_id;
          return hId === homeTeam.id;
        }).slice(0, 5).map(g => g.id).filter(Boolean);
        const awayVenue = teamGames.filter(g => {
          const hId = g?.home_team?.id || g?.home_team?.team_id || g?.home_team_id;
          return hId === awayTeam.id;
        }).slice(0, 5).map(g => g.id).filter(Boolean);
        const h2hIds = teamGames.filter(isH2H).slice(0, 6).map(g => g.id).filter(Boolean);
        if (homeQb?.id) {
          const [homeVenueStats, h2hStats] = await Promise.all([
            homeVenue.length ? ballDontLieService.getNflPlayerGameStats({ playerId: homeQb.id, gameIds: homeVenue }) : Promise.resolve([]),
            h2hIds.length ? ballDontLieService.getNflPlayerGameStats({ playerId: homeQb.id, gameIds: h2hIds }) : Promise.resolve([])
          ]);
          qbVenueH2H.home = { qbId: homeQb.id, venueSample: homeVenueStats, h2hSample: h2hStats };
        }
        if (awayQb?.id) {
          const [awayVenueStats, h2hStatsA] = await Promise.all([
            awayVenue.length ? ballDontLieService.getNflPlayerGameStats({ playerId: awayQb.id, gameIds: awayVenue }) : Promise.resolve([]),
            h2hIds.length ? ballDontLieService.getNflPlayerGameStats({ playerId: awayQb.id, gameIds: h2hIds }) : Promise.resolve([])
          ]);
          qbVenueH2H.away = { qbId: awayQb.id, venueSample: awayVenueStats, h2hSample: h2hStatsA };
        }
      } catch {}

      // Provide combined teamStats and minimal gameContext
      const teamStats = {
        home: finalHomeTeamStats,
        away: finalAwayTeamStats
      };
      const gameContext = {
        injuries: Array.isArray(injuries) ? injuries : [],
        season,
        postseason: false,
        notes: 'Regular season context from BDL NFL',
        richKeyFindings,
        qbVenueH2H
      };

      const gameObj = {
        id: gameId,
        sport: 'nfl',
        league: 'NFL',
        homeTeam: game.home_team,
        awayTeam: game.away_team,
        teamStats,
        gameContext,
        statsReport,
        modelEdge,
        odds: oddsData,
        gameTime: game.commence_time,
        time: game.commence_time
      };

      const pick = await makeGaryPick(gameObj);
      if (!pick?.success) return null;
      // Recommended sportsbook from bookmakers
      let recommendedSportsbook = null;
      try {
        const extract = pick.rawAnalysis?.rawOpenAIOutput || pick.pick || {};
        recommendedSportsbook = computeRecommendedSportsbook({
          pickType: (extract.type || '').toLowerCase(),
          pickStr: extract.pick || '',
          homeTeam: game.home_team,
          awayTeam: game.away_team,
          bookmakers: Array.isArray(game.bookmakers) ? game.bookmakers : []
        });
      } catch (e) {
        console.warn('Failed to compute recommended sportsbook (NFL):', e?.message || e);
      }

      return {
        ...pick,
        recommendedSportsbook: recommendedSportsbook || undefined,
        game: `${game.away_team} @ ${game.home_team}`,
        sport: SPORT_KEY,
        homeTeam: game.home_team,
        awayTeam: game.away_team,
        gameTime: game.commence_time,
        pickType: 'normal',
        timestamp: new Date().toISOString()
      };
    });

    if (result && result.success) picks.push(result);
  }

  if (picks.length > 0) {
    console.log(`Total NFL picks generated: ${picks.length}`);
  }
  return picks;
}


