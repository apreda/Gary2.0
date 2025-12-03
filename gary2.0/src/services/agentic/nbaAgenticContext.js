import { ballDontLieService } from '../ballDontLieService.js';
import { perplexityService } from '../perplexityService.js';
import { ensureArray } from './agenticUtils.js';
import {
  resolveTeamByName,
  formatGameTimeEST,
  buildMarketSnapshot,
  calcRestInfo,
  calcRecentForm,
  parseGameDate
} from './sharedUtils.js';

const makeStatsMap = (rows = []) => {
  const map = new Map();
  (rows || []).forEach((row) => {
    const pid = row?.player?.id;
    if (pid) {
      map.set(pid, row);
    }
  });
  return map;
};

const buildTopPlayers = (
  roster = [],
  baseRows = [],
  advancedRows = [],
  injuryMap = new Map(),
  leaderMap = new Map(),
  maxPlayers = 10
) => {
  if (!Array.isArray(roster) || roster.length === 0) return [];
  const baseMap = makeStatsMap(baseRows);
  const advMap = makeStatsMap(advancedRows);

  const enriched = roster
    .map((player) => {
      const stats = baseMap.get(player.id)?.stats || {};
      const advStats = advMap.get(player.id)?.stats || {};
      const injury = injuryMap.get(player.id);
      const leaderInfo = leaderMap.get(player.id);
      const minutes = Number(stats.minutes_per_game ?? stats.min ?? stats.minutes ?? 0);
      const pts = Number(stats.points_per_game ?? stats.points ?? stats.pts ?? 0);
      const reb = Number(stats.rebounds_per_game ?? stats.rebounds ?? stats.reb ?? 0);
      const ast = Number(stats.assists_per_game ?? stats.assists ?? stats.ast ?? 0);

      return {
        id: player.id,
        name: `${player.first_name || ''} ${player.last_name || ''}`.trim(),
        position: player.position || '',
        ptsPerGame: pts,
        rebPerGame: reb,
        astPerGame: ast,
        minutesPerGame: minutes,
        leagueLeader: leaderInfo || null,
        injuryStatus: injury?.status || null,
        injuryDescription: injury?.description || null,
        advanced: {
          usagePct: advStats.usage_percentage ?? null,
          trueShootingPct: advStats.true_shooting_percentage ?? null,
          offensiveRating: advStats.offensive_rating ?? null,
          defensiveRating: advStats.defensive_rating ?? null,
          netRating: advStats.net_rating ?? null,
          pie: advStats.player_impact_estimate ?? advStats.pie ?? null
        }
      };
    })
    .filter((entry) => Number.isFinite(entry.minutesPerGame) && entry.minutesPerGame > 0);

  enriched.sort((a, b) => b.minutesPerGame - a.minutesPerGame || b.ptsPerGame - a.ptsPerGame);
  return enriched.slice(0, maxPlayers);
};

// parseGameDate imported from shared utils

// calcRestInfo and calcRecentForm imported from shared utils

const sumStat = (rows = [], ...keys) =>
  rows.reduce((sum, entry) => {
    const stats = entry?.stats || {};
    for (const key of keys) {
      if (typeof stats[key] === 'number') {
        return sum + stats[key];
      }
    }
    return sum;
  }, 0);

const buildPaceProfile = (baseRows = []) => {
  const fga = sumStat(baseRows, 'fga', 'field_goals_attempted');
  const fgm = sumStat(baseRows, 'fgm', 'field_goals_made');
  const fg3a = sumStat(baseRows, 'fg3a', 'three_point_field_goals_attempted');
  const fg3m = sumStat(baseRows, 'fg3m', 'three_point_field_goals_made');
  const fta = sumStat(baseRows, 'fta', 'free_throws_attempted');
  const ftm = sumStat(baseRows, 'ftm', 'free_throws_made');
  const oreb = sumStat(baseRows, 'oreb', 'offensive_rebounds');
  const dreb = sumStat(baseRows, 'dreb', 'defensive_rebounds');
  const tov = sumStat(baseRows, 'tov', 'turnovers');
  const possessions = fga + 0.44 * fta - oreb + tov;
  return {
    possessionsPerGame: possessions || null,
    offensiveRebPerGame: oreb || null,
    defensiveRebPerGame: dreb || null,
    totalRebPerGame: (oreb + dreb) || null,
    shotsPerGame: fga || null,
    effectiveFgPct: fga > 0 ? (fgm + 0.5 * fg3m) / fga : null,
    threePointAttemptRate: fga > 0 ? fg3a / fga : null,
    threePointMakeRate: fg3a > 0 ? fg3m / fg3a : null,
    freeThrowRate: fga > 0 ? fta / fga : null,
    turnoverRate: (fga + 0.44 * fta + tov) > 0 ? tov / (fga + 0.44 * fta + tov) : null
  };
};

const buildDefenseProxies = (baseRows = []) => {
  const blocks = sumStat(baseRows, 'blk', 'blocks');
  const steals = sumStat(baseRows, 'stl', 'steals');
  const dreb = sumStat(baseRows, 'dreb', 'defensive_rebounds');
  const fouls = sumStat(baseRows, 'pf', 'personal_fouls');
  return {
    paintDefense: {
      blocksPerGame: blocks || null,
      defensiveReboundsPerGame: dreb || null,
      foulRate: fouls || null,
      opponentRimFgPct: null
    },
    perimeterDefense: {
      stealsPerGame: steals || null,
      opponentThreePointPct: null,
      contestProxy: blocks || null
    }
  };
};

const aggregateFourFactors = (baseList) => {
  if (!Array.isArray(baseList) || baseList.length === 0) return {};
  let fgm = 0;
  let fg3m = 0;
  let fga = 0;
  let ftm = 0;
  let fta = 0;
  let oreb = 0;
  let tov = 0;
  baseList.forEach((entry) => {
    const s = entry?.stats || {};
    fgm += Number(s.fgm || s.field_goals_made || 0);
    fga += Number(s.fga || s.field_goals_attempted || 0);
    fg3m += Number(s.fg3m || s.three_point_field_goals_made || 0);
    ftm += Number(s.ftm || s.free_throws_made || 0);
    fta += Number(s.fta || s.free_throws_attempted || 0);
    oreb += Number(s.oreb || s.offensive_rebounds || 0);
    tov += Number(s.tov || s.turnovers || 0);
  });
  const efg = fga > 0 ? (fgm + 0.5 * fg3m) / fga : null;
  const tovRateDen = fga + 0.44 * fta + tov;
  const tovRate = tovRateDen > 0 ? (tov / tovRateDen) : null;
  const ftRate = fga > 0 ? ftm / fga : null;
  return {
    effectiveFgPct: efg,
    turnoverRate: tovRate,
    offensiveRebRate: oreb,
    freeThrowRate: ftRate
  };
};

const aggregateAdvanced = (advList, usageList) => {
  if (!Array.isArray(advList) || advList.length === 0) return {};
  const avg = (arr, key) => {
    const values = arr.map((entry) => Number(entry?.stats?.[key])).filter((value) => Number.isFinite(value));
    if (!values.length) return null;
    return values.reduce((sum, value) => sum + value, 0) / values.length;
  };
  const usageValues = Array.isArray(usageList) ? usageList : [];
  return {
    trueShootingPct: avg(advList, 'true_shooting_percentage'),
    effectiveFgPctAdv: avg(advList, 'effective_field_goal_percentage'),
    offensiveRating: avg(advList, 'offensive_rating'),
    defensiveRating: avg(advList, 'defensive_rating'),
    netRating:
      (() => {
        const ortg = avg(advList, 'offensive_rating');
        const drtg = avg(advList, 'defensive_rating');
        if (typeof ortg === 'number' && typeof drtg === 'number') return ortg - drtg;
        return avg(advList, 'net_rating');
      })(),
    usagePct: avg(usageValues, 'usage_percentage')
  };
};

// formatGameTimeEST and buildMarketSnapshot imported from shared utils

export async function buildNbaAgenticContext(game, options = {}) {
  const commenceDate = parseGameDate(game.commence_time) || new Date();
  const season = commenceDate.getMonth() + 1 <= 6 ? commenceDate.getFullYear() - 1 : commenceDate.getFullYear();
  const lookbackStart = new Date(commenceDate);
  lookbackStart.setDate(lookbackStart.getDate() - 21);
  const startStr = lookbackStart.toISOString().slice(0, 10);
  const endStr = commenceDate.toISOString().slice(0, 10);

  const nbaTeams = await ballDontLieService.getNbaTeams();
  const homeTeam = resolveTeamByName(game.home_team, nbaTeams);
  const awayTeam = resolveTeamByName(game.away_team, nbaTeams);
  if (!homeTeam || !awayTeam) {
    throw new Error('Unable to resolve NBA teams for agentic context');
  }

  const teamIds = [homeTeam.id, awayTeam.id];
  const [homeRecent, awayRecent, injuries, standings, leagueLeaderMap] = await Promise.all([
    ballDontLieService.getGames(
      'basketball_nba',
      { seasons: [season], team_ids: [homeTeam.id], postseason: false, start_date: startStr, end_date: endStr, per_page: 50 },
      options.nocache ? 0 : 10
    ),
    ballDontLieService.getGames(
      'basketball_nba',
      { seasons: [season], team_ids: [awayTeam.id], postseason: false, start_date: startStr, end_date: endStr, per_page: 50 },
      options.nocache ? 0 : 10
    ),
    ballDontLieService.getInjuriesGeneric('basketball_nba', { team_ids: teamIds }, options.nocache ? 0 : 5),
    ballDontLieService.getStandingsGeneric('basketball_nba', { season }),
    (async () => {
      const types = ['pts', 'ast', 'reb', 'stl', 'blk', 'min'];
      const leaderMap = new Map();
      await Promise.all(
        types.map(async (stat) => {
          try {
            const rows = await ballDontLieService.getLeaders({ stat_type: stat, season });
            (Array.isArray(rows) ? rows : []).forEach((entry) => {
              const pid = entry?.player?.id;
              if (!pid) return;
              if (!leaderMap.has(pid)) leaderMap.set(pid, {});
              leaderMap.get(pid)[stat] = { rank: entry?.rank ?? null, value: entry?.value ?? null };
            });
          } catch (error) {
            console.warn(`[Agentic][NBA] Failed to fetch leader type ${stat}:`, error.message);
          }
        })
      );
      return leaderMap;
    })()
  ]);

  const formatBasics = (team) => {
    const row = Array.isArray(standings) ? standings.find((entry) => entry?.team?.id === team.id) : null;
    if (!row) return {};
    const record = (row?.wins != null && row?.losses != null) ? `${row.wins}-${row.losses}` : undefined;
    return {
      record,
      conference: row?.conference || team.conference,
      division: row?.division || team.division,
      streak: row?.streak || row?.current_streak || null
    };
  };

  const injuryMap = new Map();
  (injuries || []).forEach((injury) => {
    const pid = injury?.player?.id;
    if (pid) {
      injuryMap.set(pid, {
        status: injury?.status || null,
        description: injury?.description || null,
        return_date: injury?.return_date || null
      });
    }
  });

  const loadTeamAverages = async (team) => {
    let roster = [];
    try {
      roster = await ballDontLieService.getPlayersActive('basketball_nba', { team_ids: [team.id], per_page: 100 }, options.nocache ? 0 : 10);
    } catch (error) {
      console.warn(`[Agentic][NBA] getPlayersActive failed for ${team.id}:`, error.message);
    }
    if (!Array.isArray(roster) || roster.length === 0) {
      roster = await ballDontLieService.getPlayersGeneric('basketball_nba', { team_ids: [team.id], per_page: 100 });
    }
    const filteredRoster = roster.filter((player) => player?.team?.id === team.id);
    const ids = filteredRoster.map((player) => player.id).filter(Boolean).slice(0, 100);
    const [base, scoring, advanced, usage] = await Promise.all([
      ballDontLieService.getNbaSeasonAverages({ category: 'general', type: 'base', season, season_type: 'regular', player_ids: ids }),
      ballDontLieService.getNbaSeasonAverages({ category: 'general', type: 'scoring', season, season_type: 'regular', player_ids: ids }),
      ballDontLieService.getNbaSeasonAverages({ category: 'general', type: 'advanced', season, season_type: 'regular', player_ids: ids }),
      ballDontLieService.getNbaSeasonAverages({ category: 'general', type: 'usage', season, season_type: 'regular', player_ids: ids })
    ]);
    const baseMap = makeStatsMap(base);
    const rosterWithStats = filteredRoster.filter((player) => baseMap.has(player.id));
    return { base, scoring, advanced, usage, players: rosterWithStats };
  };

  const [homeAvg, awayAvg] = await Promise.all([loadTeamAverages(homeTeam), loadTeamAverages(awayTeam)]);
  const fourFactors = {
    home: aggregateFourFactors(homeAvg.base),
    away: aggregateFourFactors(awayAvg.base)
  };
  const advancedProfile = {
    home: aggregateAdvanced(homeAvg.advanced, homeAvg.usage),
    away: aggregateAdvanced(awayAvg.advanced, awayAvg.usage)
  };
  const paceProfile = {
    home: buildPaceProfile(homeAvg.base),
    away: buildPaceProfile(awayAvg.base)
  };
  const defenseProxies = {
    home: buildDefenseProxies(homeAvg.base),
    away: buildDefenseProxies(awayAvg.base)
  };
  const topPlayers = {
    home: buildTopPlayers(homeAvg.players, homeAvg.base, homeAvg.advanced, injuryMap, leagueLeaderMap, 10),
    away: buildTopPlayers(awayAvg.players, awayAvg.base, awayAvg.advanced, injuryMap, leagueLeaderMap, 10)
  };

  const restInfo = {
    home: calcRestInfo(homeRecent, homeTeam.id, commenceDate),
    away: calcRestInfo(awayRecent, awayTeam.id, commenceDate)
  };
  const recentForm = {
    home: calcRecentForm(homeRecent, homeTeam.id, 5),
    away: calcRecentForm(awayRecent, awayTeam.id, 5)
  };

  const notableInjuries = (injuries || [])
    .filter((injury) => injury?.status && injury.status !== 'Available')
    .map((injury) => ({
      player: `${injury?.player?.first_name || ''} ${injury?.player?.last_name || ''}`.trim(),
      status: injury?.status,
      description: injury?.description || '',
      team: injury?.team?.full_name || ''
    }))
    .slice(0, 8);

  const marketSnapshot = buildMarketSnapshot(
    game.bookmakers || [],
    homeTeam.full_name,
    awayTeam.full_name
  );

  let richContext = null;
  try {
    const dateStr = commenceDate.toISOString().slice(0, 10);
    richContext = await perplexityService.getRichGameContext(game.home_team, game.away_team, 'nba', dateStr);
  } catch (error) {
    console.warn('[Agentic][NBA] Perplexity rich context failed:', error.message);
  }

  const gameSummary = {
    gameId: `nba-${game.id}`,
    sport: 'basketball_nba',
    league: 'NBA',
    matchup: `${game.away_team} @ ${game.home_team}`,
    homeTeam: homeTeam.full_name,
    awayTeam: awayTeam.full_name,
    tipoff: formatGameTimeEST(game.commence_time),
    location: `${homeTeam.city || ''} (${homeTeam.conference} ${homeTeam.division})`,
    odds: {
      spread: marketSnapshot.spread,
      moneyline: marketSnapshot.moneyline
    },
    records: {
      home: formatBasics(homeTeam).record || 'N/A',
      away: formatBasics(awayTeam).record || 'N/A'
    },
    narrative: {
      home: formatBasics(homeTeam).streak ? `Streak: ${formatBasics(homeTeam).streak}` : '',
      away: formatBasics(awayTeam).streak ? `Streak: ${formatBasics(awayTeam).streak}` : '',
      notes: richContext?.summary || null
    }
  };

  const tokenData = {
    pace: paceProfile,
    efficiency: advancedProfile,
    four_factors: fourFactors,
    advanced_profile: advancedProfile, // back-compat
    paint_defense: {
      home: defenseProxies.home.paintDefense,
      away: defenseProxies.away.paintDefense
    },
    perimeter_defense: {
      home: defenseProxies.home.perimeterDefense,
      away: defenseProxies.away.perimeterDefense
    },
    rebounding: {
      home: {
        offensiveRebRate: fourFactors.home?.offensiveRebRate ?? null
      },
      away: {
        offensiveRebRate: fourFactors.away?.offensiveRebRate ?? null
      }
    },
    rest_fatigue: restInfo,
    injury_report: {
      notable: notableInjuries,
      total_listed: injuries?.length || 0
    },
    market_snapshot: marketSnapshot,
    recent_form: recentForm,
    top_players: {
      home: topPlayers.home.slice(0, 5),
      away: topPlayers.away.slice(0, 5)
    }
  };

  return {
    gameSummary,
    tokenData,
    oddsSummary: marketSnapshot,
    meta: {
      homeTeam,
      awayTeam,
      season,
      window: { start: startStr, end: endStr },
      richKeyFindings: richContext?.key_findings || []
    }
  };
}

