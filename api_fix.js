// Fix for the NBA API integration to properly handle array parameters
// For the home team player stats
const properPlayerIdsParams = {};
playerIds.forEach((id, index) => {
  properPlayerIdsParams['player_ids[]'] = playerIds;
});

// For the away team player stats  
const properPlayerIdsParams = {};
playerIds.forEach((id, index) => {
  properPlayerIdsParams['player_ids[]'] = playerIds;
});
