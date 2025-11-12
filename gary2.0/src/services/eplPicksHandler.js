import { oddsService } from './oddsService.js';
import { ballDontLieService } from './ballDontLieService.js';
import { perplexityService } from './perplexityService.js';
import { makeGaryPick } from './garyEngine.js';
import { processGameOnce } from './picksService.js';
import { computeRecommendedSportsbook } from './recommendedSportsbook.js';

const SPORT_KEY = 'soccer_epl';

export async function generateEPLPicks(options = {}) {
  console.log('Processing EPL matches');
  if (options.nocache) {
    console.log('EPL nocache mode: clearing Ball Don\'t Lie cache');
    ballDontLieService.clearCache();
  }
  const games = await oddsService.getUpcomingGames(SPORT_KEY, { nocache: options.nocache === true });
  console.log(`Found ${games.length} EPL matches from odds service`);

  // 36-hour window similar to WNBA
  const now = new Date();
  const end = new Date(now.getTime() + 36 * 60 * 60 * 1000);
  let windowed = games.filter(g => {
    const t = new Date(g.commence_time);
    return t >= now && t <= end;
  });
  console.log(`After date filtering: ${windowed.length} EPL matches in next 36h`);

  if (typeof options.onlyAtIndex === 'number') {
    const idx = options.onlyAtIndex;
    windowed = idx >= 0 && idx < windowed.length ? [windowed[idx]] : [];
  }

  const picks = [];
  const season = new Date().getFullYear();

  for (const game of windowed) {
    const gameId = `epl-${game.id}`;
    const result = await processGameOnce(gameId, async () => {
      console.log(`Processing EPL match: ${game.away_team} @ ${game.home_team}`);

      const homeTeam = await ballDontLieService.getTeamByNameGeneric(SPORT_KEY, game.home_team);
      const awayTeam = await ballDontLieService.getTeamByNameGeneric(SPORT_KEY, game.away_team);
      if (!homeTeam || !awayTeam) {
        console.warn(`EPL: Could not resolve teams for ${game.away_team} @ ${game.home_team} — skipping.`);
        return null;
      }

      // Team season stats (goals, clean_sheet, etc.)
      const [homeSeason, awaySeason] = await Promise.all([
        ballDontLieService.getTeamSeasonStats(SPORT_KEY, { teamId: homeTeam.id, season }),
        ballDontLieService.getTeamSeasonStats(SPORT_KEY, { teamId: awayTeam.id, season })
      ]);
      // Build a simple report
      const toMap = (pairs) => {
        const map = {};
        (pairs || []).forEach(r => { if (r && r.name) map[r.name] = r.value; });
        return map;
      };
      const homeRates = toMap(homeSeason);
      const awayRates = toMap(awaySeason);
      let statsReport = `\n## EPL CONTEXT (${season})\n\n`;
      statsReport += `- ${game.home_team}: goals=${homeRates.goals ?? 'N/A'}, clean_sheet=${homeRates.clean_sheet ?? 'N/A'}\n`;
      statsReport += `- ${game.away_team}: goals=${awayRates.goals ?? 'N/A'}, clean_sheet=${awayRates.clean_sheet ?? 'N/A'}\n`;

      // Odds payload (bookmakers normalized already)
      let oddsData = null;
      if (game.bookmakers && game.bookmakers.length > 0) {
        const bookmaker = game.bookmakers[0];
        oddsData = { bookmaker: bookmaker.title, markets: bookmaker.markets };
      }

      // Perplexity key findings
      let richKeyFindings = [];
      try {
        const dateStr = new Date(game.commence_time).toISOString().slice(0, 10);
        const rich = await perplexityService.getRichGameContext(game.home_team, game.away_team, 'epl', dateStr);
        if (Array.isArray(rich?.key_findings)) {
          richKeyFindings = rich.key_findings.slice(0, 4);
        }
      } catch {}

      const gameObj = {
        id: gameId,
        sport: 'epl',
        league: 'EPL',
        homeTeam: game.home_team,
        awayTeam: game.away_team,
        statsReport,
        gameContext: { season, postseason: false, notes: 'Regular season context from BDL EPL', richKeyFindings },
        odds: oddsData,
        gameTime: game.commence_time,
        time: game.commence_time
      };

      const pick = await makeGaryPick(gameObj);
      if (!pick?.success) return null;

      // Recommended sportsbook, including potential Draw selections
      try {
        const extract = pick.rawAnalysis?.rawOpenAIOutput || pick.pick || {};
        const rec = computeRecommendedSportsbook({
          pickType: (extract.type || '').toLowerCase(),
          pickStr: extract.pick || '',
          homeTeam: game.home_team,
          awayTeam: game.away_team,
          bookmakers: Array.isArray(game.bookmakers) ? game.bookmakers : []
        });
        if (rec) pick.recommendedSportsbook = rec;
      } catch (e) {
        console.warn('Failed to compute recommended sportsbook (EPL):', e?.message || e);
      }

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

  if (picks.length > 0) {
    console.log(`Total EPL picks generated: ${picks.length}`);
  }
  return picks;
}


