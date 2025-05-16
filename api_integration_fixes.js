/**
 * FIXED API INTEGRATIONS FOR MLB AND NBA
 * 
 * This file contains corrected versions of the MLB and NBA API integrations
 * to fix the 400 Bad Request errors by properly formatting array parameters 
 * and improving error handling.
 */

// ===== MLB API INTEGRATION FIX =====
const getEnhancedMLBStats = async (homeTeam, awayTeam) => {
  try {
    console.log(`Getting enhanced MLB stats for ${homeTeam} vs ${awayTeam} from Ball Don't Lie API...`);
    
    // Create a basic stats object
    const enhancedStats = {
      home: { team: homeTeam, detailedStats: {} },
      away: { team: awayTeam, detailedStats: {} },
      startingPitchers: {
        home: { name: '', stats: {} },
        away: { name: '', stats: {} }
      }
    };
    
    // Get current season and previous season for fallback
    const currentYear = new Date().getFullYear();
    const previousYear = currentYear - 1;
    let season = currentYear; // Default to current season
    
    try {
      // Get all MLB teams
      const response = await axios.get(`https://api.balldontlie.io/mlb/v1/teams`, {
        headers: { 'Authorization': ballDontLieService.getApiKey() }
      });
      
      if (response.data && response.data.data) {
        const teams = response.data.data;
        
        // Find home and away teams by name (with fuzzy matching)
        const homeTeamData = teams.find(team => 
          team.full_name.includes(homeTeam) || 
          homeTeam.includes(team.name) ||
          homeTeam.includes(team.city));
        
        const awayTeamData = teams.find(team => 
          team.full_name.includes(awayTeam) || 
          awayTeam.includes(team.name) ||
          awayTeam.includes(team.city));
        
        // Get team stats for current season
        if (homeTeamData) {
          try {
            // FIXED: Properly format team_id as an array parameter
            const homeTeamStatsResponse = await axios.get(`https://api.balldontlie.io/mlb/v1/teams/season_stats`, {
              headers: { 'Authorization': ballDontLieService.getApiKey() },
              params: { 
                season: season, 
                'team_id[]': homeTeamData.id, // Correctly formatted array parameter
                postseason: false
              }
            });
            
            if (homeTeamStatsResponse.data && homeTeamStatsResponse.data.data && homeTeamStatsResponse.data.data[0]) {
              enhancedStats.home.detailedStats = homeTeamStatsResponse.data.data[0];
              enhancedStats.home.teamId = homeTeamData.id;
              enhancedStats.home.league = `${homeTeamData.league} League ${homeTeamData.division} Division`;
            } else {
              console.log(`No current season (${season}) stats found for ${homeTeam}. Trying previous season...`);
              
              // Fall back to previous season if current season has no data
              try {
                const homeTeamStatsResponse = await axios.get(`https://api.balldontlie.io/mlb/v1/teams/season_stats`, {
                  headers: { 'Authorization': ballDontLieService.getApiKey() },
                  params: { 
                    season: previousYear,
                    'team_id[]': homeTeamData.id, // Correctly formatted array parameter
                    postseason: false
                  }
                });
                
                if (homeTeamStatsResponse.data && homeTeamStatsResponse.data.data && homeTeamStatsResponse.data.data[0]) {
                  enhancedStats.home.detailedStats = homeTeamStatsResponse.data.data[0];
                  enhancedStats.home.teamId = homeTeamData.id;
                  enhancedStats.home.league = `${homeTeamData.league} League ${homeTeamData.division} Division`;
                }
              } catch (fallbackError) {
                console.error(`Fallback attempt for home team also failed: ${fallbackError.message}`);
                console.error(`Response data:`, fallbackError.response?.data);
                console.error(`Status code:`, fallbackError.response?.status);
              }
            }
            
            // Get pitchers for home team (if applicable)
            try {
              const pitchersResponse = await axios.get(`https://api.balldontlie.io/mlb/v1/players`, {
                headers: { 'Authorization': ballDontLieService.getApiKey() },
                params: { 
                  'team_id[]': homeTeamData.id, // Correctly formatted array parameter
                  position: 'P', // Pitcher
                  per_page: 10 // Get top pitchers
                }
              });
              
              if (pitchersResponse.data && pitchersResponse.data.data) {
                const pitchers = pitchersResponse.data.data;
                if (pitchers.length > 0) {
                  // Get most recent pitcher stats
                  enhancedStats.startingPitchers.home.name = `${pitchers[0].first_name} ${pitchers[0].last_name}`;
                  
                  try {
                    const pitcherStatsResponse = await axios.get(`https://api.balldontlie.io/mlb/v1/player_stats/averages`, {
                      headers: { 'Authorization': ballDontLieService.getApiKey() },
                      params: { 
                        season: season,
                        'player_id[]': pitchers[0].id, // Correctly formatted array parameter
                        type: 'pitching'
                      }
                    });
                    
                    if (pitcherStatsResponse.data && pitcherStatsResponse.data.data && pitcherStatsResponse.data.data[0]) {
                      enhancedStats.startingPitchers.home.stats = pitcherStatsResponse.data.data[0];
                    }
                  } catch (error) {
                    console.error(`Error getting home pitcher stats: ${error.message}`);
                    console.error(`Response data:`, error.response?.data);
                    console.error(`Status code:`, error.response?.status);
                  }
                }
              }
            } catch (error) {
              console.error(`Error getting home team pitchers: ${error.message}`);
              console.error(`Response data:`, error.response?.data);
              console.error(`Status code:`, error.response?.status);
            }
          } catch (error) {
            console.error(`Error getting home team stats: ${error.message}`);
            console.error(`Response data:`, error.response?.data);
            console.error(`Status code:`, error.response?.status);
          }
        }
        
        // Same process for away team
        if (awayTeamData) {
          try {
            // FIXED: Properly format team_id as an array parameter
            const awayTeamStatsResponse = await axios.get(`https://api.balldontlie.io/mlb/v1/teams/season_stats`, {
              headers: { 'Authorization': ballDontLieService.getApiKey() },
              params: { 
                season: season,
                'team_id[]': awayTeamData.id, // Correctly formatted array parameter
                postseason: false
              }
            });
            
            if (awayTeamStatsResponse.data && awayTeamStatsResponse.data.data && awayTeamStatsResponse.data.data[0]) {
              enhancedStats.away.detailedStats = awayTeamStatsResponse.data.data[0];
              enhancedStats.away.teamId = awayTeamData.id;
              enhancedStats.away.league = `${awayTeamData.league} League ${awayTeamData.division} Division`;
            } else {
              console.log(`No current season (${season}) stats found for ${awayTeam}. Trying previous season...`);
              
              // Fall back to previous season if current season has no data
              try {
                const awayTeamStatsResponse = await axios.get(`https://api.balldontlie.io/mlb/v1/teams/season_stats`, {
                  headers: { 'Authorization': ballDontLieService.getApiKey() },
                  params: { 
                    season: previousYear,
                    'team_id[]': awayTeamData.id, // Correctly formatted array parameter
                    postseason: false
                  }
                });
                
                if (awayTeamStatsResponse.data && awayTeamStatsResponse.data.data && awayTeamStatsResponse.data.data[0]) {
                  enhancedStats.away.detailedStats = awayTeamStatsResponse.data.data[0];
                  enhancedStats.away.teamId = awayTeamData.id;
                  enhancedStats.away.league = `${awayTeamData.league} League ${awayTeamData.division} Division`;
                }
              } catch (fallbackError) {
                console.error(`Fallback attempt for away team also failed: ${fallbackError.message}`);
                console.error(`Response data:`, fallbackError.response?.data);
                console.error(`Status code:`, fallbackError.response?.status);
              }
            }
            
            // Get pitchers for away team (if applicable)
            try {
              const pitchersResponse = await axios.get(`https://api.balldontlie.io/mlb/v1/players`, {
                headers: { 'Authorization': ballDontLieService.getApiKey() },
                params: { 
                  'team_id[]': awayTeamData.id, // Correctly formatted array parameter
                  position: 'P', // Pitcher
                  per_page: 10 // Get top pitchers
                }
              });
              
              if (pitchersResponse.data && pitchersResponse.data.data) {
                const pitchers = pitchersResponse.data.data;
                if (pitchers.length > 0) {
                  // Get most recent pitcher stats
                  enhancedStats.startingPitchers.away.name = `${pitchers[0].first_name} ${pitchers[0].last_name}`;
                  
                  try {
                    const pitcherStatsResponse = await axios.get(`https://api.balldontlie.io/mlb/v1/player_stats/averages`, {
                      headers: { 'Authorization': ballDontLieService.getApiKey() },
                      params: { 
                        season: season,
                        'player_id[]': pitchers[0].id, // Correctly formatted array parameter
                        type: 'pitching'
                      }
                    });
                    
                    if (pitcherStatsResponse.data && pitcherStatsResponse.data.data && pitcherStatsResponse.data.data[0]) {
                      enhancedStats.startingPitchers.away.stats = pitcherStatsResponse.data.data[0];
                    }
                  } catch (error) {
                    console.error(`Error getting away pitcher stats: ${error.message}`);
                    console.error(`Response data:`, error.response?.data);
                    console.error(`Status code:`, error.response?.status);
                  }
                }
              }
            } catch (error) {
              console.error(`Error getting away team pitchers: ${error.message}`);
              console.error(`Response data:`, error.response?.data);
              console.error(`Status code:`, error.response?.status);
            }
          } catch (error) {
            console.error(`Error getting away team stats: ${error.message}`);
            console.error(`Response data:`, error.response?.data);
            console.error(`Status code:`, error.response?.status);
          }
        }
      }
    } catch (error) {
      console.error(`Error fetching MLB team data: ${error.message}`);
      console.error(`Response data:`, error.response?.data);
      console.error(`Status code:`, error.response?.status);
    }
    
    return enhancedStats;
  } catch (error) {
    console.error(`Error getting enhanced MLB stats: ${error.message}`);
    return { home: { team: homeTeam }, away: { team: awayTeam }, startingPitchers: {} };
  }
};

// ===== NBA API INTEGRATION FIX =====
const getEnhancedNBAStats = async (homeTeam, awayTeam) => {
  try {
    console.log(`Getting enhanced NBA stats for ${homeTeam} vs ${awayTeam} from Ball Don't Lie API...`);
    
    // Create a basic stats object
    const enhancedStats = {
      home: { team: homeTeam, detailedStats: {}, keyPlayers: [] },
      away: { team: awayTeam, detailedStats: {}, keyPlayers: [] }
    };
    
    // Get current season and previous season for fallback
    const currentYear = new Date().getFullYear();
    const previousYear = currentYear - 1;
    const season = currentYear; // Default to current season
    
    // Attempt to get team stats
    try {
      // Get all NBA teams
      const response = await axios.get(`https://api.balldontlie.io/v1/teams`, {
        headers: { 'Authorization': ballDontLieService.getApiKey() }
      });
      
      if (response.data && response.data.data) {
        const teams = response.data.data;
        
        // Find home and away teams by name (with fuzzy matching)
        const homeTeamData = teams.find(team => 
          team.full_name.includes(homeTeam) || 
          homeTeam.includes(team.name) ||
          homeTeam.includes(team.city));
        
        const awayTeamData = teams.find(team => 
          team.full_name.includes(awayTeam) || 
          awayTeam.includes(team.name) ||
          awayTeam.includes(team.city));
        
        // Get team standings for current season
        if (homeTeamData) {
          enhancedStats.home.teamId = homeTeamData.id;
          enhancedStats.home.conference = homeTeamData.conference;
          enhancedStats.home.division = homeTeamData.division;
          
          // Try to get team standings
          try {
            const standingsResponse = await axios.get(`https://api.balldontlie.io/v1/standings`, {
              headers: { 'Authorization': ballDontLieService.getApiKey() },
              params: { season: season }
            });
            
            if (standingsResponse.data && standingsResponse.data.data) {
              const homeStanding = standingsResponse.data.data.find(standing => 
                standing.team.id === homeTeamData.id);
              
              if (homeStanding) {
                enhancedStats.home.detailedStats = {
                  wins: homeStanding.wins,
                  losses: homeStanding.losses,
                  winPercent: homeStanding.win_percent,
                  conferenceRank: homeStanding.conference_rank,
                  divisionRank: homeStanding.division_rank,
                  homeRecord: homeStanding.home_record,
                  awayRecord: homeStanding.road_record,
                  lastTenGames: homeStanding.last_ten_games
                };
              }
            }
          } catch (error) {
            console.error(`Error getting NBA standings: ${error.message}`);
            console.error(`Response data:`, error.response?.data);
            console.error(`Status code:`, error.response?.status);
          }
          
          // Get key players for home team
          try {
            const playersResponse = await axios.get(`https://api.balldontlie.io/v1/players`, {
              headers: { 'Authorization': ballDontLieService.getApiKey() },
              params: { 
                'team_ids[]': homeTeamData.id, // Correctly formatted array parameter
                per_page: 25 // Get top players
              }
            });
            
            if (playersResponse.data && playersResponse.data.data) {
              const players = playersResponse.data.data;
              enhancedStats.home.keyPlayers = players.slice(0, 5).map(player => ({
                id: player.id,
                name: `${player.first_name} ${player.last_name}`,
                position: player.position,
                stats: {}
              }));
              
              // Try to get season averages for key players
              if (enhancedStats.home.keyPlayers.length > 0) {
                const playerIds = enhancedStats.home.keyPlayers.map(p => p.id);
                
                try {
                  // FIXED: Properly format player_ids as an array parameter
                  const statsResponse = await axios.get(`https://api.balldontlie.io/v1/season_averages/general`, {
                    headers: { 'Authorization': ballDontLieService.getApiKey() },
                    params: { 
                      season: season,
                      season_type: 'regular',
                      type: 'base',
                      'player_ids[]': playerIds // Pass array directly for proper formatting
                    }
                  });
                  
                  if (statsResponse.data && statsResponse.data.data) {
                    statsResponse.data.data.forEach(playerStat => {
                      const player = enhancedStats.home.keyPlayers.find(p => p.id === playerStat.player.id);
                      if (player) {
                        player.stats = playerStat.stats;
                      }
                    });
                  }
                } catch (error) {
                  console.error(`Error getting player stats: ${error.message}`);
                  console.error(`Response data:`, error.response?.data);
                  console.error(`Status code:`, error.response?.status);
                }
              }
            }
          } catch (error) {
            console.error(`Error getting home team players: ${error.message}`);
            console.error(`Response data:`, error.response?.data);
            console.error(`Status code:`, error.response?.status);
          }
        }
        
        // Same process for away team
        if (awayTeamData) {
          enhancedStats.away.teamId = awayTeamData.id;
          enhancedStats.away.conference = awayTeamData.conference;
          enhancedStats.away.division = awayTeamData.division;
          
          // Try to get team standings
          try {
            const standingsResponse = await axios.get(`https://api.balldontlie.io/v1/standings`, {
              headers: { 'Authorization': ballDontLieService.getApiKey() },
              params: { season: season }
            });
            
            if (standingsResponse.data && standingsResponse.data.data) {
              const awayStanding = standingsResponse.data.data.find(standing => 
                standing.team.id === awayTeamData.id);
              
              if (awayStanding) {
                enhancedStats.away.detailedStats = {
                  wins: awayStanding.wins,
                  losses: awayStanding.losses,
                  winPercent: awayStanding.win_percent,
                  conferenceRank: awayStanding.conference_rank,
                  divisionRank: awayStanding.division_rank,
                  homeRecord: awayStanding.home_record,
                  awayRecord: awayStanding.road_record,
                  lastTenGames: awayStanding.last_ten_games
                };
              }
            }
          } catch (error) {
            console.error(`Error getting NBA standings: ${error.message}`);
            console.error(`Response data:`, error.response?.data);
            console.error(`Status code:`, error.response?.status);
          }
          
          // Get key players for away team
          try {
            const playersResponse = await axios.get(`https://api.balldontlie.io/v1/players`, {
              headers: { 'Authorization': ballDontLieService.getApiKey() },
              params: { 
                'team_ids[]': awayTeamData.id, // Correctly formatted array parameter
                per_page: 25 // Get top players
              }
            });
            
            if (playersResponse.data && playersResponse.data.data) {
              const players = playersResponse.data.data;
              enhancedStats.away.keyPlayers = players.slice(0, 5).map(player => ({
                id: player.id,
                name: `${player.first_name} ${player.last_name}`,
                position: player.position,
                stats: {}
              }));
              
              // Try to get season averages for key players
              if (enhancedStats.away.keyPlayers.length > 0) {
                const playerIds = enhancedStats.away.keyPlayers.map(p => p.id);
                
                try {
                  // FIXED: Properly format player_ids as an array parameter
                  const statsResponse = await axios.get(`https://api.balldontlie.io/v1/season_averages/general`, {
                    headers: { 'Authorization': ballDontLieService.getApiKey() },
                    params: { 
                      season: season,
                      season_type: 'regular',
                      type: 'base',
                      'player_ids[]': playerIds // Pass array directly for proper formatting
                    }
                  });
                  
                  if (statsResponse.data && statsResponse.data.data) {
                    statsResponse.data.data.forEach(playerStat => {
                      const player = enhancedStats.away.keyPlayers.find(p => p.id === playerStat.player.id);
                      if (player) {
                        player.stats = playerStat.stats;
                      }
                    });
                  }
                } catch (error) {
                  console.error(`Error getting player stats: ${error.message}`);
                  console.error(`Response data:`, error.response?.data);
                  console.error(`Status code:`, error.response?.status);
                }
              }
            }
          } catch (error) {
            console.error(`Error getting away team players: ${error.message}`);
            console.error(`Response data:`, error.response?.data);
            console.error(`Status code:`, error.response?.status);
          }
        }
      }
    } catch (error) {
      console.error(`Error fetching NBA team data: ${error.message}`);
      console.error(`Response data:`, error.response?.data);
      console.error(`Status code:`, error.response?.status);
    }
    
    return enhancedStats;
  } catch (error) {
    console.error(`Error getting enhanced NBA stats: ${error.message}`);
    return { home: { team: homeTeam, keyPlayers: [] }, away: { team: awayTeam, keyPlayers: [] } };
  }
};
