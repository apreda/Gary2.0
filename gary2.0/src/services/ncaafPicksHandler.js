import { oddsService } from './oddsService.js';
import { ballDontLieService } from './ballDontLieService.js';
import { makeGaryPick } from './garyEngine.js';
import { computeRecommendedSportsbook } from './recommendedSportsbook.js';
import { processGameOnce, gameAlreadyHasPick } from './picksService.js';

const SPORT_KEY = 'americanfootball_ncaaf';

const roundNumber = (value, decimals = 2) => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
  const factor = Math.pow(10, decimals);
  return Math.round(value * factor) / factor;
};

const pickPerGameValue = (row = {}, statKey, decimals = 2) => {
  if (!statKey) return undefined;
  const perGameKey = `${statKey}_per_game`;
  const direct = row[perGameKey];
  if (typeof direct === 'number' && Number.isFinite(direct)) {
    return roundNumber(direct, decimals);
  }
  const games = Number(row?.games_played || row?.games || row?.season_games);
  const totalVal = row[statKey];
  if (games && games > 0 && typeof totalVal === 'number' && Number.isFinite(totalVal)) {
    return roundNumber(totalVal / games, decimals);
  }
  return undefined;
};

const formatSeasonPlayerRow = (row) => {
  if (!row || !row.player) return null;
  const player = row.player;
  const teamName = row.team?.full_name || row.team?.name || player.team?.full_name || player.team?.name || '';
  const position = (player.position_abbreviation || player.position || '').toUpperCase();
  const passY = pickPerGameValue(row, 'passing_yards', 1);
  const rushY = pickPerGameValue(row, 'rushing_yards', 1);
  const recY = pickPerGameValue(row, 'receiving_yards', 1);
  const scrimmageYards = (rushY || 0) + (recY || 0);
  const qbOffense = (passY || 0) + (rushY || 0);
  const totalYardsPerGame = position === 'QB'
    ? qbOffense
    : (scrimmageYards || passY || 0);
  const passTDG = pickPerGameValue(row, 'passing_touchdowns', 2);
  const rushTDG = pickPerGameValue(row, 'rushing_touchdowns', 2);
  const recTDG = pickPerGameValue(row, 'receiving_touchdowns', 2);
  const totalTDG = [passTDG, rushTDG, recTDG].reduce((sum, v) => sum + (typeof v === 'number' ? v : 0), 0);

  return {
    id: player.id,
    name: player.full_name || `${player.first_name || ''} ${player.last_name || ''}`.trim(),
    position: position || null,
    team: teamName || null,
    class: player.class || player.class_year || null,
    height: player.height || null,
    weight: player.weight || null,
    totalYardsPerGame: totalYardsPerGame ? roundNumber(totalYardsPerGame, 1) : undefined,
    passYdsPerGame: passY,
    rushYdsPerGame: rushY,
    recYdsPerGame: recY,
    passingTouchdownsPerGame: passTDG,
    rushingTouchdownsPerGame: rushTDG,
    receivingTouchdownsPerGame: recTDG,
    touchdownsPerGame: totalTDG ? roundNumber(totalTDG, 2) : undefined,
    interceptionsPerGame: pickPerGameValue(row, 'passing_interceptions', 2),
    completionPct: typeof row?.passing_completion_percentage === 'number'
      ? roundNumber(row.passing_completion_percentage, 1)
      : undefined,
    receptionsPerGame: pickPerGameValue(row, 'receptions', 2),
    rushingAttemptsPerGame: pickPerGameValue(row, 'rushing_attempts', 2),
    rankingScore: totalYardsPerGame || 0
  };
};

const aggregatePlayerStatsFromGames = async (teamId, season) => {
  try {
    const rows = await ballDontLieService.getPlayerStats(SPORT_KEY, {
      team_ids: [teamId],
      seasons: [season],
      per_page: 100
    });
    const grouped = new Map();
    for (const entry of rows || []) {
      const pid = entry?.player?.id;
      if (!pid) continue;
      if (!grouped.has(pid)) {
        grouped.set(pid, {
          player: entry.player,
          team: entry.team,
          games_played: 0,
          passing_yards: 0,
          passing_touchdowns: 0,
          passing_interceptions: 0,
          rushing_yards: 0,
          rushing_attempts: 0,
          rushing_touchdowns: 0,
          receiving_yards: 0,
          receptions: 0,
          receiving_touchdowns: 0
        });
      }
      const bucket = grouped.get(pid);
      bucket.games_played += 1;
      bucket.passing_yards += Number(entry?.passing_yards) || 0;
      bucket.passing_touchdowns += Number(entry?.passing_touchdowns) || 0;
      bucket.passing_interceptions += Number(entry?.passing_interceptions) || 0;
      bucket.rushing_yards += Number(entry?.rushing_yards) || 0;
      bucket.rushing_attempts += Number(entry?.rushing_attempts) || 0;
      bucket.rushing_touchdowns += Number(entry?.rushing_touchdowns) || 0;
      bucket.receiving_yards += Number(entry?.receiving_yards) || 0;
      bucket.receptions += Number(entry?.receptions) || 0;
      bucket.receiving_touchdowns += Number(entry?.receiving_touchdowns) || 0;
    }
    return Array.from(grouped.values());
  } catch (e) {
    console.warn(`[NCAAF] Failed aggregating player_stats for team ${teamId}:`, e?.message || e);
    return [];
  }
};

const buildTeamTopPlayers = async (teamId, season) => {
  if (!teamId || !season) return [];
  let seasonRows = await ballDontLieService.getNcaafPlayerSeasonStats({ teamId, season });
  if (!Array.isArray(seasonRows) || seasonRows.length === 0) {
    const aggregated = await aggregatePlayerStatsFromGames(teamId, season);
    seasonRows = aggregated;
  }
  if (!Array.isArray(seasonRows) || seasonRows.length === 0) return [];
  const formatted = seasonRows
    .map(formatSeasonPlayerRow)
    .filter((p) => p && typeof p.rankingScore === 'number' && p.rankingScore > 0);
  if (!formatted.length) return [];
  formatted.sort((a, b) => {
    if (b.rankingScore !== a.rankingScore) return b.rankingScore - a.rankingScore;
    return (b.rushYdsPerGame || 0) - (a.rushYdsPerGame || 0);
  });
  return formatted.slice(0, 3).map(({ rankingScore, ...rest }) => rest);
};

export async function generateNCAAFPicks(options = {}) {
  console.log('Processing NCAAF games');
  if (options.nocache) {
    console.log('NCAAF nocache mode: clearing Ball Don\'t Lie cache');
    ballDontLieService.clearCache();
  }
  const games = await oddsService.getUpcomingGames(SPORT_KEY, { nocache: options.nocache === true });
  console.log(`Found ${games.length} NCAAF games from odds service`);

  const now = new Date();
  const end = new Date(now.getTime() + 16 * 60 * 60 * 1000);
  let windowed = games.filter(g => {
    const t = new Date(g.commence_time);
    return t >= now && t <= end;
  });
  console.log(`After date filtering: ${windowed.length} NCAAF games in next 16h`);

  // Track total games for cursor logic
  const totalGamesCount = windowed.length;

  if (typeof options.onlyAtIndex === 'number') {
    const idx = options.onlyAtIndex;
    // If cursor is beyond available games, return early with metadata
    if (idx >= windowed.length) {
      console.log(`[NCAAF] Cursor ${idx} exceeds available games (${windowed.length}) - no more games`);
      return { picks: [], noMoreGames: true, totalGames: totalGamesCount };
    }
    windowed = [windowed[idx]];
  }

  const season = new Date().getFullYear();
  const picks = [];

  for (const game of windowed) {
    const gameId = `ncaaf-${game.id}`;

    // EARLY CHECK: Skip if this game already has a pick (prevents both sides being picked)
    const { exists: alreadyPicked, existingPick } = await gameAlreadyHasPick('NCAAF', game.home_team, game.away_team);
    if (alreadyPicked) {
      console.log(`⏭️ SKIPPING ${game.away_team} @ ${game.home_team} - already have pick: "${existingPick}"`);
      continue;
    }

    const result = await processGameOnce(gameId, async () => {
      console.log(`Processing NCAAF game: ${game.away_team} @ ${game.home_team}`);

      const homeTeam = await ballDontLieService.getTeamByNameGeneric(SPORT_KEY, game.home_team);
      const awayTeam = await ballDontLieService.getTeamByNameGeneric(SPORT_KEY, game.away_team);
      if (!homeTeam || !awayTeam) {
        console.warn(`NCAAF: Could not resolve teams for ${game.away_team} @ ${game.home_team} — skipping.`);
        return null;
      }

      const [homeTeamStats, awayTeamStats, injuries, homeSeasonRows, awaySeasonRows] = await Promise.all([
        ballDontLieService.getTeamStats(SPORT_KEY, { seasons: [season], team_ids: [homeTeam.id], per_page: 100 }),
        ballDontLieService.getTeamStats(SPORT_KEY, { seasons: [season], team_ids: [awayTeam.id], per_page: 100 }),
        ballDontLieService.getInjuriesGeneric(SPORT_KEY, { team_ids: [homeTeam.id, awayTeam.id] }),
        ballDontLieService.getTeamSeasonStats(SPORT_KEY, { teamId: homeTeam.id, season }),
        ballDontLieService.getTeamSeasonStats(SPORT_KEY, { teamId: awayTeam.id, season })
      ]);

      const hasHome = Array.isArray(homeTeamStats) && homeTeamStats.length > 0;
      const hasAway = Array.isArray(awayTeamStats) && awayTeamStats.length > 0;
      if (!hasHome || !hasAway) {
        console.warn(`NCAAF: Missing required stats for ${game.away_team} @ ${game.home_team} — skipping.`);
        return null;
      }

      // Prefer team_season_stats; fall back to aggregated team_stats when season stats are missing
      const aggregateSeasonFromTeamStats = (rows) => {
        if (!Array.isArray(rows) || rows.length === 0) return {};
        let games = 0;
        let passY = 0, rushY = 0, totalY = 0, tovs = 0;
        let tdConv = 0, tdAtt = 0, fdConv = 0, fdAtt = 0;
        for (const r of rows) {
          games += 1;
          passY += Number(r?.passing_yards) || 0;
          rushY += Number(r?.rushing_yards) || 0;
          totalY += Number(r?.total_yards) || 0;
          tovs += Number(r?.turnovers) || 0;
          // third_down_efficiency like "6-15"
          const tde = typeof r?.third_down_efficiency === 'string' ? r.third_down_efficiency : '';
          const fde = typeof r?.fourth_down_efficiency === 'string' ? r.fourth_down_efficiency : '';
          const parsePair = (s) => {
            const parts = s.split('-').map(x => Number(String(x).trim()));
            return parts.length === 2 && parts.every(n => Number.isFinite(n)) ? { made: parts[0], att: parts[1] } : { made: 0, att: 0 };
          };
          const t = parsePair(tde);
          const f = parsePair(fde);
          tdConv += t.made; tdAtt += t.att;
          fdConv += f.made; fdAtt += f.att;
        }
        const safePct = (num, den) => den > 0 ? num / den : undefined;
        return {
          passingYardsPerGame: games ? passY / games : undefined,
          rushingYardsPerGame: games ? rushY / games : undefined,
          totalYardsPerGame: games ? totalY / games : undefined,
          turnoversPerGame: games ? tovs / games : undefined,
          thirdDownPct: safePct(tdConv, tdAtt),
          fourthDownPct: safePct(fdConv, fdAtt)
        };
      };
      const mapSeasonRows = (rows) => {
        // rows from /ncaaf/v1/team_season_stats (array)
        if (!Array.isArray(rows) || rows.length === 0) return {};
        const r = rows[0] || {};
        const toNum = (v) => (typeof v === 'number' && isFinite(v)) ? v : undefined;
        const passingY = toNum(r.passing_yards_per_game);
        const rushingY = toNum(r.rushing_yards_per_game);
        return {
          passingYardsPerGame: passingY,
          rushingYardsPerGame: rushingY,
          totalYardsPerGame: (typeof passingY === 'number' && typeof rushingY === 'number') ? passingY + rushingY : undefined,
          turnoversPerGame: toNum(r.turnovers_per_game),
          thirdDownPct: toNum(r.third_down_conversion_percentage)
        };
      };
      let homeSeason = mapSeasonRows(homeSeasonRows);
      let awaySeason = mapSeasonRows(awaySeasonRows);
      if (!homeSeason?.passingYardsPerGame || !homeSeason?.rushingYardsPerGame) {
        const agg = aggregateSeasonFromTeamStats(homeTeamStats);
        homeSeason = { ...agg, ...homeSeason };
      }
      if (!awaySeason?.passingYardsPerGame || !awaySeason?.rushingYardsPerGame) {
        const agg = aggregateSeasonFromTeamStats(awayTeamStats);
        awaySeason = { ...agg, ...awaySeason };
      }
      // Duplicate keys to match prompt expectations: totalYdsPerGame, passYdsPerGame, rushYdsPerGame
      const normalizeSeasonKeys = (m = {}) => ({
        ...m,
        totalYdsPerGame: m.totalYardsPerGame ?? m.totalYdsPerGame,
        passYdsPerGame: m.passingYardsPerGame ?? m.passYdsPerGame,
        rushYdsPerGame: m.rushingYardsPerGame ?? m.rushYdsPerGame
      });
      homeSeason = normalizeSeasonKeys(homeSeason);
      awaySeason = normalizeSeasonKeys(awaySeason);

      const [homeTopPlayers, awayTopPlayers] = await Promise.all([
        buildTeamTopPlayers(homeTeam.id, season),
        buildTeamTopPlayers(awayTeam.id, season)
      ]);
      const playerBlocks = {
        home: homeTopPlayers,
        away: awayTopPlayers
      };

      // Try to load standings for basics if available (NCAAF requires conference_id)
      let homeStandings = [];
      let awayStandings = [];
      try {
        const homeConfId = homeTeam?.conference || homeTeam?.conference_id || homeTeam?.conferenceId;
        const awayConfId = awayTeam?.conference || awayTeam?.conference_id || awayTeam?.conferenceId;
        const [hs, as] = await Promise.all([
          homeConfId ? ballDontLieService.getStandingsGeneric(SPORT_KEY, { season, conference_id: homeConfId }) : Promise.resolve([]),
          awayConfId ? ballDontLieService.getStandingsGeneric(SPORT_KEY, { season, conference_id: awayConfId }) : Promise.resolve([])
        ]);
        homeStandings = hs;
        awayStandings = as;
      } catch {}
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
          home: homeSeason,
          away: awaySeason
        },
        topPlayers: playerBlocks,
        keyPlayers: {
          home: { topPlayers: homeTopPlayers },
          away: { topPlayers: awayTopPlayers }
        },
        // Back-compat for prompt sections expecting 'skillPlayers'
        skillPlayers: {
          home: { topPlayers: homeTopPlayers },
          away: { topPlayers: awayTopPlayers }
        }
      };

      // Provide combined teamStats and minimal gameContext
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
        notes: 'Regular season context from BDL NCAAF',
        richKeyFindings
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
        realTimeNews: realTimeNewsText || undefined,
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
        console.warn('Failed to compute recommended sportsbook (NCAAF):', e?.message || e);
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
    console.log(`Total NCAAF picks generated: ${picks.length}`);
  }
  // Return with metadata for cursor logic
  return { 
    picks, 
    noMoreGames: false, 
    totalGames: totalGamesCount,
    processedIndex: typeof options.onlyAtIndex === 'number' ? options.onlyAtIndex : null
  };
}


