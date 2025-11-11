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

  // Weekly window: include games in the next 5 days (Thu-Mon cadence supported)
  const now = new Date();
  const end = new Date(now.getTime() + 5 * 24 * 60 * 60 * 1000);
  console.log(`NFL 5-day window: ${now.toISOString()} to ${end.toISOString()}`);

  let todayGames = games.filter(g => {
    const t = new Date(g.commence_time);
    return t >= now && t <= end;
  });
  console.log(`After date filtering: ${todayGames.length} NFL games in next 5 days`);

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
        ballDontLieService.getTeamStats(SPORT_KEY, { seasons: [season], team_ids: [homeTeam.id] }),
        ballDontLieService.getTeamStats(SPORT_KEY, { seasons: [season], team_ids: [awayTeam.id] }),
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

      const hasHomeStats = homeTeamStatsScoped.length > 0;
      const hasAwayStats = awayTeamStatsScoped.length > 0;
      if (!hasHomeStats || !hasAwayStats) {
        console.warn(`NFL: Missing required stats for ${game.away_team} @ ${game.home_team} — skipping.`);
        return null;
      }

      // Season aggregates for offense/defense summary
      const [homeSeason, awaySeason] = await Promise.all([
        ballDontLieService.getTeamSeasonStats(SPORT_KEY, { teamId: homeTeam.id, season, postseason: false }),
        ballDontLieService.getTeamSeasonStats(SPORT_KEY, { teamId: awayTeam.id, season, postseason: false })
      ]);
      const homeRates = ballDontLieService.deriveNflTeamRates(homeSeason);
      const awayRates = ballDontLieService.deriveNflTeamRates(awaySeason);

      // Identify probable QBs and fetch season stats
      let homeQb = null;
      let awayQb = null;
      let homeQbSeason = [];
      let awayQbSeason = [];
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
        if (Array.isArray(homeQbs)) homeQbs = homeQbs.filter(isQB);
        if (Array.isArray(awayQbs)) awayQbs = awayQbs.filter(isQB);
        homeQb = Array.isArray(homeQbs) && homeQbs[0] ? homeQbs[0] : null;
        awayQb = Array.isArray(awayQbs) && awayQbs[0] ? awayQbs[0] : null;
        const [homeQbSeasonRes, awayQbSeasonRes] = await Promise.all([
          homeQb ? ballDontLieService.getNflPlayerSeasonStats({ playerId: homeQb.id, season, postseason: false }) : Promise.resolve([]),
          awayQb ? ballDontLieService.getNflPlayerSeasonStats({ playerId: awayQb.id, season, postseason: false }) : Promise.resolve([])
        ]);
        homeQbSeason = homeQbSeasonRes;
        awayQbSeason = awayQbSeasonRes;
      } catch {}

      const statsReport = {
        season,
        home: { team: homeTeam, sample: homeTeamStatsScoped.slice(0, 3) },
        away: { team: awayTeam, sample: awayTeamStatsScoped.slice(0, 3) },
        injuriesSample: injuries?.slice?.(0, 6) || [],
        seasonSummary: {
          home: homeRates,
          away: awayRates
        },
        qbSeason: {
          home: { qb: homeQb ? { id: homeQb.id, name: homeQb.full_name || `${homeQb.first_name || ''} ${homeQb.last_name || ''}`.trim() } : null, stats: homeQbSeason },
          away: { qb: awayQb ? { id: awayQb.id, name: awayQb.full_name || `${awayQb.first_name || ''} ${awayQb.last_name || ''}`.trim() } : null, stats: awayQbSeason }
        }
      };

      // Odds payload
      let oddsData = null;
      if (game.bookmakers && game.bookmakers.length > 0) {
        oddsData = {
          bookmaker: game.bookmakers[0]?.title,
          markets: game.bookmakers[0]?.markets || []
        };
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
        home: homeTeamStatsScoped,
        away: awayTeamStatsScoped
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

  console.log(`Total NFL picks generated: ${picks.length}`);
  return picks;
}


