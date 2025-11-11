import { oddsService } from './oddsService.js';
import { ballDontLieService } from './ballDontLieService.js';
import { makeGaryPick } from './garyEngine.js';
import { computeRecommendedSportsbook } from './recommendedSportsbook.js';
import { perplexityService } from './perplexityService.js';
import { processGameOnce } from './picksService.js';

const SPORT_KEY = 'basketball_wnba';

export async function generateWNBAPicks(options = {}) {
  console.log('Processing WNBA games');
  if (options.nocache) {
    console.log('WNBA nocache mode: clearing Ball Don\'t Lie cache');
    ballDontLieService.clearCache();
  }
  const games = await oddsService.getUpcomingGames(SPORT_KEY, { nocache: options.nocache === true });
  console.log(`Found ${games.length} WNBA games from odds service`);

  // 16-hour window
  const now = new Date();
  const end = new Date(now.getTime() + 16 * 60 * 60 * 1000);
  let windowed = games.filter(g => {
    const t = new Date(g.commence_time);
    return t >= now && t <= end;
  });
  console.log(`After date filtering: ${windowed.length} WNBA games in next 16h`);

  if (typeof options.onlyAtIndex === 'number') {
    const idx = options.onlyAtIndex;
    windowed = idx >= 0 && idx < windowed.length ? [windowed[idx]] : [];
  }

  const season = new Date().getFullYear();
  const picks = [];

  for (const game of windowed) {
    const gameId = `wnba-${game.id}`;

    const result = await processGameOnce(gameId, async () => {
      console.log(`Processing WNBA game: ${game.away_team} @ ${game.home_team}`);

      const homeTeam = await ballDontLieService.getTeamByNameGeneric(SPORT_KEY, game.home_team);
      const awayTeam = await ballDontLieService.getTeamByNameGeneric(SPORT_KEY, game.away_team);
      if (!homeTeam || !awayTeam) {
        console.warn(`WNBA: Could not resolve teams for ${game.away_team} @ ${game.home_team} — skipping.`);
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
        console.warn(`WNBA: Missing required stats for ${game.away_team} @ ${game.home_team} — skipping.`);
        return null;
      }

      const statsReport = {
        season,
        home: { team: homeTeam, sample: homeTeamStats.slice(0, 3) },
        away: { team: awayTeam, sample: awayTeamStats.slice(0, 3) },
        injuriesSample: injuries?.slice?.(0, 6) || []
      };

      let oddsData = null;
      if (game.bookmakers?.length) {
        oddsData = { bookmaker: game.bookmakers[0]?.title, markets: game.bookmakers[0]?.markets || [] };
      }

      // Provide combined teamStats and minimal gameContext for Gary
      const teamStats = {
        home: Array.isArray(homeTeamStats) ? homeTeamStats : [],
        away: Array.isArray(awayTeamStats) ? awayTeamStats : []
      };
      let richKeyFindings = [];
      try {
        const dateStr = new Date(game.commence_time).toISOString().slice(0, 10);
        const rich = await perplexityService.getRichGameContext(game.home_team, game.away_team, 'wnba', dateStr);
        if (Array.isArray(rich?.key_findings)) {
          richKeyFindings = rich.key_findings.slice(0, 4);
        }
      } catch {}
      const gameContext = {
        injuries: Array.isArray(injuries) ? injuries : [],
        season,
        postseason: false,
        notes: 'Regular season context from BDL WNBA',
        richKeyFindings
      };

      const gameObj = {
        id: gameId,
        sport: 'wnba',
        league: 'WNBA',
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
      // Recommended sportsbook
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
        console.warn('Failed to compute recommended sportsbook (WNBA):', e?.message || e);
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

  console.log(`Total WNBA picks generated: ${picks.length}`);
  return picks;
}


