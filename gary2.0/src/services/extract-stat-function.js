/**
 * Extract a specific stat from player statistics based on prop type
 * This function includes more forgiving property access and safety checks
 * @private
 */
_extractStatFromPlayerStats(playerStats, statType, league) {
  if (!playerStats) return null;
  
  // Add safe access with defaults to handle potential undefined properties
  const safeAccess = (obj, path, defaultValue = 0) => {
    try {
      const value = path.split('.').reduce((o, p) => (o && o[p] !== undefined) ? o[p] : null, obj);
      // Convert to number if possible, otherwise return null to indicate missing data
      const numValue = Number(value);
      return isNaN(numValue) ? null : numValue;
    } catch (e) {
      console.log(`Safe access error for path ${path}:`, e.message);
      return null;
    }
  };
  
  // Log the raw player stats for debugging
  console.log(`Raw player stats for ${statType}:`, JSON.stringify(playerStats));
  
  // Map normalized stat type to the property in player stats object
  if (league === 'NBA') {
    switch (statType) {
      case 'points': return safeAccess(playerStats, 'points');
      case 'rebounds': return safeAccess(playerStats, 'rebounds');
      case 'assists': return safeAccess(playerStats, 'assists');
      case 'steals': return safeAccess(playerStats, 'steals');
      case 'blocks': return safeAccess(playerStats, 'blocks');
      case 'threes': return safeAccess(playerStats, 'threes');
      case 'points+rebounds+assists': 
        return (safeAccess(playerStats, 'points') || 0) + 
               (safeAccess(playerStats, 'rebounds') || 0) + 
               (safeAccess(playerStats, 'assists') || 0);
      case 'points+rebounds': 
        return (safeAccess(playerStats, 'points') || 0) + 
               (safeAccess(playerStats, 'rebounds') || 0);
      case 'rebounds+assists': 
        return (safeAccess(playerStats, 'rebounds') || 0) + 
               (safeAccess(playerStats, 'assists') || 0);
      case 'points+assists': 
        return (safeAccess(playerStats, 'points') || 0) + 
               (safeAccess(playerStats, 'assists') || 0);
      case 'steals+blocks': 
        return (safeAccess(playerStats, 'steals') || 0) + 
               (safeAccess(playerStats, 'blocks') || 0);
      default: return null;
    }
  } else if (league === 'MLB') {
    // Try different property paths for MLB stats since API may return data in different structures
    switch (statType) {
      case 'strikeouts': 
        return safeAccess(playerStats, 'strikeouts') || 
               safeAccess(playerStats, 'statistics.0.strikeouts') || 
               safeAccess(playerStats, 'stats.strikeouts');
      case 'hits': 
        return safeAccess(playerStats, 'hits') || 
               safeAccess(playerStats, 'statistics.0.hits') || 
               safeAccess(playerStats, 'stats.hits');
      case 'runs': 
        return safeAccess(playerStats, 'runs') || 
               safeAccess(playerStats, 'statistics.0.runs') || 
               safeAccess(playerStats, 'stats.runs');
      case 'homeruns': 
        return safeAccess(playerStats, 'homeruns') || 
               safeAccess(playerStats, 'statistics.0.homeruns') || 
               safeAccess(playerStats, 'home_runs') || 
               safeAccess(playerStats, 'stats.homeruns');
      case 'rbis': 
        return safeAccess(playerStats, 'rbis') || 
               safeAccess(playerStats, 'rbi') || 
               safeAccess(playerStats, 'statistics.0.rbi') || 
               safeAccess(playerStats, 'stats.rbi');
      case 'doubles': 
        return safeAccess(playerStats, 'doubles') || 
               safeAccess(playerStats, 'statistics.0.doubles') || 
               safeAccess(playerStats, 'stats.doubles');
      case 'triples': 
        return safeAccess(playerStats, 'triples') || 
               safeAccess(playerStats, 'statistics.0.triples') || 
               safeAccess(playerStats, 'stats.triples');
      case 'bases': {
        // Get individual stats with null handling
        const hits = safeAccess(playerStats, 'hits') || 
                     safeAccess(playerStats, 'statistics.0.hits') || 
                     safeAccess(playerStats, 'stats.hits') || 0;
        const doubles = safeAccess(playerStats, 'doubles') || 
                        safeAccess(playerStats, 'statistics.0.doubles') || 
                        safeAccess(playerStats, 'stats.doubles') || 0;
        const triples = safeAccess(playerStats, 'triples') || 
                        safeAccess(playerStats, 'statistics.0.triples') || 
                        safeAccess(playerStats, 'stats.triples') || 0;
        const homeruns = safeAccess(playerStats, 'homeruns') || 
                         safeAccess(playerStats, 'statistics.0.homeruns') || 
                         safeAccess(playerStats, 'home_runs') || 
                         safeAccess(playerStats, 'stats.homeruns') || 0;
        
        // Calculate total bases: singles + 2*doubles + 3*triples + 4*HR
        const singles = Math.max(0, hits - doubles - triples - homeruns);
        return singles + (2 * doubles) + (3 * triples) + (4 * homeruns);
      }
      case 'innings': 
        return safeAccess(playerStats, 'innings_pitched') || 
               safeAccess(playerStats, 'statistics.0.innings.number') || 
               safeAccess(playerStats, 'stats.innings_pitched');
      default: return null;
    }
  } else if (league === 'NHL') {
    switch (statType) {
      case 'goals': 
        return safeAccess(playerStats, 'goals') || 
               safeAccess(playerStats, 'statistics.0.goals') || 
               safeAccess(playerStats, 'stats.goals');
      case 'assists': 
        return safeAccess(playerStats, 'assists') || 
               safeAccess(playerStats, 'statistics.0.assists') || 
               safeAccess(playerStats, 'stats.assists');
      case 'points': 
        return safeAccess(playerStats, 'points') || 
               safeAccess(playerStats, 'statistics.0.points') || 
               safeAccess(playerStats, 'stats.points');
      case 'shots': 
        return safeAccess(playerStats, 'shots') || 
               safeAccess(playerStats, 'statistics.0.shots') || 
               safeAccess(playerStats, 'stats.shots');
      case 'saves': 
        return safeAccess(playerStats, 'saves') || 
               safeAccess(playerStats, 'statistics.0.saves') || 
               safeAccess(playerStats, 'stats.saves');
      case 'points+shots': 
        return (safeAccess(playerStats, 'points') || 0) + 
               (safeAccess(playerStats, 'shots') || 0);
      case 'goals+assists': 
        return (safeAccess(playerStats, 'goals') || 0) + 
               (safeAccess(playerStats, 'assists') || 0);
      default: return null;
    }
  }
  
  return null;
}
