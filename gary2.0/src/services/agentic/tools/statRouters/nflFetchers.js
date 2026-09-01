import { getCurrentSeasonString, sportToBdlKey, normalizeSportName, findTeam, fmtNum, fmtPct, fetchBothTeamSeasonStats, groundedWebSearch, getGroundedWeather, isGameCompleted } from './statRouterCommon.js';
import { ballDontLieService } from '../../../ballDontLieService.js';
import { loadTeamResults, formSummary, homeAwaySplit, marginProfile } from './footballTeamGames.js';
import { nflVenueFor, weatherApplies } from './footballVenues.js';
import { loadLeagueContext, opponentQualityLine } from './footballLeagueContext.js';
import { getFbsTeams, fbsVenueFor } from '../../../cfbdService.js';
import { latestGameNarrative } from './footballGameStory.js';
import { getKickoffWeather, windDescription } from '../../../weatherService.js';
import { getPracticeReport, getSnapShare } from '../../../nflverseService.js';
import { footballAdvancedTokens } from './footballAdvancedTokens.js';

/**
 * Both teams' season rows in one call, unwrapped.
 *
 * This exact six-line fetch-and-unwrap appeared ~20 times across this file.
 * BDL returns an array for some sports and a bare object for others, so every
 * copy had to repeat the Array.isArray dance — and a copy that forgot it would
 * read fields off an array and silently get undefined for all of them.
 * getTeamSeasonStats is cached (30 min), so callers share one round trip.
 */
async function seasonPair(bdlSport, home, away, season) {
  const [homeArr, awayArr] = await Promise.all([
    ballDontLieService.getTeamSeasonStats(bdlSport, { teamId: home.id, season, postseason: false }),
    ballDontLieService.getTeamSeasonStats(bdlSport, { teamId: away.id, season, postseason: false })
  ]);
  return {
    homeStats: Array.isArray(homeArr) ? homeArr[0] : homeArr,
    awayStats: Array.isArray(awayArr) ? awayArr[0] : awayArr
  };
}

export const nflFetchers = {

  RED_ZONE_OFFENSE: async (bdlSport, home, away, season) => {
    const homeName = home.full_name || home.name;
    const awayName = away.full_name || away.name;
    
    // NCAAF: BDL doesn't provide red zone data, return N/A
    if (bdlSport === 'americanfootball_ncaaf') {
      return {
        category: 'Red Zone Efficiency',
        home: { team: homeName, red_zone_td_pct: 'N/A' },
        away: { team: awayName, red_zone_td_pct: 'N/A' },
        note: 'NCAAF red zone data unavailable from BDL'
      };
    }
    
    // Try to get actual red zone data from recent games (NFL)
    const [homeGames, awayGames] = await Promise.all([
      ballDontLieService.getTeamStats ? 
        ballDontLieService.getTeamStats(bdlSport, { team_ids: [home.id], seasons: [season], per_page: 10 }) : [],
      ballDontLieService.getTeamStats ? 
        ballDontLieService.getTeamStats(bdlSport, { team_ids: [away.id], seasons: [season], per_page: 10 }) : []
    ]);
    
    // Aggregate red zone stats from games
    const aggregateRedZone = (games, teamId) => {
      let rzScores = 0, rzAttempts = 0;
      const teamGames = (games || []).filter(g => g.team?.id === teamId);
      teamGames.forEach(g => {
        rzScores += g.red_zone_scores || 0;
        rzAttempts += g.red_zone_attempts || 0;
      });
      return {
        scores: rzScores,
        attempts: rzAttempts,
        pct: rzAttempts > 0 ? ((rzScores / rzAttempts) * 100).toFixed(1) + '%' : 'N/A',
        games: teamGames.length
      };
    };
    
    const homeRZ = aggregateRedZone(homeGames, home.id);
    const awayRZ = aggregateRedZone(awayGames, away.id);
    
    // If we got real red zone data, use it
    if (homeRZ.attempts > 0 || awayRZ.attempts > 0) {
      return {
        category: 'Red Zone Scoring Efficiency',
        home: {
          team: homeName,
          red_zone_td_pct: homeRZ.pct,
          red_zone_scores: homeRZ.scores.toString(),
          red_zone_attempts: homeRZ.attempts.toString()
        },
        away: {
          team: awayName,
          red_zone_td_pct: awayRZ.pct,
          red_zone_scores: awayRZ.scores.toString(),
          red_zone_attempts: awayRZ.attempts.toString()
        },
        note: `Aggregated from ${homeRZ.games} home games, ${awayRZ.games} away games`
      };
    }
    
    // Red zone data unavailable — return error instead of substituting a different stat
    return {
      category: 'Red Zone Scoring Efficiency',
      error: 'Red zone data unavailable from BDL for this game',
      home: { team: homeName, red_zone_td_pct: 'N/A', red_zone_scores: 'N/A', red_zone_attempts: 'N/A' },
      away: { team: awayName, red_zone_td_pct: 'N/A', red_zone_scores: 'N/A', red_zone_attempts: 'N/A' },
      note: 'Red zone game data not available via BDL.'
    };
  },

  QB_STATS: async (bdlSport, home, away, season) => {
    const { homeStats, awayStats } = await seasonPair(bdlSport, home, away, season);
    
    return {
      category: 'Quarterback/Passing Stats',
      home: {
        team: home.full_name || home.name,
        qb_rating: fmtNum(homeStats?.passing_qb_rating),
        completion_pct: fmtPct(homeStats?.passing_completion_pct / 100),
        yards_per_attempt: fmtNum(homeStats?.yards_per_pass_attempt),
        passing_tds: fmtNum(homeStats?.passing_touchdowns, 0),
        interceptions: fmtNum(homeStats?.passing_interceptions, 0)
      },
      away: {
        team: away.full_name || away.name,
        qb_rating: fmtNum(awayStats?.passing_qb_rating),
        completion_pct: fmtPct(awayStats?.passing_completion_pct / 100),
        yards_per_attempt: fmtNum(awayStats?.yards_per_pass_attempt),
        passing_tds: fmtNum(awayStats?.passing_touchdowns, 0),
        interceptions: fmtNum(awayStats?.passing_interceptions, 0)
      }
    };
  },

  RB_STATS: async (bdlSport, home, away, season) => {
    const { homeStats, awayStats } = await seasonPair(bdlSport, home, away, season);
    
    return {
      category: 'Rushing Stats',
      home: {
        team: home.full_name || home.name,
        rushing_yards_per_game: fmtNum(homeStats?.rushing_yards_per_game),
        yards_per_carry: fmtNum(homeStats?.rushing_yards_per_rush_attempt),
        rushing_tds: fmtNum(homeStats?.rushing_touchdowns, 0)
      },
      away: {
        team: away.full_name || away.name,
        rushing_yards_per_game: fmtNum(awayStats?.rushing_yards_per_game),
        yards_per_carry: fmtNum(awayStats?.rushing_yards_per_rush_attempt),
        rushing_tds: fmtNum(awayStats?.rushing_touchdowns, 0)
      }
    };
  },

  EPA_LAST_5: async (bdlSport, home, away, season) => {
    // Match the full-season request made by the scout report so this token can
    // reuse that cached schedule. An NFL season is well below 100 games and we
    // still sort and take exactly the latest five below.
    const [homeGamesRaw, awayGamesRaw] = await Promise.all([
      ballDontLieService.getGames(bdlSport, { team_ids: [home.id], seasons: [season], per_page: 100 }),
      ballDontLieService.getGames(bdlSport, { team_ids: [away.id], seasons: [season], per_page: 100 })
    ]);

    const calcL5Scoring = (games, teamId) => {
      if (!games || games.length === 0) return null;
      // Filter to completed games, sort by date descending, take last 5
      const completed = games
        .filter(g => isGameCompleted(g.status))
        .sort((a, b) => new Date(b.date) - new Date(a.date))
        .slice(0, 5);
      if (completed.length === 0) return null;

      let totalPts = 0, totalOppPts = 0;
      for (const g of completed) {
        const isHome = (g.home_team?.id || g.home_team_id) === teamId;
        const teamScore = isHome
          ? (g.home_team_score ?? g.home_score ?? 0)
          : (g.visitor_team_score ?? g.away_score ?? 0);
        const oppScore = isHome
          ? (g.visitor_team_score ?? g.away_score ?? 0)
          : (g.home_team_score ?? g.home_score ?? 0);
        totalPts += teamScore;
        totalOppPts += oppScore;
      }
      const count = completed.length;
      const ppg = totalPts / count;
      const oppPpg = totalOppPts / count;
      return {
        games_used: count,
        ppg: fmtNum(ppg, 1),
        opp_ppg: fmtNum(oppPpg, 1),
        point_diff: fmtNum(ppg - oppPpg, 1)
      };
    };

    const homeL5 = calcL5Scoring(homeGamesRaw, home.id);
    const awayL5 = calcL5Scoring(awayGamesRaw, away.id);

    return {
      category: 'Last 5 Games Scoring Efficiency',
      data_scope: 'Actual L5 game scores (not per-play EPA)',
      home: {
        team: home.full_name || home.name,
        ...(homeL5 || { note: 'No completed games found' })
      },
      away: {
        team: away.full_name || away.name,
        ...(awayL5 || { note: 'No completed games found' })
      }
    };
  },

  WR_TE_STATS: async (bdlSport, home, away, season) => {
    const { homeStats, awayStats } = await seasonPair(bdlSport, home, away, season);
    
    return {
      category: 'Receiving/Passing Attack',
      home: {
        team: home.full_name || home.name,
        receiving_yards_per_game: fmtNum(homeStats?.passing_yards_per_game),
        receiving_tds: fmtNum(homeStats?.passing_touchdowns, 0),
        yards_per_catch: fmtNum(homeStats?.passing_yards / (homeStats?.passing_completions || 1)),
        completion_pct: fmtPct(homeStats?.passing_completion_pct / 100)
      },
      away: {
        team: away.full_name || away.name,
        receiving_yards_per_game: fmtNum(awayStats?.passing_yards_per_game),
        receiving_tds: fmtNum(awayStats?.passing_touchdowns, 0),
        yards_per_catch: fmtNum(awayStats?.passing_yards / (awayStats?.passing_completions || 1)),
        completion_pct: fmtPct(awayStats?.passing_completion_pct / 100)
      }
    };
  },

  TURNOVER_LUCK: async (bdlSport, home, away, season) => {
    try {
      const { homeStats, awayStats } = await seasonPair(bdlSport, home, away, season);

      if (!homeStats || !awayStats) {
        return { category: 'Turnover Analysis', error: 'Data unavailable — BDL returned no stats for one or both teams' };
      }

      // BDL carries takeaways, giveaways and the differential as counted
      // season fields — read them rather than rebuilding the sum. The old
      // hand-rolled version added up three field names that do not exist,
      // and `|| 0` published the result as fact (every team: 0 takeaways).
      return {
        category: 'Turnover Analysis',
        home: {
          team: home.full_name || home.name,
          takeaways: fmtNum(homeStats.misc_total_takeaways, 0),
          giveaways: fmtNum(homeStats.misc_total_giveaways, 0),
          turnover_diff: fmtNum(homeStats.misc_turnover_differential, 0),
          interceptions_made: fmtNum(homeStats.defensive_interceptions, 0),
          interceptions_thrown: fmtNum(homeStats.passing_interceptions, 0),
          fumbles_lost: fmtNum(homeStats.fumbles_lost, 0)
        },
        away: {
          team: away.full_name || away.name,
          takeaways: fmtNum(awayStats.misc_total_takeaways, 0),
          giveaways: fmtNum(awayStats.misc_total_giveaways, 0),
          turnover_diff: fmtNum(awayStats.misc_turnover_differential, 0),
          interceptions_made: fmtNum(awayStats.defensive_interceptions, 0),
          interceptions_thrown: fmtNum(awayStats.passing_interceptions, 0),
          fumbles_lost: fmtNum(awayStats.fumbles_lost, 0)
        }
      };
    } catch (err) {
      console.error(`[Stat Router] TURNOVER_LUCK error: ${err.message}`);
      return { category: 'Turnover Analysis', error: 'Data unavailable' };
    }
  },

  LATE_DOWN_EFFICIENCY: async (bdlSport, home, away, season) => {
    // Late downs (3rd & 4th) - BDL has this!
    const { homeStats, awayStats } = await seasonPair(bdlSport, home, away, season);
    
    return {
      category: 'Late Down Efficiency (3rd & 4th Down)',
      home: {
        team: home.full_name || home.name,
        third_down_pct: fmtPct(homeStats?.misc_third_down_conv_pct / 100),
        fourth_down_pct: fmtPct(homeStats?.misc_fourth_down_conv_pct / 100),
        third_down_att: fmtNum(homeStats?.misc_third_down_attempts, 0),
        third_down_made: fmtNum(homeStats?.misc_third_down_convs, 0),
        fourth_down_att: fmtNum(homeStats?.misc_fourth_down_attempts, 0),
        fourth_down_made: fmtNum(homeStats?.misc_fourth_down_convs, 0)
      },
      away: {
        team: away.full_name || away.name,
        third_down_pct: fmtPct(awayStats?.misc_third_down_conv_pct / 100),
        fourth_down_pct: fmtPct(awayStats?.misc_fourth_down_conv_pct / 100),
        third_down_att: fmtNum(awayStats?.misc_third_down_attempts, 0),
        third_down_made: fmtNum(awayStats?.misc_third_down_convs, 0),
        fourth_down_att: fmtNum(awayStats?.misc_fourth_down_attempts, 0),
        fourth_down_made: fmtNum(awayStats?.misc_fourth_down_convs, 0)
      },
      comparison: '3rd down conversion rates for both teams.',
      note: '3rd down conversion data for both teams.'
    };
  },

  FUMBLE_LUCK: async (bdlSport, home, away, season) => {
    // Fumble luck - fumbles forced vs fumbles lost (regression indicator)
    const { homeStats, awayStats } = await seasonPair(bdlSport, home, away, season);
    
    // BDL splits a team's own fumbles by where they happened; the sum is the
    // offense's total, and fumbles_lost is how many it did not get back.
    // A missing input must stay missing — the previous `|| 0` published a
    // hard zero (and a flat 50.0% recovery rate) for every NFL team.
    const fumblesTotal = (stats) => {
      const rush = stats?.rushing_fumbles;
      const rec = stats?.receiving_fumbles;
      return (rush == null && rec == null) ? null : (rush || 0) + (rec || 0);
    };
    const recoveryRate = (total, lost) =>
      (total == null || lost == null || total <= 0) ? null : (total - lost) / total;

    const homeFumblesLost = homeStats?.fumbles_lost ?? null;
    const homeFumblesTotal = fumblesTotal(homeStats);
    const homeRecoveryRate = recoveryRate(homeFumblesTotal, homeFumblesLost);

    const awayFumblesLost = awayStats?.fumbles_lost ?? null;
    const awayFumblesTotal = fumblesTotal(awayStats);
    const awayRecoveryRate = recoveryRate(awayFumblesTotal, awayFumblesLost);

    // Fumbles this defense recovered. Forced fumbles are not a BDL field.
    const homeDefRecoveries = homeStats?.fumbles_recovered ?? null;
    const awayDefRecoveries = awayStats?.fumbles_recovered ?? null;

    return {
      category: 'Fumble Luck Analysis',
      data_scope: 'Season fumbles and recoveries (forced fumbles are not available)',
      home: {
        team: home.full_name || home.name,
        off_fumbles_lost: fmtNum(homeFumblesLost, 0),
        off_fumbles_total: fmtNum(homeFumblesTotal, 0),
        off_recovery_rate: fmtPct(homeRecoveryRate),
        def_recoveries: fmtNum(homeDefRecoveries, 0),
        recovery_rate: fmtPct(homeRecoveryRate)
      },
      away: {
        team: away.full_name || away.name,
        off_fumbles_lost: fmtNum(awayFumblesLost, 0),
        off_fumbles_total: fmtNum(awayFumblesTotal, 0),
        off_recovery_rate: fmtPct(awayRecoveryRate),
        def_recoveries: fmtNum(awayDefRecoveries, 0),
        recovery_rate: fmtPct(awayRecoveryRate)
      },
      comparison: 'Fumble and turnover data for both teams.',
      note: 'Fumble and turnover data for both teams.'
    };
  },

  PASSING_EPA: async (bdlSport, home, away, season) => {
    // Passing efficiency metrics from BDL
    const { homeStats, awayStats } = await seasonPair(bdlSport, home, away, season);
    
    // Calculate passer rating components
    const homeYPA = homeStats?.net_yards_per_pass_attempt || 0;
    const homeTDPct = homeStats?.passing_touchdowns && homeStats?.passing_attempts 
      ? (homeStats.passing_touchdowns / homeStats.passing_attempts * 100) : 0;
    const homeINTPct = homeStats?.passing_interceptions && homeStats?.passing_attempts
      ? (homeStats.passing_interceptions / homeStats.passing_attempts * 100) : 0;
    
    const awayYPA = awayStats?.net_yards_per_pass_attempt || 0;
    const awayTDPct = awayStats?.passing_touchdowns && awayStats?.passing_attempts
      ? (awayStats.passing_touchdowns / awayStats.passing_attempts * 100) : 0;
    const awayINTPct = awayStats?.passing_interceptions && awayStats?.passing_attempts
      ? (awayStats.passing_interceptions / awayStats.passing_attempts * 100) : 0;
    
    return {
      category: 'Passing Efficiency',
      data_scope: 'Season passing stats (not per-play EPA)',
      home: {
        team: home.full_name || home.name,
        yards_per_attempt: fmtNum(homeYPA, 1),
        completion_pct: fmtPct(homeStats?.passing_completion_pct / 100),
        td_pct: fmtPct(homeTDPct / 100),
        int_pct: fmtPct(homeINTPct / 100),
        passing_yards_per_game: fmtNum(homeStats?.passing_yards_per_game, 0),
        passing_tds: fmtNum(homeStats?.passing_touchdowns, 0),
        interceptions: fmtNum(homeStats?.passing_interceptions, 0),
        sacks_allowed: fmtNum(homeStats?.passing_sacks, 0)
      },
      away: {
        team: away.full_name || away.name,
        yards_per_attempt: fmtNum(awayYPA, 1),
        completion_pct: fmtPct(awayStats?.passing_completion_pct / 100),
        td_pct: fmtPct(awayTDPct / 100),
        int_pct: fmtPct(awayINTPct / 100),
        passing_yards_per_game: fmtNum(awayStats?.passing_yards_per_game, 0),
        passing_tds: fmtNum(awayStats?.passing_touchdowns, 0),
        interceptions: fmtNum(awayStats?.passing_interceptions, 0),
        sacks_allowed: fmtNum(awayStats?.passing_sacks, 0)
      },
      comparison: 'Passing yards per attempt for both QBs.',
      note: 'QB passing efficiency data for both teams.'
    };
  },

  RUSHING_EPA: async (bdlSport, home, away, season) => {
    // Rushing efficiency metrics from BDL
    const { homeStats, awayStats } = await seasonPair(bdlSport, home, away, season);

    // BDL publishes rushing yards per game but not carries per game; the
    // carries and the games are both counted fields, so this is a stated
    // derivation from named inputs, not a fetched rate.
    const carriesPerGame = (stats) => {
      const att = stats?.rushing_attempts;
      const gp = stats?.games_played;
      return (att == null || !gp) ? null : att / gp;
    };

    return {
      category: 'Rushing Efficiency',
      data_scope: 'Season rushing stats (not per-play EPA)',
      home: {
        team: home.full_name || home.name,
        yards_per_carry: fmtNum(homeStats?.rushing_yards_per_rush_attempt, 1),
        rushing_yards_per_game: fmtNum(homeStats?.rushing_yards_per_game, 0),
        rushing_tds: fmtNum(homeStats?.rushing_touchdowns, 0),
        rush_attempts_per_game: fmtNum(carriesPerGame(homeStats), 1),
        longest_rush: fmtNum(homeStats?.rushing_long, 0)
      },
      away: {
        team: away.full_name || away.name,
        yards_per_carry: fmtNum(awayStats?.rushing_yards_per_rush_attempt, 1),
        rushing_yards_per_game: fmtNum(awayStats?.rushing_yards_per_game, 0),
        rushing_tds: fmtNum(awayStats?.rushing_touchdowns, 0),
        rush_attempts_per_game: fmtNum(carriesPerGame(awayStats), 1),
        longest_rush: fmtNum(awayStats?.rushing_long, 0)
      },
      comparison: 'Rushing yards per carry for both teams.',
      note: 'Rushing efficiency data for both teams.'
    };
  },

  KICKING: async (bdlSport, home, away, season) => {
    // BDL carries field goals by distance bucket and the full punting line for
    // both teams, plus the opponent mirror. This used to buy web-search prose
    // for numbers already sitting in the season row.
    const { homeStats, awayStats } = await seasonPair(bdlSport, home, away, season);

    const kickingLine = (stats) => ({
      fg_pct: fmtPct(stats?.kicking_field_goal_pct / 100),
      fg_made: fmtNum(stats?.kicking_field_goals_made, 0),
      fg_attempts: fmtNum(stats?.kicking_field_goal_attempts, 0),
      fg_40_49: `${fmtNum(stats?.kicking_field_goals_made_40_49, 0)}/${fmtNum(stats?.kicking_field_goal_attempts_40_49, 0)}`,
      fg_50_plus: `${fmtNum(stats?.kicking_field_goals_made_50, 0)}/${fmtNum(stats?.kicking_field_goal_attempts_50, 0)}`,
      long_fg: fmtNum(stats?.kicking_long_field_goal_made, 0),
      xp_pct: fmtPct(stats?.kicking_extra_point_pct / 100),
      net_punt_avg: fmtNum(stats?.punting_net_avg_punt_yards, 1),
      punts_inside_20: fmtNum(stats?.punting_punts_inside_20, 0),
      punts: fmtNum(stats?.punting_punts, 0)
    });

    return {
      category: 'Kicking & Punting',
      source: 'Ball Don\'t Lie',
      data_scope: 'Season kicking by distance bucket and punting line',
      home: { team: home.full_name || home.name, ...kickingLine(homeStats) },
      away: { team: away.full_name || away.name, ...kickingLine(awayStats) }
    };
  },

  FIELD_POSITION: async (bdlSport, home, away, season) => {
    // Average starting field position needs drive data BDL does not publish
    // per team-season. What it does publish is the return and punt-coverage
    // game that drives it — real numbers, and the opponent mirror with them.
    const { homeStats, awayStats } = await seasonPair(bdlSport, home, away, season);

    const returnLine = (stats) => ({
      yards_per_punt_return: fmtNum(stats?.returning_yards_per_punt_return, 1),
      yards_per_kick_return: fmtNum(stats?.returning_yards_per_kick_return, 1),
      return_tds: fmtNum((stats?.returning_punt_return_touchdowns || 0) + (stats?.returning_kick_return_touchdowns || 0), 0),
      own_net_punt_avg: fmtNum(stats?.punting_net_avg_punt_yards, 1),
      punts_inside_20: fmtNum(stats?.punting_punts_inside_20, 0),
      touchbacks_allowed: fmtNum(stats?.punting_touchbacks, 0),
      opp_yards_per_punt_return: fmtNum(stats?.opp_returning_yards_per_punt_return, 1),
      opp_yards_per_kick_return: fmtNum(stats?.opp_returning_yards_per_kick_return, 1),
      opp_net_punt_avg: fmtNum(stats?.opp_punting_net_avg_punt_yards, 1)
    });

    return {
      category: 'Field Position Battle',
      source: 'Ball Don\'t Lie',
      data_scope: 'Return and punt-coverage game (average starting field position itself is not available)',
      home: { team: home.full_name || home.name, ...returnLine(homeStats) },
      away: { team: away.full_name || away.name, ...returnLine(awayStats) }
    };
  },

  FOURTH_DOWN_TENDENCY: async (bdlSport, home, away, season) => {
    const { homeStats, awayStats } = await seasonPair(bdlSport, home, away, season);
    const line = (stats) => {
      const att = Number(stats?.misc_fourth_down_attempts);
      const gp = Number(stats?.games_played);
      return {
        attempts: fmtNum(att, 0),
        conversions: fmtNum(stats?.misc_fourth_down_convs, 0),
        conversion_pct: fmtPct(stats?.misc_fourth_down_conv_pct / 100),
        attempts_per_game: (Number.isFinite(att) && gp) ? Number((att / gp).toFixed(2)) : 'N/A',
        opp_attempts: fmtNum(stats?.opp_misc_fourth_down_attempts, 0),
        opp_conversion_pct: fmtPct(stats?.opp_misc_fourth_down_conv_pct / 100)
      };
    };
    return {
      category: 'Fourth Down Tendency',
      source: 'Ball Don\'t Lie',
      data_scope: 'Attempts, conversions and rate. Attempts per game is the aggressiveness read; the conversion rate is how it has gone. Situation (score, field position, time) behind each attempt is not in this feed.',
      home: { team: home.full_name || home.name, ...line(homeStats) },
      away: { team: away.full_name || away.name, ...line(awayStats) }
    };
  },

  SCHEDULE_CONTEXT: async (bdlSport, home, away, season) => {
    console.log(`[Stat Router] Fetching SCHEDULE_CONTEXT for ${away.name} @ ${home.name}`);

    if (bdlSport !== 'americanfootball_nfl') {
      return { category: 'Schedule Context', note: 'Only available for NFL' };
    }

    try {
      const homeId = home.id || home.teamId;
      const awayId = away.id || away.teamId;
      // Use the same full-season query shape as the scout report. That makes
      // both sides cache hits during research instead of two new BDL calls.
      const [homeGames, awayGames] = await Promise.all([
        homeId
          ? ballDontLieService.getGames('americanfootball_nfl', { team_ids: [homeId], seasons: [season], per_page: 100 }).catch(() => [])
          : Promise.resolve([]),
        awayId
          ? ballDontLieService.getGames('americanfootball_nfl', { team_ids: [awayId], seasons: [season], per_page: 100 }).catch(() => [])
          : Promise.resolve([])
      ]);

      // ET, never UTC (Aug 19 sweep — the recurring class): toISOString
      // rolls past midnight at 8 PM ET, misfiling tonight's game.
      const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
      const formatSchedule = (games, teamName) => {
        const sorted = [...(games || [])].sort((a, b) => new Date(a.date || a.datetime) - new Date(b.date || b.datetime));
        const past = sorted.filter(g => g.status === 'Final').slice(-2);
        const future = sorted.filter(g => g.status !== 'Final' && (g.date || g.datetime) > today).slice(0, 2);
        const lines = [`${teamName}:`];
        if (past.length) lines.push(`  Recent: ${past.map(g => { const opp = g.home_team?.id === (home.id || away.id) ? g.visitor_team?.name || g.away_team?.name : g.home_team?.name; return `vs ${opp} (${g.home_team_score ?? '?'}-${g.visitor_team_score ?? g.away_score ?? '?'})`; }).join(', ')}`);
        if (future.length) lines.push(`  Upcoming: ${future.map(g => { const opp = g.home_team?.id === (home.id || away.id) ? g.visitor_team?.name || g.away_team?.name : g.home_team?.name; return `vs ${opp} (${(g.date || g.datetime || '').split('T')[0]})`; }).join(', ')}`);
        return lines.join('\n');
      };

      return {
        category: 'Schedule Context',
        source: 'BDL API (NFL schedule)',
        home: { team: home.full_name || home.name },
        away: { team: away.full_name || away.name },
        homeValue: formatSchedule(homeGames, home.full_name || home.name),
        awayValue: formatSchedule(awayGames, away.full_name || away.name),
        note: 'Recent and upcoming opponents from BDL schedule.'
      };
    } catch (error) {
      console.error(`[Stat Router] Error fetching SCHEDULE_CONTEXT:`, error.message);
      return { category: 'Schedule Context', error: 'Data unavailable' };
    }
  },

  DIVISION_RECORD: async (bdlSport, home, away, season) => {
    console.log(`[Stat Router] Fetching DIVISION_RECORD for ${away.name} @ ${home.name}`);
    
    try {
      const standings = await ballDontLieService.getStandingsGeneric(bdlSport, { season });
      
      const homeSt = standings?.find(s => s.team?.id === home.id);
      const awaySt = standings?.find(s => s.team?.id === away.id);
      
      const sameDivision = homeSt?.team?.division === awaySt?.team?.division;
      
      return {
        category: 'Division Record',
        source: 'Ball Don\'t Lie API',
        home: {
          team: home.full_name || home.name,
          division: homeSt?.team?.division || 'N/A',
          division_record: homeSt?.division_record || 'N/A',
          conference_record: homeSt?.conference_record || 'N/A'
        },
        away: {
          team: away.full_name || away.name,
          division: awaySt?.team?.division || 'N/A',
          division_record: awaySt?.division_record || 'N/A',
          conference_record: awaySt?.conference_record || 'N/A'
        },
        is_division_game: sameDivision,
        comparison: sameDivision
          ? 'Division game — division and overall records for both teams.'
          : 'Non-division game — division and overall records for both teams.',
        note: 'Division and overall records provided for comparison.'
      };
    } catch (error) {
      console.error(`[Stat Router] Error fetching DIVISION_RECORD:`, error.message);
      return { category: 'Division Record', error: 'Data unavailable' };
    }
  },

  
  // ===== DERIVED STATS (single-value for clean display) =====
  PASSING_TDS: async (bdlSport, home, away, season) => {
    const { homeStats, awayStats } = await seasonPair(bdlSport, home, away, season);
    
    return {
      category: 'Passing Touchdowns',
      home: {
        team: home.full_name || home.name,
        passing_tds: fmtNum(homeStats?.passing_touchdowns, 0)
      },
      away: {
        team: away.full_name || away.name,
        passing_tds: fmtNum(awayStats?.passing_touchdowns, 0)
      }
    };
  },

  INTERCEPTIONS: async (bdlSport, home, away, season) => {
    const { homeStats, awayStats } = await seasonPair(bdlSport, home, away, season);
    
    return {
      category: 'Interceptions Thrown',
      home: {
        team: home.full_name || home.name,
        interceptions: fmtNum(homeStats?.passing_interceptions, 0)
      },
      away: {
        team: away.full_name || away.name,
        interceptions: fmtNum(awayStats?.passing_interceptions, 0)
      }
    };
  },

  RUSHING_TDS: async (bdlSport, home, away, season) => {
    const { homeStats, awayStats } = await seasonPair(bdlSport, home, away, season);
    
    return {
      category: 'Rushing Touchdowns',
      home: {
        team: home.full_name || home.name,
        rushing_tds: fmtNum(homeStats?.rushing_touchdowns, 0)
      },
      away: {
        team: away.full_name || away.name,
        rushing_tds: fmtNum(awayStats?.rushing_touchdowns, 0)
      }
    };
  },

  TOTAL_TDS: async (bdlSport, home, away, season) => {
    const { homeStats, awayStats } = await seasonPair(bdlSport, home, away, season);
    
    const homeTotalTds = (homeStats?.passing_touchdowns || 0) + (homeStats?.rushing_touchdowns || 0);
    const awayTotalTds = (awayStats?.passing_touchdowns || 0) + (awayStats?.rushing_touchdowns || 0);
    
    return {
      category: 'Total Touchdowns',
      home: {
        team: home.full_name || home.name,
        total_tds: homeTotalTds.toString()
      },
      away: {
        team: away.full_name || away.name,
        total_tds: awayTotalTds.toString()
      }
    };
  },

  PASSING_YPG: async (bdlSport, home, away, season) => {
    const { homeStats, awayStats } = await seasonPair(bdlSport, home, away, season);
    
    return {
      category: 'Passing Yards Per Game',
      home: {
        team: home.full_name || home.name,
        passing_ypg: fmtNum(homeStats?.passing_yards_per_game)
      },
      away: {
        team: away.full_name || away.name,
        passing_ypg: fmtNum(awayStats?.passing_yards_per_game)
      }
    };
  },


  // ===== WEATHER (NFL/NCAAF) - Returns weather data for Gary to evaluate =====
  /**
   * Kickoff weather from the stadium's own coordinates.
   *
   * Was a grounded web search asking a model what the weather was — pinned to
   * "today" rather than kickoff, unverifiable, and slow. Open-Meteo is keyless
   * and returns the actual forecast hour. Roof state comes from the venue
   * table, so a dome says dome instead of reporting a wind that never reaches
   * the field.
   */
  WEATHER: async (bdlSport, home, away, season, options = {}) => {
    const homeName = home.full_name || home.name;
    const awayName = away.full_name || away.name;

    if (bdlSport !== 'americanfootball_nfl' && bdlSport !== 'americanfootball_ncaaf') {
      return {
        category: 'Weather',
        note: 'Weather is a football lane.',
        home: { team: homeName },
        away: { team: awayName }
      };
    }

    // College venues are not in the table (130+ FBS stadiums); CollegeFootballData
    // publishes them with elevation and would close this. Say so rather than
    // guessing a coordinate.
    // NFL comes from the local table; NCAAF venues come from CFBD, which
    // publishes coordinates, elevation and dome for all 136 FBS teams in one
    // cached request. Before that, college weather had to decline outright.
    let venue = bdlSport === 'americanfootball_nfl' ? nflVenueFor(homeName) : null;
    if (!venue && bdlSport === 'americanfootball_ncaaf') {
      const teams = await getFbsTeams(season).catch(() => null);
      venue = teams ? fbsVenueFor(teams, homeName) : null;
    }
    if (!venue) {
      return {
        category: 'Weather',
        source: 'NOT AVAILABLE',
        reason: bdlSport === 'americanfootball_ncaaf'
          ? `No CFBD venue matched "${homeName}" (it may be an FCS school, which the FBS teams feed does not cover). Coordinates are never guessed.`
          : `No venue entry for ${homeName}.`,
        note: 'Do not estimate conditions. Report weather as unavailable for this game.',
        home: { team: homeName },
        away: { team: awayName }
      };
    }

    const base = {
      category: 'Weather & Environment',
      source: 'Open-Meteo + venue table',
      venue: venue.venue,
      roof: venue.roof,
      surface: venue.surface,
      home: { team: homeName },
      away: { team: awayName }
    };

    if (venue.roof === 'dome') {
      return { ...base, conditions: 'Indoor — fixed roof. Weather does not reach the field.' };
    }

    const kickoff = options?.game?.commence_time || options?.gameTime || null;
    if (!kickoff) {
      return {
        ...base,
        conditions: 'Kickoff time not supplied to this lane, so no hour-specific forecast was fetched.',
        note: venue.roof === 'retractable'
          ? 'Retractable roof — whether it is open is a game-day decision not known here.'
          : undefined
      };
    }

    const weather = await getKickoffWeather(venue, kickoff);
    if (!weather) {
      return { ...base, conditions: 'Forecast lookup failed for the kickoff hour.' };
    }
    if (weather.unavailable) {
      // Not a fault — the game is simply too far out to forecast.
      return {
        ...base,
        conditions: 'No forecast yet for this kickoff.',
        reason: weather.reason,
        note: 'Weather is genuinely unknown at this range. Do not estimate it; a later run closer to kickoff will carry it.'
      };
    }

    return {
      ...base,
      // A retractable roof may be shut: report the outdoor forecast AND the
      // fact that it might not apply, rather than picking one and being wrong.
      roof_note: venue.roof === 'retractable'
        ? 'Retractable roof — the open/closed decision is made on game day and is not known here, so treat the outdoor forecast as conditional.'
        : (venue.roof === 'open_or_unconfirmed'
          ? 'CFBD reports no dome for this venue. It publishes no retractable flag, so a retractable roof would look the same as an open one here.'
          : undefined),
      temperature_f: weather.temperature_f,
      feels_like_f: weather.feels_like_f,
      wind: windDescription(weather),
      wind_mph: weather.wind_mph,
      wind_gust_mph: weather.wind_gust_mph,
      wind_direction: weather.wind_direction,
      precip_chance_pct: weather.precip_chance_pct,
      conditions: weather.conditions,
      humidity_pct: weather.humidity_pct,
      elevation_ft: Number.isFinite(weather.elevation_m) ? Math.round(weather.elevation_m * 3.28084) : null,
      forecast_provenance: weather.provenance
    };
  },

  QB_WEATHER_HISTORY: async (bdlSport, home, away, season, options = {}) => {
    // Only applicable for NFL
    if (bdlSport !== 'americanfootball_nfl') {
      return {
        category: 'QB Weather History',
        note: 'Only available for NFL games',
        home: { team: home.full_name || home.name },
        away: { team: away.full_name || away.name }
      };
    }

    console.log(`[Stat Router] Fetching QB_WEATHER_HISTORY for ${away.name} @ ${home.name}`);

    try {
      // First, get weather for the game via grounded search
      const dateStr = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
      const weather = await getGroundedWeather(
        home.full_name || home.name,
        away.full_name || away.name,
        dateStr
      );

      if (!weather || weather.isDome) {
        return {
          category: 'QB Weather History',
          note: weather?.isDome ? 'Indoor/dome stadium.' : 'Weather data unavailable.',
          home: { team: home.full_name || home.name },
          away: { team: away.full_name || away.name },
          weather_conditions: weather?.isDome ? 'Indoor' : 'Unknown'
        };
      }

      // Check if weather is adverse enough to matter
      const temp = weather.temperature;
      const windStr = weather.wind || '';
      const windSpeed = parseInt((windStr.match(/(\d+)/) || [])[1]) || 0;
      const conditions = (weather.conditions || '').toLowerCase();
      const isAdverse = (temp && temp < 40) || 
                        (windSpeed > 15) || 
                        conditions.includes('snow') || 
                        conditions.includes('rain');

      if (!isAdverse) {
        return {
          category: 'QB Weather History',
          note: 'Weather conditions are normal.',
          home: { team: home.full_name || home.name },
          away: { team: away.full_name || away.name },
          weather_conditions: `${temp}°F, ${windStr}, ${weather.conditions}`,
          impact: 'minimal'
        };
      }

      // Use grounded search for QB weather performance history
      const qbQuery = `NFL QB weather performance history for ${away.full_name || away.name} @ ${home.full_name || home.name}:

Weather conditions: ${temp}°F, ${windStr}, ${conditions}

For each team's starting QB:
1. Name of current starting QB
2. Career games in similar conditions (cold/snow/rain/wind)
3. Career record in adverse weather
4. Completion percentage in cold/adverse weather
5. Stats in adverse conditions vs normal conditions

Be factual with historical stats where available.`;

      const qbResult = await groundedWebSearch(qbQuery, { temperature: 1.0, maxTokens: 1500 });

      return {
        category: 'QB Cold/Adverse Weather History',
        weather_conditions: `${temp}°F, ${windStr}, ${weather.conditions}`,
        home: {
          team: home.full_name || home.name,
          analysis: qbResult?.success ? qbResult.data : 'Weather analysis unavailable'
        },
        away: {
          team: away.full_name || away.name,
          analysis: qbResult?.success ? qbResult.data : 'Weather analysis unavailable'
        },
        note: 'Historical QB performance in similar weather conditions via grounded search'
      };
    } catch (error) {
      console.error(`[Stat Router] Error fetching QB weather history:`, error.message);
      return {
        category: 'QB Weather History',
        error: error.message,
        home: { team: home.full_name || home.name },
        away: { team: away.full_name || away.name },
        note: 'Unable to fetch QB weather performance data'
      };
    }
  },


  /**
   * What actually happened in the most recent game.
   *
   * MLB hands Gary real journalism — a headline and ~4,500 characters of
   * written recap. Football has no free equivalent, so this reconstructs the
   * account from play-by-play: the scoring, the plays that actually moved the
   * result, and whether the game was ever decided before the whistle.
   *
   * Deliberately NOT the transcript. A game is ~170 plays and handing all of
   * them over buries the story in noise — the beats are the story.
   */
  NFL_GAME_STORY: async (bdlSport, home, away, season) => {
    const [h, a] = await Promise.all([
      latestGameNarrative(bdlSport, home.id, season).catch(() => null),
      latestGameNarrative(bdlSport, away.id, season).catch(() => null)
    ]);
    const shape = (n, team) => {
      if (!n) return { team, note: 'No completed game or play-by-play on file.' };
      return {
        team,
        as_written: n.headline || 'No written headline on file for this game.',
        scoring: n.scoring,
        turning_points: n.turning_points,
        stopped_being_a_contest: n.stopped_being_a_contest,
        yards_per_play_by_team: n.yards_per_play_by_team
      };
    };
    return {
      category: 'Last Game — What Happened',
      source: 'Ball Don\'t Lie play-by-play',
      data_scope: 'The most recent completed game told as an account rather than a box score: the scoring, the plays that swung win probability most, and whether the result was ever settled early. Yards per play is split competitive-vs-after-decided so garbage-time production cannot pass for form.',
      home: shape(h, home.full_name || home.name),
      away: shape(a, away.full_name || away.name)
    };
  },

  // ═══════════════════════════════════════════════════════════════════════
  // SPORT-SPECIFIC OVERRIDES (Aug 24 2026 audit)
  //
  // These names are owned by the NBA fetcher map. The cross-sport guard was
  // correctly refusing them during football runs — but the NFL factor
  // checklist still asked for them, so INJURIES, RECENT_FORM,
  // TURNOVER_MARGIN, HOME_AWAY_SPLITS and VARIANCE_CONSISTENCY returned
  // "belongs to NBA" on every game. Defining the NFL_-prefixed form gives
  // football its own implementation through the dispatcher's existing
  // sport-specific lookup, without weakening the guard for anyone.
  // ═══════════════════════════════════════════════════════════════════════

  NFL_TURNOVER_MARGIN: async (bdlSport, home, away, season) => {
    return nflFetchers.TURNOVER_LUCK(bdlSport, home, away, season);
  },

  NFL_HOME_AWAY_SPLITS: async (bdlSport, home, away, season) => {
    const [homeResults, awayResults] = await Promise.all([
      loadTeamResults(bdlSport, home.id, season),
      loadTeamResults(bdlSport, away.id, season)
    ]);
    const homeSplit = homeAwaySplit(homeResults);
    const awaySplit = homeAwaySplit(awayResults);
    return {
      category: 'Home/Away Splits',
      data_scope: 'Completed games this season, split by venue',
      home: { team: home.full_name || home.name, at_home: homeSplit.home, on_road: homeSplit.away },
      away: { team: away.full_name || away.name, at_home: awaySplit.home, on_road: awaySplit.away }
    };
  },

  NFL_VARIANCE_CONSISTENCY: async (bdlSport, home, away, season) => {
    const [homeResults, awayResults] = await Promise.all([
      loadTeamResults(bdlSport, home.id, season),
      loadTeamResults(bdlSport, away.id, season)
    ]);
    return {
      category: 'Margin Profile / Consistency',
      data_scope: 'Final margins of completed games — a record built on one-score games reads differently from the same record built on blowouts',
      home: { team: home.full_name || home.name, ...(marginProfile(homeResults) || { note: 'No completed games found' }) },
      away: { team: away.full_name || away.name, ...(marginProfile(awayResults) || { note: 'No completed games found' }) }
    };
  },

  NFL_INJURIES: async (bdlSport, home, away, season) => {
    const injuries = await ballDontLieService.getNflPlayerInjuries([home.id, away.id]);
    const forTeam = (teamId) => {
      const rows = (injuries || []).filter((i) => Number(i?.player?.team?.id) === Number(teamId));
      const byStatus = (status) => rows
        .filter((i) => String(i?.status || '').toUpperCase() === status)
        .map((i) => `${i.player?.first_name || ''} ${i.player?.last_name || ''}`.trim()
          + (i.player?.position_abbreviation ? ` (${i.player.position_abbreviation})` : ''));
      return {
        total_listed: rows.length,
        out: byStatus('OUT'),
        doubtful: byStatus('DOUBTFUL'),
        questionable: byStatus('QUESTIONABLE')
      };
    };
    // The practice report is what makes a status readable. "Questionable" on
    // its own is close to noise — in 2025, 321 Questionable players had
    // practiced fully and only 171 had not practiced at all. BDL cannot tell
    // those apart; nflverse can.
    const [homePractice, awayPractice] = await Promise.all([
      getPracticeReport(home.full_name || home.name, season).catch(() => null),
      getPracticeReport(away.full_name || away.name, season).catch(() => null)
    ]);
    const practiceBlock = (p) => {
      if (!p) return { note: 'Practice report lookup failed.' };
      if (p.unavailable) return { note: p.reason };
      return {
        week: p.week,
        report: p.players.map((x) => (
          `${x.name}${x.position ? ` (${x.position})` : ''} — ${x.game_status || 'no game status'}, practiced ${x.practice || 'unknown'}${x.injury ? ` [${x.injury}]` : ''}`
        ))
      };
    };

    return {
      category: 'Injury Report',
      data_scope: 'BDL official injury feed (status + comment) PLUS the nflverse practice report (DNP / Limited / Full). The inactives list at 90 minutes before kickoff is still the only certainty about who dresses, and is not available here.',
      home: {
        team: home.full_name || home.name,
        ...forTeam(home.id),
        practice_report: practiceBlock(homePractice)
      },
      away: {
        team: away.full_name || away.name,
        ...forTeam(away.id),
        practice_report: practiceBlock(awayPractice)
      }
    };
  },

  /**
   * Who is ACTUALLY on the field. A depth chart says who is listed; snap share
   * says who plays, and by how much. A "starter" at 38% and a backup at 62% is
   * a fact no roster ordering carries.
   */
  NFL_SNAP_SHARE: async (bdlSport, home, away, season) => {
    const [h, a] = await Promise.all([
      getSnapShare(home.full_name || home.name, season).catch(() => null),
      getSnapShare(away.full_name || away.name, season).catch(() => null)
    ]);
    const block = (s, team) => {
      if (!s) return { team, note: 'Snap-count lookup failed.' };
      if (s.unavailable) return { team, note: s.reason };
      return { team, week: s.week, opponent: s.opponent, offense: s.offense, defense: s.defense };
    };
    return {
      category: 'Snap Share',
      source: 'nflverse',
      data_scope: 'Snap percentages from the most recent completed game — usage, not depth-chart position.',
      home: block(h, home.full_name || home.name),
      away: block(a, away.full_name || away.name)
    };
  },

  NFL_SPECIAL_TEAMS: async (bdlSport, home, away, season) => {
    // SPECIAL_TEAMS is owned by the NHL map, so the guard refused it on every
    // football run. BDL's NFL season row carries the whole unit.
    const kicking = await nflFetchers.KICKING(bdlSport, home, away, season);
    const fieldPosition = await nflFetchers.FIELD_POSITION(bdlSport, home, away, season);
    return {
      category: 'Special Teams',
      source: 'Ball Don\'t Lie',
      home: { team: home.full_name || home.name, kicking: kicking.home, return_game: fieldPosition.home },
      away: { team: away.full_name || away.name, kicking: kicking.away, return_game: fieldPosition.away }
    };
  },

  /**
   * Game-by-game lines for each side's leading passer, rusher and receiver.
   * The checklist has asked for this since the NFL factor map was written and
   * it never had a fetcher — the season totals it fell back on cannot show
   * whether a number came from four steady weeks or one outlier.
   */
  NFL_PLAYER_GAME_LOGS: async (bdlSport, home, away, season) => {
    const leadersFor = async (team) => {
      const rows = await ballDontLieService.getNflSeasonStatsByTeam(team.id, season) || [];
      const topBy = (field) => rows
        .filter((r) => Number(r?.[field]) > 0)
        .sort((a, b) => Number(b[field]) - Number(a[field]))[0] || null;
      const picks = [
        ['passer', topBy('passing_yards')],
        ['rusher', topBy('rushing_yards')],
        ['receiver', topBy('receiving_yards')]
      ];
      return picks
        .filter(([, row]) => row?.player?.id)
        .map(([role, row]) => ({
          role,
          id: row.player.id,
          name: `${row.player.first_name || ''} ${row.player.last_name || ''}`.trim(),
          position: row.player.position_abbreviation || row.player.position || null
        }));
    };

    // The game ledger and league ranks turn a stat line into an account of
    // the game it came from: what the score was, whether he was chasing it,
    // and how good the defense he did it against actually was.
    const [homeLeaders, awayLeaders, homeGames, awayGames, league] = await Promise.all([
      leadersFor(home), leadersFor(away),
      loadTeamResults(bdlSport, home.id, season).catch(() => []),
      loadTeamResults(bdlSport, away.id, season).catch(() => []),
      loadLeagueContext(bdlSport, season).catch(() => null)
    ]);
    const ledgerFor = (results) => new Map((results || []).map((r) => [String(r.gameId), r]));
    const homeLedger = ledgerFor(homeGames);
    const awayLedger = ledgerFor(awayGames);
    const allIds = [...homeLeaders, ...awayLeaders].map((p) => p.id);
    const logs = allIds.length
      ? await ballDontLieService.getNflPlayerGameLogsBatch(allIds, season, 5)
      : {};

    // Render each game as the line that role is actually judged on. Handing
    // over the raw summary object printed every stat family for every player,
    // so a running back's log carried "pass_yds: 0, pass_tds: 0" on all five
    // rows — noise Gary has to read past to find the carries.
    const statLine = (role, g, ledger) => {
      const parts = [];
      if (role === 'passer' || Number(g.pass_att)) {
        parts.push(`${g.pass_comp ?? 0}/${g.pass_att ?? 0}, ${g.pass_yds ?? 0} pass yds, ${g.pass_tds ?? 0} TD, ${g.ints ?? 0} INT`);
      }
      if (role === 'rusher' || Number(g.rush_att)) {
        parts.push(`${g.rush_att ?? 0} car, ${g.rush_yds ?? 0} rush yds, ${g.rush_tds ?? 0} TD`);
      }
      if (role === 'receiver' || Number(g.targets) || Number(g.receptions)) {
        parts.push(`${g.receptions ?? 0}/${g.targets ?? 0} tgt, ${g.rec_yds ?? 0} rec yds, ${g.rec_tds ?? 0} TD`);
      }
      const where = g.isHome === undefined ? '' : (g.isHome ? 'vs ' : '@ ');
      const opponent = g.opponent ? `${where}${g.opponent}` : 'opponent not carried';

      // What the game actually was. A 331-yard game in a blowout loss where he
      // was throwing from two scores down is not the same evidence as 331 in a
      // game he controlled, and the raw line cannot tell them apart.
      const tail = [];
      const led = ledger.get(String(g.gameId));
      if (led) {
        tail.push(`team ${led.won ? 'won' : 'lost'} ${led.scored}-${led.allowed}`);
        if (led.shapeKnown) {
          const ht = led.halftimeFor === led.halftimeAgainst
            ? `tied ${led.halftimeFor}-${led.halftimeAgainst} at half`
            : `${led.halftimeFor > led.halftimeAgainst ? 'led' : 'trailed'} ${led.halftimeFor}-${led.halftimeAgainst} at half`;
          tail.push(ht);
        }
        const oppLine = league ? opponentQualityLine(league, led.opponentId) : null;
        if (oppLine) tail.push(oppLine);
      }
      const context = tail.length ? ` — ${tail.join(', ')}` : '';
      return `${opponent}: ${parts.join('; ') || 'no offensive stats'}${context}`;
    };

    const render = (leaders, ledger) => leaders.map((p) => {
      const summary = logs?.[p.id];
      if (!summary?.games?.length) {
        return { player: p.name, role: p.role, position: p.position, last_5: 'No game logs returned' };
      }
      return {
        player: p.name,
        role: p.role,
        position: p.position,
        games_used: summary.gamesAnalyzed ?? summary.games.length,
        last_5: summary.games.map((g) => statLine(p.role, g, ledger))
      };
    });

    return {
      category: 'Player Game Logs',
      source: 'Ball Don\'t Lie',
      data_scope: 'Last 5 games for each side\'s leading passer, rusher and receiver, each line carrying the game it came from — the result, whether the team led or trailed at half, and how good that opponent was',
      home: { team: home.full_name || home.name, players: render(homeLeaders, homeLedger) },
      away: { team: away.full_name || away.name, players: render(awayLeaders, awayLedger) }
    };
  }

};

/**
 * THE LEDGER-BACKED TOKENS (Aug 25 2026).
 *
 * Fifteen tokens moved out of this file and into footballAdvancedTokens.js
 * when the season play ledger landed. Six of them used to decline outright,
 * four were named after a metric they did not compute, and one was a
 * red-zone lane containing no red-zone data.
 *
 * They are merged rather than defined inline so this file stays about BDL's
 * season row and that file stays about the play ledger. The merge happens
 * BEFORE the season-sample wrapper below, so the ledger tokens are wrapped
 * too and carry the same provenance stamp as everything else.
 */
Object.assign(nflFetchers, footballAdvancedTokens);



/**
 * SAMPLE PROVENANCE (founder standard, Aug 25 2026).
 *
 * "If we are going to show X data point then nobody should be able to poke
 * holes in it — someone shouldn't be able to say but when was that game, or
 * who played in that game, or any context relevant beyond what the data point
 * is saying."
 *
 * A season rate like "5.4 yards per play" says nothing about how much football
 * it rests on. Week 2 and Week 17 print identically. Every season-stat lane
 * now carries the games behind it and the season it belongs to, so a thin
 * sample announces itself instead of arriving with the authority of a full
 * year. Stamped in one place rather than in twenty-four return statements.
 *
 * getTeamSeasonStats is cached, so this costs no extra round trip.
 */
const SEASON_SAMPLE_TOKENS = [
  'OFFENSIVE_EPA', 'DEFENSIVE_EPA', 'QB_STATS', 'RB_STATS',
  'SUCCESS_RATE_OFFENSE', 'SUCCESS_RATE_DEFENSE', 'EXPLOSIVE_PLAYS',
  'PRESSURE_RATE', 'RED_ZONE_DEFENSE', 'WR_TE_STATS', 'DEFENSIVE_PLAYMAKERS',
  'TURNOVER_LUCK', 'LATE_DOWN_EFFICIENCY', 'EXPLOSIVE_ALLOWED', 'FUMBLE_LUCK',
  'PASSING_EPA', 'RUSHING_EPA', 'KICKING', 'FIELD_POSITION', 'PASSING_TDS',
  'INTERCEPTIONS', 'RUSHING_TDS', 'TOTAL_TDS', 'PASSING_YPG', 'FOURTH_DOWN_TENDENCY'
];

export function seasonSampleTokens() {
  return [...SEASON_SAMPLE_TOKENS];
}

for (const token of SEASON_SAMPLE_TOKENS) {
  const inner = nflFetchers[token];
  if (typeof inner !== 'function') continue;
  nflFetchers[token] = async (bdlSport, home, away, season, options) => {
    const result = await inner(bdlSport, home, away, season, options);
    if (!result || typeof result !== 'object' || result.error) return result;
    try {
      const { homeStats, awayStats } = await seasonPair(bdlSport, home, away, season);
      const gp = (stats) => {
        const n = Number(stats?.games_played);
        return Number.isFinite(n) && n > 0 ? n : null;
      };
      const homeGp = gp(homeStats);
      const awayGp = gp(awayStats);
      if (homeGp === null && awayGp === null) return result;
      const label = (name, n) => `${name}: ${n === null ? 'games played not reported' : `${n} game${n === 1 ? '' : 's'}`}`;
      result.sample = `Season totals — ${label(home.full_name || home.name, homeGp)}, `
        + `${label(away.full_name || away.name, awayGp)}${season ? ` (${season} season)` : ''}`;
    } catch {
      // Provenance is context, never a reason to lose the stat itself.
    }
    return result;
  };
}
