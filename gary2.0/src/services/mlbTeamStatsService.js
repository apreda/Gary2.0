/**
 * MLB Team Stats Service
 * Comprehensive team-level statistics for advanced analysis
 * Gets offensive, pitching, and sabermetric team stats
 */
import axios from 'axios';

const MLB_API_BASE_URL = 'https://statsapi.mlb.com/api/v1';

// Cache for team stats to avoid repeated API calls
const teamStatsCache = new Map();
const CACHE_TTL = 10 * 60 * 1000; // 10 minutes

/**
 * Cached API request to avoid duplicate calls
 */
async function cachedRequest(key, requestFn) {
  const cached = teamStatsCache.get(key);
  if (cached && (Date.now() - cached.timestamp < CACHE_TTL)) {
    console.log(`[MLB Team Stats] Using cached data for ${key}`);
    return cached.data;
  }

  console.log(`[MLB Team Stats] Making fresh API call for ${key}`);
  const data = await requestFn();
  teamStatsCache.set(key, { data, timestamp: Date.now() });
  return data;
}

/**
 * Get team ID by name with fuzzy matching
 */
async function getTeamId(teamName) {
  try {
    const response = await axios.get(`${MLB_API_BASE_URL}/teams`, {
      params: {
        sportId: 1,
        season: new Date().getFullYear()
      }
    });

    if (!response.data?.teams) return null;

    // Try exact match first
    let team = response.data.teams.find(t => 
      t.name.toLowerCase() === teamName.toLowerCase() ||
      t.teamName.toLowerCase() === teamName.toLowerCase()
    );

    // Try partial match if exact fails
    if (!team) {
      team = response.data.teams.find(t => 
        t.name.toLowerCase().includes(teamName.toLowerCase()) ||
        teamName.toLowerCase().includes(t.name.toLowerCase()) ||
        t.teamName.toLowerCase().includes(teamName.toLowerCase()) ||
        teamName.toLowerCase().includes(t.teamName.toLowerCase())
      );
    }

    return team ? { id: team.id, name: team.name, teamName: team.teamName } : null;
  } catch (error) {
    console.error(`[MLB Team Stats] Error finding team ID for ${teamName}:`, error.message);
    return null;
  }
}

const mlbTeamStatsService = {
  /**
   * Get comprehensive team offensive statistics
   * @param {string} teamName - Team name
   * @returns {Promise<Object>} - Offensive team stats
   */
  async getTeamOffensiveStats(teamName) {
    const cacheKey = `offensive_${teamName}_${new Date().getFullYear()}`;
    
    return cachedRequest(cacheKey, async () => {
      try {
        console.log(`[MLB Team Stats] Getting offensive stats for ${teamName}`);
        
        const teamInfo = await getTeamId(teamName);
        if (!teamInfo) {
          console.log(`[MLB Team Stats] Team not found: ${teamName}`);
          return null;
        }

        // Get team stats from MLB API
        const response = await axios.get(`${MLB_API_BASE_URL}/teams/${teamInfo.id}/stats`, {
          params: {
            stats: 'season',
            group: 'hitting',
            season: new Date().getFullYear(),
            sportId: 1
          }
        });

        if (!response.data?.stats?.[0]?.splits?.[0]?.stat) {
          console.log(`[MLB Team Stats] No offensive stats found for ${teamName}`);
          return null;
        }

        const stats = response.data.stats[0].splits[0].stat;
        
        // Calculate advanced metrics
        const gamesPlayed = stats.gamesPlayed || 1;
        const runsPerGame = (stats.runs || 0) / gamesPlayed;
        const teamOPS = parseFloat(stats.ops || '0.000');
        const teamAverage = parseFloat(stats.avg || '0.000');
        
        return {
          teamId: teamInfo.id,
          teamName: teamInfo.name,
          gamesPlayed,
          
          // Basic Offensive Stats
          runs: stats.runs || 0,
          runsPerGame: runsPerGame.toFixed(2),
          hits: stats.hits || 0,
          doubles: stats.doubles || 0,
          triples: stats.triples || 0,
          homeRuns: stats.homeRuns || 0,
          rbi: stats.rbi || 0,
          stolenBases: stats.stolenBases || 0,
          caughtStealing: stats.caughtStealing || 0,
          
          // Advanced Offensive Metrics
          teamAverage: teamAverage.toFixed(3),
          teamOBP: parseFloat(stats.obp || '0.000').toFixed(3),
          teamSLG: parseFloat(stats.slg || '0.000').toFixed(3),
          teamOPS: teamOPS.toFixed(3),
          
          // Plate Discipline
          walks: stats.baseOnBalls || 0,
          strikeouts: stats.strikeOuts || 0,
          hitByPitch: stats.hitByPitch || 0,
          
          // Situational Stats
          leftOnBase: stats.leftOnBase || 0,
          atBats: stats.atBats || 0,
          plateAppearances: stats.plateAppearances || 0,
          
          // Calculated Advanced Metrics
          homeRunsPerGame: ((stats.homeRuns || 0) / gamesPlayed).toFixed(2),
          stolenBaseSuccess: stats.stolenBases > 0 ? 
            ((stats.stolenBases / (stats.stolenBases + (stats.caughtStealing || 0))) * 100).toFixed(1) : '0.0',
          walkRate: stats.plateAppearances > 0 ? 
            (((stats.baseOnBalls || 0) / stats.plateAppearances) * 100).toFixed(1) : '0.0',
          strikeoutRate: stats.plateAppearances > 0 ? 
            (((stats.strikeOuts || 0) / stats.plateAppearances) * 100).toFixed(1) : '0.0'
        };
      } catch (error) {
        console.error(`[MLB Team Stats] Error getting offensive stats for ${teamName}:`, error.message);
        return null;
      }
    });
  },

  /**
   * Get comprehensive team pitching statistics
   * @param {string} teamName - Team name
   * @returns {Promise<Object>} - Pitching team stats
   */
  async getTeamPitchingStats(teamName) {
    const cacheKey = `pitching_${teamName}_${new Date().getFullYear()}`;
    
    return cachedRequest(cacheKey, async () => {
      try {
        console.log(`[MLB Team Stats] Getting pitching stats for ${teamName}`);
        
        const teamInfo = await getTeamId(teamName);
        if (!teamInfo) return null;

        const response = await axios.get(`${MLB_API_BASE_URL}/teams/${teamInfo.id}/stats`, {
          params: {
            stats: 'season',
            group: 'pitching',
            season: new Date().getFullYear(),
            sportId: 1
          }
        });

        if (!response.data?.stats?.[0]?.splits?.[0]?.stat) {
          console.log(`[MLB Team Stats] No pitching stats found for ${teamName}`);
          return null;
        }

        const stats = response.data.stats[0].splits[0].stat;
        
        // Calculate advanced metrics
        const inningsPitched = parseFloat(stats.inningsPitched || '0.0');
        const teamERA = parseFloat(stats.era || '0.00');
        const teamWHIP = parseFloat(stats.whip || '0.00');
        
        return {
          teamId: teamInfo.id,
          teamName: teamInfo.name,
          
          // Basic Pitching Stats
          wins: stats.wins || 0,
          losses: stats.losses || 0,
          saves: stats.saves || 0,
          blownSaves: stats.blownSaves || 0,
          holds: stats.holds || 0,
          
          // Core Pitching Metrics
          teamERA: teamERA.toFixed(2),
          teamWHIP: teamWHIP.toFixed(2),
          inningsPitched: inningsPitched.toFixed(1),
          
          // Runs and Hits Allowed
          runsAllowed: stats.runs || 0,
          earnedRuns: stats.earnedRuns || 0,
          hitsAllowed: stats.hits || 0,
          homeRunsAllowed: stats.homeRuns || 0,
          
          // Strikeouts and Walks
          strikeouts: stats.strikeOuts || 0,
          walksAllowed: stats.baseOnBalls || 0,
          hitBatsmen: stats.hitBatsmen || 0,
          
          // Advanced Pitching Metrics
          battingAvgAgainst: parseFloat(stats.avg || '0.000').toFixed(3),
          onBasePercentageAgainst: parseFloat(stats.obp || '0.000').toFixed(3),
          sluggingPercentageAgainst: parseFloat(stats.slg || '0.000').toFixed(3),
          
          // Rate Stats (per 9 innings)
          strikeoutsPer9: inningsPitched > 0 ? ((stats.strikeOuts || 0) * 9 / inningsPitched).toFixed(2) : '0.00',
          walksPer9: inningsPitched > 0 ? ((stats.baseOnBalls || 0) * 9 / inningsPitched).toFixed(2) : '0.00',
          homeRunsPer9: inningsPitched > 0 ? ((stats.homeRuns || 0) * 9 / inningsPitched).toFixed(2) : '0.00',
          hitsPer9: inningsPitched > 0 ? ((stats.hits || 0) * 9 / inningsPitched).toFixed(2) : '0.00',
          
          // Efficiency Metrics
          strikeoutToWalkRatio: (stats.baseOnBalls || 0) > 0 ? 
            ((stats.strikeOuts || 0) / stats.baseOnBalls).toFixed(2) : 'Inf',
          groundOutToAirOutRatio: parseFloat(stats.groundOutToAirOutRatio || '0.00').toFixed(2)
        };
      } catch (error) {
        console.error(`[MLB Team Stats] Error getting pitching stats for ${teamName}:`, error.message);
        return null;
      }
    });
  },

  /**
   * Get bullpen-specific statistics
   * @param {string} teamName - Team name
   * @returns {Promise<Object>} - Bullpen stats
   */
  async getBullpenStats(teamName) {
    const cacheKey = `bullpen_${teamName}_${new Date().getFullYear()}`;
    
    return cachedRequest(cacheKey, async () => {
      try {
        console.log(`[MLB Team Stats] Getting bullpen stats for ${teamName}`);
        
        const teamInfo = await getTeamId(teamName);
        if (!teamInfo) return null;

        // Get relief pitching stats
        const response = await axios.get(`${MLB_API_BASE_URL}/teams/${teamInfo.id}/stats`, {
          params: {
            stats: 'season',
            group: 'pitching',
            season: new Date().getFullYear(),
            sportId: 1,
            gameType: 'R'
          }
        });

        if (!response.data?.stats?.[0]?.splits?.[0]?.stat) {
          return null;
        }

        const stats = response.data.stats[0].splits[0].stat;
        
        // Try to get more specific bullpen stats
        let bullpenSpecificStats = {};
        try {
          const bullpenResponse = await axios.get(`${MLB_API_BASE_URL}/teams/${teamInfo.id}/roster`, {
            params: {
              rosterType: 'active'
            }
          });
          
          if (bullpenResponse.data?.roster) {
            // Filter for relief pitchers (non-starters)
            const relievers = bullpenResponse.data.roster.filter(p => 
              p.position.code === '1' && 
              p.position.name !== 'Starting Pitcher'
            );
            
            bullpenSpecificStats.relieverCount = relievers.length;
          }
        } catch (relieverError) {
          console.log(`[MLB Team Stats] Could not get specific bullpen roster for ${teamName}`);
        }
        
        return {
          teamId: teamInfo.id,
          teamName: teamInfo.name,
          
          // Bullpen Performance
          saves: stats.saves || 0,
          blownSaves: stats.blownSaves || 0,
          holds: stats.holds || 0,
          saveOpportunities: stats.saveOpportunities || 0,
          
          // Bullpen ERA and efficiency
          bullpenERA: parseFloat(stats.era || '0.00').toFixed(2),
          bullpenWHIP: parseFloat(stats.whip || '0.00').toFixed(2),
          
          // Save percentage
          savePercentage: (stats.saveOpportunities || 0) > 0 ? 
            (((stats.saves || 0) / stats.saveOpportunities) * 100).toFixed(1) : '0.0',
          
          // Inherited runners (approximation)
          inheritedRunners: stats.inheritedRunners || 0,
          inheritedRunnersScored: stats.inheritedRunnersScored || 0,
          inheritedRunnersPct: stats.inheritedRunners > 0 ? 
            (((stats.inheritedRunners - (stats.inheritedRunnersScored || 0)) / stats.inheritedRunners) * 100).toFixed(1) : '100.0',
          
          ...bullpenSpecificStats
        };
      } catch (error) {
        console.error(`[MLB Team Stats] Error getting bullpen stats for ${teamName}:`, error.message);
        return null;
      }
    });
  },

  /**
   * Get sabermetric team statistics
   * @param {string} teamName - Team name
   * @returns {Promise<Object>} - Advanced sabermetric stats
   */
  async getSabermetricStats(teamName) {
    const cacheKey = `sabermetric_${teamName}_${new Date().getFullYear()}`;
    
    return cachedRequest(cacheKey, async () => {
      try {
        console.log(`[MLB Team Stats] Getting sabermetric stats for ${teamName}`);
        
        const teamInfo = await getTeamId(teamName);
        if (!teamInfo) return null;

        // Get both hitting and pitching stats for calculations
        const [hittingResponse, pitchingResponse] = await Promise.all([
          axios.get(`${MLB_API_BASE_URL}/teams/${teamInfo.id}/stats`, {
            params: {
              stats: 'season',
              group: 'hitting',
              season: new Date().getFullYear(),
              sportId: 1
            }
          }),
          axios.get(`${MLB_API_BASE_URL}/teams/${teamInfo.id}/stats`, {
            params: {
              stats: 'season',
              group: 'pitching',
              season: new Date().getFullYear(),
              sportId: 1
            }
          })
        ]);

        const hittingStats = hittingResponse.data?.stats?.[0]?.splits?.[0]?.stat || {};
        const pitchingStats = pitchingResponse.data?.stats?.[0]?.splits?.[0]?.stat || {};
        
        // Calculate advanced sabermetrics
        const atBats = hittingStats.atBats || 0;
        const hits = hittingStats.hits || 0;
        const homeRuns = hittingStats.homeRuns || 0;
        const walks = hittingStats.baseOnBalls || 0;
        const hitByPitch = hittingStats.hitByPitch || 0;
        const sacrificeFlies = hittingStats.sacFlies || 0;
        
        // wOBA calculation (simplified)
        const singles = hits - hittingStats.doubles - hittingStats.triples - homeRuns;
        const plateAppearances = hittingStats.plateAppearances || 0;
        
        // wOBA weights (2023 values)
        const wOBA = plateAppearances > 0 ? 
          ((0.692 * walks) + (0.722 * hitByPitch) + (0.888 * singles) + 
           (1.271 * hittingStats.doubles) + (1.616 * hittingStats.triples) + 
           (2.101 * homeRuns)) / (atBats + walks + sacrificeFlies + hitByPitch) : 0;
        
        // BABIP calculation
        const babip = (atBats - hittingStats.strikeOuts - homeRuns + sacrificeFlies) > 0 ?
          (hits - homeRuns) / (atBats - hittingStats.strikeOuts - homeRuns + sacrificeFlies) : 0;
        
        // FIP calculation for pitching
        const inningsPitched = parseFloat(pitchingStats.inningsPitched || '0.0');
        const fip = inningsPitched > 0 ? 
          (((13 * pitchingStats.homeRuns) + (3 * pitchingStats.baseOnBalls) - (2 * pitchingStats.strikeOuts)) / inningsPitched) + 3.10 : 0;
        
        return {
          teamId: teamInfo.id,
          teamName: teamInfo.name,
          
          // Advanced Offensive Metrics
          wOBA: wOBA.toFixed(3),
          babip: babip.toFixed(3),
          isolatedPower: atBats > 0 ? ((hittingStats.slg || 0) - (hittingStats.avg || 0)).toFixed(3) : '0.000',
          
          // Advanced Pitching Metrics
          fip: fip.toFixed(2),
          xFIP: fip.toFixed(2), // Simplified - would need league HR/FB rate for true xFIP
          
          // Team WAR (approximation - would need more complex calculation for true WAR)
          teamWAR: 'N/A', // Would require complex calculation with replacement level
          
          // Run Creation and Prevention
          runsCreated: hittingStats.runs || 0,
          runsPrevented: 'N/A', // Would require league average comparison
          
          // Pythagorean Win Percentage
          runsScored: hittingStats.runs || 0,
          runsAllowed: pitchingStats.runs || 0,
          pythagoreanWinPct: (hittingStats.runs && pitchingStats.runs) ? 
            (Math.pow(hittingStats.runs, 2) / (Math.pow(hittingStats.runs, 2) + Math.pow(pitchingStats.runs, 2))).toFixed(3) : '0.000'
        };
      } catch (error) {
        console.error(`[MLB Team Stats] Error getting sabermetric stats for ${teamName}:`, error.message);
        return null;
      }
    });
  },

  /**
   * Get comprehensive team statistics (all categories combined)
   * @param {string} teamName - Team name
   * @returns {Promise<Object>} - Complete team stats
   */
  async getComprehensiveTeamStats(teamName) {
    try {
      console.log(`[MLB Team Stats] Getting comprehensive stats for ${teamName}`);
      
      const [offensiveStats, pitchingStats, bullpenStats, sabermetricStats] = await Promise.all([
        this.getTeamOffensiveStats(teamName),
        this.getTeamPitchingStats(teamName),
        this.getBullpenStats(teamName),
        this.getSabermetricStats(teamName)
      ]);

      if (!offensiveStats && !pitchingStats) {
        console.log(`[MLB Team Stats] No stats found for ${teamName}`);
        return null;
      }

      return {
        teamName,
        lastUpdated: new Date().toISOString(),
        
        offense: offensiveStats || {},
        pitching: pitchingStats || {},
        bullpen: bullpenStats || {},
        advanced: sabermetricStats || {},
        
        // Summary metrics for quick reference
        summary: {
          runsPerGame: offensiveStats?.runsPerGame || '0.00',
          teamERA: pitchingStats?.teamERA || '0.00',
          teamOPS: offensiveStats?.teamOPS || '0.000',
          teamWHIP: pitchingStats?.teamWHIP || '0.00',
          bullpenERA: bullpenStats?.bullpenERA || '0.00',
          wOBA: sabermetricStats?.wOBA || '0.000',
          fip: sabermetricStats?.fip || '0.00'
        }
      };
    } catch (error) {
      console.error(`[MLB Team Stats] Error getting comprehensive stats for ${teamName}:`, error.message);
      return null;
    }
  },

  /**
   * Get team stats comparison for a matchup
   * @param {string} homeTeam - Home team name
   * @param {string} awayTeam - Away team name
   * @returns {Promise<Object>} - Team stats comparison
   */
  async getTeamStatsComparison(homeTeam, awayTeam) {
    try {
      console.log(`[MLB Team Stats] Getting team comparison: ${awayTeam} @ ${homeTeam}`);
      
      const [homeStats, awayStats] = await Promise.all([
        this.getComprehensiveTeamStats(homeTeam),
        this.getComprehensiveTeamStats(awayTeam)
      ]);

      if (!homeStats || !awayStats) {
        console.log(`[MLB Team Stats] Could not get stats for both teams`);
        return null;
      }

      // Create comparison metrics
      const comparison = {
        matchup: `${awayTeam} @ ${homeTeam}`,
        homeTeam: homeStats,
        awayTeam: awayStats,
        
        advantages: {
          offense: {
            runsPerGame: parseFloat(homeStats.summary.runsPerGame) > parseFloat(awayStats.summary.runsPerGame) ? homeTeam : awayTeam,
            teamOPS: parseFloat(homeStats.summary.teamOPS) > parseFloat(awayStats.summary.teamOPS) ? homeTeam : awayTeam,
            wOBA: parseFloat(homeStats.summary.wOBA) > parseFloat(awayStats.summary.wOBA) ? homeTeam : awayTeam
          },
          pitching: {
            teamERA: parseFloat(homeStats.summary.teamERA) < parseFloat(awayStats.summary.teamERA) ? homeTeam : awayTeam,
            teamWHIP: parseFloat(homeStats.summary.teamWHIP) < parseFloat(awayStats.summary.teamWHIP) ? homeTeam : awayTeam,
            fip: parseFloat(homeStats.summary.fip) < parseFloat(awayStats.summary.fip) ? homeTeam : awayTeam
          },
          bullpen: {
            bullpenERA: parseFloat(homeStats.summary.bullpenERA) < parseFloat(awayStats.summary.bullpenERA) ? homeTeam : awayTeam
          }
        }
      };

      return comparison;
    } catch (error) {
      console.error(`[MLB Team Stats] Error getting team comparison:`, error.message);
      return null;
    }
  }
};

export { mlbTeamStatsService }; 