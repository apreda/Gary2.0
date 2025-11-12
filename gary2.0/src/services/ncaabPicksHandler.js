import { oddsService } from './oddsService.js';
import { ballDontLieService } from './ballDontLieService.js';
import { makeGaryPick } from './garyEngine.js';
import { computeRecommendedSportsbook } from './recommendedSportsbook.js';
import { perplexityService } from './perplexityService.js';
import { processGameOnce } from './picksService.js';

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

  if (typeof options.onlyAtIndex === 'number') {
    const idx = options.onlyAtIndex;
    windowed = idx >= 0 && idx < windowed.length ? [windowed[idx]] : [];
  }

  const season = new Date().getFullYear();
  const picks = [];

  for (const game of windowed) {
    const gameId = `ncaab-${game.id}`;
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
        ballDontLieService.getStandingsGeneric(SPORT_KEY, { season, team_ids: [homeTeam.id] }),
        ballDontLieService.getStandingsGeneric(SPORT_KEY, { season, team_ids: [awayTeam.id] })
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

      // Identify top 3 players by points from season player stats (best-effort)
      async function getTop3Players(teamId) {
        try {
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
          const arr = Array.from(byPlayer.values()).map(p => ({
            id: p.pid,
            name: p.name,
            ptsPerGame: p.gp ? +(p.pts / p.gp).toFixed(1) : 0,
            rebPerGame: p.gp ? +(p.reb / p.gp).toFixed(1) : 0,
            astPerGame: p.gp ? +(p.ast / p.gp).toFixed(1) : 0,
            minPerGame: p.gp ? +(p.min / p.gp).toFixed(1) : 0
          }));
          arr.sort((a, b) => b.ptsPerGame - a.ptsPerGame);
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
          home: pickBasic(homeStandings?.[0] || homeStandings),
          away: pickBasic(awayStandings?.[0] || awayStandings)
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
      // Perplexity key findings and compact summary for prompt's REAL-TIME NEWS
      let richKeyFindings = [];
      let realTimeNewsText = '';
      try {
        const dateStr = new Date(game.commence_time).toISOString().slice(0, 10);
        const rich = await perplexityService.getRichGameContext(game.home_team, game.away_team, 'ncaab', dateStr);
        if (Array.isArray(rich?.key_findings)) {
          richKeyFindings = rich.key_findings.slice(0, 4);
        }
        if (Array.isArray(rich?.key_findings) && rich.key_findings.length > 0) {
          const toLine = (k) => {
            const title = k?.title || 'Finding';
            const rationale = k?.rationale || k?.note || '';
            return rationale ? `${title}: ${rationale}` : String(title);
          };
          realTimeNewsText = rich.key_findings.slice(0, 3).map(toLine).join('\n');
        } else if (typeof rich?.summary === 'string' && rich.summary.trim().length > 0) {
          realTimeNewsText = rich.summary.trim();
        }
      } catch {}
      const gameContext = {
        injuries: Array.isArray(injuries) ? injuries : [],
        season,
        postseason: false,
        notes: 'Regular season context from BDL NCAAB',
        richKeyFindings
      };

      // Merge odds across all available bookmakers to avoid false negatives
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
      } catch {}

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
  return picks;
}


