
// Platform constraints - hard-coded rules for each platform/sport
export const PLATFORM_CONSTRAINTS = {
  draftkings: {
    NBA: {
      salaryCap: 50000,
      rosterSize: 8,
      positions: ['PG', 'SG', 'SF', 'PF', 'C', 'G', 'F', 'UTIL'],
      positionRules: {
        // Specific slots accept their position OR generic fallbacks (G/F)
        PG: { count: 1, eligible: ['PG', 'G', 'G-F', 'F-G'] },
        SG: { count: 1, eligible: ['SG', 'G', 'G-F', 'F-G'] },
        SF: { count: 1, eligible: ['SF', 'F', 'G-F', 'F-G'] },
        PF: { count: 1, eligible: ['PF', 'F', 'F-C', 'C-F'] },
        C: { count: 1, eligible: ['C', 'F-C', 'C-F'] },
        // Guard slot accepts PG or SG or G
        G: { count: 1, eligible: ['PG', 'SG', 'G', 'G-F', 'F-G'] },
        // Forward slot accepts SF or PF or F
        F: { count: 1, eligible: ['SF', 'PF', 'F', 'F-C', 'C-F', 'G-F', 'F-G'] },
        // UTIL slot accepts anyone
        UTIL: { count: 1, eligible: ['PG', 'SG', 'SF', 'PF', 'C', 'G', 'F', 'G-F', 'F-G', 'F-C', 'C-F'] }
      }
    },
    NFL: {
      salaryCap: 50000,
      rosterSize: 9,
      positions: ['QB', 'RB', 'RB', 'WR', 'WR', 'WR', 'TE', 'FLEX', 'DST'],
      positionRules: {
        QB: { count: 1, eligible: ['QB'] },
        RB: { count: 2, eligible: ['RB'] },
        WR: { count: 3, eligible: ['WR'] },
        TE: { count: 1, eligible: ['TE'] },
        FLEX: { count: 1, eligible: ['RB', 'WR', 'TE'] },
        DST: { count: 1, eligible: ['DST'] }
      }
    }
  },
    fanduel: {
    NBA: {
      salaryCap: 60000,
      rosterSize: 9,
      positions: ['PG', 'PG', 'SG', 'SG', 'SF', 'SF', 'PF', 'PF', 'C'],
      positionRules: {
        // FanDuel is STRICT: Slots only accept their specific positions
        PG: { count: 2, eligible: ['PG'] },
        SG: { count: 2, eligible: ['SG'] },
        SF: { count: 2, eligible: ['SF'] },
        PF: { count: 2, eligible: ['PF'] },
        C: { count: 1, eligible: ['C'] }
      }
    },
    NFL: {
      salaryCap: 60000,
      rosterSize: 10, // FanDuel includes Kickers!
      positions: ['QB', 'RB', 'RB', 'WR', 'WR', 'WR', 'TE', 'FLEX', 'K', 'DST'],
      positionRules: {
        QB: { count: 1, eligible: ['QB'] },
        RB: { count: 2, eligible: ['RB'] },
        WR: { count: 3, eligible: ['WR'] },
        TE: { count: 1, eligible: ['TE'] },
        FLEX: { count: 1, eligible: ['RB', 'WR', 'TE'] },
        K: { count: 1, eligible: ['K'] },
        DST: { count: 1, eligible: ['DST'] }
      }
    }
  }
};

// Pivot tier configurations - alternatives for users to consider
// Gary picks his BEST lineup; these are just other options at different price points

export 
// Pivot tier configurations - alternatives for users to consider
// Gary picks his BEST lineup; these are just other options at different price points
const PIVOT_TIERS = {
  direct: {
    label: 'Direct Swap',
    description: 'Similar ceiling',
    salaryRange: { min: -500, max: 500 }
  },
  mid: {
    label: 'Mid Value',
    description: 'Save ~$1K',
    salaryRange: { min: -1500, max: -500 }
  },
  budget: {
    label: 'Budget Play',
    description: 'Punt spot',
    salaryRange: { min: -Infinity, max: -1500 }
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// SALARY TIER THRESHOLDS - Absolute salary determines player tier, not just diff
// ═══════════════════════════════════════════════════════════════════════════
// A $9K player is NEVER a "punt spot" regardless of who they're replacing

export 
// ═══════════════════════════════════════════════════════════════════════════
// SALARY TIER THRESHOLDS - Absolute salary determines player tier, not just diff
// ═══════════════════════════════════════════════════════════════════════════
// A $9K player is NEVER a "punt spot" regardless of who they're replacing
const SALARY_TIER_LABELS = {
  anchor: { min: 9000, label: 'Star Pivot', description: 'Premium anchor option' },
  core: { min: 7000, label: 'Core Alternative', description: 'Solid production floor' },
  mid: { min: 5000, label: 'Mid-Tier Value', description: 'Balanced value play' },
  value: { min: 4000, label: 'Value Play', description: 'Upside at lower cost' },
  punt: { min: 0, label: 'Budget Punt', description: 'High-risk punt spot' }
};

/**
 * Get appropriate tier label based on player's absolute salary
 * Prevents calling $9K players "punt spots"
 */

export 
/**
 * Get appropriate tier label based on player's absolute salary
 * Prevents calling $9K players "punt spots"
 */
function getSalaryAwareTierLabel(salary, defaultTier, defaultLabel, defaultDescription) {
  // Override "Budget Play" labels for expensive players
  if (defaultTier === 'budget') {
    for (const [tierName, config] of Object.entries(SALARY_TIER_LABELS)) {
      if (salary >= config.min) {
        return { label: config.label, description: config.description };
      }
    }
  }
  return { label: defaultLabel, description: defaultDescription };
}

// ═══════════════════════════════════════════════════════════════════════════
// DFS LINEUP VALIDATION RULES - Prevent "Fragile Floor" Disasters
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Punt salary thresholds - Below this = "minimum salary" or "punt play"
 * These players are risky - bench warmers, fill-ins, or deep rotations
 */

export 
// ═══════════════════════════════════════════════════════════════════════════
// DFS LINEUP VALIDATION RULES - Prevent "Fragile Floor" Disasters
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Punt salary thresholds - Below this = "minimum salary" or "punt play"
 * These players are risky - bench warmers, fill-ins, or deep rotations
 */
const PUNT_SALARY_THRESHOLD = {
  draftkings: 4500,  // DK: $4,500 or less = punt territory
  fanduel: 4500      // FD: $4,500 or less = punt territory
};

/**
 * PUNT AWARENESS THRESHOLDS (NOT limits - Gary decides)
 *
 * Gary is AWARE that pros typically use 1-2 punts in GPPs.
 * But if Gary finds undervalued low-salary players with real upside
 * (minutes increase, injury replacement, favorable matchup), he can
 * build lineups with more punts if his investigation supports it.
 *
 * The audit layer will flag punt-heavy lineups for Gary to review,
 * but won't block them - Gary has agency to make his own decisions.
 */

export 
/**
 * PUNT AWARENESS THRESHOLDS (NOT limits - Gary decides)
 *
 * Gary is AWARE that pros typically use 1-2 punts in GPPs.
 * But if Gary finds undervalued low-salary players with real upside
 * (minutes increase, injury replacement, favorable matchup), he can
 * build lineups with more punts if his investigation supports it.
 *
 * The audit layer will flag punt-heavy lineups for Gary to review,
 * but won't block them - Gary has agency to make his own decisions.
 */
const PUNT_AWARENESS = {
  gpp: { typical: 2, flagIfOver: 3 },   // Flag for review if 4+ punts
  cash: { typical: 1, flagIfOver: 2 }   // Flag for review if 3+ punts
};

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * GARY'S SHARP KNOWLEDGE BASE
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * This is what Gary KNOWS as a sharp DFS player - NOT rules he must follow.
 * Gary uses this knowledge to THINK, then makes his OWN decisions.
 * 
 * The system identifies what Gary built and surfaces relevant considerations
 * from this knowledge base. Gary decides if his conviction justifies the risk.
 * 
 * PHILOSOPHY: Gary is the decision maker. We provide awareness, not rules.
 */


/**
 * ═══════════════════════════════════════════════════════════════════════════
 * GARY'S SHARP KNOWLEDGE BASE
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * This is what Gary KNOWS as a sharp DFS player - NOT rules he must follow.
 * Gary uses this knowledge to THINK, then makes his OWN decisions.
 * 
 * The system identifies what Gary built and surfaces relevant considerations
 * from this knowledge base. Gary decides if his conviction justifies the risk.
 * 
 * PHILOSOPHY: Gary is the decision maker. We provide awareness, not rules.
 */
export const GARY_SHARP_KNOWLEDGE = {
  
  // ═══════════════════════════════════════════════════════════════════════
  // BUILD ARCHETYPES - Patterns Gary recognizes and their trade-offs
  // ═══════════════════════════════════════════════════════════════════════
  archetypes: {
    'mini_max': {
      name: 'Mini-Max',
      pattern: '3+ premium plays ($9K+) via 1-2 extreme punts',
      when_it_works: 'Punts have ESTABLISHED roles (injury boost, confirmed starter, 20+ MPG)',
      when_it_fails: 'Punts are dart throws without clear minutes path',
      ceiling: 'Very high - three studs can all pop',
      floor: 'Very low - punt bust tanks lineup',
      key_question: 'Do your punts have real paths to production or are they lottery tickets?'
    },
    
    'balanced': {
      name: 'Balanced Build',
      pattern: 'Spread salary across proven mid-tier ($7-9K)',
      when_it_works: 'Mid-tier has multiple smash spots, no clear alpha dominates',
      when_it_fails: 'One alpha dominates slate and you missed them',
      ceiling: 'Moderate - harder to separate from field',
      floor: 'High - multiple paths to hitting',
      key_question: 'Is this slate truly balanced or did you miss an alpha opportunity?'
    },
    
    'alpha_anchor': {
      name: 'Alpha Anchor',
      pattern: 'One $11K+ true superstar + quality throughout',
      when_it_works: 'Clear alpha situation (injury boost + pace + matchup alignment)',
      when_it_fails: 'Alpha underperforms and you have no pivot',
      ceiling: 'High - alpha alone can carry to cash',
      floor: 'Moderate - alpha provides production base',
      key_question: 'Is your alpha truly in a smash spot or just expensive?'
    },
    
    'stars_and_scrubs': {
      name: 'Stars & Scrubs',
      pattern: '2 true studs ($10K+) + value plays throughout',
      when_it_works: 'Two clear alpha situations, cheap chalk hits',
      when_it_fails: 'Either stud busts or value tier zeros out',
      ceiling: 'Very high - two alphas popping = tournament winner',
      floor: 'Low - high variance by design',
      key_question: 'Do both studs have independent paths to smashing?'
    },
    
    'leverage_contrarian': {
      name: 'Leverage/Contrarian',
      pattern: '5+ players under 10% ownership',
      when_it_works: 'Chalk has red flags and your fades are reasoned',
      when_it_fails: 'Chalk hits anyway and you have zero equity',
      ceiling: 'Massive - if your reads are right, field is dead',
      floor: 'Very low - fighting against consensus',
      key_question: 'Are you contrarian for a reason or just being different?'
    },
    
    'game_stack': {
      name: 'Game Stack',
      pattern: '3-4 players from one high-total game',
      when_it_works: 'Vegas total 235+, close spread, pace-up matchup',
      when_it_fails: 'Game goes under or wrong side dominates',
      ceiling: 'Massive - correlated upside in shootout',
      floor: 'Very low - correlated downside if game busts',
      key_question: 'Does game environment support a shootout?'
    },
    
    'injury_stack': {
      name: 'Injury Replacement Stack',
      pattern: 'Stack multiple beneficiaries of same star OUT',
      when_it_works: 'Star OUT creates 30+ usage/minutes to redistribute',
      when_it_fails: 'Coach goes random rotation or blowout kills minutes',
      ceiling: 'High - multiple players popping from same source',
      floor: 'Moderate - usage has to go somewhere',
      key_question: 'Is this fresh injury or has market already adjusted?'
    },
    
    'ceiling_chase': {
      name: 'Ceiling Chase',
      pattern: 'Maximum upside build, accept high bust rate',
      when_it_works: 'Massive GPP (50K+ entries) where you need 400+ to cash big',
      when_it_fails: 'Small field where consistency wins',
      ceiling: 'Maximum - built to win tournaments',
      floor: 'Minimum - will bust frequently',
      key_question: 'Is this field size large enough to need a ceiling build?'
    },
    
    'anti_fragile': {
      name: 'Anti-Fragile',
      pattern: 'High floor + moderate ceiling - survives variance',
      when_it_works: 'Small-field GPP, single entry, or cash game',
      when_it_fails: 'Large GPP where you need ceiling to separate',
      ceiling: 'Moderate - not built to win big',
      floor: 'Very high - rarely busts completely',
      key_question: 'Is this the right build for this contest size?'
    },
    
    'run_it_back': {
      name: 'Run It Back Stack',
      pattern: 'Primary stack + opposing players for game correlation',
      when_it_works: 'High total (235+) with close spread (under 5 points)',
      when_it_fails: 'One team dominates and your bring-back is useless',
      ceiling: 'Massive - both sides of shootout',
      floor: 'Low - double correlation risk',
      key_question: 'Is spread tight enough that both teams will score?'
    },
    
    'pace_up_spot': {
      name: 'Pace Up Spot',
      pattern: 'Target players facing faster pace than usual',
      when_it_works: 'Slow team faces top-5 pace team',
      when_it_fails: 'Blowout kills pace-up opportunity',
      ceiling: 'High - more possessions = more production',
      floor: 'Moderate - pace boost has floor',
      key_question: 'Will game script allow full pace-up benefit?'
    }
  },
  
  // ═══════════════════════════════════════════════════════════════════════
  // PRO CONCEPTS - Mental models Gary uses when thinking
  // ═══════════════════════════════════════════════════════════════════════
  concepts: {
    'ownership_leverage': {
      principle: 'Your edge = (your_exposure - field_exposure) × player_outperformance',
      insight: 'Being 10% overweight on player who beats projection by 15pts = massive equity gain'
    },
    
    'correlation_theory': {
      principle: 'Correlated players rise/fall together - amplifies upside AND downside',
      insight: 'Use correlation when game environment supports. Avoid when forcing.'
    },
    
    'slate_size_adjustment': {
      small_slate: 'Chalk is more acceptable, correlation matters more, fewer unique paths',
      large_slate: 'Uniqueness matters more, contrarian builds gain equity'
    },
    
    'positional_scarcity': {
      principle: 'When a position is thin, chalk is forced',
      insight: 'Accept chalk at scarce positions. Fight ownership battles elsewhere.'
    },
    
    'game_theory': {
      principle: 'Sometimes play chalk BECAUSE others are fading it',
      insight: 'If 25% owned chalk hits, all faders lose equity to you'
    },
    
    'value_vs_dart_throw': {
      value_play: 'Cheap player with ESTABLISHED role - clear path to production',
      dart_throw: 'Cheap player without clear minutes - pure lottery ticket',
      insight: 'Value plays win lineups. Dart throws are for ceiling chasing only.'
    },
    
    'ceiling_gap': {
      principle: 'Gap between projection and ceiling reveals upside potential',
      gpp_target: 'GPP lineups should have 15-20%+ ceiling gap',
      cash_target: 'Cash lineups should have 5-10% ceiling gap (floor matters more)'
    }
  },
  
  // ═══════════════════════════════════════════════════════════════════════
  // SHARP DATA POINTS - What Gary investigates for each player
  // ═══════════════════════════════════════════════════════════════════════
  data_points: {
    'minutes_volatility': 'High volatility = GPP only (boom/bust profile)',
    'usage_in_close_games': 'Does coach trust them in crunch time? (floor indicator)',
    'garbage_time_equity': 'Do they play when down 20? (blowout hedge)',
    'pace_adjusted_stats': 'Raw stats lie - pace context matters',
    'home_vs_away_splits': 'Some players have massive home/road gaps',
    'vs_top_defense': 'Do they maintain production against elite D?',
    'back_to_back_impact': 'Vets often rest, young guys get extra run'
  },
  
  // ═══════════════════════════════════════════════════════════════════════
  // WINNING SCORE TARGETS - What Gary needs to hit to actually WIN
  // ═══════════════════════════════════════════════════════════════════════
  // Gary builds lineups that CAN WIN, not lineups that merely "cash"
  // These are targets for first-place finishes in each contest type
  winning_targets: {
    NBA: {
      draftkings: {
        // DraftKings NBA: 8 players, $50K cap
        gpp_small: { win: 350, cash: 280, description: 'Small GPP (50-500 entries) - ~350 wins' },
        gpp_medium: { win: 370, cash: 280, description: 'Medium GPP (500-5K entries) - ~370 wins' },
        gpp_large: { win: 400, cash: 280, description: 'Large GPP (5K+ entries) - 400+ needed for 1st' },
        gpp_milly: { win: 420, cash: 280, description: 'Milly Maker (50K+ entries) - 420+ for top spots' },
        cash: { win: 280, cash: 280, description: 'Cash games (50/50, H2H) - 280+ is safe' },
        avg_per_player: { gpp_win: 45, cash: 35, description: 'GPP winner averages 45+ FPTS/player' }
      },
      fanduel: {
        // FanDuel NBA: 9 players, $60K cap
        gpp_small: { win: 340, cash: 270, description: 'Small GPP - ~340 wins' },
        gpp_medium: { win: 360, cash: 270, description: 'Medium GPP - ~360 wins' },
        gpp_large: { win: 380, cash: 270, description: 'Large GPP - 380+ for 1st' },
        cash: { win: 270, cash: 270, description: 'Cash games - 270+ is safe' },
        avg_per_player: { gpp_win: 40, cash: 30, description: 'GPP winner averages 40+ FPTS/player' }
      }
    },
    NFL: {
      draftkings: {
        // DraftKings NFL: 9 players, $50K cap
        gpp_small: { win: 180, cash: 130, description: 'Small GPP - ~180 wins' },
        gpp_medium: { win: 200, cash: 130, description: 'Medium GPP - ~200 wins' },
        gpp_large: { win: 220, cash: 130, description: 'Large GPP - 220+ for 1st' },
        gpp_milly: { win: 250, cash: 130, description: 'Milly Maker - 250+ for top spots' },
        cash: { win: 130, cash: 130, description: 'Cash games - 130+ is safe' }
      },
      fanduel: {
        // FanDuel NFL: 9 players, $60K cap  
        gpp_small: { win: 170, cash: 120, description: 'Small GPP - ~170 wins' },
        gpp_medium: { win: 190, cash: 120, description: 'Medium GPP - ~190 wins' },
        gpp_large: { win: 210, cash: 120, description: 'Large GPP - 210+ for 1st' },
        cash: { win: 120, cash: 120, description: 'Cash games - 120+ is safe' }
      }
    }
  }
};

// Legacy export for backward compatibility


// Legacy export for backward compatibility
export const LINEUP_ARCHETYPES = {
  'stars_and_scrubs': {
    name: 'Stars & Scrubs',
    description: 'High variance - 2 studs, rest value plays',
    contestTypes: ['gpp'],
    riskLevel: 'VERY_HIGH',
    floorTarget: 260,
    ceilingTarget: 400
  },
  'balanced_build': {
    name: 'Balanced Build',
    description: 'Medium variance - spread salary across mid-tier stars',
    contestTypes: ['gpp', 'cash'],
    riskLevel: 'MEDIUM',
    floorTarget: 300,
    ceilingTarget: 380
  },
  'cash_safe': {
    name: 'Cash Safe',
    description: 'Low variance - high floor, no punts',
    contestTypes: ['cash'],
    riskLevel: 'LOW',
    floorTarget: 320,
    ceilingTarget: 360
  }
};

/**
 * Anti-correlation rules - Detect conflicting player combinations
 * Stacking players who compete for the same opportunities = bad strategy
 */

export 
/**
 * Anti-correlation rules - Detect conflicting player combinations
 * Stacking players who compete for the same opportunities = bad strategy
 */
const ANTI_CORRELATION_RULES = {
  'bench_conflict': {
    name: 'Same-Team Bench Conflict',
    check: (playerA, playerB) => {
      return playerA.team === playerB.team &&
             (playerA.seasonStats?.mpg || 0) < 25 && // Both bench players
             (playerB.seasonStats?.mpg || 0) < 25 &&
             playerA.position === playerB.position;
    },
    penalty: -15,
    reason: 'Same-team bench players compete for minutes'
  },
  
  'frontcourt_stack': {
    name: 'Frontcourt Overlap',
    check: (playerA, playerB) => {
      return playerA.team === playerB.team &&
             ['C', 'PF', 'F', 'F-C', 'C-F'].includes(playerA.position) &&
             ['C', 'PF', 'F', 'F-C', 'C-F'].includes(playerB.position) &&
             (playerA.seasonStats?.mpg || 0) < 30 && // Not both starters
             (playerB.seasonStats?.mpg || 0) < 30;
    },
    penalty: -10,
    reason: 'Frontcourt overlap - limited scoring opportunities'
  },
  
  'backup_rb_stack': {
    name: 'Backup RB Stack (NFL)',
    check: (playerA, playerB) => {
      return playerA.team === playerB.team &&
             playerA.position === 'RB' &&
             playerB.position === 'RB' &&
             (playerA.seasonStats?.rushing_attempts || 0) < 15 && // Both backups
             (playerB.seasonStats?.rushing_attempts || 0) < 15;
    },
    penalty: -20,
    reason: 'Both backup RBs - one will dominate, other gets nothing'
  },
  
  'ball_dominant_guards': {
    name: 'Ball-Dominant Guard Overlap',
    check: (playerA, playerB) => {
      // List of ball-dominant guards who cannibalize each other's usage
      const BALL_DOMINANT_GUARDS = [
        'james harden', 'tyrese maxey', 'luka doncic', 'trae young',
        'damian lillard', 'ja morant', 'shai gilgeous-alexander', 'de\'aaron fox',
        'kyrie irving', 'donovan mitchell', 'jalen brunson', 'cade cunningham',
        'lamelo ball', 'darius garland', 'tyrese haliburton', 'anthony edwards',
        'stephen curry', 'fred vanvleet', 'devin booker', 'russell westbrook'
      ];
      
      const aName = (playerA.player || playerA.name || '').toLowerCase();
      const bName = (playerB.player || playerB.name || '').toLowerCase();
      
      const aIsBallDominant = BALL_DOMINANT_GUARDS.some(g => aName.includes(g) || g.includes(aName.split(' ').pop()));
      const bIsBallDominant = BALL_DOMINANT_GUARDS.some(g => bName.includes(g) || g.includes(bName.split(' ').pop()));
      
      // Only flag if BOTH are ball-dominant AND on the same team
      return aIsBallDominant && bIsBallDominant && playerA.team === playerB.team;
    },
    penalty: -12,
    reason: 'Ball-dominant guards cannibalize each other\'s usage - limit ceiling in GPPs'
  },
  
  'star_returning_beneficiary': {
    name: 'Star Returning - Beneficiary Loses Value',
    check: (playerA, playerB) => {
      // Check if one player is marked as losing value due to star returning
      const aLosesValue = playerA.starReturning || playerA.roleEnded || playerA.usageChange < -5;
      const bLosesValue = playerB.starReturning || playerB.roleEnded || playerB.usageChange < -5;
      
      // Flag if EITHER player has reduced opportunity
      return (aLosesValue || bLosesValue) && playerA.team === playerB.team;
    },
    penalty: -8,
    reason: 'Star returning reduces role player\'s value - ceiling capped'
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// BUILD IDENTIFICATION & REFLECTION - Non-Prescriptive Awareness
// ═══════════════════════════════════════════════════════════════════════════
// 
// Gary builds whatever lineup HE thinks wins. These functions identify what
// he built and surface relevant considerations from his sharp knowledge base.
// 
// This is REFLECTION, not rules. Gary decides if his conviction holds.
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Identify what type of build Gary created based on salary distribution
 * This is DETECTION, not prescription - we're observing what Gary chose
 * 
 * @param {Array} lineup - The lineup Gary built
 * @param {string} platform - 'draftkings' or 'fanduel'
 * @returns {Object} Build identification with type and tier breakdown
 */


/**
 * ═══════════════════════════════════════════════════════════════════════════
 * GPP VALUE TARGETS - Industry-Standard Multipliers
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * To hit 350+ points in GPPs, you need players hitting these value targets:
 * 
 * NBA GPP Target: 7x value ($5K player needs 35 pts, $10K needs 70 pts)
 * NBA Cash Target: 5x value (safer, hit 280 pts)
 * 
 * NFL GPP Target: 4x value ($6K player needs 24 pts)
 * NFL Cash Target: 2.5x value (safer floor)
 * 
 * These targets help identify "smash spots" vs "chalk traps"
 * ═══════════════════════════════════════════════════════════════════════════
 */
export const GPP_VALUE_TARGETS = {
  NBA: { gpp: 7.0, cash: 5.0 },
  NFL: { gpp: 4.0, cash: 2.5 }
};

/**
 * Calculate GPP Value Score - Points needed to hit GPP target
 * @param {number} salary - Player salary
 * @param {string} sport - 'NBA' or 'NFL'
 * @param {string} contestType - 'gpp' or 'cash'
 * @returns {number} Target points to hit value
 */

