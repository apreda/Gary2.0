// Fixed NBA API Integration
// Replace the player_ids parameter formatting section with this code:

// Home team player stats section:
if (enhancedStats.home.keyPlayers.length > 0) {
  const playerIds = enhancedStats.home.keyPlayers.map(p => p.id);
  
  try {
    // Properly format player IDs as an array parameter
    const statsResponse = await axios.get(`https://api.balldontlie.io/v1/season_averages/general`, {
      headers: { 'Authorization': ballDontLieService.getApiKey() },
      params: { 
        season: season,
        season_type: 'regular',
        type: 'base',
        'player_ids[]': playerIds // Pass array directly
      }
    });
    
    // Process response as before
  } catch (error) {
    console.error(`Error getting player stats: ${error.message}`);
    console.error(`Response data:`, error.response?.data);
    console.error(`Status code:`, error.response?.status);
  }
}

// Away team player stats section:
if (enhancedStats.away.keyPlayers.length > 0) {
  const playerIds = enhancedStats.away.keyPlayers.map(p => p.id);
  
  try {
    // Properly format player IDs as an array parameter
    const statsResponse = await axios.get(`https://api.balldontlie.io/v1/season_averages/general`, {
      headers: { 'Authorization': ballDontLieService.getApiKey() },
      params: { 
        season: season,
        season_type: 'regular',
        type: 'base',
        'player_ids[]': playerIds // Pass array directly
      }
    });
    
    // Process response as before
  } catch (error) {
    console.error(`Error getting player stats: ${error.message}`);
    console.error(`Response data:`, error.response?.data);
    console.error(`Status code:`, error.response?.status);
  }
}
