import { oddsService } from './oddsService.js';
import { ballDontLieService } from './ballDontLieService.js';
import { makeGaryPick } from './garyEngine.js';
import { computeRecommendedSportsbook } from './recommendedSportsbookUtil.js';
import { processGameOnce, gameAlreadyHasPick } from './picksService.js';
import { mergeBookmakerOdds } from './agentic/sharedUtils.js';
import { ncaabSeason } from '../utils/dateUtils.js';

const SPORT_KEY = 'basketball_ncaab';

export async function generateNCAABPicks(options = {}) {
  console.log('Processing NCAAB games');
  if (options.nocache) {
    console.log('NCAAB nocache mode: clearing Ball Don\'t Lie cache');
    ballDontLieService.clearCache();
  }
  const games = await oddsService.getUpcomingGames(SPORT_KEY, { nocache: options.nocache === true });
  console.log(`Found ${games.length} NCAAB games from odds service`);

  const now = new Date();
  const end = new Date(now.getTime() + 16 * 60 * 60 * 1000);
  let windowed = games.filter(g => {
    const t = new Date(g.commence_time);
    return t >= now && t <= end;
  });
  console.log(`After date filtering: ${windowed.length} NCAAB games in next 16h`);

  // Track total games for cursor logic
  const totalGamesCount = windowed.length;

  if (typeof options.onlyAtIndex === 'number') {
    const idx = options.onlyAtIndex;
    // If cursor is beyond available games, return early with metadata
    if (idx >= windowed.length) {
      console.log(`[NCAAB] Cursor ${idx} exceeds available games (${windowed.length}) - no more games`);
      return { picks: [], noMoreGames: true, totalGames: totalGamesCount };
    }
    windowed = [windowed[idx]];
  }

  const season = ncaabSeason();
  const picks = [];

  for (const game of windowed) {
    const gameId = `ncaab-${game.id}`;

    // EARLY CHECK: Skip if this game already has a pick (prevents both sides being picked)
    const { exists: alreadyPicked, existingPick } = await gameAlreadyHasPick('NCAAB', game.home_team, game.away_team);
    if (alreadyPicked) {
      console.log(`⏭️ SKIPPING ${game.away_team} @ ${game.home_team} - already have pick: "${existingPick}"`);
      continue;
    }

    const result = await processGameOnce(gameId, async () => {
      console.log(`Processing NCAAB game: ${game.away_team} @ ${game.home_team}`);

      const homeTeam = await ballDontLieService.getTeamByNameGeneric(SPORT_KEY, game.home_team);
      const awayTeam = await ballDontLieService.getTeamByNameGeneric(SPORT_KEY, game.away_team);
      if (!homeTeam || !awayTeam) {
        console.warn(`NCAAB: Could not resolve teams for ${game.away_team} @ ${game.home_team} — skipping.`);
        return null;
      }

      const [homeTeamStats, awayTeamStats, injuries, homeSeasonAgg, awaySeasonAgg, homeStandings, awayStandings] = await Promise.all([
        ballDontLieService.getTeamStats(SPORT_KEY, { seasons: [season], team_ids: [homeTeam.id] }),
        ballDontLieService.getTeamStats(SPORT_KEY, { seasons: [season], team_ids: [awayTeam.id] }),
        ballDontLieService.getInjuriesGeneric(SPORT_KEY, { team_ids: [homeTeam.id, awayTeam.id] }),
        ballDontLieService.getTeamSeasonStats(SPORT_KEY, { teamId: homeTeam.id, season }),
        ballDontLieService.getTeamSeasonStats(SPORT_KEY, { teamId: awayTeam.id, season }),
        // NCAAB standings require conference_id; use dedicated getNcaabStandings method
        (homeTeam?.conference_id || homeTeam?.conference) ? ballDontLieService.getNcaabStandings(homeTeam.conference_id || homeTeam.conference, season) : Promise.resolve([]),
        (awayTeam?.conference_id || awayTeam?.conference) ? ballDontLieService.getNcaabStandings(awayTeam.conference_id || awayTeam.conference, season) : Promise.resolve([])
      ]);

      const hasHome = Array.isArray(homeTeamStats) && homeTeamStats.length > 0;
      const hasAway = Array.isArray(awayTeamStats) && awayTeamStats.length > 0;
      if (!hasHome || !hasAway) {
        console.warn(`NCAAB: Missing required stats for ${game.away_team} @ ${game.home_team} — skipping.`);
        return null;
      }

      // Derive Four Factors (season aggregates)
      const homeFour = Array.isArray(homeSeasonAgg) && homeSeasonAgg[0] ? ballDontLieService.deriveBasketballFourFactors(homeSeasonAgg[0]) : {};
      const awayFour = Array.isArray(awaySeasonAgg) && awaySeasonAgg[0] ? ballDontLieService.deriveBasketballFourFactors(awaySeasonAgg[0]) : {};

      // Identify top 3 players by points from player SEASON stats (prefer season endpoint; fallback to per-game aggregation)
      async function getTop3Players(teamId) {
        try {
          // Try player SEASON stats first
          const seasonRows = await ballDontLieService.getNcaabPlayerSeasonStats({ teamId, season });
          let arr = [];
          if (Array.isArray(seasonRows) && seasonRows.length) {
            arr = seasonRows.map(r => {
              const gp = Number(r?.games_played) || 0;
              const name =
                r?.player?.full_name ||
                `${r?.player?.first_name || ''} ${r?.player?.last_name || ''}`.trim();
              const ppg = gp ? (Number(r?.pts) || 0) / gp : undefined;
              const rpg = gp ? (Number(r?.reb) || 0) / gp : undefined;
              const apg = gp ? (Number(r?.ast) || 0) / gp : undefined;
              return {
                id: r?.player?.id,
                name,
                ptsPerGame: ppg != null ? +ppg.toFixed(1) : undefined,
                rebPerGame: rpg != null ? +rpg.toFixed(1) : undefined,
                astPerGame: apg != null ? +apg.toFixed(1) : undefined,
                minPerGame: r?.min != null ? +Number(r.min).toFixed(1) : undefined
              };
            });
          } else {
            // Fallback: aggregate from per-game player_stats
            const rows = await ballDontLieService.getPlayerStats(SPORT_KEY, { seasons: [season], team_ids: [teamId], per_page: 100 });
            const byPlayer = new Map();
            for (const r of rows || []) {
              const pid = r?.player?.id;
              if (!pid) continue;
              const name = r?.player?.full_name || `${r?.player?.first_name || ''} ${r?.player?.last_name || ''}`.trim();
              const pts = Number(r?.points) || Number(r?.pts) || 0;
              const reb = Number(r?.rebounds) || Number(r?.reb) || 0;
              const ast = Number(r?.assists) || Number(r?.ast) || 0;
              const min = Number(r?.minutes) || Number(r?.min) || 0;
              const prev = byPlayer.get(pid) || { pid, name, pts: 0, reb: 0, ast: 0, min: 0, gp: 0 };
              prev.pts += pts;
              prev.reb += reb;
              prev.ast += ast;
              prev.min += min;
              prev.gp += 1;
              byPlayer.set(pid, prev);
            }
            arr = Array.from(byPlayer.values()).map(p => ({
              id: p.pid,
              name: p.name,
              ptsPerGame: p.gp ? +(p.pts / p.gp).toFixed(1) : 0,
              rebPerGame: p.gp ? +(p.reb / p.gp).toFixed(1) : 0,
              astPerGame: p.gp ? +(p.ast / p.gp).toFixed(1) : 0,
              minPerGame: p.gp ? +(p.min / p.gp).toFixed(1) : 0
            }));
          }
          arr.sort((a, b) => (b.ptsPerGame || 0) - (a.ptsPerGame || 0));
          return arr.slice(0, 3);
        } catch {
          return [];
        }
      }
      const [homeTop3, awayTop3] = await Promise.all([getTop3Players(homeTeam.id), getTop3Players(awayTeam.id)]);

      const pickBasic = (row) => {
        if (!row) return {};
        const s = Array.isArray(row) ? row[0] : row;
        const record = (s?.overall_wins != null && s?.overall_losses != null) ? `${s.overall_wins}-${s.overall_losses}` : (s?.overall_record || undefined);
        const homeRec = (s?.home_wins != null && s?.home_losses != null) ? `${s.home_wins}-${s.home_losses}` : undefined;
        const awayRec = (s?.away_wins != null && s?.away_losses != null) ? `${s.away_wins}-${s.away_losses}` : undefined;
        const streak = s?.streak || s?.current_streak || undefined;
        const ppg = s?.points_per_game || s?.ppg || undefined;
        const oppg = s?.points_against_per_game || s?.opp_ppg || undefined;
        return { record, homeRec, awayRec, streak, ppg, oppg };
      };
      const statsReport = {
        season,
        home: { team: homeTeam, sample: homeTeamStats.slice(0, 3) },
        away: { team: awayTeam, sample: awayTeamStats.slice(0, 3) },
        injuriesSample: injuries?.slice?.(0, 6) || [],
        basics: {
          home: pickBasic(Array.isArray(homeStandings) ? homeStandings.find(r => r?.team?.id === homeTeam.id) : null),
          away: pickBasic(Array.isArray(awayStandings) ? awayStandings.find(r => r?.team?.id === awayTeam.id) : null)
        },
        seasonSummary: {
          home: homeFour,
          away: awayFour
        },
        topPlayers: {
          home: homeTop3,
          away: awayTop3
        }
      };

      const teamStats = {
        home: Array.isArray(homeTeamStats) ? homeTeamStats : [],
        away: Array.isArray(awayTeamStats) ? awayTeamStats : []
      };
      // Rich context now provided by Gemini Grounding in the agentic pipeline
      const richKeyFindings = [];
      const realTimeNewsText = '';
      const gameContext = {
        injuries: Array.isArray(injuries) ? injuries : [],
        season,
        postseason: false,
        notes: 'Regular season context from BDL NCAAB',
        richKeyFindings
      };

      // Merge odds across all available bookmakers to avoid false negatives
      const oddsData = mergeBookmakerOdds(game.bookmakers);

      const gameObj = {
        id: gameId,
        sport: 'ncaab',
        league: 'NCAAB',
        homeTeam: game.home_team,
        awayTeam: game.away_team,
        teamStats,
        gameContext,
        statsReport,
        realTimeNews: realTimeNewsText || undefined,
        odds: oddsData,
        gameTime: game.commence_time,
        time: game.commence_time
      };

      // Explicit log confirmation for debugging visibility
      try {
        const hasFourFactors = !!(statsReport?.seasonSummary && (Object.keys(statsReport.seasonSummary.home || {}).length || Object.keys(statsReport.seasonSummary.away || {}).length));
        const hasTop3 = !!(Array.isArray(statsReport?.topPlayers?.home) && statsReport.topPlayers.home.length || Array.isArray(statsReport?.topPlayers?.away) && statsReport.topPlayers.away.length);
        const hasNews = !!(realTimeNewsText && realTimeNewsText.length);
        console.log(`NCAAB: Injected season metrics/top players into prompt (fourFactors=${hasFourFactors}, top3=${hasTop3}, news=${hasNews})`);
      } catch (e) { console.warn('NCAAB stats visibility check failed:', e?.message); }

      const pick = await makeGaryPick(gameObj);
      if (!pick?.success) return null;
      // Recommended sportsbook
      let recommendedSportsbook = null;
      try {
        const extract = pick.rawAnalysis?.rawGeminiOutput || pick.pick || {};
        recommendedSportsbook = computeRecommendedSportsbook({
          pickType: (extract.type || '').toLowerCase(),
          pickStr: extract.pick || '',
          homeTeam: game.home_team,
          awayTeam: game.away_team,
          bookmakers: Array.isArray(game.bookmakers) ? game.bookmakers : []
        });
      } catch (e) {
        console.warn('Failed to compute recommended sportsbook (NCAAB):', e?.message || e);
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
    console.log(`Total NCAAB picks generated: ${picks.length}`);
  }
  // Return with metadata for cursor logic
  return { 
    picks, 
    noMoreGames: false, 
    totalGames: totalGamesCount,
    processedIndex: typeof options.onlyAtIndex === 'number' ? options.onlyAtIndex : null
  };
}


