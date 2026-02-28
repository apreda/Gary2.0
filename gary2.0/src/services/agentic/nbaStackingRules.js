/**
 * NBA DFS Stacking & Correlation Rules
 *
 * Provides INVESTIGATION DATA about stacking and correlation.
 * Outputs observations and findings — not grades or prescriptive labels.
 * Gary reasons about these findings to inform his decisions.
 */

const PLAYER_ROLES = {
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

// CORRELATION_MATRIX, NBA_STACKING_RULES removed — dead code (only consumer analyzeLineupStacking was removed)

/**
 * Infer player role from stats
 */
export function inferPlayerRole(player) {
  const pos = (player.position || '').toUpperCase();
  const usage = player.usageRate || player.seasonStats?.usageRate || 20;
  const assists = player.assistsPerGame || player.seasonStats?.apg || 3;
  const ppg = player.ppg || player.seasonStats?.ppg || 10;
  const threeAttempts = player.threeAttempts || player.seasonStats?.tpa || 3;

  if (ppg > 25 && usage > 28 && assists > 5) return PLAYER_ROLES.ALPHA;
  if (usage > 25 && assists > 6) return PLAYER_ROLES.PRIMARY_BALL_HANDLER;
  if (assists > 4 && usage > 20) return PLAYER_ROLES.SECONDARY_BALL_HANDLER;

  if (pos.includes('C') || pos.includes('PF')) {
    if (threeAttempts > 4) return PLAYER_ROLES.STRETCH_BIG;
    if (usage > 24) return PLAYER_ROLES.POST_SCORER;
    return PLAYER_ROLES.RIM_RUNNER;
  }

  if (pos.includes('F') || pos.includes('SG')) {
    if (usage > 23) return PLAYER_ROLES.WING_CREATOR;
    if (threeAttempts > 5) return PLAYER_ROLES.SPOT_UP_SHOOTER;
  }

  return PLAYER_ROLES.ROLE_PLAYER;
}

// evaluateCorrelation, analyzeLineupStacking removed — dead code (zero consumers)

