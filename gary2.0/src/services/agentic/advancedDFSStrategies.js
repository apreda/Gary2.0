/**
 * Advanced DFS Strategies - The Gary Playbook
 * 
 * Based on proven winning methodologies from top DFS minds like:
 * - Jonathan Bales (Antifragility, Game Theory)
 * - Adam Levitan (Ownership, Correlation, Leverage)
 * - Peter Jennings / CSURAM88 (Finding Edges)
 * - Stokastic & RotoGrinders (Data-driven approach)
 */

export const BALES_PHILOSOPHY = {
  ANTIFRAGILITY: {
    title: "Antifragility",
    insight: "Don't just survive variance - EXPLOIT it. Chaos eliminates chalk. When uncertainty is high (e.g., late injury news), the edge goes to the flexible and contrarian."
  },
  GAME_THEORY: {
    title: "Game Theory",
    insight: "Being different AND right > Being just right. In large fields, you are playing against people, not just the house. Your goal is to maximize the chance of finishing 1st, not just 'cashing'."
  },
  CONTRARIAN_MINDSET: {
    title: "Contrarian Mindset",
    insight: "Fade the crowd by default, but with conviction. Every high-owned 'chalk' play you include reduces your potential payout if they smash."
  }
};

export const CONTEST_STRATEGIES = {
  CASH_GAMES: {
    goal: "Beat 50% of the field",
    strategy: "Floor over ceiling. High-owned, high-minute starters are fine. Avoid volatility.",
    riskMode: "CONSERVATIVE"
  },
  SMALL_GPP: {
    goal: "Top 10-20% finish",
    strategy: "Balanced build. Include 1-2 contrarian pivots. Focus on high-value mid-tier plays.",
    riskMode: "BALANCED"
  },
  LARGE_GPP: {
    goal: "1st Place finish",
    strategy: "Maximum leverage + ceiling. Game stacks and low-owned 'boom' candidates. Fade at least 1-2 major chalk plays.",
    riskMode: "AGGRESSIVE"
  },
  MILLY_MAKER: {
    goal: "1st Place out of 100K+ entries",
    strategy: "Win or Bust. High-variance stacks. Antifragile builds that benefit from unexpected game scripts.",
    riskMode: "WIN_OR_BUST"
  }
};

export const RISK_MODES = {
  CONSERVATIVE: {
    name: "Conservative",
    emoji: "🛡️",
    avgOwnershipTarget: "15-25%",
    floorCeilingSplit: "70/30",
    description: "Focus on guaranteed minutes and high floor. Best for Cash games and Double-Ups."
  },
  BALANCED: {
    name: "Balanced",
    emoji: "⚖️",
    avgOwnershipTarget: "12-18%",
    floorCeilingSplit: "50/50",
    description: "Mix of reliable production and 1-2 high-upside pivots. Best for small-field GPPs."
  },
  AGGRESSIVE: {
    name: "Aggressive",
    emoji: "🎯",
    avgOwnershipTarget: "8-15%",
    floorCeilingSplit: "30/70",
    description: "Prioritize ceiling over floor. Fading popular plays for leverage. Best for large tournaments."
  },
  WIN_OR_BUST: {
    name: "Win or Bust",
    emoji: "🚀",
    avgOwnershipTarget: "5-12%",
    floorCeilingSplit: "10/90",
    description: "Maximum variance. Looking for the 1-in-100 outcome. Best for Milly Makers."
  },
  CHAOS: {
    name: "Chaos",
    emoji: "🔥",
    avgOwnershipTarget: "3-10%",
    floorCeilingSplit: "0/100",
    description: "Full contrarian. Predicting low-probability events that would eliminate the field. Best for when you're feeling lucky."
  }
};

/**
 * Calculate Leverage Score
 * Leverage = Optimal Lineup % (Simulated) - Projected Ownership %
 */
export function calculateLeverage(player) {
  const optimalFreq = player.optimalLineupPercent || (player.valueScore * 2); // Heuristic if sims unavailable
  const projectedOwn = player.ownership || 15;
  const leverage = optimalFreq - projectedOwn;
  
  return {
    score: Math.round(leverage * 10) / 10,
    status: leverage >= 10 ? "STRONG GPP PLAY" : 
            leverage >= 5 ? "SOLID VALUE" :
            leverage <= -10 ? "TRAP (OVEROWNED)" : "MARKET PRICED"
  };
}

export const STACKING_STRATEGIES = {
  NBA: {
    GAME_STACK: "3-4 players from a high-total, close-spread game (shootout potential).",
    TEAMMATE_STACK: "Pairing a star with a value teammate whose usage spikes when another starter is OUT.",
    PACE_UP: "Targeting slow-paced teams playing against ultra-fast opponents."
  },
  NFL: {
    QB_WR1: "Mandatory QB + WR1 stack for ceiling correlation.",
    DOUBLE_STACK: "QB + 2 pass catchers (WR/TE) to capture maximum offensive output.",
    BRING_BACK: "Including an opposing WR/RB in your QB stack to capture shootout back-and-forth.",
    GAME_STACK: "Loading up on 4-5 players from a single high-total game."
  },
  MLB: {
    STANDARD_5_MAN: "Full team stack (1-5 hitters) to capture home run / scoring clusters.",
    WRAP_4_4: "Stacking 4 hitters from two different high-total teams.",
    COORS_STACK: "Targeting games at Coors Field or high-wind environments."
  }
};

/**
 * Strategy Selector Function
 * 
 * @param {string} contestType - 'gpp' or 'cash'
 * @param {string} riskPreference - 'conservative', 'balanced', 'aggressive'
 * @param {number} fieldSize - Number of entries
 * @returns {Object} Selected strategy mode
 */
export function selectDFSStrategy(contestType = 'gpp', riskPreference = 'balanced', fieldSize = 1000) {
  if (contestType === 'cash') return RISK_MODES.CONSERVATIVE;
  
  if (fieldSize > 50000) return RISK_MODES.WIN_OR_BUST;
  if (fieldSize > 5000) return RISK_MODES.AGGRESSIVE;
  
  // Default to preference if field size is small
  const pref = riskPreference.toUpperCase();
  return RISK_MODES[pref] || RISK_MODES.BALANCED;
}

export const WINNING_PLAYER_WISDOM = [
  { author: "CSURAM88", quote: "The best DFS players don't chase points. They chase edges." },
  { author: "Jonathan Bales", quote: "Being fast and first is the true key to finding an edge." },
  { author: "Adam Levitan", quote: "Picking players is not a strategy. Ownership, correlation, and leverage is strategy." }
];

export default {
  BALES_PHILOSOPHY,
  CONTEST_STRATEGIES,
  RISK_MODES,
  STACKING_STRATEGIES,
  calculateLeverage,
  selectDFSStrategy,
  WINNING_PLAYER_WISDOM
};
