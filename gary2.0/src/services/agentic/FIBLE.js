/**
 * ╔═══════════════════════════════════════════════════════════════════════════╗
 * ║                                                                           ║
 * ║   ███████╗██╗██████╗ ██╗     ███████╗                                    ║
 * ║   ██╔════╝██║██╔══██╗██║     ██╔════╝                                    ║
 * ║   █████╗  ██║██████╔╝██║     █████╗                                      ║
 * ║   ██╔══╝  ██║██╔══██╗██║     ██╔══╝                                      ║
 * ║   ██║     ██║██████╔╝███████╗███████╗                                    ║
 * ║   ╚═╝     ╚═╝╚═════╝ ╚══════╝╚══════╝                                    ║
 * ║                                                                           ║
 * ║   GARY'S FANTASY BIBLE - THE DEFINITIVE DFS REFERENCE                    ║
 * ║                                                                           ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 * 
 * ═══════════════════════════════════════════════════════════════════════════
 * ⚠️  CRITICAL: HOW GARY SHOULD USE THE FIBLE
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * The FIBLE is NOT a set of hard rules to follow blindly.
 * It is a KNOWLEDGE BASE of questions to ask and patterns to investigate.
 * 
 * WRONG: "Player is on -10 favorite → Apply 15% penalty"
 * RIGHT: "Player is on -10 favorite → INVESTIGATE: 
 *         - Check BDL for recent game scripts
 *         - Use Gemini to see if blowout is likely
 *         - Look at opponent's pace and defensive rating
 *         - Verify if coach has history of resting stars
 *         THEN decide if this specific situation warrants concern"
 * 
 * Gary should:
 * 1. CONSULT the FIBLE to know WHAT to investigate
 * 2. USE BDL stats & Gemini grounding to VALIDATE the situation is real
 * 3. CONFIRM the reasoning applies to THIS SPECIFIC GAME/PLAYER
 * 4. MAKE DECISIONS based on actual context, not formulas
 * 
 * The FIBLE teaches Gary WHAT MATTERS. Gary's job is to VERIFY IT'S TRUE.
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * SHARP DFS PLAYBOOK v2.0 - STATE OF THE ART (SOTA) EDITION
 * 
 * This is Gary's sacred reference document. When building lineups, Gary
 * consults the FIBLE for guidance on:
 * - Score targets (what wins vs what cashes)
 * - Simulation strategy (optimize for WINS, not projections)
 * - Boom/Bust modeling (percentiles, not floor/ceiling)
 * - Ownership leverage (true edge, not just "low owned")
 * - Late swap protocol (the #1 edge in NBA DFS)
 * - Usage inheritance (who REALLY benefits from injuries)
 * - Vegas integration (implied totals, line movement)
 * - Correlation strategy (game stacks with bringbacks)
 * - Portfolio theory (multi-entry diversification)
 * 
 * Enhanced with cutting-edge strategies from 2024-2025 research:
 * - Simulation-based lineup construction (Monte Carlo)
 * - Boom/Bust percentile modeling (not just floor/ceiling)
 * - Advanced ownership leverage game theory
 * - Late swap alpha extraction
 * - Portfolio theory for multi-entry
 * - Minutes inheritance modeling
 * - Blowout scenario analysis
 * 
 * @module sharpDFSPlaybook_SOTA
 * @version 2.0.0
 */

// ============================================================================
// PART 1: ENHANCED WINNING SCORE TARGETS (Updated 2024-2025)
// ============================================================================

export const WINNING_SCORE_TARGETS = {
  
  DRAFTKINGS_NBA: {
    LARGE_GPP: {
      firstPlace: { min: 370, typical: 385, ceiling: 420 },
      top1Percent: { min: 340, typical: 355 },
      top10Percent: { min: 300, typical: 315 },
      cashLine: { min: 270, typical: 285 },
      
      // NEW: Percentile-based targets (SOTA approach)
      percentileTargets: {
        p99: 380,   // Need this to win
        p95: 355,   // Top 1%
        p90: 340,   // Top 5%
        p75: 310,   // Top 10%
        p50: 285,   // Cash line
      }
    },

    SMALL_GPP: {
      firstPlace: { min: 350, typical: 365 },
      top1Percent: { min: 330, typical: 340 },
      top10Percent: { min: 290, typical: 305 },
      cashLine: { min: 265, typical: 275 },
    },

    SHOWDOWN: {
      firstPlace: { min: 180, typical: 200 },
      top1Percent: { min: 165, typical: 175 },
      cashLine: { min: 140, typical: 150 },
      
      // NEW: Captain multiplier strategy
      captainStrategy: {
        idealCaptainOutput: '55-80 raw points (82.5-120 with 1.5x)',
        captainOwnershipThreshold: 25, // Below this = leverage opportunity
        bringBackRequired: true, // Always pair with opposing player
      }
    },

    CASH: {
      cashLine: { min: 260, typical: 275 },
      safeTarget: 285,
      floorFocus: true,
    }
  },

  FANDUEL_NBA: {
    LARGE_GPP: {
      firstPlace: { min: 380, typical: 400 },
      top1Percent: { min: 350, typical: 365 },
      cashLine: { min: 280, typical: 295 }
    },
  },

  DRAFTKINGS_NFL: {
    LARGE_GPP: {
      firstPlace: { min: 200, typical: 220, ceiling: 260 },
      top1Percent: { min: 185, typical: 200 },
      top10Percent: { min: 160, typical: 175 },
      cashLine: { min: 140, typical: 155 },
    },
    SMALL_GPP: {
      firstPlace: { min: 190, typical: 205 },
      top1Percent: { min: 175, typical: 190 },
      cashLine: { min: 135, typical: 145 },
    },
    SHOWDOWN: {
      firstPlace: { min: 120, typical: 140 },
      top1Percent: { min: 105, typical: 115 },
      cashLine: { min: 85, typical: 95 },
    },
    CASH: {
      cashLine: { min: 130, typical: 145 },
      safeTarget: 155,
      floorFocus: true,
    }
  },

  FANDUEL_NFL: {
    LARGE_GPP: {
      firstPlace: { min: 195, typical: 215 },
      top1Percent: { min: 180, typical: 195 },
      cashLine: { min: 135, typical: 150 }
    },
  },

  DRAFTKINGS_NHL: {
    LARGE_GPP: {
      firstPlace: { min: 38, typical: 45, ceiling: 55 },
      top1Percent: { min: 33, typical: 38 },
      top10Percent: { min: 28, typical: 32 },
      cashLine: { min: 22, typical: 26 },
    },
    SMALL_GPP: {
      firstPlace: { min: 35, typical: 40 },
      top1Percent: { min: 30, typical: 35 },
      cashLine: { min: 20, typical: 24 },
    },
    CASH: {
      cashLine: { min: 20, typical: 24 },
      safeTarget: 28,
      floorFocus: true,
    }
  },

  FANDUEL_NHL: {
    LARGE_GPP: {
      firstPlace: { min: 55, typical: 65 },
      top1Percent: { min: 48, typical: 55 },
      cashLine: { min: 35, typical: 42 }
    },
  },

  SLATE_ADJUSTMENTS: {
    LARGE_SLATE: { games: '10+', multiplier: 1.0 },
    MEDIUM_SLATE: { games: '6-9', multiplier: 0.97 },
    SMALL_SLATE: { games: '3-5', multiplier: 0.94 },
    SHOWDOWN: { games: '1-2', multiplier: 0.55 }
  }
};

// ============================================================================
// PART 2: SOTA - SIMULATION-BASED LINEUP CONSTRUCTION
// ============================================================================

/**
 * CUTTING EDGE: Monte Carlo Simulation Approach
 * 
 * Traditional optimizers find the lineup with highest AVERAGE projection.
 * SOTA approach: Simulate the slate 10,000+ times, find lineups that WIN most often.
 * 
 * Key insight: The lineup that wins isn't always the highest projected -
 * it's the one that hits when other chalk fails.
 */
export const SIMULATION_STRATEGY = {
  
  concept: `
    OLD WAY (what most do): Optimize for highest projected points
    Result: Same 8 chalk players as everyone else
    
    SOTA WAY: Simulate thousands of slate outcomes
    Find: Lineups that WIN the tournament, not just score well
    
    The difference: Simulation captures CORRELATION and VARIANCE.
    When Jokic goes off, who else goes off? When chalk fails, who pops?
  `,

  implementation: {
    simulationCount: 10000,  // Minimum simulations per slate
    varianceModeling: {
      // Each player has a distribution, not a single projection
      usePercentiles: true,
      percentileLevels: [10, 25, 50, 75, 90], // Floor to ceiling
      
      // CRITICAL: Variance differs by player type
      varianceByPlayerType: {
        volumeScorer: 'low',      // Consistent touches = narrow range
        streakShooter: 'high',    // 3PT dependent = wide range
        defensiveSpecialist: 'medium',
        reboundDependent: 'medium',
        usageDependent: 'high',   // Role players = high variance
      }
    },
    
    // Key metric: How often does this lineup WIN, not just cash
    winProbabilityFocus: true,
  },

  // What simulations reveal that projections miss
  simulationInsights: [
    'Correlation between teammates (stacks work because of this)',
    'Inverse correlation between opponents (your guy scoring = their guy in foul trouble)',
    'Game script scenarios (blowout vs close = different winners)',
    'Ownership-adjusted win probability (low owned + boom = GPP gold)',
  ],

};

// ============================================================================
// PART 3: SOTA - BOOM/BUST PERCENTILE MODELING
// ============================================================================

/**
 * CUTTING EDGE: Percentile-Based Player Evaluation
 * 
 * Floor/Ceiling is too simplistic. Modern approach uses full distributions.
 * A player's 75th percentile outcome matters more than their "ceiling".
 */
export const BOOM_BUST_MODELING = {

  concept: `
    OLD: Player X has floor 25, projection 40, ceiling 55
    SOTA: Player X percentile distribution:
      - 10th percentile: 22 (floor, happens 10% of time)
      - 25th percentile: 30 (soft floor)
      - 50th percentile: 38 (median - NOT the same as projection!)
      - 75th percentile: 48 (soft ceiling, we care about this)
      - 90th percentile: 58 (hard ceiling, happens 10% of time)
    
    KEY INSIGHT: In GPPs, we want players whose 75th percentile is HIGH,
    not just players with high projections.
  `,

  boomProbability: {
    definition: 'Probability player exceeds salary-based expectation (5x value)',
    threshold: {
      draftkings: 5.0,  // 5x value = $5K player scores 25+ DK points
      fanduel: 4.0,     // FD scoring is different
    },
    
    // What makes a player "boomy"
    boomIndicators: [
      'High usage rate (25%+)',
      'Three-point volume (6+ 3PA/game)',
      'Double-double/Triple-double upside',
      'Pace-up matchup',
      'Injury to teammate (usage spike)',
      'Revenge game narrative',
    ],
    
    // What makes a player "busty"
    bustIndicators: [
      'Minutes uncertainty',
      'Bad matchup (elite defender)',
      'Blowout risk (heavy favorite, might sit Q4)',
      'Back-to-back fatigue',
      'Recent injury return (minutes limit)',
      'Role uncertainty (new team, lineup changes)',
    ]
  },

  bustProbability: {
    definition: 'Probability player fails to reach 4x value',
    cashGameConcern: true,  // High bust = avoid in cash
    gppOpportunity: true,   // High bust + high boom = GPP leverage play
  },

  // CRITICAL: The Boom/Bust Ratio
  boomBustRatio: {
    formula: 'boomProbability / bustProbability',
    interpretation: {
      above2: 'Strong GPP play - boom outweighs bust risk',
      between1and2: 'Balanced - use based on ownership',
      below1: 'High risk - only if very low owned',
    },
    
    example: `
      Player A: 30% boom, 20% bust = 1.5 ratio (decent)
      Player B: 25% boom, 10% bust = 2.5 ratio (excellent)
      Player C: 40% boom, 35% bust = 1.14 ratio (volatile)
      
      Player B is actually better for GPPs despite lower boom%
      because the bust risk is so much lower.
    `
  },

};

// ============================================================================
// PART 4: SOTA - ADVANCED OWNERSHIP LEVERAGE
// ============================================================================

/**
 * CUTTING EDGE: Leverage Score Calculation
 * 
 * Simple ownership analysis is dead. Modern approach calculates
 * "implied ownership" vs "actual ownership" to find true leverage.
 */
export const ADVANCED_OWNERSHIP_LEVERAGE = {

  leverageScoreFormula: {
    concept: `
      Leverage Score = Implied Ownership - Projected Ownership
      
      Where:
      - Implied Ownership = What ownership SHOULD be based on win probability
      - Projected Ownership = What ownership will actually be
      
      Positive Leverage = Underowned relative to upside
      Negative Leverage = Overowned relative to upside
    `,
    
    calculation: `
      1. Calculate player's probability of being on winning lineup
      2. Divide by sum of all players' win probabilities = Implied Ownership
      3. Compare to projected ownership from consensus
      4. Difference = Leverage Score
    `,
    
    example: `
      Jokic: 35% chance on winning lineup, 30% projected ownership
      Leverage = +5% (slightly underowned)
      
      Random hot player: 5% chance on winning lineup, 20% projected ownership  
      Leverage = -15% (massively overowned - FADE)
      
      Injury replacement: 12% chance on winning lineup, 4% projected ownership
      Leverage = +8% (huge positive leverage - ATTACK)
    `
  },

  ownershipTiers: {
    chalk: {
      range: '25%+',
      strategy: 'Only roster if truly elite play, accept you share upside',
      gppApproach: 'Maximum 2 chalk players per lineup',
    },
    popular: {
      range: '15-25%',
      strategy: 'Fine if justified by projection, not automatic include',
      gppApproach: 'Acceptable but need differentiation elsewhere',
    },
    moderate: {
      range: '8-15%',
      strategy: 'Sweet spot - enough people to not be contrarian for contrarian sake',
      gppApproach: 'Core of lineup should be here',
    },
    lowOwned: {
      range: '4-8%',
      strategy: 'Leverage plays - need clear upside narrative',
      gppApproach: 'Need 1-2 of these to differentiate',
    },
    contrarian: {
      range: '<4%',
      strategy: 'Only if legitimate path to value (injury, narrative)',
      gppApproach: 'Can win tournaments but risky - need strong conviction',
    }
  },

  // CRITICAL: When to fade chalk
  chalkFadeIndicators: [
    'Recency bias (player went off last night, ownership spikes)',
    'Name value exceeds current situation',
    'Price hasn\'t caught up to negative news',
    'Blowout risk for star on heavy favorite',
    'Back-to-back with rest risk',
  ],

  // CRITICAL: When to eat chalk
  chalkEatIndicators: [
    'Truly elite ceiling (Jokic triple-double, Luka explosion)',
    'Injury created must-play situation (even at high ownership)',
    'Small field contest (less need for differentiation)',
    'Cash game (ownership irrelevant)',
  ],

};

// ============================================================================
// PART 5: SOTA - LATE SWAP ALPHA EXTRACTION
// ============================================================================

/**
 * CUTTING EDGE: Systematic Late Swap Strategy
 * 
 * NBA DFS edge is won and lost in late swap. The best players
 * are monitoring news until final tip and pivoting systematically.
 */
export const LATE_SWAP_STRATEGY = {

  importance: `
    NBA injury news often comes 30 minutes before tip (league rule: 30 min minimum).
    DraftKings allows late swap - adjust lineup after early games start.
    FanDuel does NOT allow late swap - must account for uncertainty pre-lock.
    
    THIS IS THE #1 EDGE IN NBA DFS.
    Players who don't late swap are leaving money on the table.
  `,

  systematicApproach: {
    preLock: {
      actions: [
        'Build primary lineup with early game exposure',
        'Identify late game "pivot candidates" at each position',
        'Leave 1-2 roster spots for late game players',
        'Set news alerts for questionable players',
      ],
      riskManagement: `
        If you NEED late news to go your way, lineup is too risky.
        Build lineups that are solid regardless, with upside if news breaks.
      `
    },
    
    postLock: {
      monitoringSchedule: [
        '30 min before each tip: Check injury report',
        '15 min before tip: Verify starting lineups on Twitter',
        '5 min before tip: Final confirmation',
      ],
      pivotTriggers: [
        'Star ruled out = Pivot to usage beneficiary',
        'Star confirmed = Lock in your exposure',
        'Unexpected scratch = Emergency pivot to backup plan',
      ]
    }
  },

  // NEW: Salary buffer strategy
  salaryBuffering: {
    concept: `
      Leave $200-500 salary buffer for late swap flexibility.
      A slightly suboptimal pre-lock lineup that can pivot
      beats a "perfect" lineup that's stuck.
    `,
    implementation: `
      Instead of spending exactly $50,000:
      - Spend $49,600 with flexibility to upgrade if news breaks
      - Identify the $400 upgrade paths at each position
      - Execute pivot when information advantage appears
    `
  },

  // Key late swap scenarios
  scenarios: {
    starRuledOut: {
      action: 'Immediately pivot to highest usage beneficiary',
      timing: 'Within 2 minutes of news (ownership adjusts fast)',
      targets: 'Backup at same position, or teammate with usage spike',
    },
    starConfirmedIn: {
      action: 'Lock exposure, consider fading if ownership spiked',
      timing: 'Before ownership settles',
    },
    unexpectedRest: {
      action: 'Pivot to value play or eat the L if no pivot available',
      prevention: 'Always have backup plan for questionable tags',
    }
  },

};

// ============================================================================
// PART 6: SOTA - MINUTES PROJECTION & INHERITANCE MODELING
// ============================================================================

/**
 * CUTTING EDGE: Usage Inheritance Calculation
 * 
 * When a star is out, who inherits the minutes and usage?
 * This is more complex than "backup gets his minutes."
 */
export const MINUTES_INHERITANCE = {

  baselineProjection: {
    formula: '(SeasonAvg * 0.75) + (Last5Avg * 0.25)',
    adjustments: [
      'Injury replacement: +5-12 minutes',
      'Blowout risk (8+ spread): -3-6 minutes for starters',
      'Back-to-back: -2-4 minutes',
      'Overtime potential (close spread, fast pace): +2-4 minutes',
    ]
  },

  // CRITICAL: Usage doesn't transfer 1:1
  usageInheritance: {
    concept: `
      When Star X (30% usage, 35 min) is out:
      - His minutes get distributed (roughly)
      - His USAGE gets distributed (unevenly)
      
      Key insight: Backup at same position gets MINUTES
      but other starters often get more USAGE.
    `,
    
    distributionPattern: {
      backupSamePosition: {
        minutesGain: '+8-15 minutes',
        usageGain: '+2-5% usage',
        note: 'Gets run but may not be the primary beneficiary',
      },
      secondaryBallHandler: {
        minutesGain: '+2-4 minutes',
        usageGain: '+5-10% usage',
        note: 'Often the BIGGEST winner - more touches, same minutes',
      },
      otherStarters: {
        minutesGain: '+1-3 minutes',
        usageGain: '+2-4% usage',
        note: 'Slight boost across the board',
      }
    },
    
    example: `
      LeBron out:
      - Austin Reaves: +4 min, +8% usage (becomes primary ball handler)
      - Backup SF: +10 min, +2% usage (gets minutes but limited role)
      - AD: +2 min, +5% usage (more post touches)
      
      The BEST play is often Reaves, not the backup SF!
    `
  },

  blowoutRiskModeling: {
    spreadThresholds: {
      8: 'Minor blowout risk - slight minutes concern',
      10: 'Moderate blowout risk - avoid stars on favorite',
      12: 'High blowout risk - starters likely sit Q4',
      15: 'Extreme blowout risk - only play bench from favorite',
    },
    
    favoredTeamStrategy: `
      Stars on heavy favorites: Reduced ceiling (might sit Q4)
      Bench on heavy favorites: Increased ceiling (garbage time boost)
      
      In GPPs, consider FADING stars on -12 favorites.
      The ceiling is capped even if floor is safe.
    `,
    
    underdogStrategy: `
      Stars on heavy underdogs: BLOWOUT IMMUNE
      They play all 48 minutes trying to keep it close.
      
      This is a GPP goldmine - full minutes + usage
      even if the team loses.
    `
  },

};

// ============================================================================
// PART 7: SOTA - VEGAS DATA INTEGRATION
// ============================================================================

/**
 * CUTTING EDGE: Implied Team Totals & Pace Projection
 * 
 * Vegas lines are the best public predictor of game outcomes.
 * Smart DFS players use Vegas data, not just projections.
 */
export const VEGAS_INTEGRATION = {

  impliedTeamTotals: {
    calculation: `
      Game Total = 225, Spread = -5 (home team favored)
      Home Team Implied = (225 + 5) / 2 = 115
      Away Team Implied = (225 - 5) / 2 = 110
      
      CRITICAL: Higher implied total = More fantasy points available
    `,
    
    thresholds: {
      elite: { min: 118, strategy: 'Heavy exposure to this team' },
      good: { min: 112, strategy: 'Target stars and key role players' },
      average: { min: 106, strategy: 'Selective exposure' },
      poor: { min: 100, strategy: 'Fade unless specific value' },
      terrible: { max: 100, strategy: 'Avoid entirely' },
    },
    
    insight: `
      The difference between 118 implied and 105 implied is HUGE.
      That's 13 more real points = ~20+ more fantasy points available.
      Stack the high-total games, fade the low-total games.
    `
  },

  paceProjection: {
    formula: `
      Projected Pace = (TeamA_Pace + TeamB_Pace) / 2 * VegasMultiplier
      
      Where VegasMultiplier = GameTotal / LeagueAvgTotal
    `,
    
    paceUpSpots: {
      definition: 'Game projected 5%+ faster than either team\'s season average',
      indicators: [
        'High total (230+)',
        'Both teams top-15 pace',
        'Close spread (competitive game = more possessions)',
      ],
      value: 'More possessions = more opportunities = higher ceilings'
    },
    
    paceDownSpots: {
      definition: 'Game projected 5%+ slower than either team\'s season average',
      indicators: [
        'Low total (<215)',
        'Both teams bottom-15 pace',
        'Blowout spread (starters sit = fewer minutes)',
      ],
      value: 'Fewer possessions = lower ceilings = FADE'
    }
  },

  lineMovement: {
    importance: `
      Line movement tells you where sharp money is going.
      If total drops from 225 to 220, sharps are betting under.
      This might indicate injury news or analytical edge.
    `,
    
    monitoring: [
      'Opening line (morning of)',
      'Current line (pre-lock)',
      'Direction of movement',
      'Percentage of bets vs percentage of money',
    ],
    
    signals: {
      totalDrop: 'Possible injury news or pace-down expectation',
      totalRise: 'Possible shootout or pace-up expectation',
      spreadMove: 'Sharp money on one side',
    }
  },

};

// ============================================================================
// PART 8: SOTA - CORRELATION & STACKING STRATEGY
// ============================================================================

/**
 * CUTTING EDGE: Game Stacking in NBA
 * 
 * NBA correlation is DIFFERENT from NFL/MLB.
 * Points compound incrementally, not through events.
 * But correlation still matters - especially for GPPs.
 */
export const CORRELATION_STRATEGY = {

  nbaCorrelationDifference: `
    NFL: WR catches TD from QB = both score big simultaneously
    MLB: Runners on base = hitter drives them in = correlated spike
    NBA: Points accumulate gradually throughout game
    
    BUT: High-scoring games benefit ALL players in that game.
    A 260-point shootout has more fantasy points than a 200-point slugfest.
  `,

  gameStackStrategy: {
    concept: `
      Target 3-5 players from the same game (both teams).
      If the game "hits" (high scoring, OT, close), your lineup smashes.
      If the game "misses" (blowout, low scoring), your lineup struggles.
      
      This is INTENTIONAL correlation for GPP ceilings.
    `,
    
    idealGameProfile: {
      total: '235+',
      spread: '-3 to +3 (close game likely)',
      pace: 'Both teams top-15 pace',
      injury: 'No major stars out (full firepower)',
    },
    
    stackConstruction: {
      coreStack: '2-3 players from Team A (primary stack)',
      bringBack: '1-2 players from Team B (correlation capture)',
      reason: `
        If Team A scores 130, Team B probably scored 115+.
        Both teams' players benefit from high total.
        Bringback captures BOTH sides of the shootout.
      `
    }
  },

  miniStackStrategy: {
    concept: `
      Pair players who directly create for each other.
      Point guard + shooting wing (assists → points)
      Pick and roll duo (handler + roller)
    `,
    
    examples: [
      'Trae Young + Clint Capela (lob connection)',
      'Luka + Kyrie (ball movement)',
      'Jokic + Aaron Gordon (post + cutter)',
    ],
    
    value: 'Lower variance than single-player picks'
  },

  // CRITICAL: When NOT to stack
  antiStackScenarios: [
    'Blowout spread (10+): Starters on favorite will sit',
    'Low total (<215): Not enough points to go around',
    'Injury to primary playmaker: Correlation disrupted',
    'Back-to-back: Minutes management likely',
  ],

};

// ============================================================================
// PART 9: SOTA - MULTI-ENTRY PORTFOLIO THEORY
// ============================================================================

/**
 * CUTTING EDGE: Portfolio Construction for Max Entry
 * 
 * Single-entry and multi-entry require COMPLETELY different approaches.
 * Multi-entry is about DIVERSIFICATION, not duplication.
 */
export const PORTFOLIO_STRATEGY = {

  singleEntry: {
    approach: `
      One shot - need to be CORRECT.
      Moderate contrarian: Don't follow chalk blindly, but don't be weird.
      Target ownership sweet spot: 10-20% average ownership.
      Correlation: Yes, but don't go crazy (3-4 from same game max).
    `,
    
    priorities: [
      '1. Get the slate read RIGHT',
      '2. Target highest-upside players',
      '3. Add 1-2 leverage plays for differentiation',
      '4. Ensure all picks have clear narrative',
    ]
  },

  multiEntry: {
    approach: `
      Multiple shots - need to COVER scenarios.
      Each lineup should have a unique "way to win."
      Vary: Anchors, game stacks, ownership exposure, punt plays.
      
      KEY: Lineups should be DIFFERENT, not 6 variations of the same core.
    `,
    
    portfolioConstruction: {
      concept: `
        Build 3-20 lineups that cover different slate outcomes:
        - Lineup 1: Jokic smash game + DEN stack
        - Lineup 2: Luka smash game + DAL stack  
        - Lineup 3: Chalk fails, value plays pop
        - Lineup 4: High-total game explodes
        - etc.
      `,
      
      minUniquesConcept: `
        "Min Uniques" = Minimum unique players between lineups.
        Set min uniques to 3-4 to prevent duplication.
        This forces diversification across outcomes.
      `,
      
      exposureManagement: `
        Track exposure % to each player across portfolio.
        If you love a player: 40-60% exposure
        If you like a player: 20-40% exposure
        Leverage plays: 10-25% exposure
        
        NO player should be in 100% of lineups (except rare cases).
      `
    },

    avoidingDuplication: {
      problem: `
        Duplication = multiple people have your exact lineup.
        If you and 50 others have the same lineup, you split the prize.
        In 150-max contests, sharks intentionally avoid duplication.
      `,
      
      solutions: [
        'Use min uniques setting in optimizer',
        'Vary captain/anchor across lineups',
        'Include at least one <5% owned player per lineup',
        'Don\'t just swap punts - change core players',
      ]
    }
  },

};

// ============================================================================
// PART 10: ENHANCED TEN COMMANDMENTS (SOTA VERSION)
// ============================================================================

export const TEN_COMMANDMENTS_SOTA = [
  {
    number: 1,
    commandment: 'THOU SHALT SIMULATE, NOT JUST OPTIMIZE',
    explanation: `
      Traditional: Find lineup with highest projected points.
      SOTA: Simulate slate 10,000 times, find lineup that WINS most.
      
      The winning lineup is often NOT the highest projected.
      It's the one that hits when chalk fails.
    `
  },
  {
    number: 2,
    commandment: 'THOU SHALT MEASURE BOOM/BUST PERCENTILES',
    explanation: `
      Floor and ceiling are too simplistic.
      Calculate 10th/25th/50th/75th/90th percentile outcomes.
      
      For GPPs: Target 75th percentile.
      For Cash: Target 25th percentile (floor).
    `
  },
  {
    number: 3,
    commandment: 'THOU SHALT CALCULATE LEVERAGE, NOT JUST OWNERSHIP',
    explanation: `
      Low ownership alone doesn't mean good leverage.
      Leverage = Win Probability Implied Ownership - Actual Ownership.
      
      A 5% owned player with 2% win probability is NEGATIVE leverage.
      A 15% owned player with 20% win probability is POSITIVE leverage.
    `
  },
  {
    number: 4,
    commandment: 'THOU SHALT MASTER LATE SWAP',
    explanation: `
      NBA injury news comes 30 min before tip.
      Late swap is the #1 edge in NBA DFS.
      
      Set alerts. Monitor Twitter. Execute within 2 minutes.
      Those who don't late swap are leaving money on the table.
    `
  },
  {
    number: 5,
    commandment: 'THOU SHALT USE VEGAS DATA',
    explanation: `
      Implied team totals predict game environments.
      High total (118+) = More fantasy points available.
      Low total (<105) = Fade the entire game.
      
      Vegas is smarter than your projections.
    `
  },
  {
    number: 6,
    commandment: 'THOU SHALT UNDERSTAND USAGE INHERITANCE',
    explanation: `
      When a star is out, backup gets MINUTES.
      But the USAGE often goes to the secondary ball handler.
      
      The best injury play is often NOT the direct replacement.
    `
  },
  {
    number: 7,
    commandment: 'THOU SHALT STACK WITH PURPOSE',
    explanation: `
      NBA stacking captures high-scoring games.
      4-5 players from one game = tournament ceiling.
      
      But only stack games with: 230+ total, <5 spread, top-15 pace.
    `
  },
  {
    number: 8,
    commandment: 'THOU SHALT BUILD PORTFOLIOS, NOT LINEUPS',
    explanation: `
      Multi-entry requires diversification.
      Each lineup needs a unique "way to win."
      
      Min 3-4 unique players between lineups.
      Track exposure % across entire portfolio.
    `
  },
  {
    number: 9,
    commandment: 'THOU SHALT RESPECT BLOWOUT RISK',
    explanation: `
      10+ spread = starters sit Q4 on favorite.
      This CAPS ceiling even if floor is safe.
      
      For GPPs: Target stars on UNDERDOGS (blowout immune).
      Heavy favorites: Play the bench for garbage time.
    `
  },
  {
    number: 10,
    commandment: 'THOU SHALT TRUST THE PROCESS',
    explanation: `
      You will lose most GPPs. Even the best win <5%.
      But one $10K win covers 500 losing $20 entries.
      
      Focus on +EV decisions, not short-term results.
      The math will win over time.
    `
  }
];

// ============================================================================
// PART 11: GARY'S ENHANCED CHECKLIST
// ============================================================================

export const GPP_CHECKLIST_SOTA = {
  
  required: [
    {
      check: 'Did I run simulations (not just optimize)?',
      definition: 'Lineup win probability calculated from simulations',
      ifNo: 'Lineup is optimized for projection, not winning'
    },
    {
      check: 'Does lineup target 75th percentile outcomes?',
      definition: 'Each player\'s 75th percentile outcome is strong',
      ifNo: 'Lineup has projection but not ceiling'
    },
    {
      check: 'Do I have positive leverage plays?',
      definition: 'At least 2 players with leverage > +3%',
      ifNo: 'Lineup is too chalky to win large fields'
    },
    {
      check: 'Is lineup correlated?',
      definition: '4-5 players from high-total game (230+)',
      ifNo: 'Lineup has ceiling cap - add game stack'
    },
    {
      check: 'Did I integrate Vegas data?',
      definition: 'Stack targets highest implied total game',
      ifNo: 'May be stacking wrong game'
    },
    {
      check: 'Is blowout risk accounted for?',
      definition: 'No stars on -10+ favorites (capped ceiling)',
      ifNo: 'Replace with underdog stars or favorite bench'
    },
    {
      check: 'Do I have late swap plan?',
      definition: 'Pivot candidates identified for each position',
      ifNo: 'Set up contingencies before lock'
    }
  ],

  warnings: [
    {
      flag: 'Negative leverage on multiple players',
      issue: 'Field is overrating these players',
      action: 'Find alternatives with positive leverage'
    },
    {
      flag: 'No game stack',
      issue: 'Lineup ceiling capped at ~330',
      action: 'Add 4-5 players from best game environment'
    },
    {
      flag: 'Star on -10+ favorite',
      issue: 'Blowout risk caps ceiling',
      action: 'Pivot to underdog star or favorite bench'
    },
    {
      flag: 'All high-owned players',
      issue: 'No differentiation from field',
      action: 'Add 1-2 leverage plays under 10% owned'
    }
  ],

  ultimateQuestion: `
    BEFORE SUBMITTING, ASK:
    
    "In how many simulation outcomes does this lineup WIN?"
    
    If the answer is <0.5%, you need more upside or leverage.
    Winning lineups have unique exposure to outcomes others miss.
  `
};

// ============================================================================
// PART 12: SCORE TARGETS BY SLATE TYPE (derived from WINNING_SCORE_TARGETS)
// ============================================================================

// Build flat score targets from canonical WINNING_SCORE_TARGETS to avoid duplication.
// Legacy audit service imports this shape.
function buildScoreTargets(sportKey) {
  const targets = WINNING_SCORE_TARGETS[sportKey];
  if (!targets?.LARGE_GPP) return null;
  const gpp = targets.LARGE_GPP;
  return {
    MAIN_SLATE: {
      toWin: gpp.firstPlace?.typical || 0,
      toTop1Percent: gpp.top1Percent?.typical || 0,
      toTop10Percent: gpp.top10Percent?.typical || 0,
      toCash: gpp.cashLine?.typical || 0,
    },
  };
}

export const SCORE_TARGETS_SOTA = {
  DRAFTKINGS_NBA: buildScoreTargets('DRAFTKINGS_NBA'),
  FANDUEL_NBA: buildScoreTargets('FANDUEL_NBA'),
  DRAFTKINGS_NFL: buildScoreTargets('DRAFTKINGS_NFL'),
  FANDUEL_NFL: buildScoreTargets('FANDUEL_NFL'),
  DRAFTKINGS_NHL: buildScoreTargets('DRAFTKINGS_NHL'),
  FANDUEL_NHL: buildScoreTargets('FANDUEL_NHL'),
};

// ============================================================================
// PART 13: GARY'S INVESTIGATION FRAMEWORK
// ============================================================================

/**
 * CRITICAL: These are QUESTIONS to investigate, NOT rules to apply blindly.
 * Gary should use BDL stats and Gemini grounding to VERIFY each situation.
 */
export const GARY_INVESTIGATION_QUESTIONS = {
  
  // Questions to ask for EACH player before including in lineup
  PLAYER_QUESTIONS: [
    {
      question: "Is this player's recent form (L5) sustainable or an anomaly?",
      howToVerify: "Check BDL L5 stats. Use Gemini to find if there's a reason (injury return, role change, matchup streak).",
      whatToLookFor: "If hot streak is due to temporary circumstance (weak schedule), fade. If due to permanent change (new role), target."
    },
    {
      question: "Is the ownership projection accurate for this player?",
      howToVerify: "Use Gemini grounding to check RotoGrinders, FantasyLabs ownership projections.",
      whatToLookFor: "If ownership is based on recency bias (last game explosion), it may be inflated."
    },
    {
      question: "Does this player have a real path to ceiling tonight?",
      howToVerify: "Check opponent DvP, pace, and recent defensive performance via BDL.",
      whatToLookFor: "Ceiling needs opportunity (minutes + usage) AND matchup (weak defense)."
    },
    {
      question: "Is there an injury or rotation change affecting this player?",
      howToVerify: "Use Gemini grounding for latest injury news. Check BDL for teammate status.",
      whatToLookFor: "Teammate out = usage boost. Player questionable = risk."
    }
  ],

  // Questions to ask about GAME ENVIRONMENT
  GAME_QUESTIONS: [
    {
      question: "Is this game total (O/U) accurate or has it moved?",
      howToVerify: "Use Gemini to check opening line vs current line.",
      whatToLookFor: "Total dropping = sharps betting under (possible injury, pace-down). Rising = shootout expected."
    },
    {
      question: "Is blowout risk REAL for this specific matchup?",
      howToVerify: "Check BDL for recent head-to-head, home/away splits. Check if underdog has history of keeping games close.",
      whatToLookFor: "Some -10 favorites still play close (rivalry games, playoff implications)."
    },
    {
      question: "Which players benefit most if this game goes as Vegas expects?",
      howToVerify: "If high total: Target pace-up players. If low total: Fade or find defensive players.",
      whatToLookFor: "Game environment should match player profiles."
    }
  ],

  // Questions to ask about LINEUP CONSTRUCTION
  LINEUP_QUESTIONS: [
    {
      question: "Does my correlation make sense for tonight's slate?",
      howToVerify: "Verify the games I'm stacking are actually high-total, competitive matchups.",
      whatToLookFor: "Don't stack a 210-total slog just because the formula says 'stack 4 players'."
    },
    {
      question: "Are my value plays actually good value, or just cheap?",
      howToVerify: "Check BDL for minutes, usage, recent production. Verify they have a role.",
      whatToLookFor: "Cheap + no role = zero. Cheap + real role = value."
    },
    {
      question: "Do I have a unique path to victory, or am I building the same lineup as everyone?",
      howToVerify: "Use Gemini to check consensus plays. Identify where you're different.",
      whatToLookFor: "Need 1-2 leverage plays that give you an edge when they hit."
    }
  ],

  // Questions to ask during AUDIT/GRADING
  AUDIT_QUESTIONS: [
    {
      question: "Why is this lineup NOT an A grade?",
      howToVerify: "Identify specific weaknesses. For each, ask: Is this a real problem for TONIGHT'S slate?",
      whatToLookFor: "Sometimes 'punt overload' is fine if punts are in smash spots."
    },
    {
      question: "Can I improve this lineup without breaking something else?",
      howToVerify: "For each suggested swap, check if new player is actually better for this situation.",
      whatToLookFor: "Don't swap just to hit a formula. Swap because the new player is genuinely better."
    },
    {
      question: "Does my lineup tell a coherent 'story' of how it wins?",
      howToVerify: "Explain in one sentence why this lineup could win tonight.",
      whatToLookFor: "'I'm betting on the NYK/SAC game exploding and my WAS stack provides leverage.'"
    }
  ]
};

// How Gary should approach the ENTIRE DFS process
export const GARY_DFS_PHILOSOPHY = {
  
  approach: `
    Gary is a SHARP DFS ANALYST, not a rule-following optimizer.
    
    The FIBLE teaches Gary what matters in DFS.
    Gary's job is to INVESTIGATE whether those things apply TONIGHT.
    
    EVERY pick should have a REASON that Gary can explain.
    "The formula said so" is NOT a valid reason.
    "I checked BDL and this player is averaging 35 MPG with a teammate out" IS valid.
  `,

  process: [
    "1. CONSULT the FIBLE to understand what factors matter",
    "2. GATHER DATA using BDL stats and Gemini grounding",
    "3. INVESTIGATE each player/game to verify the situation is real",
    "4. BUILD lineup based on validated insights, not formulas",
    "5. AUDIT lineup by asking if each pick has a real reason",
    "6. IMPROVE by investigating alternatives, not just swapping by score"
  ],

  validation: `
    Before finalizing a lineup, Gary should be able to answer:
    
    "For each player in this lineup, what SPECIFIC DATA supports this pick?"
    
    Good answer: "KAT is in a buy-low spot (L5 down 21%) against SAC who ranks 28th in DvP vs Centers."
    Bad answer: "KAT has a high ceiling score in my formula."
  `
};

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  WINNING_SCORE_TARGETS,
  SIMULATION_STRATEGY,
  BOOM_BUST_MODELING,
  ADVANCED_OWNERSHIP_LEVERAGE,
  LATE_SWAP_STRATEGY,
  MINUTES_INHERITANCE,
  VEGAS_INTEGRATION,
  CORRELATION_STRATEGY,
  PORTFOLIO_STRATEGY,
  TEN_COMMANDMENTS_SOTA,
  GPP_CHECKLIST_SOTA,
  SCORE_TARGETS_SOTA,
  GARY_INVESTIGATION_QUESTIONS,
  GARY_DFS_PHILOSOPHY
};
