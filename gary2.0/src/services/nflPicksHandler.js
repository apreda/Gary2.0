import { oddsService } from './oddsService.js';
import { ballDontLieService } from './ballDontLieService.js';
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

  // 36-hour window
  const now = new Date();
  const end = new Date(now.getTime() + 36 * 60 * 60 * 1000);

  let todayGames = games.filter(g => {
    const t = new Date(g.commence_time);
    return t >= now && t <= end;
  });
  console.log(`After date filtering: ${todayGames.length} NFL games in next 36h`);

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

      const hasHomeStats = Array.isArray(homeTeamStats) && homeTeamStats.length > 0;
      const hasAwayStats = Array.isArray(awayTeamStats) && awayTeamStats.length > 0;
      if (!hasHomeStats || !hasAwayStats) {
        console.warn(`NFL: Missing required stats for ${game.away_team} @ ${game.home_team} — skipping.`);
        return null;
      }

      const statsReport = {
        season,
        home: { team: homeTeam, sample: homeTeamStats.slice(0, 3) },
        away: { team: awayTeam, sample: awayTeamStats.slice(0, 3) },
        injuriesSample: injuries?.slice?.(0, 6) || []
      };

      // Odds payload
      let oddsData = null;
      if (game.bookmakers && game.bookmakers.length > 0) {
        oddsData = {
          bookmaker: game.bookmakers[0]?.title,
          markets: game.bookmakers[0]?.markets || []
        };
      }

      const gameObj = {
        id: gameId,
        sport: 'nfl',
        league: 'NFL',
        homeTeam: game.home_team,
        awayTeam: game.away_team,
        statsReport,
        odds: oddsData,
        gameTime: game.commence_time,
        time: game.commence_time
      };

      const pick = await makeGaryPick(gameObj);
      if (!pick?.success) return null;

      return {
        ...pick,
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


