/**
 * Sharp DFS Principles
 * Gary's knowledge base for auditing and improving DFS lineups.
 * 
 * THE 10 COMMANDMENTS OF GPP DFS:
 * 1. THOU SHALT NOT BUILD FOR FLOOR IN GPPS - Ceiling wins tournaments
 * 2. THOU SHALT CORRELATE THY LINEUP - 4-5 players from 1-2 games
 * 3. THOU SHALT TARGET GAME ENVIRONMENTS - Stack 235+ total games
 * 4. THOU SHALT LEVERAGE INJURY NEWS - #1 source of edge
 * 5. THOU SHALT BE CONTRARIAN WITH PURPOSE - Not random, but SMART contrarian
 * 6. THOU SHALT NOT CHASE LAST NIGHT'S POINTS - Fade recency bias
 * 7. THOU SHALT RESPECT MINUTES - No minutes = No points
 * 8. THOU SHALT DIFFERENTIATE THY LINEUPS - Each lineup needs unique path to win
 * 9. THOU SHALT HAVE A REASON FOR EVERY PICK - "He's good" is not a reason
 * 10. THOU SHALT ACCEPT VARIANCE - You'll lose most GPPs, but one big win covers hundreds
 */

// GPP PROJECTION TARGETS - Minimum viable ceiling for tournament play
export const GPP_PROJECTION_TARGETS = {
  MAIN_SLATE: {       // 7+ games
    minProjection: 320,
    targetCeiling: 350,
    description: "Large slate requires high ceiling to differentiate"
  },
  MEDIUM_SLATE: {     // 4-6 games
    minProjection: 305,
    targetCeiling: 330,
    description: "Medium slate - still need ceiling but less variance"
  },
  SMALL_SLATE: {      // 2-3 games
    minProjection: 290,
    targetCeiling: 310,
    description: "Small slate - correlation is everything"
  }
};

// Game environment thresholds for targeting
export const GAME_ENVIRONMENT_TARGETS = {
  SHOOTOUT_TOTAL: 235,      // O/U 235+ = shootout potential
  BLOWOUT_SPREAD: 10,       // 10+ point spread = blowout risk
  PACE_UP_THRESHOLD: 102,   // Pace factor for fast games
  HIGH_TOTAL_PRIORITY: true // Always prioritize high-total games
};

// Correlation requirements for GPP lineups
export const CORRELATION_REQUIREMENTS = {
  MIN_PLAYERS_CORRELATED: 4,    // At least 4 players from 1-2 games
  MAX_GAMES_IN_LINEUP: 4,       // Don't spread across more than 4 games
  SAME_GAME_STACK_MIN: 2,       // At least 2 from same game
  BRING_BACK_REQUIRED: true,    // Need players from both sides of game stack
  GAME_STACK_BONUS: 15          // Sharp score bonus for proper game stacks
};

export const SHARP_DFS_PRINCIPLES = {
  PROCESS_OVER_OUTCOMES: {
    name: "Process Over Outcomes",
    key_insight: "Evaluate decisions by EV, not results. A winning lineup can be the result of a bad process (luck), and a losing lineup can be the result of a sharp process (bad variance)."
  },
  SALARY_AS_MARKET: {
    name: "Salary Is a Market",
    key_insight: "Salaries are 'prices' set by the market. Find mispricings where consensus is wrong - this is where Gary finds his edge."
  },
  OWNERSHIP_IS_INFORMATION: {
    name: "Ownership Is Information",
    key_insight: "Being different AND right wins GPPs. Fading 'bad chalk' (highly owned players in bad matchups) is the sharpest move."
  },
  CORRELATION_WINS: {
    name: "Correlation Wins Tournaments",
    key_insight: "Stacks create ceiling for big scores. In NBA, 'game stacks' capture shootouts. In NFL, 'QB+WR stacks' are mandatory for ceiling scores."
  },
  OPPORTUNITY_OVER_TALENT: {
    name: "Opportunity Over Talent",
    key_insight: "Volume (minutes, usage, targets) > per-minute production. Gary hunts for role changes before the pricing catches up."
  },
  GAME_ENVIRONMENT: {
    name: "Game Environment",
    key_insight: "Vegas totals, pace, game script matter. High totals and fast pace are where the fantasy points live."
  },
  MATCHUPS_MATTER: {
    name: "Matchups Matter",
    key_insight: "DvP (Defense vs Position) rankings create exploitable edges. Attack the weaknesses."
  },
  BANKROLL_MANAGEMENT: {
    name: "Bankroll Management",
    key_insight: "Size entries appropriately. Gary builds for the long haul, not just one night."
  }
};

export const LOSING_PATTERNS = {
  RECENCY_BIAS: {
    id: 'RECENCY_BIAS',
    name: "Recency Bias",
    description: "Chasing last night's top scorer. Don't chase points; chase opportunity."
  },
  NARRATIVE_FALLACY: {
    id: 'NARRATIVE_FALLACY',
    name: "Narrative Fallacy",
    description: "Picking a 'revenge game' or 'birthday narrative' without the supporting stats."
  },
  CHALK_LOCK: {
    id: 'CHALK_LOCK',
    name: "Chalk Lock",
    description: "Lineup looks like everyone else's. No leverage, no edge."
  },
  FALSE_VALUE: {
    id: 'FALSE_VALUE',
    name: "False Value",
    description: "Cheap players who are cheap for a reason. Don't punt just to punt."
  },
  OVERCOMPLICATING: {
    id: 'OVERCOMPLICATING',
    name: "Overcomplicating",
    description: "Contrarian for its own sake. Different is good, but you still need points."
  },
  IGNORING_VEGAS: {
    id: 'IGNORING_VEGAS',
    name: "Ignoring Vegas",
    description: "Ignoring the sharpest projection source: the betting markets."
  },
  PUNT_OVERLOAD: {
    id: 'PUNT_OVERLOAD',
    name: "Punt Overload",
    description: "3+ min-salary players = 'Fragile Floor'. One dud kills the lineup."
  },
  CORRELATION_BLINDNESS: {
    id: 'CORRELATION_BLINDNESS',
    name: "Correlation Blindness",
    description: "No coherent 'story' to the lineup. Independent events rarely win GPPs."
  }
};

// The 10 Commandments as actionable checks
export const TEN_COMMANDMENTS = [
  {
    id: 1,
    commandment: "THOU SHALT NOT BUILD FOR FLOOR IN GPPS",
    check: (lineup) => {
      const avgCeiling = lineup.players?.reduce((sum, p) => sum + (p.ceiling || p.projected_pts * 1.3), 0) / (lineup.players?.length || 8);
      return avgCeiling >= 35; // Average ceiling per player should be 35+
    },
    fix: "Replace floor plays with ceiling plays. Target boom-or-bust players.",
    penalty: -20
  },
  {
    id: 2,
    commandment: "THOU SHALT CORRELATE THY LINEUP",
    check: (lineup, context) => {
      const gameCount = new Set(lineup.players?.map(p => p.gameId || p.team)).size;
      return gameCount <= 4 && lineup.players?.length >= 4;
    },
    fix: "Stack 4-5 players from 1-2 games. Add game correlation.",
    penalty: -25
  },
  {
    id: 3,
    commandment: "THOU SHALT TARGET GAME ENVIRONMENTS",
    check: (lineup, context) => {
      const highTotalPlayers = lineup.players?.filter(p => {
        const game = context?.games?.find(g => g.homeTeam === p.team || g.awayTeam === p.team);
        return game?.total >= 235;
      }).length || 0;
      return highTotalPlayers >= 4;
    },
    fix: "Stack players from 235+ total games. Avoid low-total slogs.",
    penalty: -15
  },
  {
    id: 4,
    commandment: "THOU SHALT LEVERAGE INJURY NEWS",
    check: (lineup, context) => {
      const injuryBeneficiaries = lineup.players?.filter(p => p.injuryBoost || p.usageBoost).length || 0;
      return injuryBeneficiaries >= 1;
    },
    fix: "Find players who benefit from teammate injuries (usage boost).",
    penalty: -10
  },
  {
    id: 5,
    commandment: "THOU SHALT BE CONTRARIAN WITH PURPOSE",
    check: (lineup) => {
      const avgOwnership = lineup.players?.reduce((sum, p) => sum + (p.ownership || 15), 0) / (lineup.players?.length || 8);
      const hasLowOwned = lineup.players?.some(p => p.ownership && p.ownership < 10);
      return avgOwnership < 20 && hasLowOwned;
    },
    fix: "Add low-owned plays with upside, not just random fades.",
    penalty: -10
  },
  {
    id: 6,
    commandment: "THOU SHALT NOT CHASE LAST NIGHT'S POINTS",
    check: (lineup, context) => {
      // Check if any player had a massive game yesterday and is now chalk
      const recencyTraps = lineup.players?.filter(p => 
        p.isChalk && p.recentForm === 'hot' && (p.ownership || 15) > 25
      ).length || 0;
      return recencyTraps <= 1;
    },
    fix: "Fade players who are only chalk because of last game's performance.",
    penalty: -10
  },
  {
    id: 7,
    commandment: "THOU SHALT RESPECT MINUTES",
    check: (lineup) => {
      const lowMinutesPlayers = lineup.players?.filter(p => {
        const mpg = p.seasonStats?.mpg || p.mpg || 20;
        return mpg < 20 && (p.salary || 0) > 4500;
      }).length || 0;
      return lowMinutesPlayers === 0;
    },
    fix: "Don't roster players under 20 MPG at mid-tier salaries.",
    penalty: -15
  },
  {
    id: 8,
    commandment: "THOU SHALT DIFFERENTIATE THY LINEUPS",
    // This is for multi-lineup builds - check at portfolio level
    check: () => true,
    fix: "Each lineup needs a unique path to victory.",
    penalty: 0
  },
  {
    id: 9,
    commandment: "THOU SHALT HAVE A REASON FOR EVERY PICK",
    check: (lineup) => {
      const noReasonPlayers = lineup.players?.filter(p => !p.rationale || p.rationale.includes('NO-DATA')).length || 0;
      return noReasonPlayers <= 1;
    },
    fix: "Every player needs a specific reason: matchup, usage, correlation, etc.",
    penalty: -10
  },
  {
    id: 10,
    commandment: "THOU SHALT ACCEPT VARIANCE",
    // This is mindset, not lineup check
    check: () => true,
    fix: "Build for ceiling, accept that most GPPs are losses.",
    penalty: 0
  }
];

export default {
  SHARP_DFS_PRINCIPLES,
  LOSING_PATTERNS,
  GPP_PROJECTION_TARGETS,
  GAME_ENVIRONMENT_TARGETS,
  CORRELATION_REQUIREMENTS,
  TEN_COMMANDMENTS
};
