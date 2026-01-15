/**
 * NBA DFS Stacking & Correlation Rules
 * Implements sharp GPP principles for team and game stacking.
 */

export const PLAYER_ROLES = {
  PRIMARY_BALL_HANDLER: 'primary_ball_handler',
  SECONDARY_BALL_HANDLER: 'secondary_ball_handler',
  RIM_RUNNER: 'rim_runner',
  SPOT_UP_SHOOTER: 'spot_up_shooter',
  WING_CREATOR: 'wing_creator',
  STRETCH_BIG: 'stretch_big',
  POST_SCORER: 'post_scorer',
  ALPHA: 'alpha',
  ROLE_PLAYER: 'role_player'
};

export const CORRELATION_MATRIX = {
  // Positive correlations (Good stacks)
  [`${PLAYER_ROLES.PRIMARY_BALL_HANDLER}+${PLAYER_ROLES.RIM_RUNNER}`]: 0.7,
  [`${PLAYER_ROLES.PRIMARY_BALL_HANDLER}+${PLAYER_ROLES.SPOT_UP_SHOOTER}`]: 0.5,
  [`${PLAYER_ROLES.SECONDARY_BALL_HANDLER}+${PLAYER_ROLES.RIM_RUNNER}`]: 0.4,
  [`${PLAYER_ROLES.WING_CREATOR}+${PLAYER_ROLES.STRETCH_BIG}`]: 0.4,
  [`${PLAYER_ROLES.ALPHA}+${PLAYER_ROLES.ROLE_PLAYER}`]: 0.3,

  // Negative correlations (Cannibalization)
  [`${PLAYER_ROLES.PRIMARY_BALL_HANDLER}+${PLAYER_ROLES.PRIMARY_BALL_HANDLER}`]: -0.5,
  [`${PLAYER_ROLES.SECONDARY_BALL_HANDLER}+${PLAYER_ROLES.SECONDARY_BALL_HANDLER}`]: -0.3,
  [`${PLAYER_ROLES.ALPHA}+${PLAYER_ROLES.ALPHA}`]: -0.8,
  [`${PLAYER_ROLES.WING_CREATOR}+${PLAYER_ROLES.WING_CREATOR}`]: -0.4,
  [`${PLAYER_ROLES.RIM_RUNNER}+${PLAYER_ROLES.POST_SCORER}`]: -0.3,
  [`${PLAYER_ROLES.POST_SCORER}+${PLAYER_ROLES.POST_SCORER}`]: -0.6
};

export const NBA_STACKING_RULES = {
  STANDARD: {
    maxSameTeam: 3,
    preferredStackSize: 2,
    penaltyOver: 3,
    bonusForGameStack: true,
    totalThreshold: 230
  },
  SHOOTOUT: {
    maxSameTeam: 4,
    preferredStackSize: 3,
    penaltyOver: 4,
    bonusForGameStack: true,
    bringBackRequired: true,
    totalThreshold: 235
  },
  SMALL_SLATE: {
    maxSameTeam: 5,
    preferredStackSize: 3,
    penaltyOver: 5,
    concentrationAllowed: true,
    slateSizeThreshold: 3
  }
};

/**
 * Infer player role from stats
 */
export function inferPlayerRole(player) {
  const pos = (player.position || '').toUpperCase();
  const usage = player.usageRate || player.seasonStats?.usageRate || 20;
  const assists = player.assistsPerGame || player.seasonStats?.apg || 3;
  const ppg = player.ppg || player.seasonStats?.ppg || 10;
  const threeAttempts = player.threeAttempts || player.seasonStats?.tpa || 3;

  // Alpha check (Elite production)
  if (ppg > 25 && usage > 28 && assists > 5) return PLAYER_ROLES.ALPHA;
  
  // Primary Ball Handler
  if (usage > 25 && assists > 6) return PLAYER_ROLES.PRIMARY_BALL_HANDLER;
  
  // Secondary Ball Handler
  if (assists > 4 && usage > 20) return PLAYER_ROLES.SECONDARY_BALL_HANDLER;
  
  // Big man roles
  if (pos.includes('C') || pos.includes('PF')) {
    if (threeAttempts > 4) return PLAYER_ROLES.STRETCH_BIG;
    if (usage > 24) return PLAYER_ROLES.POST_SCORER;
    return PLAYER_ROLES.RIM_RUNNER;
  }
  
  // Wing roles
  if (pos.includes('F') || pos.includes('SG')) {
    if (usage > 23) return PLAYER_ROLES.WING_CREATOR;
    if (threeAttempts > 5) return PLAYER_ROLES.SPOT_UP_SHOOTER;
  }
  
  return PLAYER_ROLES.ROLE_PLAYER;
}

/**
 * Evaluate correlation between two players
 */
export function evaluateCorrelation(p1, p2) {
  if (p1.team !== p2.team) return 0;
  
  const role1 = p1.role || inferPlayerRole(p1);
  const role2 = p2.role || inferPlayerRole(p2);
  
  const pair1 = `${role1}+${role2}`;
  const pair2 = `${role2}+${role1}`;
  
  return CORRELATION_MATRIX[pair1] || CORRELATION_MATRIX[pair2] || 0;
}

/**
 * Analyze stacking in a complete lineup
 */
export function analyzeLineupStacking(lineup, context) {
  const players = Array.isArray(lineup) ? lineup : (lineup.lineup || []);
  const teamCounts = {};
  const strengths = [];
  const weaknesses = [];
  let sharpScore = 0;
  
  const slateSize = context.slate?.gameCount || 8;
  const isSmallSlate = slateSize <= NBA_STACKING_RULES.SMALL_SLATE.slateSizeThreshold;
  
  players.forEach(p => {
    teamCounts[p.team] = (teamCounts[p.team] || 0) + 1;
  });

  // Evaluate each team stack
  for (const [team, count] of Object.entries(teamCounts)) {
    const teamPlayers = players.filter(p => p.team === team);
    const gameTotal = context.vegasLines?.[team]?.total || 225;
    const isShootout = gameTotal >= NBA_STACKING_RULES.SHOOTOUT.totalThreshold;
    
    let maxAllowed = NBA_STACKING_RULES.STANDARD.maxSameTeam;
    if (isSmallSlate) maxAllowed = NBA_STACKING_RULES.SMALL_SLATE.maxSameTeam;
    else if (isShootout) maxAllowed = NBA_STACKING_RULES.SHOOTOUT.maxSameTeam;

    if (count > maxAllowed) {
      weaknesses.push(`⚠️ ${count} players from ${team} exceeds limit (${maxAllowed} max for ${isSmallSlate ? 'small slate' : isShootout ? 'shootout' : 'standard'} game)`);
      sharpScore -= 15;
    } else if (count >= 2) {
      // Analyze internal correlation
      let stackCorrelation = 0;
      let pairs = 0;
      
      for (let i = 0; i < teamPlayers.length; i++) {
        for (let j = i + 1; j < teamPlayers.length; j++) {
          stackCorrelation += evaluateCorrelation(teamPlayers[i], teamPlayers[j]);
          pairs++;
        }
      }
      
      const avgCorrelation = pairs > 0 ? stackCorrelation / pairs : 0;
      
      if (avgCorrelation > 0.3) {
        strengths.push(`✓ Smart ${team} stack (${count} players): Complementary roles with ${avgCorrelation.toFixed(2)} correlation.`);
        sharpScore += 10;
      } else if (avgCorrelation < -0.2) {
        weaknesses.push(`⚠️ ${team} stack has high cannibalization risk (correlation: ${avgCorrelation.toFixed(2)})`);
        sharpScore -= 10;
      }
    }
  }

  // Evaluate Game Stacks (Bring-backs)
  const games = context.games || context.slate?.matchups || [];
  const gameStacks = [];
  
  // Normalize matchups if they are strings like "DET@CHA"
  const normalizedGames = games.map(g => {
    if (typeof g === 'string') {
      const [away, home] = g.split('@');
      return { awayTeam: away, homeTeam: home };
    }
    return g;
  });

  normalizedGames.forEach(game => {
    const awayCount = teamCounts[game.awayTeam] || 0;
    const homeCount = teamCounts[game.homeTeam] || 0;
    
    if (awayCount + homeCount >= 3 && awayCount >= 1 && homeCount >= 1) {
      strengths.push(`✓ Elite Game Stack: ${game.awayTeam}@${game.homeTeam} (${awayCount}+${homeCount} build)`);
      sharpScore += 15;
      gameStacks.push(`${game.awayTeam}@${game.homeTeam}`);
    }
  });

  // Calculate final grade
  let grade = 'C';
  if (sharpScore >= 25) grade = 'A';
  else if (sharpScore >= 10) grade = 'B';
  else if (sharpScore < 0) grade = 'D';
  else if (sharpScore < -20) grade = 'F';

  return {
    grade,
    sharpScore,
    strengths,
    weaknesses,
    teamCounts,
    gameStacks
  };
}

/**
 * Suggest optimal stacks for a slate
 */
export function suggestStacks(playerPool, context) {
  const suggestions = [];
  const games = context.games || context.slate?.matchups || [];
  
  // Similar normalization
  const normalizedGames = games.map(g => {
    if (typeof g === 'string') {
      const [away, home] = g.split('@');
      return { awayTeam: away, homeTeam: home, id: g };
    }
    return g;
  });

  normalizedGames.forEach(game => {
    const gameTotal = context.vegasLines?.[game.homeTeam]?.total || 225;
    const isShootout = gameTotal >= 230;
    
    const awayPlayers = playerPool.filter(p => p.team === game.awayTeam);
    const homePlayers = playerPool.filter(p => p.team === game.homeTeam);
    
    // Find top correlated pairs
    const pairs = [];
    [awayPlayers, homePlayers].forEach(teamPlayers => {
      for (let i = 0; i < teamPlayers.length; i++) {
        for (let j = i + 1; j < teamPlayers.length; j++) {
          const corr = evaluateCorrelation(teamPlayers[i], teamPlayers[j]);
          if (corr > 0.4) {
            pairs.push({ p1: teamPlayers[i].name, p2: teamPlayers[j].name, team: teamPlayers[i].team, corr });
          }
        }
      }
    });
    
    if (pairs.length > 0 || isShootout) {
      suggestions.push({
        game: `${game.awayTeam}@${game.homeTeam}`,
        total: gameTotal,
        isShootout,
        topPairs: pairs.sort((a, b) => b.corr - a.corr).slice(0, 2)
      });
    }
  });

  return suggestions.sort((a, b) => b.total - a.total);
}
