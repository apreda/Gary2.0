/** NBA stat tools: How each team has been playing: recent form, efficiency trend, quarters and halves, margins, minutes, meetings. (split from nbaFetchers.js, Oct 13 2026). */
import { formatRecentGames, isGameCompleted } from '../statRouterCommon.js';
import { ballDontLieService } from '../../../../ballDontLieService.js';
import { providerGameInstant, providerGameDateLabel } from '../../../../../utils/dateUtils.js';
import { recentSeasonGames } from './recentSeasonGames.js';

export const formAndTrendsFetchers = {


  // ===== POINT DIFFERENTIAL TREND (REAL DATA - L5 vs Season) =====
  EFFICIENCY_TREND: async (bdlSport, home, away, season, options) => {
    console.log(`[Stat Router] Fetching EFFICIENCY_TREND (point differential) for ${away.name} @ ${home.name}`);
    
    try {
      // Two windows per team: a 45-day recent window whose single page is
      // guaranteed to contain the LATEST games (honest L5/L10), plus the
      // season window for the season average — merged and deduped. The old
      // single full-season fetch with per_page:30 returned the FIRST 30
      // games (Oct-Dec) and labeled them "L5/L10" (June 3 2026 audit).
      // BDL season=2025 means 2025-26 season, which starts Oct 2025.
      const seasonStart = new Date(season, 9, 1);
      const today = new Date();
      const recentStart = new Date();
      recentStart.setDate(recentStart.getDate() - 45);
      const fmt = (d) => d.toISOString().split('T')[0];

      const fetchGames = (teamId, from) => ballDontLieService.getGames(bdlSport, {
        team_ids: [teamId],
        start_date: fmt(from),
        end_date: fmt(today),
        per_page: 100
      });

      const [homeRecent, awayRecent, homeSeason, awaySeason] = await Promise.all([
        fetchGames(home.id, recentStart),
        fetchGames(away.id, recentStart),
        fetchGames(home.id, seasonStart),
        fetchGames(away.id, seasonStart)
      ]);

      const mergeGames = (a, b) => {
        const seen = new Set();
        return [...(a || []), ...(b || [])].filter(g => {
          if (!g?.id || seen.has(g.id)) return false;
          seen.add(g.id);
          return true;
        });
      };
      const homeGames = mergeGames(homeRecent, homeSeason);
      const awayGames = mergeGames(awayRecent, awaySeason);
      
      // Calculate efficiency trend (point differential)
      const calcEfficiencyTrend = (games, teamId) => {
        const completed = (games || [])
          .filter(g => {
            const hs = g.home_team_score || g.home_score || 0;
            const as = g.visitor_team_score || g.away_score || 0;
            return hs > 0 || as > 0;
          })
          .sort((a, b) => new Date(b.date || b.game_date) - new Date(a.date || a.game_date));
        
        if (completed.length < 5) return null;
        
        // Calculate point differential for each game
        const margins = completed.map(g => {
          const isHome = (g.home_team?.id || g.home_team_id) === teamId;
          const teamScore = isHome ? (g.home_team_score || g.home_score) : (g.visitor_team_score || g.away_score);
          const oppScore = isHome ? (g.visitor_team_score || g.away_score) : (g.home_team_score || g.home_score);
          return teamScore - oppScore;
        });
        
        const l5Margins = margins.slice(0, 5);
        const l10Margins = margins.slice(0, 10);
        const seasonMargins = margins;
        
        const avg = (arr) => arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
        
        const l5Avg = avg(l5Margins);
        const l10Avg = avg(l10Margins);
        const seasonAvg = avg(seasonMargins);
        
        return {
          l5_margin: `${l5Avg > 0 ? '+' : ''}${l5Avg.toFixed(1)}`,
          l10_margin: `${l10Avg > 0 ? '+' : ''}${l10Avg.toFixed(1)}`,
          season_margin: `${seasonAvg > 0 ? '+' : ''}${seasonAvg.toFixed(1)}`,
          games_analyzed: completed.length
        };
      };
      
      const homeTrend = calcEfficiencyTrend(homeGames, home.id);
      const awayTrend = calcEfficiencyTrend(awayGames, away.id);
      
      return {
        category: 'Point Differential Trend (L5 vs L10 vs Season)',
        source: 'Ball Don\'t Lie API (calculated)',
        data_scope: 'Point differential trends (not pace-adjusted efficiency)',
        home: {
          team: home.full_name || home.name,
          ...homeTrend
        },
        away: {
          team: away.full_name || away.name,
          ...awayTrend
        },
        comparison: 'Recent point differential trends for both teams.',
        note: 'Raw point differentials for both teams.'
      };
    } catch (error) {
      console.error(`[Stat Router] Error fetching EFFICIENCY_TREND:`, error.message);
      return {
        category: 'Efficiency Trend',
        error: 'Data unavailable',
        home: { team: home.full_name || home.name },
        away: { team: away.full_name || away.name }
      };
    }
  },


  // ===== MINUTES TREND (Top 5 MPG per team from BDL season averages) =====
  MINUTES_TREND: async (bdlSport, home, away, season, options) => {
    console.log(`[Stat Router] Fetching MINUTES_TREND for ${away.name} @ ${home.name}`);

    if (bdlSport !== 'basketball_nba') {
      return { category: 'Minutes Trend', note: 'Only available for NBA' };
    }

    if (!season) {
      const month = new Date().getMonth() + 1;
      const year = new Date().getFullYear();
      season = month >= 10 ? year : year - 1;
    }

    try {
      // Fetch active players for both teams, then get season averages with MPG
      // The whole active roster and its season lines through the shared, retried service (audit, Oct 13 2026: the
      // first 15 players in API order left out rotation players, and a 429 read as 'Data unavailable').
      const fetchTopMinutesPlayers = async (teamId) => {
        const players = await ballDontLieService.getActivePlayersComplete('basketball_nba', teamId);
        if (!players?.length) return [];
        const playerStats = await ballDontLieService.getNbaSeasonAverages({ type: 'base', season, player_ids: players.map((p) => p.id) });

        // Sort by minutes descending, take full rotation
        return (playerStats || [])
          .filter(ps => ps.stats?.min != null && parseFloat(ps.stats.min) > 0)
          .sort((a, b) => parseFloat(b.stats.min) - parseFloat(a.stats.min))
          .slice(0, 10)
          .map(ps => ({
            name: `${ps.player?.first_name || ''} ${ps.player?.last_name || ''}`.trim(),
            mpg: parseFloat(ps.stats.min).toFixed(1),
            ppg: (ps.stats?.pts || 0).toFixed(1),
            games_played: ps.stats?.gp ?? 'N/A'
          }));
      };

      const [homePlayers, awayPlayers] = await Promise.all([
        fetchTopMinutesPlayers(home.id),
        fetchTopMinutesPlayers(away.id)
      ]);

      return {
        category: 'Minutes Distribution (Top 5 by MPG)',
        source: 'Ball Don\'t Lie API (Season Averages)',
        home: {
          team: home.full_name || home.name,
          top_5_by_minutes: homePlayers.length > 0 ? homePlayers : 'Data unavailable'
        },
        away: {
          team: away.full_name || away.name,
          top_5_by_minutes: awayPlayers.length > 0 ? awayPlayers : 'Data unavailable'
        },
        comparison: 'Minutes distribution and rotation patterns for both teams.',
        note: 'Season MPG for top 5 players per team.'
      };
    } catch (error) {
      console.error(`[Stat Router] Error fetching MINUTES_TREND:`, error.message);
      return {
        category: 'Minutes Trend',
        error: 'Data unavailable',
        home: { team: home.full_name || home.name },
        away: { team: away.full_name || away.name }
      };
    }
  },


  // ===== BLOWOUT TENDENCY (Margin Patterns) =====
  BLOWOUT_TENDENCY: async (bdlSport, home, away, season, options) => {
    console.log(`[Stat Router] Fetching BLOWOUT_TENDENCY for ${away.name} @ ${home.name}`);
    
    try {
      const seasonStart = new Date(season, 9, 1); // BDL season=2025 means 2025-26
      const today = new Date();
      
      const [homeGames, awayGames] = await Promise.all([
        ballDontLieService.getGames(bdlSport, {
          team_ids: [home.id],
          start_date: seasonStart.toISOString().split('T')[0],
          end_date: today.toISOString().split('T')[0],
          per_page: 40
        }),
        ballDontLieService.getGames(bdlSport, {
          team_ids: [away.id],
          start_date: seasonStart.toISOString().split('T')[0],
          end_date: today.toISOString().split('T')[0],
          per_page: 40
        })
      ]);
      
      // Calculate blowout and close game patterns
      const calcMarginPatterns = (games, teamId) => {
        const completed = (games || [])
          .filter(g => (g.home_team_score || 0) > 0)
          .sort((a, b) => new Date(b.date) - new Date(a.date));
        
        if (completed.length < 5) return null;
        
        let blowoutWins = 0, blowoutLosses = 0;
        let closeWins = 0, closeLosses = 0;
        let totalMargin = 0;
        const margins = [];
        
        for (const g of completed) {
          const isHome = g.home_team?.id === teamId;
          const teamScore = isHome ? (g.home_team_score ?? g.home_score ?? 0) : (g.visitor_team_score ?? g.away_score ?? 0);
          const oppScore = isHome ? (g.visitor_team_score ?? g.away_score ?? 0) : (g.home_team_score ?? g.home_score ?? 0);
          const margin = teamScore - oppScore;
          const absMargin = Math.abs(margin);

          margins.push(margin);
          totalMargin += margin;

          if (margin > 0) {
            // Win
            if (absMargin >= 15) blowoutWins++;
            else if (absMargin <= 5) closeWins++;
          } else {
            // Loss
            if (absMargin >= 15) blowoutLosses++;
            else if (absMargin <= 5) closeLosses++;
          }
        }
        
        const avgMargin = totalMargin / completed.length;
        const blowoutRate = ((blowoutWins + blowoutLosses) / completed.length * 100).toFixed(0);
        const closeGameRate = ((closeWins + closeLosses) / completed.length * 100).toFixed(0);
        
        return {
          games_analyzed: completed.length,
          avg_margin: `${avgMargin > 0 ? '+' : ''}${avgMargin.toFixed(1)}`,
          blowout_wins: blowoutWins,
          blowout_losses: blowoutLosses,
          blowout_rate: `${blowoutRate}%`,
          close_wins: closeWins,
          close_losses: closeLosses,
          close_game_rate: `${closeGameRate}%`,
          total_games: completed.length
        };
      };
      
      const homePatterns = calcMarginPatterns(homeGames, home.id);
      const awayPatterns = calcMarginPatterns(awayGames, away.id);
      
      return {
        category: 'Blowout Tendency & Margin Patterns',
        source: 'Ball Don\'t Lie API (calculated)',
        home: {
          team: home.full_name || home.name,
          ...homePatterns
        },
        away: {
          team: away.full_name || away.name,
          ...awayPatterns
        },
        comparison: 'Recent point differential trends for both teams.'
      };
    } catch (error) {
      console.error(`[Stat Router] Error fetching BLOWOUT_TENDENCY:`, error.message);
      return {
        category: 'Blowout Tendency',
        error: 'Data unavailable',
        home: { team: home.full_name || home.name },
        away: { team: away.full_name || away.name }
      };
    }
  },


  // ===== RECENT FORM (ENHANCED) =====
  // Now includes margin analysis, opponent quality, and narrative context
  RECENT_FORM: async (bdlSport, home, away, season, options) => {
    const homeName = home.full_name || home.name || 'Home';
    const awayName = away.full_name || away.name || 'Away';
    console.log(`[Stat Router] Fetching ENHANCED RECENT_FORM for ${awayName} @ ${homeName} (${bdlSport})`);
    
    // NFL uses seasons[] and team_ids[], not date ranges
    const isNFL = bdlSport === 'americanfootball_nfl';
    const isNCAA = bdlSport === 'americanfootball_ncaaf' || bdlSport === 'basketball_ncaab';
    const isNBA = bdlSport === 'basketball_nba';
    const isNHL = bdlSport === 'icehockey_nhl';
    
    let params;
    if (isNFL || isNCAA) {
      // For football, use season filter - get all games this season (need 10+ for L10)
      params = {
        seasons: [season],
        per_page: 25 // Get more games to ensure we have enough for L10
      };
    } else {
      // For other sports (NBA, NHL), use date range - extend to 45 days to capture L10
      const today = new Date();
      const fortyFiveDaysAgo = new Date(today.getTime() - 45 * 24 * 60 * 60 * 1000);
      params = {
        start_date: fortyFiveDaysAgo.toISOString().split('T')[0],
        end_date: today.toISOString().split('T')[0],
        per_page: 25 // Need more for L10
      };
    }
    
    try {
      // Fetch games AND standings in parallel for opponent quality analysis
      const [homeGames, awayGames, standings] = await Promise.all([
        ballDontLieService.getGames(bdlSport, { team_ids: [home.id], ...params }),
        ballDontLieService.getGames(bdlSport, { team_ids: [away.id], ...params }),
        // Fetch standings to assess opponent quality
        (isNFL || isNBA || isNHL) ? ballDontLieService.getStandingsGeneric(bdlSport, { season }) : Promise.resolve([])
      ]);
      
      console.log(`[Stat Router] Got ${homeGames?.length || 0} games for ${homeName}, ${awayGames?.length || 0} for ${awayName}, ${standings?.length || 0} standings`);
      
      // Build standings map for quick opponent lookup
      const standingsMap = new Map();
      if (standings && standings.length > 0) {
        for (const s of standings) {
          const teamId = s.team?.id;
          if (teamId) {
            standingsMap.set(teamId, {
              overall_record: s.overall_record || `${s.wins || 0}-${s.losses || 0}`,
              wins: s.wins || 0,
              losses: s.losses || 0,
              point_differential: s.point_differential || 0
            });
          }
        }
        console.log(`[Stat Router] Built standings map with ${standingsMap.size} teams for opponent quality lookup`);
      }
      
      // Sort by date descending (most recent first)
      const sortByDate = (a, b) => new Date(b.date) - new Date(a.date);
      const sortedHomeGames = (homeGames || []).sort(sortByDate);
      const sortedAwayGames = (awayGames || []).sort(sortByDate);
      
      // Pass standings map for enhanced analysis
      const homeForm = formatRecentGames(sortedHomeGames, homeName, standingsMap);
      const awayForm = formatRecentGames(sortedAwayGames, awayName, standingsMap);
      
      return {
        category: 'Recent Form - L5 + L10 Analysis',

        home: {
          team: home.full_name || home.name,
          ...homeForm
        },
        away: {
          team: away.full_name || away.name,
          ...awayForm
        },
        note: 'If Scout Report grounding has more recent data, prefer that for accuracy.'
      };
    } catch (error) {
      console.error(`[Stat Router] Error fetching recent form:`, error.message);
      return {
        category: 'Recent Form',
        home: { team: home.full_name || home.name, record: 'N/A', note: 'Data unavailable' },
        away: { team: away.full_name || away.name, record: 'N/A', note: 'Data unavailable' },
        WARNING: 'Recent form data unavailable.'
      };
    }
  },


  // ===== QUARTER SCORING TRENDS (NFL) =====
  // Shows Q1, Q2, Q3, Q4 scoring breakdown - fast starters vs closers
  QUARTER_SCORING: async (bdlSport, home, away, season, options) => {
    const homeName = home.full_name || home.name || 'Home';
    const awayName = away.full_name || away.name || 'Away';
    console.log(`[Stat Router] Fetching QUARTER_SCORING for ${awayName} @ ${homeName} (${bdlSport})`);
    
    try {
      // NHL uses periods (P1/P2/P3), not quarters — BDL NHL game data doesn't expose period scores
      if (bdlSport === 'icehockey_nhl') {
        return {
          category: 'Period Scoring Trends',
          data_scope: 'BDL NHL game data does not expose period-by-period scores (P1/P2/P3). Use grounded search for period scoring trends.',
          home: { team: homeName, note: 'Period scoring data unavailable from BDL' },
          away: { team: awayName, note: 'Period scoring data unavailable from BDL' }
        };
      }

      const [homeGames, awayGames] = await Promise.all([
        recentSeasonGames(bdlSport, home.id, season),
        recentSeasonGames(bdlSport, away.id, season)
      ]);

      // Filter to completed games only - using case-insensitive status check
      const completedHomeGames = (homeGames || []).filter(g => isGameCompleted(g.status));
      const completedAwayGames = (awayGames || []).filter(g => isGameCompleted(g.status));

      const calcQuarterStats = (games, teamId, teamName) => {
        if (!games || games.length === 0) return null;
        
        let q1Scored = 0, q2Scored = 0, q3Scored = 0, q4Scored = 0;
        let q1Allowed = 0, q2Allowed = 0, q3Allowed = 0, q4Allowed = 0;
        let gamesWithQuarters = 0;
        
        for (const game of games) {
          const isHome = (game.home_team?.id || game.home_team_id) === teamId;
          
          // Get quarter scores based on whether team is home or away
          const teamQ1 = isHome ? game.home_team_q1 : game.visitor_team_q1;
          const teamQ2 = isHome ? game.home_team_q2 : game.visitor_team_q2;
          const teamQ3 = isHome ? game.home_team_q3 : game.visitor_team_q3;
          const teamQ4 = isHome ? game.home_team_q4 : game.visitor_team_q4;
          
          const oppQ1 = isHome ? game.visitor_team_q1 : game.home_team_q1;
          const oppQ2 = isHome ? game.visitor_team_q2 : game.home_team_q2;
          const oppQ3 = isHome ? game.visitor_team_q3 : game.home_team_q3;
          const oppQ4 = isHome ? game.visitor_team_q4 : game.home_team_q4;
          
          // Only count games with quarter data
          // Null is a shutout quarter — see FIRST_HALF_TRENDS.
          if (true) {
            q1Scored += teamQ1 || 0;
            q2Scored += teamQ2 || 0;
            q3Scored += teamQ3 || 0;
            q4Scored += teamQ4 || 0;
            q1Allowed += oppQ1 || 0;
            q2Allowed += oppQ2 || 0;
            q3Allowed += oppQ3 || 0;
            q4Allowed += oppQ4 || 0;
            gamesWithQuarters++;
          }
        }
        
        if (gamesWithQuarters === 0) return null;
        
        const avgQ1 = (q1Scored / gamesWithQuarters).toFixed(1);
        const avgQ2 = (q2Scored / gamesWithQuarters).toFixed(1);
        const avgQ3 = (q3Scored / gamesWithQuarters).toFixed(1);
        const avgQ4 = (q4Scored / gamesWithQuarters).toFixed(1);
        const avg1H = ((q1Scored + q2Scored) / gamesWithQuarters).toFixed(1);
        const avg2H = ((q3Scored + q4Scored) / gamesWithQuarters).toFixed(1);
        
        const avgQ1Allowed = (q1Allowed / gamesWithQuarters).toFixed(1);
        const avgQ2Allowed = (q2Allowed / gamesWithQuarters).toFixed(1);
        const avgQ3Allowed = (q3Allowed / gamesWithQuarters).toFixed(1);
        const avgQ4Allowed = (q4Allowed / gamesWithQuarters).toFixed(1);
        
        // Determine team profile
        const q1Diff = parseFloat(avgQ1) - parseFloat(avgQ1Allowed);
        const q4Diff = parseFloat(avgQ4) - parseFloat(avgQ4Allowed);
        const firstHalfDiff = parseFloat(avg1H) - ((parseFloat(avgQ1Allowed) + parseFloat(avgQ2Allowed)));
        const secondHalfDiff = parseFloat(avg2H) - ((parseFloat(avgQ3Allowed) + parseFloat(avgQ4Allowed)));
        
        return {
          team: teamName,
          games_analyzed: gamesWithQuarters,
          scoring: { Q1: avgQ1, Q2: avgQ2, Q3: avgQ3, Q4: avgQ4, '1H': avg1H, '2H': avg2H },
          allowed: { Q1: avgQ1Allowed, Q2: avgQ2Allowed, Q3: avgQ3Allowed, Q4: avgQ4Allowed },
          differential: { Q1: q1Diff.toFixed(1), Q4: q4Diff.toFixed(1), '1H': firstHalfDiff.toFixed(1), '2H': secondHalfDiff.toFixed(1) }
        };
      };
      
      return {
        category: 'Quarter-by-Quarter Scoring Trends',
        home: calcQuarterStats(completedHomeGames, home.id, homeName),
        away: calcQuarterStats(completedAwayGames, away.id, awayName),
        note: 'Quarter-by-quarter scoring and defensive data for both teams.'
      };
    } catch (error) {
      console.error(`[Stat Router] Error fetching QUARTER_SCORING:`, error.message);
      return { category: 'Quarter Scoring', error: 'Data unavailable' };
    }
  },


  // ===== FIRST HALF TRENDS =====
  // Teams that start hot vs cold - halftime lead %
  FIRST_HALF_TRENDS: async (bdlSport, home, away, season, options) => {
    const homeName = home.full_name || home.name || 'Home';
    const awayName = away.full_name || away.name || 'Away';
    console.log(`[Stat Router] Fetching FIRST_HALF_TRENDS for ${awayName} @ ${homeName} (${bdlSport})`);
    
    try {
      const [homeGames, awayGames] = await Promise.all([
        recentSeasonGames(bdlSport, home.id, season),
        recentSeasonGames(bdlSport, away.id, season)
      ]);
      
      const completedHomeGames = (homeGames || []).filter(g => g.status === 'Final' || g.status === 'final');
      const completedAwayGames = (awayGames || []).filter(g => g.status === 'Final' || g.status === 'final');
      
      const calcFirstHalfStats = (games, teamId, teamName) => {
        if (!games || games.length === 0) return null;
        
        let leadingAtHalf = 0, trailingAtHalf = 0, tiedAtHalf = 0;
        let totalFirstHalfScored = 0, totalFirstHalfAllowed = 0;
        let winsWhenLeading = 0, winsWhenTrailing = 0;
        let gamesWithData = 0;
        
        for (const game of games) {
          const isHome = (game.home_team?.id || game.home_team_id) === teamId;
          
          const teamQ1 = isHome ? game.home_team_q1 : game.visitor_team_q1;
          const teamQ2 = isHome ? game.home_team_q2 : game.visitor_team_q2;
          const oppQ1 = isHome ? game.visitor_team_q1 : game.home_team_q1;
          const oppQ2 = isHome ? game.visitor_team_q2 : game.home_team_q2;
          
          const teamFinal = isHome ? (game.home_team_score ?? game.home_score ?? 0) : (game.visitor_team_score ?? game.away_score ?? 0);
          const oppFinal = isHome ? (game.visitor_team_score ?? game.away_score ?? 0) : (game.home_team_score ?? game.home_score ?? 0);
          
          // BDL stores a SCORELESS quarter as null, not 0 — verified Aug 25
          // 2026: across a 2025 NFL sample only 9 of 97 finals had all eight
          // quarter fields, yet every single game reconciled to its final
          // score once null was read as 0 (194/194). Skipping those games
          // dropped 69% of the season AND biased what remained: the surviving
          // sample averaged 14.7 first-half points against a true 11.4,
          // because the games it threw away were the low-scoring ones.
          // A missing quarter is a shutout quarter. Count it.
          if (teamFinal !== null && oppFinal !== null) {
            const team1H = (teamQ1 || 0) + (teamQ2 || 0);
            const opp1H = (oppQ1 || 0) + (oppQ2 || 0);
            
            totalFirstHalfScored += team1H;
            totalFirstHalfAllowed += opp1H;
            gamesWithData++;
            
            const won = teamFinal > oppFinal;
            
            if (team1H > opp1H) {
              leadingAtHalf++;
              if (won) winsWhenLeading++;
            } else if (team1H < opp1H) {
              trailingAtHalf++;
              if (won) winsWhenTrailing++;
            } else {
              tiedAtHalf++;
            }
          }
        }
        
        if (gamesWithData === 0) return null;
        
        const avg1HScored = (totalFirstHalfScored / gamesWithData).toFixed(1);
        const avg1HAllowed = (totalFirstHalfAllowed / gamesWithData).toFixed(1);
        const leadPct = ((leadingAtHalf / gamesWithData) * 100).toFixed(0);
        const closeRate = leadingAtHalf > 0 ? ((winsWhenLeading / leadingAtHalf) * 100).toFixed(0) : 'N/A';
        const comebackRate = trailingAtHalf > 0 ? ((winsWhenTrailing / trailingAtHalf) * 100).toFixed(0) : 'N/A';
        
        return {
          team: teamName,
          games_analyzed: gamesWithData,
          avg_1H_scored: avg1HScored,
          avg_1H_allowed: avg1HAllowed,
          leading_at_half: `${leadingAtHalf}/${gamesWithData} (${leadPct}%)`,
          trailing_at_half: `${trailingAtHalf}/${gamesWithData}`,
          close_out_rate: closeRate !== 'N/A' ? `${closeRate}% when leading at half` : 'N/A',
          comeback_rate: comebackRate !== 'N/A' ? `${comebackRate}% when trailing at half` : 'N/A'
        };
      };
      
      return {
        category: 'First Half Scoring Trends',
        home: calcFirstHalfStats(completedHomeGames, home.id, homeName),
        away: calcFirstHalfStats(completedAwayGames, away.id, awayName),
        note: 'First half scoring and halftime lead data for both teams.'
      };
    } catch (error) {
      console.error(`[Stat Router] Error fetching FIRST_HALF_TRENDS:`, error.message);
      return { category: 'First Half Trends', error: 'Data unavailable' };
    }
  },


  // ===== SECOND HALF TRENDS =====
  // Closers vs faders - 4th quarter dominance
  SECOND_HALF_TRENDS: async (bdlSport, home, away, season, options) => {
    const homeName = home.full_name || home.name || 'Home';
    const awayName = away.full_name || away.name || 'Away';
    console.log(`[Stat Router] Fetching SECOND_HALF_TRENDS for ${awayName} @ ${homeName} (${bdlSport})`);
    
    try {
      const [homeGames, awayGames] = await Promise.all([
        recentSeasonGames(bdlSport, home.id, season),
        recentSeasonGames(bdlSport, away.id, season)
      ]);
      
      const completedHomeGames = (homeGames || []).filter(g => g.status === 'Final' || g.status === 'final');
      const completedAwayGames = (awayGames || []).filter(g => g.status === 'Final' || g.status === 'final');
      
      const calcSecondHalfStats = (games, teamId, teamName) => {
        if (!games || games.length === 0) return null;
        
        let total2HScored = 0, total2HAllowed = 0;
        let totalQ4Scored = 0, totalQ4Allowed = 0;
        let won2ndHalf = 0, lost2ndHalf = 0;
        let wonQ4 = 0, lostQ4 = 0;
        let gamesWithData = 0;
        
        for (const game of games) {
          const isHome = (game.home_team?.id || game.home_team_id) === teamId;
          
          const teamQ3 = isHome ? game.home_team_q3 : game.visitor_team_q3;
          const teamQ4 = isHome ? game.home_team_q4 : game.visitor_team_q4;
          const oppQ3 = isHome ? game.visitor_team_q3 : game.home_team_q3;
          const oppQ4 = isHome ? game.visitor_team_q4 : game.home_team_q4;
          
          // A missing quarter is a scoreless quarter, not a missing game —
          // see the note in FIRST_HALF_TRENDS. Skipping them dropped most of
          // the season and inflated the average. The game is already filtered
          // to Final; require only that it carries a final score.
          if (game.home_team_score != null && game.visitor_team_score != null) {
            const team2H = (teamQ3 || 0) + (teamQ4 || 0);
            const opp2H = (oppQ3 || 0) + (oppQ4 || 0);
            const teamQ4Score = teamQ4 || 0;
            const oppQ4Score = oppQ4 || 0;
            
            total2HScored += team2H;
            total2HAllowed += opp2H;
            totalQ4Scored += teamQ4Score;
            totalQ4Allowed += oppQ4Score;
            gamesWithData++;
            
            if (team2H > opp2H) won2ndHalf++;
            else if (team2H < opp2H) lost2ndHalf++;
            
            if (teamQ4Score > oppQ4Score) wonQ4++;
            else if (teamQ4Score < oppQ4Score) lostQ4++;
          }
        }
        
        if (gamesWithData === 0) return null;
        
        const avg2HScored = (total2HScored / gamesWithData).toFixed(1);
        const avg2HAllowed = (total2HAllowed / gamesWithData).toFixed(1);
        const avgQ4Scored = (totalQ4Scored / gamesWithData).toFixed(1);
        const avgQ4Allowed = (totalQ4Allowed / gamesWithData).toFixed(1);
        const q4Diff = (totalQ4Scored - totalQ4Allowed) / gamesWithData;
        
        return {
          team: teamName,
          games_analyzed: gamesWithData,
          avg_2H_scored: avg2HScored,
          avg_2H_allowed: avg2HAllowed,
          avg_Q4_scored: avgQ4Scored,
          avg_Q4_allowed: avgQ4Allowed,
          Q4_differential: q4Diff >= 0 ? `+${q4Diff.toFixed(1)}` : q4Diff.toFixed(1),
          won_2nd_half: `${won2ndHalf}/${gamesWithData}`,
          won_Q4: `${wonQ4}/${gamesWithData}`
        };
      };
      
      return {
        category: 'Second Half & 4th Quarter Trends',
        home: calcSecondHalfStats(completedHomeGames, home.id, homeName),
        away: calcSecondHalfStats(completedAwayGames, away.id, awayName),
        note: 'Second half and Q4 scoring data for both teams.'
      };
    } catch (error) {
      console.error(`[Stat Router] Error fetching SECOND_HALF_TRENDS:`, error.message);
      return { category: 'Second Half Trends', error: 'Data unavailable' };
    }
  },


  // ===== VARIANCE & CONSISTENCY ANALYSIS =====
  VARIANCE_CONSISTENCY: async (bdlSport, home, away, season, options) => {
    const homeName = home.full_name || home.name || 'Home';
    const awayName = away.full_name || away.name || 'Away';
    console.log(`[Stat Router] Fetching VARIANCE_CONSISTENCY for ${awayName} @ ${homeName} (${bdlSport})`);
    
    // Only supported for NFL currently (expandable to other sports)
    if (bdlSport !== 'americanfootball_nfl') {
      return {
        category: 'Variance & Consistency',
        note: 'Currently only available for NFL. Coming soon for other sports.',
        home: { team: homeName },
        away: { team: awayName }
      };
    }
    
    try {
      // Get recent games for both teams
      const [homeGames, awayGames] = await Promise.all([
        ballDontLieService.getGames(bdlSport, { team_ids: [home.id], seasons: [season], per_page: 17 }),
        ballDontLieService.getGames(bdlSport, { team_ids: [away.id], seasons: [season], per_page: 17 })
      ]);
      
      const completedHomeGames = (homeGames || []).filter(g => g.status === 'Final' || g.status === 'final').slice(0, 10);
      const completedAwayGames = (awayGames || []).filter(g => g.status === 'Final' || g.status === 'final').slice(0, 10);
      
      // Calculate variance stats for a team
      const calcVarianceStats = (games, teamId, teamName) => {
        if (!games || games.length < 3) {
          return { team: teamName, error: 'Insufficient data' };
        }
        
        const margins = [];
        const pointsScored = [];
        let closeGames = 0; // Within 7 points
        let blowouts = 0;   // Won/lost by 14+
        let beatsGoodTeams = 0;
        let losesToBadTeams = 0;
        
        for (const game of games) {
          const isHome = game.home_team?.id === teamId;
          const teamScore = isHome ? game.home_team_score : game.away_team_score;
          const oppScore = isHome ? game.away_team_score : game.home_team_score;
          
          if (teamScore == null || oppScore == null) continue;
          
          const margin = teamScore - oppScore;
          margins.push(margin);
          pointsScored.push(teamScore);
          
          // Close game analysis
          if (Math.abs(margin) <= 7) closeGames++;
          if (Math.abs(margin) >= 14) blowouts++;
        }
        
        if (margins.length < 3) {
          return { team: teamName, error: 'Insufficient games with scores' };
        }
        
        // Calculate standard deviation of margins (VARIANCE indicator)
        const avgMargin = margins.reduce((a, b) => a + b, 0) / margins.length;
        const variance = margins.reduce((acc, m) => acc + Math.pow(m - avgMargin, 2), 0) / margins.length;
        const stdDev = Math.sqrt(variance);
        
        // Calculate scoring consistency
        const avgPoints = pointsScored.reduce((a, b) => a + b, 0) / pointsScored.length;
        const scoringVariance = pointsScored.reduce((acc, p) => acc + Math.pow(p - avgPoints, 2), 0) / pointsScored.length;
        const scoringStdDev = Math.sqrt(scoringVariance);
        
        // Calculate upset potential indicators
        const closeGamePct = ((closeGames / margins.length) * 100).toFixed(0);
        const blowoutPct = ((blowouts / margins.length) * 100).toFixed(0);

        return {
          team: teamName,
          games_analyzed: margins.length,
          margin_analysis: {
            avg_margin: avgMargin.toFixed(1),
            std_dev: stdDev.toFixed(1)
          },
          scoring_analysis: {
            avg_points: avgPoints.toFixed(1),
            std_dev: scoringStdDev.toFixed(1)
          },
          game_types: {
            close_games: `${closeGames}/${margins.length} (${closeGamePct}%)`,
            blowouts: `${blowouts}/${margins.length} (${blowoutPct}%)`
          }
        };
      };
      
      const homeVariance = calcVarianceStats(completedHomeGames, home.id, homeName);
      const awayVariance = calcVarianceStats(completedAwayGames, away.id, awayName);
      
      return {
        category: 'Variance & Consistency Analysis',
        note: 'Margin and scoring standard deviation for both teams.',
        home: homeVariance,
        away: awayVariance
      };
    } catch (error) {
      console.error(`[Stat Router] Error fetching VARIANCE_CONSISTENCY:`, error.message);
      return { category: 'Variance & Consistency', error: 'Data unavailable' };
    }
  },


  // ===== HEAD-TO-HEAD HISTORY =====
  H2H_HISTORY: async (bdlSport, home, away, season, options) => {
    const homeName = home.full_name || home.name || 'Home';
    const awayName = away.full_name || away.name || 'Away';
    console.log(`[Stat Router] Fetching H2H_HISTORY for ${awayName} @ ${homeName} (${bdlSport})`);
    
    // Helper: Extract personnel notes from box score data
    const extractPersonnelNote = (boxScore, homeTeamId, awayTeamId) => {
      try {
        // BDL's box score carries each side's players under home_team / visitor_team (audit, Oct 13 2026: the
        // old home_team_stats fields never existed, so these notes never printed).
        const homeStats = boxScore?.home_team?.players || boxScore?.home_team_stats || [];
        const awayStats = boxScore?.visitor_team?.players || boxScore?.away_team_stats || [];
        if (!homeStats.length || !awayStats.length) return null;
        
        // Get top scorer from each team
        
        // Sort by points to find top performers
        const homeTop = [...homeStats].sort((a, b) => (b.pts || 0) - (a.pts || 0))[0];
        const awayTop = [...awayStats].sort((a, b) => (b.pts || 0) - (a.pts || 0))[0];
        
        // Find any key players who DNP (0 minutes or not in stats)
        const homeDnp = homeStats.filter(p => (p.min === '0:00' || p.min === 0 || p.min === '00:00') && p.player?.first_name);
        const awayDnp = awayStats.filter(p => (p.min === '0:00' || p.min === 0 || p.min === '00:00') && p.player?.first_name);
        
        let note = 'Key: ';
        if (homeTop?.player) {
          const name = `${homeTop.player.first_name?.[0] || ''}. ${homeTop.player.last_name || 'Unknown'}`;
          note += `${name} ${homeTop.pts || 0}pts/${homeTop.min || '?'}min`;
        }
        if (awayTop?.player) {
          const name = `${awayTop.player.first_name?.[0] || ''}. ${awayTop.player.last_name || 'Unknown'}`;
          note += `; ${name} ${awayTop.pts || 0}pts/${awayTop.min || '?'}min`;
        }
        
        // Add DNP notes for all players (Gary needs full absence awareness)
        const dnpNotes = [];
        if (homeDnp.length > 0) {
          const dnpNames = homeDnp.map(p => `${p.player?.last_name || 'Unknown'}`).join(', ');
          dnpNotes.push(`${dnpNames} DNP`);
        }
        if (awayDnp.length > 0) {
          const dnpNames = awayDnp.map(p => `${p.player?.last_name || 'Unknown'}`).join(', ');
          dnpNotes.push(`${dnpNames} DNP`);
        }
        
        if (dnpNotes.length > 0) {
          note += ` | ${dnpNotes.join('; ')}`;
        }
        
        return note;
      } catch (e) {
        console.log(`[Stat Router] Error extracting personnel note: ${e.message}`);
        return null;
      }
    };
    
    try {
      // Calculate dynamic season - NFL/NCAAF: Aug-Feb spans years
      // If season not provided, calculate based on current date
      let currentSeason = season;
      if (!currentSeason) {
        const month = new Date().getMonth() + 1;
        const year = new Date().getFullYear();
        // NFL/NCAAF: Aug-Feb, so Jan-Jul = previous year's season
        currentSeason = month <= 7 ? year - 1 : year;
      }
      
      const homeGames = await ballDontLieService.getGames(bdlSport, {
        team_ids: [home.id],
        seasons: [currentSeason],
        per_page: 100
      });

      // Filter to only COMPLETED games against the away team
      const h2hGames = (homeGames || []).filter(game => {
        const gameHomeId = game.home_team?.id || game.home_team_id;
        const gameAwayId = game.visitor_team?.id || game.visitor_team_id;
        const isH2H = (gameHomeId === away.id || gameAwayId === away.id);
        // BDL status values vary by sport:
        // NBA: has home_team_score > 0 means completed
        // NFL: status='Final'
        // NCAAB: status='Final' or 'post'
        // NHL: status='Final' or game_state='OFF'
        const hasScores = ((game.home_team_score ?? game.home_score ?? 0) > 0) || ((game.visitor_team_score ?? game.away_score ?? 0) > 0);
        const statusFinal = game.status === 'Final' || game.status === 'post' || game.status === 'final';
        const isCompleted = hasScores || statusFinal;
        // Also ensure game date is in the past
        const isPast = providerGameInstant(game.datetime || game.date) < new Date();
        return isH2H && isCompleted && isPast;
      }).sort((a, b) => new Date(b.date) - new Date(a.date)); // Most recent first
      
      if (h2hGames.length === 0) {
        return {
          category: `Head-to-Head History (${currentSeason} Season)`,
          games_found: 0,
          h2h_available: false,
          note: `NO H2H DATA: ${homeName} and ${awayName} have not played each other in the ${currentSeason} season.`,
          revenge_game: false,
          ANTI_HALLUCINATION: `CRITICAL: You have ZERO H2H data for this matchup. DO NOT claim any historical records, winning streaks, or "Team A owns Team B" narratives. If you don't have H2H data, simply don't mention H2H in your analysis.`
        };
      }
      
      // For NBA, try to fetch box scores to get personnel context
      const isNba = bdlSport === 'basketball_nba';
      let boxScoresByDate = {};
      
      if (isNba && h2hGames.length <= 3) {
        // Only fetch box scores for recent H2H games (limit to avoid slowdown)
        console.log(`[Stat Router] Fetching box scores for ${h2hGames.length} H2H game(s) to get personnel notes...`);
        
        for (const game of h2hGames.slice(0, 3)) {
          try {
            const gameDate = game.date?.split('T')[0]; // YYYY-MM-DD
            if (gameDate && !boxScoresByDate[gameDate]) {
              const boxScores = await ballDontLieService.getNbaBoxScores(gameDate, 30); // Cache 30 min
              if (boxScores && boxScores.length > 0) {
                // Find the box score that matches this game (by team IDs)
                const matchingBox = boxScores.find(bs => {
                  const bsHomeId = bs.game?.home_team?.id || bs.home_team?.id;
                  const bsAwayId = bs.game?.visitor_team?.id || bs.visitor_team?.id;
                  return (bsHomeId === home.id || bsHomeId === away.id) && 
                         (bsAwayId === home.id || bsAwayId === away.id);
                });
                if (matchingBox) {
                  boxScoresByDate[gameDate] = matchingBox;
                }
              }
            }
          } catch (e) {
            console.log(`[Stat Router] Box score fetch failed for ${game.date}: ${e.message}`);
          }
        }
      }
      
      // Format H2H results with full date including year AND personnel notes
      const h2hResults = h2hGames.slice(0, 5).map(game => {
        const isHomeTeamHome = (game.home_team?.id || game.home_team_id) === home.id;
        const homeScore = isHomeTeamHome ? (game.home_team_score ?? game.home_score ?? 0) : (game.visitor_team_score ?? game.away_score ?? 0);
        const awayScore = isHomeTeamHome ? (game.visitor_team_score ?? game.away_score ?? 0) : (game.home_team_score ?? game.home_score ?? 0);
        const winner = homeScore > awayScore ? homeName : awayName;
        const margin = Math.abs(homeScore - awayScore);
        const gameDate = providerGameDateLabel(game.datetime || game.date, { month: 'short', day: 'numeric', year: 'numeric' });
        const gameDateKey = game.date?.split('T')[0];
        const week = game.week ? `Week ${game.week}` : '';
        
        // Get personnel note from box score if available
        const boxScore = boxScoresByDate[gameDateKey];
        const personnelNote = boxScore ? extractPersonnelNote(boxScore, home.id, away.id) : null;
        
        return {
          date: gameDate,
          week: week,
          result: `${winner} won by ${margin}`,
          score: `${homeName} ${homeScore} - ${awayScore} ${awayName}`,
          margin: margin, // Store margin for sweep context analysis
          home_won: homeScore > awayScore,
          personnel_note: personnelNote || (isNba ? '(Box score unavailable)' : null)
        };
      });
      
      // Calculate series record for THIS SEASON
      const homeWins = h2hResults.filter(r => r.home_won).length;
      const awayWins = h2hResults.length - homeWins;
      
      // Check for revenge game (did away team lose last meeting?)
      const lastMeeting = h2hResults[0];
      const revengeGame = lastMeeting && !lastMeeting.home_won;
      
      // ===== NBA SWEEP CONTEXT DETECTION (NBA-SPECIFIC) =====
      // Detects when one team is about to sweep an elite opponent 4-0
      // This is historically very rare and should prompt investigation
      let sweepContext = null;
      
      if (isNba && h2hGames.length >= 3) {
        const gamesPlayed = h2hGames.length;
        const isCompleteSweep = (homeWins === gamesPlayed) || (awayWins === gamesPlayed);
        
        if (isCompleteSweep) {
          try {
            // Determine dominant and swept teams
            const dominantTeam = homeWins === gamesPlayed ? home : away;
            const dominantTeamName = homeWins === gamesPlayed ? homeName : awayName;
            const sweptTeam = homeWins === gamesPlayed ? away : home;
            const sweptTeamName = homeWins === gamesPlayed ? awayName : homeName;
            
            // Fetch standings to get win percentages and division info
            const standings = await ballDontLieService.getNbaStandings(currentSeason);
            
            // Get swept team's standing (with null checks)
            const sweptTeamStanding = standings?.find(s => s.team?.id === sweptTeam.id);
            const dominantTeamStanding = standings?.find(s => s.team?.id === dominantTeam.id);
            
            if (sweptTeamStanding?.wins !== undefined && sweptTeamStanding?.losses !== undefined) {
              const sweptWins = sweptTeamStanding.wins;
              const sweptLosses = sweptTeamStanding.losses;
              const sweptTotal = sweptWins + sweptLosses;
              
              if (sweptTotal > 0) {
                const sweptWinPct = (sweptWins / sweptTotal) * 100;
                
                // Check if division rivals (same division = more film study and adjustment opportunities)
                const sweptDivision = sweptTeamStanding?.team?.division;
                const dominantDivision = dominantTeamStanding?.team?.division;
                const isDivisionRival = sweptDivision && dominantDivision && sweptDivision === dominantDivision;
                
                // Calculate average margin of H2H wins
                const margins = h2hResults.map(r => r.margin || 0);
                const avgMargin = margins.reduce((sum, m) => sum + m, 0) / margins.length;
                
                sweepContext = {
                  triggered: true,
                  games_in_sweep: gamesPlayed,
                  dominant_team: dominantTeamName,
                  swept_team: sweptTeamName,
                  swept_team_record: `${sweptWins}-${sweptLosses}`,
                  swept_team_win_pct: `${sweptWinPct.toFixed(1)}%`,
                  is_division_rival: isDivisionRival,
                  division: isDivisionRival ? sweptDivision : null,
                  avg_margin: avgMargin.toFixed(1)
                };
                console.log(`[Stat Router] SWEEP CONTEXT: ${dominantTeamName} is ${gamesPlayed}-0 vs ${sweptTeamName} (${sweptWinPct.toFixed(1)}% win rate${isDivisionRival ? ', division rival' : ''})`);
              }
            }
          } catch (sweepErr) {
            console.log(`[Stat Router] Sweep context check failed (non-fatal): ${sweepErr.message}`);
            // Non-fatal - just skip sweep context if standings unavailable
          }
        }
      }
      
      // ===== NFL REVENGE CONTEXT DETECTION (NFL-SPECIFIC) =====
      // In NFL, elite teams don't lose twice to the same opponent, especially after a blowout
      const isNfl = bdlSport === 'americanfootball_nfl';
      
      if (isNfl && h2hGames.length >= 1 && !sweepContext) {
        try {
          // Get the previous meeting details
          const lastGame = h2hResults[0];
          const lastMargin = lastGame?.margin || 0;
          
          // Determine winner and loser of last meeting
          const lastWinnerIsHome = lastGame?.home_won;
          const losingTeam = lastWinnerIsHome ? away : home;
          const losingTeamName = lastWinnerIsHome ? awayName : homeName;
          const winningTeam = lastWinnerIsHome ? home : away;
          const winningTeamName = lastWinnerIsHome ? homeName : awayName;
          
          // Fetch standings to get win percentages and division info
          const standings = await ballDontLieService.getStandingsGeneric(bdlSport, { season: currentSeason });
          
          const losingTeamStanding = standings?.find(s => s.team?.id === losingTeam.id);
          const winningTeamStanding = standings?.find(s => s.team?.id === winningTeam.id);
          
          if (losingTeamStanding?.wins !== undefined && losingTeamStanding?.losses !== undefined) {
            const losingWins = losingTeamStanding.wins;
            const losingLosses = losingTeamStanding.losses;
            const losingTotal = losingWins + losingLosses;
            
            if (losingTotal > 0) {
              const losingWinPct = (losingWins / losingTotal) * 100;
              
              // Check if division rivals
              const losingDivision = losingTeamStanding?.team?.division;
              const winningDivision = winningTeamStanding?.team?.division;
              const isDivisionRival = losingDivision && winningDivision && losingDivision === winningDivision;
              
              // NFL Revenge Context: Division rival lost by 14+ points AND is 70%+ win rate
              // In NFL, 14+ points is a convincing win (2+ TDs)
              if (isDivisionRival && losingWinPct >= 70 && lastMargin >= 14) {
                sweepContext = {
                  triggered: true,
                  sport: 'NFL',
                  games_played: h2hGames.length,
                  losing_team: losingTeamName,
                  winning_team: winningTeamName,
                  losing_team_record: `${losingWins}-${losingLosses}`,
                  losing_team_win_pct: `${losingWinPct.toFixed(1)}%`,
                  is_division_rival: true,
                  division: losingDivision,
                  last_margin: lastMargin,
                  sweep_note: `NFL DIVISION REMATCH: ${losingTeamName} is ${losingWins}-${losingLosses} (${losingWinPct.toFixed(1)}%) and lost by ${lastMargin} points to division rival ${winningTeamName} earlier this season.`
                };
                console.log(`[Stat Router] NFL REVENGE CONTEXT: ${losingTeamName} (${losingWinPct.toFixed(1)}%) lost by ${lastMargin} to division rival ${winningTeamName}`);
              }
            }
          }
        } catch (nflErr) {
          console.log(`[Stat Router] NFL revenge context check failed (non-fatal): ${nflErr.message}`);
        }
      }
      
      // ===== NCAAB SWEEP CONTEXT DETECTION (NCAAB-SPECIFIC) =====
      // In NCAAB, conference rivals play 2x per year; 2-0 sweeps trigger caution for elite/ranked teams
      const isNcaab = bdlSport === 'basketball_ncaab';
      
      if (isNcaab && h2hGames.length >= 2 && !sweepContext) {
        const gamesPlayed = h2hGames.length;
        const isCompleteSweep = (homeWins === gamesPlayed) || (awayWins === gamesPlayed);
        
        if (isCompleteSweep) {
          try {
            // Determine dominant and swept teams
            const dominantTeam = homeWins === gamesPlayed ? home : away;
            const dominantTeamName = homeWins === gamesPlayed ? homeName : awayName;
            const sweptTeam = homeWins === gamesPlayed ? away : home;
            const sweptTeamName = homeWins === gamesPlayed ? awayName : homeName;
            
            // Fetch standings to get win percentages and conference info
            const standings = await ballDontLieService.getStandingsGeneric(bdlSport, { season: currentSeason });
            
            const sweptTeamStanding = standings?.find(s => s.team?.id === sweptTeam.id);
            const dominantTeamStanding = standings?.find(s => s.team?.id === dominantTeam.id);
            
            if (sweptTeamStanding?.wins !== undefined && sweptTeamStanding?.losses !== undefined) {
              const sweptWins = sweptTeamStanding.wins;
              const sweptLosses = sweptTeamStanding.losses;
              const sweptTotal = sweptWins + sweptLosses;
              
              if (sweptTotal > 0) {
                const sweptWinPct = (sweptWins / sweptTotal) * 100;
                
                // Check if conference rivals
                const sweptConference = sweptTeamStanding?.team?.conference;
                const dominantConference = dominantTeamStanding?.team?.conference;
                const isConferenceRival = sweptConference && dominantConference && sweptConference === dominantConference;
                
                // Check if swept team is ranked (Top 25 indicator)
                const sweptRanking = sweptTeamStanding?.ranking || sweptTeamStanding?.ap_rank || null;
                const isRanked = sweptRanking && sweptRanking <= 25;
                
                // Calculate average margin
                const margins = h2hResults.map(r => r.margin || 0);
                const avgMargin = margins.reduce((sum, m) => sum + m, 0) / margins.length;
                
                // NCAAB Sweep Context: Conference rival is 0-2 AND is 70%+ OR ranked
                if (isConferenceRival && (sweptWinPct >= 70 || isRanked)) {
                  sweepContext = {
                    triggered: true,
                    sport: 'NCAAB',
                    games_in_sweep: gamesPlayed,
                    dominant_team: dominantTeamName,
                    swept_team: sweptTeamName,
                    swept_team_record: `${sweptWins}-${sweptLosses}`,
                    swept_team_win_pct: `${sweptWinPct.toFixed(1)}%`,
                    swept_team_ranking: sweptRanking,
                    is_conference_rival: true,
                    conference: sweptConference,
                    avg_margin: avgMargin.toFixed(1)
                  };
                  console.log(`[Stat Router] NCAAB SWEEP CONTEXT: ${sweptTeamName} (${sweptWinPct.toFixed(1)}%${isRanked ? ', #' + sweptRanking : ''}) is 0-${gamesPlayed} vs conference rival ${dominantTeamName}`);
                }
              }
            }
          } catch (ncaabErr) {
            console.log(`[Stat Router] NCAAB sweep context check failed (non-fatal): ${ncaabErr.message}`);
          }
        }
      }
      
      // ===== CONDITIONS CHANGED CONTEXT (1-2 GAME H2H) =====
      // For small sample H2H (1-2 games), check if conditions have significantly changed
      // This helps Gary understand that a single game result may not be representative
      let conditionsChangedContext = null;
      
      if (isNba && h2hGames.length <= 2 && h2hResults.length > 0) {
        try {
          // Check for DNPs in previous H2H games (from personnel notes)
          const dnpMatches = [];
          for (const result of h2hResults) {
            if (result.personnel_note) {
              // Look for DNP patterns like "DNP: Embiid" or "Embiid (0 min)"
              const dnpPattern = /DNP:\s*([^|,]+)|(\w+)\s*\(0\s*min\)/gi;
              let match;
              while ((match = dnpPattern.exec(result.personnel_note)) !== null) {
                const playerName = (match[1] || match[2] || '').trim();
                if (playerName && playerName.length > 2) {
                  dnpMatches.push({
                    player: playerName,
                    date: result.date,
                    result: result.result
                  });
                }
              }
            }
          }
          
          // If we found DNPs, flag that conditions may have changed
          if (dnpMatches.length > 0) {
            const dnpList = dnpMatches.map(d => `${d.player} (out ${d.date})`).join(', ');
            const gamesText = h2hGames.length === 1 ? 'the only H2H game' : `${h2hGames.length} H2H games`;
            
            conditionsChangedContext = {
              triggered: true,
              dnp_players: dnpMatches,
              sample_size: h2hGames.length,
              note: `CONDITIONS CHANGED: In ${gamesText} this season, key player(s) were OUT: ${dnpList}. This result happened under different circumstances than tonight. Check current injury report for who is available tonight.`
            };
            console.log(`[Stat Router] CONDITIONS CHANGED: Found DNP(s) in H2H: ${dnpList}`);
          } else if (h2hGames.length === 1) {
            // Even without detected DNPs, flag that 1-game H2H is anecdotal
            conditionsChangedContext = {
              triggered: true,
              dnp_players: [],
              sample_size: 1,
              note: `Only 1 H2H game this season.`
            };
          }
        } catch (condErr) {
          console.log(`[Stat Router] Conditions changed check failed (non-fatal): ${condErr.message}`);
        }
      }
      
      return {
        category: `Head-to-Head History (${currentSeason} Season ONLY)`,
        games_found: h2hGames.length,
        h2h_available: true,
        this_season_record: `${homeName} ${homeWins}-${awayWins} ${awayName}`,
        meetings_this_season: h2hResults,
        revenge_game: revengeGame,
        revenge_note: revengeGame ? `${awayName} lost the last meeting.` : null,
        sweep_context: sweepContext,
        conditions_changed_context: conditionsChangedContext,
        ANTI_HALLUCINATION: `DATA BOUNDARY: You have ONLY ${h2hGames.length} verified H2H game(s) from the ${currentSeason} season. You may cite these specific games. DO NOT claim historical streaks, prior season records, or "all-time" H2H records that are not shown here.`
      };
    } catch (error) {
      console.error(`[Stat Router] Error fetching H2H history:`, error.message);
      return {
        category: 'Head-to-Head History',
        h2h_available: false,
        error: 'Data unavailable',
        ANTI_HALLUCINATION: 'CRITICAL: H2H data fetch FAILED. You have ZERO verified H2H data. DO NOT mention H2H history at all - focus on other factors instead.'
      };
    }
  },
};
