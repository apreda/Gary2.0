import { oddsService } from './oddsService.js';
import { ballDontLieService } from './ballDontLieService.js';
import { makeGaryPick } from './garyEngine.js';
import { processGameOnce } from './picksService.js';

const SPORT_KEY = 'americanfootball_ncaaf';

export async function generateNCAAFPicks(options = {}) {
  console.log('Processing NCAAF games');
  if (options.nocache) {
    console.log('NCAAF nocache mode: clearing Ball Don\'t Lie cache');
    ballDontLieService.clearCache();
  }
  const games = await oddsService.getUpcomingGames(SPORT_KEY, { nocache: options.nocache === true });
  console.log(`Found ${games.length} NCAAF games from odds service`);

  const now = new Date();
  const end = new Date(now.getTime() + 36 * 60 * 60 * 1000);
  let windowed = games.filter(g => {
    const t = new Date(g.commence_time);
    return t >= now && t <= end;
  });
  console.log(`After date filtering: ${windowed.length} NCAAF games in next 36h`);

  if (typeof options.onlyAtIndex === 'number') {
    const idx = options.onlyAtIndex;
    windowed = idx >= 0 && idx < windowed.length ? [windowed[idx]] : [];
  }

  const season = new Date().getFullYear();
  const picks = [];

  for (const game of windowed) {
    const gameId = `ncaaf-${game.id}`;
    const result = await processGameOnce(gameId, async () => {
      console.log(`Processing NCAAF game: ${game.away_team} @ ${game.home_team}`);

      const homeTeam = await ballDontLieService.getTeamByNameGeneric(SPORT_KEY, game.home_team);
      const awayTeam = await ballDontLieService.getTeamByNameGeneric(SPORT_KEY, game.away_team);
      if (!homeTeam || !awayTeam) {
        console.warn(`NCAAF: Could not resolve teams for ${game.away_team} @ ${game.home_team} — skipping.`);
        return null;
      }

      const [homeTeamStats, awayTeamStats, injuries] = await Promise.all([
        ballDontLieService.getTeamStats(SPORT_KEY, { seasons: [season], team_ids: [homeTeam.id] }),
        ballDontLieService.getTeamStats(SPORT_KEY, { seasons: [season], team_ids: [awayTeam.id] }),
        ballDontLieService.getInjuriesGeneric(SPORT_KEY, { team_ids: [homeTeam.id, awayTeam.id] })
      ]);

      const hasHome = Array.isArray(homeTeamStats) && homeTeamStats.length > 0;
      const hasAway = Array.isArray(awayTeamStats) && awayTeamStats.length > 0;
      if (!hasHome || !hasAway) {
        console.warn(`NCAAF: Missing required stats for ${game.away_team} @ ${game.home_team} — skipping.`);
        return null;
      }

      const statsReport = {
        season,
        home: { team: homeTeam, sample: homeTeamStats.slice(0, 3) },
        away: { team: awayTeam, sample: awayTeamStats.slice(0, 3) },
        injuriesSample: injuries?.slice?.(0, 6) || []
      };

      // Provide combined teamStats and minimal gameContext
      const teamStats = {
        home: Array.isArray(homeTeamStats) ? homeTeamStats : [],
        away: Array.isArray(awayTeamStats) ? awayTeamStats : []
      };
      const gameContext = {
        injuries: Array.isArray(injuries) ? injuries : [],
        season,
        postseason: false,
        notes: 'Regular season context from BDL NCAAF'
      };

      let oddsData = null;
      if (game.bookmakers?.length) {
        oddsData = { bookmaker: game.bookmakers[0]?.title, markets: game.bookmakers[0]?.markets || [] };
      }

      const gameObj = {
        id: gameId,
        sport: 'ncaaf',
        league: 'NCAAF',
        homeTeam: game.home_team,
        awayTeam: game.away_team,
        teamStats,
        gameContext,
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

  console.log(`Total NCAAF picks generated: ${picks.length}`);
  return picks;
}


