/**
 * DFS Lineup Service
 * Core lineup optimization and pivot generation for Gary's Fantasy
 * 
 * Supports:
 * - DraftKings and FanDuel platforms
 * - NBA and NFL sports
 * - 3-tier pivot alternatives per position (direct, mid, budget)
 */

import { runSharpAuditCycle } from './agentic/dfsLineupAuditIntegration.js';

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
export function identifyBuildType(lineup, platform = 'draftkings') {
  // Platform-specific salary thresholds
  const thresholds = platform === 'fanduel' 
    ? { alpha: 9500, star: 8500, mid: 5500, value: 4000 }
    : { alpha: 10000, star: 9000, mid: 6000, value: 4000 };
  
  // Categorize players into tiers
  const alphas = lineup.filter(s => (s.salary || 0) >= thresholds.alpha);
  const stars = lineup.filter(s => (s.salary || 0) >= thresholds.star && (s.salary || 0) < thresholds.alpha);
  const mids = lineup.filter(s => (s.salary || 0) >= thresholds.mid && (s.salary || 0) < thresholds.star);
  const values = lineup.filter(s => (s.salary || 0) >= thresholds.value && (s.salary || 0) < thresholds.mid);
  const punts = lineup.filter(s => (s.salary || 0) < thresholds.value);
  
  const premiumCount = alphas.length + stars.length;
  const totalPremiumSalary = [...alphas, ...stars].reduce((sum, s) => sum + (s.salary || 0), 0);
  
  // Identify build type based on distribution pattern
  let buildType = 'balanced'; // Default
  let confidence = 'medium';
  
  // Check for game stack (3+ from same team)
  const teamCounts = {};
  lineup.forEach(s => {
    teamCounts[s.team] = (teamCounts[s.team] || 0) + 1;
  });
  const maxTeamStack = Math.max(...Object.values(teamCounts));
  const stackedTeam = Object.keys(teamCounts).find(t => teamCounts[t] === maxTeamStack);
  
  // Check for correlation (players from same game)
  const hasGameStack = maxTeamStack >= 3;
  
  // Identify injury stack (multiple players with injury boost from same team)
  const injuryBoosts = lineup.filter(s => s.usageBoost || s.teammateOpportunity || s.injuryBeneficiary);
  const injuryByTeam = {};
  injuryBoosts.forEach(s => {
    injuryByTeam[s.team] = (injuryByTeam[s.team] || 0) + 1;
  });
  const hasInjuryStack = Object.values(injuryByTeam).some(c => c >= 2);
  
  // Identify dart throws vs value plays
  const dartThrows = lineup.filter(s => {
    const mpg = s.mpg || s.seasonStats?.mpg || 0;
    const gamesPlayed = s.seasonStats?.gamesPlayed || s.seasonStats?.games || 0;
    const hasBoost = s.usageBoost || s.teammateOpportunity || s.injuryBeneficiary;
    const salary = s.salary || 0;
    
    // Dart throw = cheap + low minutes + no boost
    return salary < thresholds.value && mpg < 20 && gamesPlayed < 30 && !hasBoost;
  });
  
  // Determine build type
  if (alphas.length >= 1 && premiumCount >= 3 && punts.length >= 2) {
    buildType = 'mini_max';
    confidence = punts.length > 2 ? 'high' : 'medium';
  } else if (alphas.length >= 1 && mids.length >= 4) {
    buildType = 'alpha_anchor';
    confidence = 'high';
  } else if (premiumCount >= 2 && values.length + punts.length >= 4) {
    buildType = 'stars_and_scrubs';
    confidence = 'medium';
  } else if (hasGameStack) {
    buildType = 'game_stack';
    confidence = maxTeamStack >= 4 ? 'high' : 'medium';
  } else if (hasInjuryStack) {
    buildType = 'injury_stack';
    confidence = 'medium';
  } else if (punts.length === 0 && values.length <= 2) {
    buildType = 'anti_fragile';
    confidence = 'high';
  } else if (mids.length >= 5) {
    buildType = 'balanced';
    confidence = 'high';
  }
  
  // Check for contrarian build (low ownership)
  const avgOwnership = lineup.reduce((sum, s) => sum + (s.ownership || 10), 0) / lineup.length;
  const lowOwnedCount = lineup.filter(s => (s.ownership || 10) < 10).length;
  if (lowOwnedCount >= 5) {
    buildType = 'leverage_contrarian';
    confidence = 'medium';
  }
  
  return {
    buildType,
    confidence,
    tiers: {
      alphas: alphas.map(s => ({ name: s.player, salary: s.salary, team: s.team })),
      stars: stars.map(s => ({ name: s.player, salary: s.salary, team: s.team })),
      mids: mids.map(s => ({ name: s.player, salary: s.salary, team: s.team })),
      values: values.map(s => ({ name: s.player, salary: s.salary, team: s.team })),
      punts: punts.map(s => ({ name: s.player, salary: s.salary, team: s.team }))
    },
    metrics: {
      premiumCount,
      totalPremiumSalary,
      dartThrowCount: dartThrows.length,
      dartThrows: dartThrows.map(s => s.player),
      maxTeamStack,
      stackedTeam: maxTeamStack >= 3 ? stackedTeam : null,
      avgOwnership,
      lowOwnedCount
    }
  };
}

/**
 * Reflect on Gary's build and surface relevant considerations
 * This is AWARENESS, not prescription - Gary decides what to do
 * 
 * @param {Array} lineup - The lineup Gary built
 * @param {Object} context - Contest context (contestType, etc.)
 * @param {string} platform - 'draftkings' or 'fanduel'
 * @returns {Object} Reflection with considerations for Gary to evaluate
 */
export function reflectOnBuild(lineup, context = {}, platform = 'draftkings') {
  const contestType = context.contestType || 'gpp';
  const buildInfo = identifyBuildType(lineup, platform);
  const archetype = GARY_SHARP_KNOWLEDGE.archetypes[buildInfo.buildType];
  
  const reflection = {
    buildType: buildInfo.buildType,
    buildName: archetype?.name || 'Custom Build',
    confidence: buildInfo.confidence,
    tiers: buildInfo.tiers,
    considerations: [],
    questions: [],
    metrics: buildInfo.metrics
  };
  
  // ═══════════════════════════════════════════════════════════════════════
  // Surface considerations based on what Gary built
  // These are QUESTIONS for Gary to answer, not rules to follow
  // ═══════════════════════════════════════════════════════════════════════
  
  if (archetype) {
    reflection.considerations.push({
      type: 'build_profile',
      message: `BUILD: ${archetype.name} - ${archetype.pattern}`,
      detail: `This build works when: ${archetype.when_it_works}`
    });
    
    reflection.questions.push(archetype.key_question);
  }
  
  // Dart throw awareness
  if (buildInfo.metrics.dartThrowCount >= 3) {
    reflection.considerations.push({
      type: 'dart_throw_concentration',
      severity: 'investigate',
      message: `${buildInfo.metrics.dartThrowCount} players appear to be dart throws`,
      players: buildInfo.metrics.dartThrows
    });
    reflection.questions.push('Do these dart throws have clear paths to minutes (injury boost) or are they lottery tickets?');
  }
  
  // Ceiling gap check for GPPs
  const totalProjected = lineup.reduce((sum, s) => sum + (s.projected_pts || 0), 0);
  const totalCeiling = lineup.reduce((sum, s) => {
    const baseProj = s.projected_pts || 0;
    const mpg = s.mpg || s.seasonStats?.mpg || 20;
    const upsideMultiplier = mpg >= 32 ? 1.35 : mpg >= 25 ? 1.25 : 1.4; // Dart throws have high variance
    return sum + (baseProj * upsideMultiplier);
  }, 0);
  const ceilingGap = ((totalCeiling - totalProjected) / totalProjected) * 100;
  
  reflection.metrics.projected = totalProjected;
  reflection.metrics.ceiling = totalCeiling;
  reflection.metrics.ceilingGapPercent = ceilingGap;
  
  if (contestType === 'gpp' && ceilingGap < 12) {
    reflection.considerations.push({
      type: 'narrow_ceiling',
      severity: 'investigate',
      message: `Ceiling gap is ${ceilingGap.toFixed(0)}% (GPPs typically need 15-20%+)`,
      detail: `Projected: ${totalProjected.toFixed(0)} | Ceiling: ${totalCeiling.toFixed(0)}`
    });
    reflection.questions.push('Is this ceiling enough to win this GPP, or do you need more upside players?');
  }
  
  // Mini-Max specific checks
  if (buildInfo.buildType === 'mini_max') {
    const puntQuality = buildInfo.tiers.punts.filter(p => {
      const slot = lineup.find(s => s.player === p.name);
      const mpg = slot?.mpg || slot?.seasonStats?.mpg || 0;
      const hasBoost = slot?.usageBoost || slot?.teammateOpportunity;
      return mpg >= 20 || hasBoost;
    });
    
    if (puntQuality.length < buildInfo.tiers.punts.length) {
      const riskyPunts = buildInfo.tiers.punts.filter(p => !puntQuality.find(q => q.name === p.name));
      reflection.considerations.push({
        type: 'punt_quality',
        severity: 'investigate',
        message: `Mini-Max needs established role punts. ${riskyPunts.length} punt(s) look like dart throws.`,
        players: riskyPunts.map(p => p.name)
      });
      reflection.questions.push('Mini-Max risk without Mini-Max quality - is your conviction on these punts strong enough?');
    }
  }
  
  // Game stack awareness
  if (buildInfo.metrics.maxTeamStack >= 3) {
    reflection.considerations.push({
      type: 'game_stack',
      severity: 'awareness',
      message: `${buildInfo.metrics.maxTeamStack}-man stack from ${buildInfo.metrics.stackedTeam}`,
      detail: 'Correlation amplifies upside AND downside'
    });
    reflection.questions.push('Does game environment (total, pace, spread) support a shootout for this stack?');
  }
  
  // Ownership awareness
  if (buildInfo.metrics.avgOwnership > 20) {
    reflection.considerations.push({
      type: 'chalky_build',
      severity: 'awareness',
      message: `Average ownership is ${buildInfo.metrics.avgOwnership.toFixed(0)}% - this is a chalky build`,
      detail: 'Fine for cash games, but limits GPP equity if chalk busts'
    });
  } else if (buildInfo.metrics.lowOwnedCount >= 4) {
    reflection.considerations.push({
      type: 'contrarian_build',
      severity: 'awareness',
      message: `${buildInfo.metrics.lowOwnedCount} players under 10% ownership - highly contrarian`,
      detail: 'Massive upside if reads are right, but fighting consensus'
    });
    reflection.questions.push('Are you contrarian for a specific reason or just being different?');
  }
  
  // Always end with Gary's agency
  reflection.garyDecides = true;
  reflection.reminder = 'Gary: You built this for a reason. Trust your thesis or adjust specific spots.';
  
  return reflection;
}

/**
 * Generate reflection notes for Gary's lineup
 * Returns formatted strings for inclusion in gary_notes
 */
export function generateReflectionNotes(lineup, context = {}, platform = 'draftkings') {
  const reflection = reflectOnBuild(lineup, context, platform);
  const notes = [];
  
  notes.push(``);
  notes.push(`═══════════════════════════════════════════════════════════`);
  notes.push(`🔍 BUILD ANALYSIS - What Gary Built`);
  notes.push(`═══════════════════════════════════════════════════════════`);
  notes.push(``);
  
  // Build identification
  notes.push(`BUILD TYPE: ${reflection.buildName.toUpperCase()}`);
  notes.push(`Confidence: ${reflection.confidence}`);
  notes.push(``);
  
  // Tier breakdown
  notes.push(`TIER BREAKDOWN:`);
  if (reflection.tiers.alphas.length > 0) {
    notes.push(`  Alphas ($10K+): ${reflection.tiers.alphas.map(p => `${p.name} ($${(p.salary/1000).toFixed(1)}K)`).join(', ')}`);
  }
  if (reflection.tiers.stars.length > 0) {
    notes.push(`  Stars ($9K+):   ${reflection.tiers.stars.map(p => `${p.name} ($${(p.salary/1000).toFixed(1)}K)`).join(', ')}`);
  }
  if (reflection.tiers.mids.length > 0) {
    notes.push(`  Mid ($6-9K):    ${reflection.tiers.mids.map(p => `${p.name} ($${(p.salary/1000).toFixed(1)}K)`).join(', ')}`);
  }
  if (reflection.tiers.values.length > 0) {
    notes.push(`  Value ($4-6K):  ${reflection.tiers.values.map(p => `${p.name} ($${(p.salary/1000).toFixed(1)}K)`).join(', ')}`);
  }
  if (reflection.tiers.punts.length > 0) {
    notes.push(`  Punts (<$4K):   ${reflection.tiers.punts.map(p => `${p.name} ($${(p.salary/1000).toFixed(1)}K)`).join(', ')}`);
  }
  
  // Metrics
  notes.push(``);
  notes.push(`METRICS:`);
  notes.push(`  Projected: ${reflection.metrics.projected?.toFixed(0) || 'N/A'} | Ceiling: ${reflection.metrics.ceiling?.toFixed(0) || 'N/A'} | Gap: ${reflection.metrics.ceilingGapPercent?.toFixed(0) || 'N/A'}%`);
  notes.push(`  Avg Ownership: ${reflection.metrics.avgOwnership?.toFixed(0) || 'N/A'}% | Dart Throws: ${reflection.metrics.dartThrowCount || 0}`);
  
  // Considerations
  if (reflection.considerations.length > 0) {
    notes.push(``);
    notes.push(`⚠️ CONSIDERATIONS:`);
    reflection.considerations.forEach(c => {
      notes.push(`  • ${c.message}`);
      if (c.detail) notes.push(`    → ${c.detail}`);
    });
  }
  
  // Questions for Gary
  if (reflection.questions.length > 0) {
    notes.push(``);
    notes.push(`❓ QUESTIONS FOR GARY:`);
    reflection.questions.forEach((q, i) => {
      notes.push(`  ${i + 1}. ${q}`);
    });
  }
  
  // Gary's agency reminder
  notes.push(``);
  notes.push(`💡 ${reflection.reminder}`);
  
  return notes;
}

// ═══════════════════════════════════════════════════════════════════════════
// DFS VALUE EQUATIONS - Key metrics for optimal lineup building
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Calculate VALUE SCORE - Points per $1K of salary
 * This is the core DFS metric for identifying value plays
 * 
 * Target: 5x is baseline, 6x+ is elite value
 * 
 * @param {number} projectedPts - Projected fantasy points
 * @param {number} salary - Player salary
 * @returns {number} Value score (points per $1K)
 */
export function calculateValueScore(projectedPts, salary) {
  if (!salary || salary <= 0) return 0;
  return Math.round((projectedPts / (salary / 1000)) * 100) / 100;
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * CEILING SCORE - 90th Percentile Upside (GPP Optimization)
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * For GPP tournaments, we need to target 350+ point lineups.
 * This means optimizing for CEILING, not median.
 * 
 * The formula uses:
 * 1. Base projection as floor
 * 2. Best recent game (L5 bestPts) as ceiling indicator
 * 3. Situation multipliers (usage, matchup, revenge, etc.)
 * 4. Volatility bonus for boom/bust players (GPP gold)
 * 
 * @param {Object} player - Player with recent game data
 * @param {Object} context - DFS context (matchup, usage, etc.)
 * @returns {number} Ceiling score (90th percentile outcome)
 */
export function calculateCeilingScore(player, context = {}) {
  const baseProjection = player.projected_pts || player.projectedPts || 0;
  const isGPP = context.contestType === 'gpp';
  
  // ═══════════════════════════════════════════════════════════════════════════
  // STEP 1: Use L5 best game as ceiling indicator (real data from BDL)
  // ═══════════════════════════════════════════════════════════════════════════
  // If we have L5 stats, use the best game as a ceiling anchor
  // For GPP, we are MORE AGGRESSIVE - ceiling wins tournaments!
  // 10 COMMANDMENTS: "THOU SHALT NOT BUILD FOR FLOOR IN GPPS"
  const gppMultiplier = isGPP ? 1.50 : 1.15; // Increased from 1.35 to 1.50 for GPP
  const l5BestPts = player.l5Stats?.bestPts || 0;
  const ceilingAnchor = l5BestPts > baseProjection ? l5BestPts : baseProjection * gppMultiplier;
  
  // ═══════════════════════════════════════════════════════════════════════════
  // STEP 2: Situation multipliers (context-based boosts)
  // ═══════════════════════════════════════════════════════════════════════════
  let multiplier = 1.0;
  
  // Hot streak boost (+15% ceiling) - player is exceeding averages
  if (context.recentForm === 'hot' || player.recentForm === 'hot') {
    multiplier += 0.15;
  }
  
  // Revenge game boost (+10%) - extra motivation vs former team
  if (context.isRevenge || player.isRevenge) {
    multiplier += 0.10;
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // USAGE SPIKE BOOST (+20-25%) - KEY GPP STRATEGY
  // ═══════════════════════════════════════════════════════════════════════════
  // When a star is OUT, their usage redistributes to teammates.
  // This is the "Usage Vacuum" - the player's ceiling explodes.
  // Example: If LeBron is OUT, Austin Reaves gets +15% usage → +25% ceiling
  if (context.usageBoost || player.usageBoost) {
    // Parse usage boost if it's a string like "+15% usage"
    let usageMultiplier = 0.20; // Default 20% boost
    const usageStr = player.usageBoost || context.usageBoost;
    if (typeof usageStr === 'string') {
      const match = usageStr.match(/\+(\d+)%/);
      if (match) {
        // Convert usage % increase to ceiling boost (roughly 1.5x)
        usageMultiplier = Math.min(0.35, parseInt(match[1]) / 100 * 1.5);
      }
    }
    multiplier += usageMultiplier;
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // SNAP COUNT / OPPORTUNITY BOOST (+10-15%)
  // ═══════════════════════════════════════════════════════════════════════════
  // Players with 85%+ snaps have higher floors AND ceilings
  // They're on the field for more opportunities
  const snapPct = player.snapPct || context.snapPct || 0;
  if (snapPct >= 90) {
    multiplier += 0.15; // Elite snap count
  } else if (snapPct >= 85) {
    multiplier += 0.10; // Very high snap count
  } else if (snapPct >= 75) {
    multiplier += 0.05; // Good snap count
  }
  
  // Good DvP matchup boost (+10%) - facing weak defense at position
  if (context.dvpRank && context.dvpRank <= 8) {
    multiplier += 0.10;
  } else if (context.dvpRank && context.dvpRank <= 5) {
    multiplier += 0.15; // Top 5 matchup = even bigger boost
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // VOLATILITY BONUS (GPP Gold)
  // ═══════════════════════════════════════════════════════════════════════════
  // Players with high variance (big difference between best and worst games)
  // are GREAT for GPPs because when they boom, they WIN you tournaments.
  // Cash games want consistency; GPPs want upside.
  if (player.l5Stats?.bestPts && player.l5Stats?.worstPts) {
    const volatility = player.l5Stats.bestPts - player.l5Stats.worstPts;
    const volatilityRatio = volatility / (baseProjection || 20);
    
    // High volatility (50%+ swing) = boom/bust = GPP gold
    if (volatilityRatio >= 0.5) {
      multiplier += 0.10; // Volatility bonus for GPP upside
    }
  }
  
  // Back-to-back reduction (-10%) - fatigue lowers ceiling
  if (context.isB2B || player.isB2B) {
    multiplier -= 0.10;
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // GAME ENVIRONMENT BOOST (10 COMMANDMENTS: Target 235+ Total Games)
  // ═══════════════════════════════════════════════════════════════════════════
  // Players in high-total games have more scoring opportunity
  // "THOU SHALT TARGET GAME ENVIRONMENTS"
  const gameTotal = player.gameTotal || context.gameTotal || 0;
  if (gameTotal >= 240) {
    multiplier += 0.20; // Elite shootout environment
  } else if (gameTotal >= 235) {
    multiplier += 0.15; // High-total game - target these
  } else if (gameTotal >= 230) {
    multiplier += 0.08; // Above average
  } else if (gameTotal < 215) {
    multiplier -= 0.10; // Low-total slog - avoid these in GPP
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // PACE BOOST - Position-Weighted (FIBLE Research)
  // ═══════════════════════════════════════════════════════════════════════════
  // Guards are HIGHLY correlated with pace, bigs are NOT.
  // PG in a fast game = huge boost. Center in fast game = minor boost.
  const PACE_WEIGHTS = {
    'PG': 1.0,   // Full pace boost - guards run the offense
    'SG': 0.7,   // Moderate boost - shooting guards benefit
    'G': 0.85,   // Average of PG/SG
    'SF': 0.3,   // Minimal - wings less affected
    'PF': 0.3,   // Minimal - bigs less affected
    'F': 0.3,    // Average of SF/PF
    'C': 0.2     // Almost ignore pace - centers are matchup-dependent
  };
  
  const pace = player.teamPace || context.pace || 0;
  const playerPosition = (player.position || 'G').toUpperCase();
  const paceWeight = PACE_WEIGHTS[playerPosition] || 0.5;
  
  if (pace >= 102) {
    multiplier += 0.12 * paceWeight; // Fast-paced team (position-weighted)
  } else if (pace >= 100) {
    multiplier += 0.06 * paceWeight; // Above average pace
  } else if (pace <= 96) {
    multiplier -= 0.05 * paceWeight; // Slow-paced team
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // FINAL CEILING CALCULATION
  // ═══════════════════════════════════════════════════════════════════════════
  // Use the higher of: adjusted base projection OR ceiling anchor
  // This ensures we capture true upside potential
  const adjustedProjection = baseProjection * multiplier;
  const adjustedCeiling = ceilingAnchor * (multiplier * 0.9); // Slightly dampen ceiling anchor
  
  const finalCeiling = Math.max(adjustedProjection, adjustedCeiling);
  
  return Math.round(finalCeiling * 10) / 10;
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * FLOOR SCORE - Minimum Expected Output (Cash Game Optimization)
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * For Cash games (50/50, Double-Ups), we need SAFE floors.
 * Target 280 points with high probability of hitting.
 * 
 * The formula uses:
 * 1. Base projection as anchor
 * 2. Worst recent game (L5 worstPts) as floor indicator
 * 3. Situation modifiers (snap count, blowout risk, weather)
 * 
 * @param {Object} player - Player with recent game data
 * @param {Object} context - DFS context
 * @returns {number} Floor score (10th percentile outcome)
 */
export function calculateFloorScore(player, context = {}) {
  const baseProjection = player.projected_pts || player.projectedPts || 0;
  
  // ═══════════════════════════════════════════════════════════════════════════
  // STEP 1: Use L5 worst game as floor anchor (real data from BDL)
  // ═══════════════════════════════════════════════════════════════════════════
  const l5WorstPts = player.l5Stats?.worstPts || 0;
  const floorAnchor = l5WorstPts > 0 ? l5WorstPts : baseProjection * 0.65;
  
  // Default floor is 70% of projection
  let floorPct = 0.70;
  
  // ═══════════════════════════════════════════════════════════════════════════
  // SNAP COUNT FLOOR BOOST (+10-15%)
  // ═══════════════════════════════════════════════════════════════════════════
  // High snap count = more opportunities = higher floor
  // This is the KEY metric for Cash games
  const snapPct = player.snapPct || context.snapPct || 0;
  if (snapPct >= 90) {
    floorPct += 0.15; // Elite volume = very safe floor
  } else if (snapPct >= 85) {
    floorPct += 0.10; // High volume = safe floor
  } else if (snapPct >= 75) {
    floorPct += 0.05; // Good volume
  } else if (snapPct > 0 && snapPct < 60) {
    floorPct -= 0.10; // Low snap count = risky floor
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // USAGE SPIKE FLOOR BOOST (+5-10%)
  // ═══════════════════════════════════════════════════════════════════════════
  // If a star is OUT, the backup gets guaranteed volume = higher floor
  if (context.usageBoost || player.usageBoost) {
    floorPct += 0.08; // Usage spike = safer floor
  }
  
  // Cold streak lowers floor (-10%) - player is underperforming
  if (context.recentForm === 'cold' || player.recentForm === 'cold') {
    floorPct -= 0.10;
  }
  
  // Blowout risk lowers floor (may sit 4th quarter) (-15%)
  if (context.blowoutRisk || player.blowoutRisk) {
    floorPct -= 0.15;
  }
  
  // Bad weather lowers floor for skill positions (-10%)
  if (context.weatherImpact === 'negative' || player.weatherImpact === 'negative') {
    floorPct -= 0.10;
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // FINAL FLOOR CALCULATION
  // ═══════════════════════════════════════════════════════════════════════════
  // Use the higher of: percentage-based floor OR real L5 worst game
  // This ensures we don't underestimate proven performers
  const adjustedFloor = baseProjection * floorPct;
  const finalFloor = Math.max(adjustedFloor, floorAnchor * 0.9);
  
  return Math.round(finalFloor * 10) / 10;
}

/**
 * Calculate CONSISTENCY RATING - How reliable is this player?
 * Higher = more consistent (good for cash games)
 * Lower = more volatile (boom/bust for GPPs)
 * 
 * Formula: 1 - (stdDev / mean)
 * 
 * @param {number} mean - Average fantasy points
 * @param {number} stdDev - Standard deviation of fantasy points
 * @returns {number} Consistency rating (0-1)
 */
export function calculateConsistencyRating(mean, stdDev) {
  if (!mean || mean <= 0) return 0;
  const rating = 1 - (stdDev / mean);
  return Math.max(0, Math.min(1, Math.round(rating * 100) / 100));
}

/**
 * Determine RECENT FORM based on last 5 games vs season average
 * 
 * @param {number} last5Avg - Average fantasy points last 5 games
 * @param {number} seasonAvg - Season average fantasy points
 * @returns {string} 'hot' | 'cold' | 'neutral'
 */
export function determineRecentForm(last5Avg, seasonAvg) {
  if (!seasonAvg || seasonAvg <= 0) return 'neutral';
  
  const ratio = last5Avg / seasonAvg;
  
  if (ratio >= 1.20) return 'hot';    // 20%+ above average
  if (ratio <= 0.80) return 'cold';   // 20%+ below average
  return 'neutral';
}

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
export function calculateGPPValueTarget(salary, sport, contestType = 'gpp') {
  const target = GPP_VALUE_TARGETS[sport]?.[contestType] || 5.0;
  return Math.round((salary / 1000) * target * 10) / 10;
}

/**
 * Check if a player is a "Smash Spot" (ceiling > GPP target)
 * @param {Object} player - Player with ceiling and salary
 * @param {string} sport - 'NBA' or 'NFL'
 * @returns {boolean} True if player can smash GPP value target
 */
export function isSmashSpot(player, sport) {
  const ceilingScore = player.ceilingScore || calculateCeilingScore(player, {});
  const gppTarget = calculateGPPValueTarget(player.salary || 5000, sport, 'gpp');
  return ceilingScore >= gppTarget;
}

/**
 * Calculate all DFS metrics for a player
 * 
 * @param {Object} player - Player with projection and context
 * @param {Object} context - DFS context (matchup, form, etc.)
 * @param {string} sport - 'NBA' or 'NFL' (for GPP targets)
 * @returns {Object} All DFS metrics
 */
export function calculateDFSMetrics(player, context = {}, sport = 'NBA') {
  const projectedPts = player.projected_pts || player.projectedPts || 0;
  const salary = player.salary || 0;
  
  const ceilingScore = calculateCeilingScore(player, context);
  const floorScore = calculateFloorScore(player, context);
  const valueScore = calculateValueScore(projectedPts, salary);
  
  // GPP-specific metrics
  const gppValueTarget = calculateGPPValueTarget(salary, sport, 'gpp');
  const cashValueTarget = calculateGPPValueTarget(salary, sport, 'cash');
  const isGppSmash = ceilingScore >= gppValueTarget;
  const isCashSafe = floorScore >= cashValueTarget;
  
  return {
    valueScore,
    ceilingScore,
    floorScore,
    // GPP optimization metrics
    gppValueTarget,
    cashValueTarget,
    isGppSmash,      // True if ceiling can hit 7x (NBA) or 4x (NFL)
    isCashSafe,      // True if floor hits 5x (NBA) or 2.5x (NFL)
    // Consistency requires historical data - estimate based on projection
    consistencyRating: player.consistencyRating || 0.75,
    // Form from context
    recentForm: context.recentForm || player.recentForm || 'neutral'
  };
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * OPPORTUNITY SCORE - Volume-Based Breakout Detection
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * This identifies "Price Lag" players - high opportunity but low salary.
 * DFS sites are slow to adjust salaries to new roles/volume.
 * 
 * NFL Opportunity Score uses:
 * - Snap Count % (opportunity to produce)
 * - Target Share (% of team targets for WR/TE)
 * - Red Zone Targets (TD upside)
 * - Air Yards (big play potential)
 * 
 * NBA Opportunity Score uses:
 * - Minutes Per Game (opportunity)
 * - Usage Rate Boost (from injuries)
 * - L5 Hot Streak (recent form)
 * 
 * @param {Object} player - Player with opportunity metrics
 * @param {string} sport - 'NBA' or 'NFL'
 * @returns {Object} { score: number, isPriceLag: boolean, reason: string }
 */
export function calculateOpportunityScore(player, sport) {
  let score = 50; // Base score (0-100 scale)
  let reasons = [];
  
  if (sport === 'NFL') {
    // ═══════════════════════════════════════════════════════════════════════
    // NFL OPPORTUNITY SCORE
    // ═══════════════════════════════════════════════════════════════════════
    
    const snapPct = player.snapPct || 0;
    const targetShare = player.targetShare || 0;
    const redZoneTargets = player.redZoneTargets || 0;
    const position = (player.position || '').toUpperCase();
    
    // Snap Count Score (0-30 points)
    // 90%+ snaps = 30 pts, 80% = 24 pts, 70% = 18 pts
    if (snapPct >= 90) {
      score += 30;
      reasons.push(`Elite snap count (${snapPct}%)`);
    } else if (snapPct >= 80) {
      score += 24;
      reasons.push(`High snap count (${snapPct}%)`);
    } else if (snapPct >= 70) {
      score += 18;
    } else if (snapPct >= 60) {
      score += 12;
    }
    
    // Target Share Score for WR/TE (0-25 points)
    if (['WR', 'TE'].includes(position) && targetShare > 0) {
      if (targetShare >= 25) {
        score += 25;
        reasons.push(`Elite target share (${targetShare}%)`);
      } else if (targetShare >= 20) {
        score += 20;
        reasons.push(`High target share (${targetShare}%)`);
      } else if (targetShare >= 15) {
        score += 15;
      } else if (targetShare >= 10) {
        score += 10;
      }
    }
    
    // Red Zone Targets Score (0-20 points) - TD upside
    if (redZoneTargets >= 10) {
      score += 20;
      reasons.push(`Red zone threat (${redZoneTargets} RZ targets)`);
    } else if (redZoneTargets >= 7) {
      score += 15;
    } else if (redZoneTargets >= 5) {
      score += 10;
    } else if (redZoneTargets >= 3) {
      score += 5;
    }
    
    // RB Rush Attempts Bonus (opportunity for RBs)
    if (position === 'RB') {
      const rushAttempts = player.seasonStats?.rushing_attempts || 0;
      const gamesPlayed = player.seasonStats?.games_played || 1;
      const attPerGame = rushAttempts / gamesPlayed;
      
      if (attPerGame >= 18) {
        score += 20;
        reasons.push(`Workhorse RB (${attPerGame.toFixed(1)} att/gm)`);
      } else if (attPerGame >= 14) {
        score += 15;
      } else if (attPerGame >= 10) {
        score += 10;
      }
    }
    
  } else {
    // ═══════════════════════════════════════════════════════════════════════
    // NBA OPPORTUNITY SCORE
    // ═══════════════════════════════════════════════════════════════════════
    
    const mpg = player.seasonStats?.mpg || player.l5Stats?.mpg || 0;
    const usageBoost = player.usageBoost || null;
    const recentForm = player.recentForm || 'neutral';
    
    // ═══════════════════════════════════════════════════════════════════════
    // ROTATION CONTEXT - Predictive vs Reactive
    // ═══════════════════════════════════════════════════════════════════════
    const rotationStatus = player.rotation_status || 'stable';
    const minutesTrend = player.minutes_trend || 'stable';
    const roleSustainability = player.role_sustainability || 'season_long';
    const projectedMinutes = player.projected_minutes || mpg;
    
    // Minutes Per Game Score (0-30 points)
    // Use PROJECTED minutes for tonight, not historical average
    const tonightMinutes = projectedMinutes > 0 ? projectedMinutes : mpg;
    
    if (tonightMinutes >= 35) {
      score += 30;
      reasons.push(`Heavy minutes (${tonightMinutes.toFixed(1)} mpg)`);
    } else if (tonightMinutes >= 32) {
      score += 26;
      reasons.push(`High minutes (${tonightMinutes.toFixed(1)} mpg)`);
    } else if (tonightMinutes >= 28) {
      score += 20;
    } else if (tonightMinutes >= 24) {
      score += 14;
    } else if (tonightMinutes >= 20) {
      score += 8;
    }
    
    // Usage Boost Score (0-25 points) - Key injury impact
    if (usageBoost) {
      score += 25;
      reasons.push(`Usage spike: ${usageBoost}`);
    }
    
    // ═══════════════════════════════════════════════════════════════════════
    // PREDICTIVE BREAKOUT BOOST (NEW!)
    // ═══════════════════════════════════════════════════════════════════════
    // Reward players whose role is EXPANDING (before they pop, not after)
    if (rotationStatus === 'expanded_role' && minutesTrend === 'increasing') {
      score += 20;
      reasons.push('🚀 Breakout opportunity (role expanding)');
    } else if (rotationStatus === 'breakout_candidate') {
      score += 15;
      reasons.push('Breakout candidate');
    }
    
    // ═══════════════════════════════════════════════════════════════════════
    // HOT STREAK LOGIC (REVISED) - Context-Aware
    // ═══════════════════════════════════════════════════════════════════════
    // Only reward hot streaks if the role is SUSTAINABLE
    // Don't chase yesterday's outlier if it was a fill-in role that ended
    if (recentForm === 'hot') {
      // Check if this was a temporary fill-in role that has now ended
      const isFillInEnded = rotationStatus === 'bench_return' || 
                            rotationStatus === 'diminished_role' ||
                            roleSustainability === 'ended' ||
                            roleSustainability === 'one_game';
      
      if (isFillInEnded) {
        // PENALIZE chasing yesterday's outlier when role ended
        score -= 10;
        reasons.push('❌ Hot streak (unsustainable - fill-in role ended)');
      } else {
        // Reward sustainable hot streaks
        score += 15;
        reasons.push('Hot streak (sustainable role)');
      }
    } else if (recentForm === 'cold') {
      score -= 10; // Penalty for cold players
    }
    
    // ═══════════════════════════════════════════════════════════════════════
    // FADE DIMINISHED ROLES
    // ═══════════════════════════════════════════════════════════════════════
    // If a player's role just ended (starter returned), actively fade them
    if (rotationStatus === 'diminished_role' || minutesTrend === 'decreasing') {
      score -= 15;
      reasons.push('Role diminished (starter returned)');
    }
    
    // L5 Best Game Indicator (ceiling exists)
    if (player.l5Stats?.bestPts) {
      const seasonPpg = player.seasonStats?.ppg || 0;
      const bestPts = player.l5Stats.bestPts;
      if (bestPts >= seasonPpg * 1.5) {
        score += 10;
        reasons.push(`Proven ceiling (${bestPts} pts game)`);
      }
    }
  }
  
  // ═══════════════════════════════════════════════════════════════════════
  // PRICE LAG DETECTION
  // ═══════════════════════════════════════════════════════════════════════
  // A player has "Price Lag" if their opportunity score is high but salary
  // hasn't caught up yet. This is the GPP breakout sweet spot.
  //
  // High opportunity (score > 75) + below-average salary = Price Lag
  const salary = player.salary || 5000;
  const avgSalary = sport === 'NBA' ? 6500 : 5500;
  const isPriceLag = score >= 75 && salary < avgSalary;
  
  if (isPriceLag) {
    reasons.push(`PRICE LAG: High opportunity at $${salary}`);
  }
  
  return {
    score: Math.min(100, Math.max(0, score)),
    isPriceLag,
    reasons,
    reasonSummary: reasons.slice(0, 2).join(', ') || 'Standard opportunity'
  };
}

/**
 * Apply Opportunity Score boost to player projection
 * This is called during lineup optimization to identify breakouts
 * 
 * @param {Object} player - Player with stats
 * @param {string} sport - 'NBA' or 'NFL'
 * @returns {Object} Player with opportunityScore and boosted projection
 */
export function applyOpportunityBoost(player, sport) {
  const opportunityData = calculateOpportunityScore(player, sport);
  
  // Copy player to avoid mutation
  const boostedPlayer = { ...player };
  boostedPlayer.opportunityScore = opportunityData.score;
  boostedPlayer.isPriceLag = opportunityData.isPriceLag;
  boostedPlayer.opportunityReasons = opportunityData.reasons;
  
  // Apply projection boost for Price Lag players
  // These are the "Hidden Gems" - high opportunity, low salary
  if (opportunityData.isPriceLag) {
    const baseProjection = boostedPlayer.projected_pts || 0;
    const boost = baseProjection * 0.15; // 15% boost for Price Lag
    boostedPlayer.projected_pts = Math.round((baseProjection + boost) * 10) / 10;
    boostedPlayer.projectionBoosted = true;
    boostedPlayer.boostReason = opportunityData.reasonSummary;
    
    console.log(`[Opportunity] 🚀 PRICE LAG: ${player.name} boosted +${boost.toFixed(1)} pts (${opportunityData.reasonSummary})`);
  }
  
  return boostedPlayer;
}

/**
 * Calculate fantasy points projection for a player
 * @param {Object} player - Player with stats
 * @param {string} sport - 'NBA' or 'NFL'
 * @param {string} platform - 'draftkings' or 'fanduel'
 * @returns {number} Projected fantasy points
 */
/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * SLATE CHARACTERISTIC ANALYSIS
 * ═══════════════════════════════════════════════════════════════════════════════
 * Gary investigates the slate to determine the optimal strategy organically.
 * This is AWARENESS - Gary looks at the data and decides, not a forced rule.
 * 
 * Factors Gary considers:
 * - Elite value opportunities (high ceiling + reasonable salary)
 * - Cheap chalk availability (low salary players with high floor)
 * - Mid-tier depth (solid options in $5k-$8k range)
 * - Injury landscape (usage opportunities)
 * - Vegas totals (shootout potential)
 * ═══════════════════════════════════════════════════════════════════════════════
 */
function analyzeSlateCharacteristics(players, constraints, sport, isGPP) {
  const { salaryCap } = constraints;
  
  // Define salary tiers based on platform
  const eliteThreshold = sport === 'NBA' ? 9000 : 7500;
  const midTierMin = sport === 'NBA' ? 5500 : 5000;
  const midTierMax = sport === 'NBA' ? 8500 : 7000;
  const cheapThreshold = sport === 'NBA' ? 4500 : 4000;
  
  // Categorize players by tier
  const elitePlayers = players.filter(p => (p.salary || 0) >= eliteThreshold);
  const midTierPlayers = players.filter(p => {
    const sal = p.salary || 0;
    return sal >= midTierMin && sal < midTierMax;
  });
  const cheapPlayers = players.filter(p => (p.salary || 0) > 0 && (p.salary || 0) < cheapThreshold);
  
  // Calculate value scores for each tier
  const eliteValue = elitePlayers.filter(p => {
    const pts = p.projected_pts || 0;
    const val = pts / ((p.salary || 9000) / 1000);
    return val >= 5.0; // Elite player with 5x+ value is exceptional
  });
  
  const cheapChalk = cheapPlayers.filter(p => {
    const pts = p.projected_pts || 0;
    const val = pts / ((p.salary || 4000) / 1000);
    return val >= 5.5; // Cheap player with 5.5x+ value is chalk
  });
  
  const midTierDepth = midTierPlayers.filter(p => {
    const pts = p.projected_pts || 0;
    const val = pts / ((p.salary || 6000) / 1000);
    return val >= 4.5; // Solid mid-tier value
  });
  
  // Check for injury-based opportunities
  const usageOpportunities = players.filter(p => 
    p.teammateOpportunity || p.rotation_status === 'expanded_role' || p.isBreakoutCandidate
  );
  
  // Build analysis result
  const analysis = {
    hasEliteValue: eliteValue.length >= 2,
    hasCheapChalk: cheapChalk.length >= 3,
    hasMidTierDepth: midTierDepth.length >= 5,
    hasUsageOpportunities: usageOpportunities.length >= 2,
    eliteCount: eliteValue.length,
    cheapChalkCount: cheapChalk.length,
    midTierCount: midTierDepth.length,
    usageCount: usageOpportunities.length,
    reasoning: ''
  };
  
  // Build reasoning string for logging
  const reasons = [];
  if (analysis.hasEliteValue && analysis.hasCheapChalk) {
    reasons.push(`${analysis.eliteCount} elite values + ${analysis.cheapChalkCount} cheap chalk → Stars & Scrubs favored`);
  }
  if (analysis.hasMidTierDepth) {
    reasons.push(`${analysis.midTierCount} quality mid-tier options → Balanced viable`);
  }
  if (analysis.hasUsageOpportunities) {
    reasons.push(`${analysis.usageCount} injury-based opportunities detected`);
  }
  
  analysis.reasoning = reasons.join(' | ') || 'Standard slate, balanced approach recommended';
  
  return analysis;
}

/**
 * Calculate basic projected points for a player
 * @param {Object} player - Player object
 * @param {string} sport - 'NBA' or 'NFL'
 * @param {string} platform - 'draftkings' or 'fanduel'
 * @param {string} contestType - 'gpp' or 'cash'
 * @returns {number} Projected fantasy points
 */
export function calculateProjectedPoints(player, sport, platform, contestType = 'cash') {
  // ═══════════════════════════════════════════════════════════════════════════
  // STAR RETURNING USAGE REDUCTION
  // ═══════════════════════════════════════════════════════════════════════════
  // When a star returns from injury, role players who benefited LOSE usage.
  // Example: Embiid returns → Maxey's usage drops from 35% to 28%
  // This is the OPPOSITE of injury boost - we must reduce projections
  // ═══════════════════════════════════════════════════════════════════════════
  let usageMultiplier = 1.0;
  
  if (player.starReturning) {
    usageMultiplier = player.starReturning.usageMultiplier || 0.85; // Default 15% reduction
    const reductionPct = ((1 - usageMultiplier) * 100).toFixed(0);
    const restrictionInfo = player.starReturning.minutesRestriction 
      ? ` [${player.starReturning.minutesRestriction}]` 
      : player.starReturning.impactSeverity === 'partial' 
        ? ' [expected ramping]' 
        : '';
    console.log(`[Projection] ⚠️ ${player.name}: Star returning (${player.starReturning.star})${restrictionInfo} → usage reduction ${reductionPct}%`);
  }
  
  if (player.roleEnded) {
    usageMultiplier = 0.75; // 25% reduction for ended roles
    console.log(`[Projection] ⚠️ ${player.name}: Role ended → ${player.roleEnded.reason}`);
  }
  
  // ⭐ If BDL already provided fantasy points, use them (most accurate)
  const bdlFpts = player.seasonStats?.fpts || player.fpts || 0;
  if (bdlFpts > 0) {
    // BDL uses DraftKings scoring - adjust for FanDuel if needed
    let baseProjection = bdlFpts;
    if (platform === 'fanduel' && sport === 'NBA') {
      // FanDuel values steals/blocks higher (3 pts vs 2 pts)
      // Rough adjustment: +5% for defensive players
      const spg = player.seasonStats?.spg || 0;
      const bpg = player.seasonStats?.bpg || 0;
      if (spg + bpg >= 2) {
        baseProjection = bdlFpts * 1.05;
      }
    }
    // Apply usage multiplier for star returning scenarios
    return Math.round(baseProjection * usageMultiplier * 10) / 10;
  }
  
  if (sport === 'NBA') {
    const projection = calculateNBAProjection(player, platform);
    // ═══════════════════════════════════════════════════════════════════════════
    // NO FALLBACKS - BDL has stats for ALL players including rookies
    // If projection is 0, it's a BUG in our code that needs fixing
    // ═══════════════════════════════════════════════════════════════════════════
    if (projection === 0 && player.salary > 0) {
      // This is a BUG - BDL has stats for everyone. Log for debugging.
      console.error(`[Projection] 🐛 BUG: ${player.name} (${player.team}) has $${player.salary} salary but 0 projection!`);
      console.error(`[Projection]    → Check: 1) Player name matching  2) BDL fetch logic  3) Season param`);
      console.error(`[Projection]    → Stats: ppg=${player.seasonStats?.ppg}, mpg=${player.seasonStats?.mpg}`);
      // Return 0 - don't use this player until the bug is fixed
      return 0;
    }
    return projection;
  } else if (sport === 'NFL') {
    const projection = calculateNFLProjection(player, platform);
    if (projection === 0 && player.salary > 0) {
      console.error(`[Projection] 🐛 BUG: ${player.name} (${player.team}) has $${player.salary} salary but 0 projection!`);
      return 0;
    }
    return projection;
  }
  return 0;
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * SALARY-BASED PROJECTION ESTIMATION
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * When a player has salary but no stats (e.g., not in BDL yet, injury return),
 * we estimate their projection based on their DFS salary tier.
 * 
 * DFS sites set salaries based on their own projections, so:
 * - $10,000+ player = site expects ~50+ fantasy points
 * - $7,000 player = site expects ~35 fantasy points
 * - $4,000 player = site expects ~20 fantasy points
 * - $3,000 player = site expects ~15 fantasy points (minimum)
 * 
 * For GPP, we use a higher multiplier (6.5x for NBA) to reflect winning potential.
 * 
 * @param {number} salary - Player's DFS salary
 * @param {string} sport - 'NBA' or 'NFL'
 * @param {string} platform - 'draftkings' or 'fanduel'
 * @param {string} contestType - 'gpp' or 'cash'
 * @returns {number} Estimated fantasy points
 */
function estimateProjectionFromSalary(salary, sport, platform, contestType = 'cash') {
  if (!salary || salary <= 0) return 0;
  
  const isGPP = contestType === 'gpp';
  
  // Different salary ranges for each platform/sport
  // ═══════════════════════════════════════════════════════════════════════════
  // VALUE MULTIPLIER FIX: NBA players typically return 4-6x their salary in FPTS
  // Example: $8,000 player should project for ~40-48 FPTS (5x-6x)
  // Previous formula was using 2x which severely undervalued all players
  // ═══════════════════════════════════════════════════════════════════════════
  let baseSalary, baseProjection, valueMultiplier;
  
  if (sport === 'NBA') {
    if (platform === 'fanduel') {
      // FanDuel NBA: $3,500 min, $60,000 cap, 9 players
      // GPP WINNING TARGET: 360+ points → 40 FPTS/player average
      // Cash TARGET: 270 points → 30 FPTS/player average
      baseSalary = 3500;
      baseProjection = isGPP ? 20 : 15; // Min-salary punt plays: 15-20 FPTS
      valueMultiplier = isGPP ? 6.5 : 5.0; // GPP winners average 6-7x value
    } else {
      // DraftKings NBA: $3,000 min, $50,000 cap, 8 players
      // GPP WINNING TARGET: 370+ points → 46 FPTS/player average
      // Cash TARGET: 280 points → 35 FPTS/player average
      baseSalary = 3000;
      baseProjection = isGPP ? 18 : 12; // Min-salary punt plays: 12-18 FPTS
      valueMultiplier = isGPP ? 7.0 : 5.5; // GPP winners average 6-7x value
    }
  } else { // NFL
    if (platform === 'fanduel') {
      // FanDuel NFL: $60,000 cap, 9 players
      // GPP WINNING TARGET: 200+ points
      baseSalary = 5000;
      baseProjection = isGPP ? 15 : 10; 
      valueMultiplier = isGPP ? 4.5 : 3.0;
    } else {
      // DraftKings NFL: $50,000 cap, 9 players
      // GPP WINNING TARGET: 220+ points
      baseSalary = 4000;
      baseProjection = isGPP ? 14 : 8;
      valueMultiplier = isGPP ? 5.0 : 3.5;
    }
  }
  
  // Calculate estimated projection based on salary tier
  const salaryDiff = salary - baseSalary;
  const estimatedPts = baseProjection + (salaryDiff / 1000) * valueMultiplier;
  
  // Ensure minimum floor (cheap players still produce something)
  const minFloor = sport === 'NBA' ? (isGPP ? 12.0 : 8.0) : (isGPP ? 5.0 : 3.0);
  
  return Math.round(Math.max(estimatedPts, minFloor) * 10) / 10;
}

/**
 * NBA fantasy points calculation
 * 
 * DraftKings NBA Scoring:
 * - Point: 1 pt
 * - 3-Point Made: +0.5 bonus
 * - Rebound: 1.25 pts
 * - Assist: 1.5 pts
 * - Steal: 2 pts
 * - Block: 2 pts
 * - Turnover: -0.5 pts
 * - Double-Double: +1.5 bonus
 * - Triple-Double: +3 bonus
 * 
 * FanDuel NBA Scoring:
 * - Point: 1 pt
 * - Rebound: 1.2 pts
 * - Assist: 1.5 pts
 * - Steal: 3 pts (higher than DK!)
 * - Block: 3 pts (higher than DK!)
 * - Turnover: -1 pt (more punishing)
 * - No DD/TD bonuses
 */
function calculateNBAProjection(player, platform) {
  const stats = player.seasonStats || player;
  const ppg = stats.ppg || stats.pts || 0;
  const rpg = stats.rpg || stats.reb || 0;
  const apg = stats.apg || stats.ast || 0;
  const spg = stats.spg || stats.stl || 0;
  const bpg = stats.bpg || stats.blk || 0;
  // Only apply turnover penalty if we have actual stats
  const hasStats = ppg > 0 || rpg > 0 || apg > 0;
  const topg = hasStats ? (stats.topg || stats.turnover || 1.5) : 0;
  const tpm = stats.tpg || stats.fg3m || 0; // 3-pointers made per game
  
  // If no stats at all, this is a DATA BUG - BDL has stats for all NBA players
  // including rookies (via Game Player Stats endpoint)
  if (!hasStats) {
    // Don't silently return 0 - flag this as a bug to investigate
    console.error(`[DFS] 🐛 NO STATS: ${player.name} (${player.team}) - BDL should have game logs for everyone!`);
    console.error(`[DFS]    → Check: getPlayerStats/getSeasonAverages, player ID matching, season=2025`);
    return 0;
  }
  
  if (platform === 'draftkings') {
    // DK: +0.5 for each 3PM, DD/TD bonuses
    let pts = ppg + (tpm * 0.5) + (rpg * 1.25) + (apg * 1.5) + (spg * 2) + (bpg * 2) - (topg * 0.5);
    
    // Double-Double bonus estimate (if 2+ categories hit 10+)
    const ddCategories = [ppg >= 10, rpg >= 10, apg >= 10, spg >= 10, bpg >= 10].filter(Boolean).length;
    if (ddCategories >= 2) pts += 1.5;
    if (ddCategories >= 3) pts += 1.5; // Triple-double adds another +1.5 (total +3)
    
    return Math.round(pts * 10) / 10;
  } else {
    // FanDuel: Steals/Blocks worth 3 pts, TO -1, no bonuses
    // This makes defensive specialists MORE valuable on FD (e.g., Wembanyama)
    return Math.round((ppg + (rpg * 1.2) + (apg * 1.5) + (spg * 3) + (bpg * 3) - topg) * 10) / 10;
  }
}

/**
 * NFL fantasy points calculation
 * 
 * ⚠️ CRITICAL: BDL returns SEASON TOTALS for TDs/receptions, not per-game!
 * We must divide by games_played to get per-game projections.
 * 
 * DraftKings NFL Scoring (Full PPR):
 * - Passing TD: 4 pts
 * - Passing Yards: 1 pt per 25 yds (0.04/yd)
 * - Interception: -1 pt
 * - Rushing TD: 6 pts
 * - Rushing Yards: 1 pt per 10 yds (0.1/yd)
 * - Reception: 1 pt (Full PPR)
 * - Receiving TD: 6 pts
 * - Receiving Yards: 1 pt per 10 yds
 * - Fumble Lost: -1 pt
 * - 300+ Passing Yards Bonus: +3 pts
 * - 100+ Rushing Yards Bonus: +3 pts
 * - 100+ Receiving Yards Bonus: +3 pts
 * 
 * FanDuel NFL Scoring (Half PPR):
 * - Same as DK EXCEPT:
 * - Reception: 0.5 pts (Half PPR)
 * - Fumble Lost: -2 pts (more punishing)
 * - NO yardage bonuses
 */
function calculateNFLProjection(player, platform) {
  const stats = player.seasonStats || player;
  const position = (player.position || '').toUpperCase();
  
  // ⭐ CRITICAL FIX: BDL returns SEASON TOTALS for TDs/receptions
  // We must divide by games_played to get per-game averages
  const gamesPlayed = stats.games_played || 16; // Default to 16 if not specified
  
  // QB scoring
  if (position === 'QB') {
    // Yards per game (already per-game from BDL)
    const passYpg = stats.passing_yards_per_game || 0;
    const rushYpg = stats.rushing_yards_per_game || 0;
    
    // TDs and INTs are SEASON TOTALS - convert to per-game
    const passTdPg = (stats.passing_touchdowns || 0) / gamesPlayed;
    const intsPg = (stats.passing_interceptions || 0) / gamesPlayed;
    const rushTdPg = (stats.rushing_touchdowns || 0) / gamesPlayed;
    const fumblesLostPg = (stats.rushing_fumbles_lost || 0) / gamesPlayed;
    
    let pts = (passYpg * 0.04) + (passTdPg * 4) - (intsPg * 1) + (rushYpg * 0.1) + (rushTdPg * 6);
    
    if (platform === 'draftkings') {
      pts -= (fumblesLostPg * 1);
      // 300+ passing yards bonus (approximate based on average)
      if (passYpg >= 300) pts += 3;
      if (rushYpg >= 100) pts += 3;
    } else {
      // FanDuel: -2 per fumble lost, no bonuses
      pts -= (fumblesLostPg * 2);
    }
    
    return Math.round(pts * 10) / 10;
  }
  
  // RB scoring
  if (position === 'RB') {
    // Yards per game (already per-game from BDL)
    const rushYpg = stats.rushing_yards_per_game || 0;
    const recYpg = stats.receiving_yards_per_game || 0;
    
    // Season totals - convert to per-game
    const rushTdPg = (stats.rushing_touchdowns || 0) / gamesPlayed;
    const recTdPg = (stats.receiving_touchdowns || 0) / gamesPlayed;
    const recPg = (stats.receptions || 0) / gamesPlayed;
    const fumblesLostPg = (stats.rushing_fumbles_lost || 0) / gamesPlayed;
    
    let pts = (rushYpg * 0.1) + (rushTdPg * 6) + (recYpg * 0.1) + (recTdPg * 6);
    
    if (platform === 'draftkings') {
      pts += (recPg * 1); // Full PPR
      pts -= (fumblesLostPg * 1);
      if (rushYpg >= 100) pts += 3;
      if (recYpg >= 100) pts += 3;
    } else {
      pts += (recPg * 0.5); // Half PPR
      pts -= (fumblesLostPg * 2);
    }
    
    return Math.round(pts * 10) / 10;
  }
  
  // WR scoring
  if (position === 'WR') {
    // Yards per game (already per-game from BDL)
    const recYpg = stats.receiving_yards_per_game || 0;
    const rushYpg = stats.rushing_yards_per_game || 0;
    
    // Season totals - convert to per-game
    const recTdPg = (stats.receiving_touchdowns || 0) / gamesPlayed;
    const rushTdPg = (stats.rushing_touchdowns || 0) / gamesPlayed;
    const recPg = (stats.receptions || 0) / gamesPlayed;
    const fumblesLostPg = (stats.receiving_fumbles_lost || 0) / gamesPlayed;
    
    let pts = (recYpg * 0.1) + (recTdPg * 6) + (rushYpg * 0.1) + (rushTdPg * 6);
    
    if (platform === 'draftkings') {
      pts += (recPg * 1); // Full PPR - makes slot receivers valuable
      pts -= (fumblesLostPg * 1);
      if (recYpg >= 100) pts += 3;
    } else {
      pts += (recPg * 0.5); // Half PPR - favors TD threats over volume
      pts -= (fumblesLostPg * 2);
    }
    
    return Math.round(pts * 10) / 10;
  }
  
  // TE scoring (same as WR)
  if (position === 'TE') {
    // Yards per game (already per-game from BDL)
    const recYpg = stats.receiving_yards_per_game || 0;
    
    // Season totals - convert to per-game
    const recTdPg = (stats.receiving_touchdowns || 0) / gamesPlayed;
    const recPg = (stats.receptions || 0) / gamesPlayed;
    const fumblesLostPg = (stats.receiving_fumbles_lost || 0) / gamesPlayed;
    
    let pts = (recYpg * 0.1) + (recTdPg * 6);
    
    if (platform === 'draftkings') {
      pts += (recPg * 1);
      pts -= (fumblesLostPg * 1);
      if (recYpg >= 100) pts += 3;
    } else {
      pts += (recPg * 0.5);
      pts -= (fumblesLostPg * 2);
    }
    
    return Math.round(pts * 10) / 10;
  }
  
  // DST scoring (simplified)
  if (position === 'DST' || position === 'DEF') {
    // Base 8 pts - DST projections vary widely by matchup
    return 8.0;
  }
  
  // K (Kicker) - FanDuel only
  if (position === 'K') {
    // Kickers average ~8 pts per game
    return 8.0;
  }
  
  // Default fallback for unknown positions
  const rushYpg = stats.rushing_yards_per_game || 0;
  const recYpg = stats.receiving_yards_per_game || 0;
  const rushTdPg = (stats.rushing_touchdowns || 0) / gamesPlayed;
  const recTdPg = (stats.receiving_touchdowns || 0) / gamesPlayed;
  const recPg = (stats.receptions || 0) / gamesPlayed;
  
  if (platform === 'draftkings') {
    return Math.round((rushYpg * 0.1 + rushTdPg * 6 + recYpg * 0.1 + recTdPg * 6 + recPg * 1) * 10) / 10;
  } else {
    return Math.round((rushYpg * 0.1 + rushTdPg * 6 + recYpg * 0.1 + recTdPg * 6 + recPg * 0.5) * 10) / 10;
  }
}

/**
 * Find pivot alternatives for a position
 * @param {Object} starter - The starter player at this position
 * @param {Array} playerPool - All available players for this position
 * @param {string} sport - 'NBA' or 'NFL'
 * @param {string} platform - 'draftkings' or 'fanduel'
 * @returns {Array} 3 pivot alternatives (direct, mid, budget)
 */
export function findPivotAlternatives(starter, playerPool, sport, platform) {
  const starterSalary = starter.salary;
  const pivots = [];
  const usedPlayers = new Set(); // Track already-selected pivot players to avoid duplicates
  
  // Filter out the starter and players who are OUT
  const eligiblePlayers = playerPool.filter(p => 
    p.name !== starter.player && 
    p.status !== 'OUT' &&
    p.salary > 0
  );
  
  // Sort by projected points descending
  const sortedPool = eligiblePlayers.sort((a, b) => {
    const ptsA = a.projected_pts || calculateProjectedPoints(a, sport, platform);
    const ptsB = b.projected_pts || calculateProjectedPoints(b, sport, platform);
    return ptsB - ptsA;
  });
  
  // Find best alternative player for each tier
  // These are OPTIONS for users - Gary already picked his best lineup
  for (const [tier, config] of Object.entries(PIVOT_TIERS)) {
    const salaryDiffMin = config.salaryRange.min;
    const salaryDiffMax = config.salaryRange.max;
    
    // Find highest-projected player within this salary range (that hasn't been used already)
    const candidate = sortedPool.find(p => {
      if (usedPlayers.has(p.name)) return false; // Skip if already used in another tier
      const diff = p.salary - starterSalary;
      return diff >= salaryDiffMin && diff <= salaryDiffMax;
    });
    
    if (candidate) {
      usedPlayers.add(candidate.name); // Mark as used
      
      // Get salary-aware label (prevents calling $9K players "punt spots")
      const { label: tierLabel, description: tierDescription } = getSalaryAwareTierLabel(
        candidate.salary, 
        tier, 
        config.label, 
        config.description
      );
      
      pivots.push({
        tier,
        tierLabel,
        tierDescription,
        player: candidate.name,
        team: candidate.team,
        salary: candidate.salary,
        projected_pts: candidate.projected_pts || calculateProjectedPoints(candidate, sport, platform),
        salaryDiff: candidate.salary - starterSalary
      });
    }
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // ALWAYS SHOW AT LEAST ONE ALTERNATIVE
  // ═══════════════════════════════════════════════════════════════════════════
  // Substitutions are options for users - they don't affect salary cap.
  // On small slates with limited options, still show the best available player
  // even if it's outside normal salary tiers.
  if (pivots.length === 0 && sortedPool.length > 0) {
    // Find best available player not already used
    const bestAvailable = sortedPool.find(p => !usedPlayers.has(p.name));
    if (bestAvailable) {
      const salaryDiff = bestAvailable.salary - starterSalary;
      const tierLabel = salaryDiff > 0 ? 'Upgrade' : (salaryDiff < 0 ? 'Budget Play' : 'Direct Swap');
      
      pivots.push({
        tier: 'best_available',
        tierLabel,
        tierDescription: 'Best available alternative at this position',
        player: bestAvailable.name,
        team: bestAvailable.team,
        salary: bestAvailable.salary,
        projected_pts: bestAvailable.projected_pts || calculateProjectedPoints(bestAvailable, sport, platform),
        salaryDiff
      });
    }
  }
  
  return pivots;
}

/**
 * Greedy lineup optimizer
 * Fills positions with best value (pts/salary) while respecting cap
 * @param {Array} players - Player pool with salaries and projections
 * @param {Object} constraints - Platform constraints
 * @param {string} sport - 'NBA' or 'NFL'
 * @param {string} platform - 'draftkings' or 'fanduel'
 * @param {Object} context - Optional narrative context (fadePlayers, targetPlayers)
 * @returns {Object} Optimized lineup
 */
export function optimizeLineup(players, constraints, sport, platform, context = {}) {
  const { salaryCap, positions, positionRules } = constraints;
  
  // ═══════════════════════════════════════════════════════════════════════════
  // GARY'S SHARP DFS FRAMEWORK
  // ═══════════════════════════════════════════════════════════════════════════
  // Gary is a GAMBLER finding edges, not an optimizer outputting highest projections.
  //
  // HARD FACTORS Gary investigates:
  // - Usage/target share, minutes/snap trends (opportunity)
  // - DvP rankings, pace (matchup)
  // - Salary efficiency (value per dollar)
  //
  // SOFT FACTORS Gary validates:
  // - Narratives (revenge, hot streak) need data backing
  // - Ownership is ONE data point, not a forced pivot trigger
  //
  // GARY'S APPROACH:
  // Investigate the factors. Understand the opportunity. Build the lineup based on his analysis.
  //
  // SALARY LAG = where DFS value lives:
  // - Player promoted to starter but salary hasn't adjusted
  // - Player's teammate just went out creating usage vacuum
  // ═══════════════════════════════════════════════════════════════════════════
  
  // ═══════════════════════════════════════════════════════════════════════════
  // NARRATIVE CONTEXT: Gary's intelligence beyond raw numbers
  // ═══════════════════════════════════════════════════════════════════════════
  // Extract narrative data for Gary to factor into decisions
  const fadePlayers = context.fadePlayers || [];
  const targetPlayers = context.targetPlayers || [];
  
  // Create lookup sets for quick access
  const fadeSet = new Set(fadePlayers.map(p => p.name?.toLowerCase()));
  const targetSet = new Set(targetPlayers.map(p => p.name?.toLowerCase()));
  
  // Log narrative intelligence
  if (fadePlayers.length > 0 || targetPlayers.length > 0) {
    console.log(`[Optimizer] 📖 Narrative context:`);
    if (targetPlayers.length > 0) {
      console.log(`   🎯 Targets: ${targetPlayers.map(p => `${p.name} (${p.reason?.substring(0, 40)}...)`).join(', ')}`);
    }
    if (fadePlayers.length > 0) {
      console.log(`   ⚠️ Fades: ${fadePlayers.map(p => `${p.name} (${p.reason?.substring(0, 40)}...)`).join(', ')}`);
    }
  }
  const lineup = [];
  const usedPlayers = new Set();
  let totalSalary = 0;
  
  // ⭐ FIX: Create a mapping of which positions each player can fill
  // BDL uses generic positions (G, F, C) so we need to map them to DFS slots
  const positionEligibility = {
    // NBA - Specific positions
    'PG': ['PG', 'G', 'UTIL'],
    'SG': ['SG', 'G', 'UTIL'],
    'SF': ['SF', 'F', 'UTIL'],
    'PF': ['PF', 'F', 'UTIL'],
    'C': ['C', 'UTIL'],
    // NBA - Generic positions from BDL
    'G': ['PG', 'SG', 'G', 'UTIL'],  // Guards can fill PG, SG, G, UTIL
    'F': ['SF', 'PF', 'F', 'UTIL'],  // Forwards can fill SF, PF, F, UTIL
    'G-F': ['SG', 'SF', 'G', 'F', 'UTIL'],  // Combo guard-forward
    'F-G': ['SG', 'SF', 'G', 'F', 'UTIL'],  // Combo forward-guard
    'F-C': ['PF', 'C', 'F', 'UTIL'],  // Combo forward-center
    'C-F': ['PF', 'C', 'F', 'UTIL'],  // Combo center-forward
    'UTIL': ['PG', 'SG', 'SF', 'PF', 'C', 'G', 'F', 'UTIL'],
    // NFL
    'QB': ['QB'],
    'RB': ['RB', 'FLEX'],
    'WR': ['WR', 'FLEX'],
    'TE': ['TE', 'FLEX'],
    'K': ['K'],
    'DST': ['DST'],
    'DEF': ['DST'],
    'FLEX': ['RB', 'WR', 'TE', 'FLEX']
  };
  
  // ═══════════════════════════════════════════════════════════════════════════
  // STEP 1: CALCULATE PROJECTED POINTS + APPLY MODIFIERS
  // ═══════════════════════════════════════════════════════════════════════════
  // We need to calculate projections BEFORE sorting so we can rank by ceiling
  // This includes:
  // 1. Base projections from stats
  // 2. Opportunity Score (volume-based breakout detection)
  // 3. Narrative modifiers (targets/fades from Gemini)
  // 4. Ceiling/Floor calculations for GPP/Cash optimization
  
  // Get contest type from context (default to 'gpp' for tournaments)
  const contestType = context.contestType || 'gpp';
  const isGPP = contestType === 'gpp';
  
  console.log(`[Optimizer] 🎰 Contest type: ${contestType.toUpperCase()} (${isGPP ? 'ceiling optimization' : 'floor optimization'})`);
  
  for (const player of players) {
    // Calculate base projection if missing
    if (!player.projected_pts || player.projected_pts === 0) {
      player.projected_pts = calculateProjectedPoints(player, sport, platform, contestType);
    }
    
    // ═══════════════════════════════════════════════════════════════════════
    // OPPORTUNITY SCORE - Volume-Based Breakout Detection
    // ═══════════════════════════════════════════════════════════════════════
    // Identifies "Price Lag" players (high opportunity, low salary)
    if (!player.opportunityScore && player.projected_pts > 0) {
      const boostedPlayer = applyOpportunityBoost(player, sport);
      Object.assign(player, boostedPlayer);
    }
    
    // ═══════════════════════════════════════════════════════════════════════
    // CEILING & FLOOR CALCULATION
    // ═══════════════════════════════════════════════════════════════════════
    // Calculate DFS metrics including ceiling/floor for GPP/Cash optimization
    if (!player.ceilingScore) {
      const metrics = calculateDFSMetrics(player, context, sport);
      player.ceilingScore = metrics.ceilingScore;
      player.floorScore = metrics.floorScore;
      player.isGppSmash = metrics.isGppSmash;
      player.isCashSafe = metrics.isCashSafe;
      player.gppValueTarget = metrics.gppValueTarget;
    }
    
    const playerNameLower = player.name?.toLowerCase();
    
    // Mark players based on narrative context
    player.isTarget = targetSet.has(playerNameLower);
    player.isFade = fadeSet.has(playerNameLower);
    
    // ═══════════════════════════════════════════════════════════════════════
    // MERGE ROTATION CONTEXT from Narrative
    // ═══════════════════════════════════════════════════════════════════════
    // Extract rotation-aware fields from target/fade players
    const targetPlayerData = targetPlayers.find(t => t.name?.toLowerCase() === playerNameLower);
    const fadePlayerData = fadePlayers.find(f => f.name?.toLowerCase() === playerNameLower);
    
    if (targetPlayerData) {
      player.rotation_status = targetPlayerData.rotation_status || player.rotation_status;
      player.minutes_trend = targetPlayerData.minutes_trend || player.minutes_trend;
      player.role_sustainability = targetPlayerData.role_sustainability || player.role_sustainability;
      player.projected_minutes = targetPlayerData.projected_minutes || player.projected_minutes;
    }
    
    if (fadePlayerData) {
      player.rotation_status = fadePlayerData.rotation_status || player.rotation_status;
      player.minutes_trend = fadePlayerData.minutes_trend || player.minutes_trend;
      player.role_sustainability = fadePlayerData.role_sustainability || player.role_sustainability;
      player.projected_minutes = fadePlayerData.projected_minutes || player.projected_minutes;
    }
    
    // Apply small narrative modifier to projections (organic, not forced)
    // ═══════════════════════════════════════════════════════════════════════════
    // NARRATIVE AWARENESS (NOT PRESCRIPTIVE)
    // ═══════════════════════════════════════════════════════════════════════════
    // Gary sees narrative context as DATA, not COMMANDS. He makes his own decisions.
    // We log the context for transparency but DON'T modify projections based on it.
    // Gary's job is to analyze ALL factors and pick the best lineup himself.
    // ═══════════════════════════════════════════════════════════════════════════
    if (player.isTarget && !player.narrativeLogged) {
      player.narrativeLogged = true;
      console.log(`[Optimizer] 📖 Narrative context: ${player.name} identified as potential target (Gary will evaluate)`);
    }
    if (player.isFade && !player.narrativeLogged) {
      player.narrativeLogged = true;
      console.log(`[Optimizer] 📖 Narrative context: ${player.name} identified as potential fade (Gary will evaluate)`);
    }
  }
  
  // Log Opportunity Score findings (Price Lag players)
  const priceLagPlayers = players.filter(p => p.isPriceLag);
  if (priceLagPlayers.length > 0) {
    console.log(`[Optimizer] 🚀 Price Lag breakouts found: ${priceLagPlayers.map(p => `${p.name} ($${p.salary})`).join(', ')}`);
  }
  
  // Log GPP Smash Spots
  const smashSpots = players.filter(p => p.isGppSmash);
  if (smashSpots.length > 0 && isGPP) {
    console.log(`[Optimizer] 💥 GPP Smash Spots: ${smashSpots.slice(0, 5).map(p => `${p.name} (ceiling: ${p.ceilingScore})`).join(', ')}`);
  }
  
  // Group players by ALL positions they can fill
  const playersByPosition = {};
  for (const player of players) {
    const pos = player.position?.toUpperCase();
    if (!pos) continue;
    
    // ⭐ Use Tank01's platform-specific positions when available
    // This ensures DK/FD position eligibility is accurate (they differ!)
    const eligibleSlots = player.allPositions && player.allPositions.length > 0
      ? getPlayerEligibleSlots(player, sport, platform)
      : positionEligibility[pos] || [pos];
    
    if (player.name?.includes('Grayson Allen')) {
      console.log(`[DEBUG] Grayson Allen Eligible Slots:`, eligibleSlots);
    }
    
    for (const slot of eligibleSlots) {
      if (!playersByPosition[slot]) playersByPosition[slot] = [];
      playersByPosition[slot].push(player);
    }
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // STEP 2: SORT BY OPTIMIZATION METRIC (GPP = Ceiling, Cash = Floor)
  // ═══════════════════════════════════════════════════════════════════════════
  // GPP: Sort by CEILING score (target 350+ pts, boom/bust players)
  // Cash: Sort by FLOOR score (target 280 pts, consistent performers)
  // 
  // TIE-BREAKER LOGIC (organic, not forced):
  //   1. Similar scores (within 1.5 pts): Prefer lower ownership (GPP differentiation)
  //   2. Value contrarian: Consider if LOW ownership + saves $1500+
  //   3. Price Lag boost: Favor high opportunity + low salary players
  // ═══════════════════════════════════════════════════════════════════════════
  for (const pos in playersByPosition) {
    playersByPosition[pos].sort((a, b) => {
    // GPP: Use ceiling score | Cash: Use floor score
    const scoreA = isGPP ? (a.ceilingScore || a.projected_pts || 0) : (a.floorScore || a.projected_pts * 0.7 || 0);
    const scoreB = isGPP ? (b.ceilingScore || b.projected_pts || 0) : (b.floorScore || b.projected_pts * 0.7 || 0);
    
    // ═══════════════════════════════════════════════════════════════════════
    // CONFIRMED STARTER PRIORITY (BDL/Vegas lock)
    // ═══════════════════════════════════════════════════════════════════════
    // If one player is a confirmed starter and the other isn't, prefer the starter
    if (a.forcedLock && !b.forcedLock) return -1;
    if (b.forcedLock && !a.forcedLock) return 1;

    const scoreDiff = scoreB - scoreA;
      
      const salaryA = a.salary || 5000;
      const salaryB = b.salary || 5000;
      const ownA = a.ownership || 15;
      const ownB = b.ownership || 15;
      
      // ═══════════════════════════════════════════════════════════════════════
      // PRICE LAG PRIORITY (GPP only)
      // ═══════════════════════════════════════════════════════════════════════
      // If one player is a Price Lag breakout, prioritize them
      if (isGPP) {
        if (a.isPriceLag && !b.isPriceLag && Math.abs(scoreDiff) <= 5) {
          return -1; // Prefer Price Lag player A
        }
        if (b.isPriceLag && !a.isPriceLag && Math.abs(scoreDiff) <= 5) {
          return 1; // Prefer Price Lag player B
        }
      }
      
      // If scores are similar (within 1.5 pts), prefer lower ownership (GPP differentiation)
      if (Math.abs(scoreDiff) <= 1.5) {
        return ownA - ownB;
      }
      
      // VALUE CONTRARIAN: If player A is 3-6 pts less but saves $1500+ AND is low-owned (<12%),
      // consider them competitive (could be worth the savings to upgrade elsewhere)
      if (scoreDiff > 0 && scoreDiff <= 6 && scoreDiff >= 3) {
        const salarySaved = salaryB - salaryA;
        if (salarySaved >= 1500 && ownA < 12) {
          // Player A is a "value contrarian" - bump them up in the sort
          // But not above similar-projection players
          return -0.5; // Slight preference for value contrarian
        }
      }
      if (scoreDiff < 0 && Math.abs(scoreDiff) <= 6 && Math.abs(scoreDiff) >= 3) {
        const salarySaved = salaryA - salaryB;
        if (salarySaved >= 1500 && ownB < 12) {
          return 0.5; // Slight preference for value contrarian
        }
      }
      
      // Otherwise, sort by optimization score (highest first)
      return scoreDiff;
    });
  }
  
  // ⭐ FIX: Sort positions by ACTUAL AVAILABLE PLAYERS (fewest first)
  // This prevents using all 'F' players on SF before PF gets filled
  // Count how many players are eligible for each position, then fill scarcer first
  
  // Count available players per position
  const availablePerPosition = {};
  for (const pos of [...new Set(positions)]) {
    availablePerPosition[pos] = (playersByPosition[pos] || []).filter(p => 
      p.salary > 0 && p.status !== 'OUT'
    ).length;
  }
  
  const sortedPositions = [...positions].sort((a, b) => {
    const flexSlots = ['G', 'F', 'UTIL', 'FLEX'];
    const aIsFlex = flexSlots.includes(a);
    const bIsFlex = flexSlots.includes(b);
    if (aIsFlex && !bIsFlex) return 1; // Flex goes last
    if (!aIsFlex && bIsFlex) return -1;
    
    // Fill positions with fewer available players FIRST
    // This ensures scarce positions get filled before players are used elsewhere
    const availA = availablePerPosition[a] || 0;
    const availB = availablePerPosition[b] || 0;
    return availA - availB;
  });
  
  // Calculate minimum salary to reserve for remaining positions
  // This prevents overspending early and leaving no room for flex
  const MIN_SALARY_PER_POSITION = sport === 'NFL' ? 3500 : 3800;

  // ═══════════════════════════════════════════════════════════════════════════
  // ═══════════════════════════════════════════════════════════════════════════
  // PUNT AWARENESS (NOT enforcement - Gary has agency)
  // ═══════════════════════════════════════════════════════════════════════════
  // Gary is AWARE that most winning GPP lineups have 1-2 punts.
  // BUT Gary can use MORE punts if he's found genuine value:
  //   - Player getting increased minutes (injury to teammate)
  //   - Usage spike (trade, lineup change)
  //   - Favorable matchup + pace-up spot
  //   - Underpriced due to recent slump but talent is there
  //
  // Gary's job: INVESTIGATE whether cheap players have real upside.
  // The audit layer will flag punt-heavy lineups for review, not block them.
  // ═══════════════════════════════════════════════════════════════════════════
  const puntThreshold = PUNT_SALARY_THRESHOLD[platform] || 4500;
  const puntAwareness = PUNT_AWARENESS[contestType] || { typical: 2, flagIfOver: 3 };
  let currentPuntCount = 0;

  // Fill each position slot
  for (let i = 0; i < sortedPositions.length; i++) {
    const posSlot = sortedPositions[i];
    const rule = positionRules[posSlot];
    if (!rule) continue;
    
    // Calculate remaining positions to fill (after this one)
    const remainingPositions = sortedPositions.length - i - 1;

    // ═══════════════════════════════════════════════════════════════════════════
    // SALARY RESERVATION: Ensure we can fill remaining spots
    // ═══════════════════════════════════════════════════════════════════════════
    // Reserve minimum salary for remaining positions so we don't get stuck.
    // Gary has agency to choose punts OR mid-tier - we just ensure the lineup
    // can be completed. Gary will investigate if his punt picks have real upside.
    const reservedSalary = remainingPositions * MIN_SALARY_PER_POSITION;
    const maxSalaryForThisSlot = salaryCap - totalSalary - reservedSalary;
    
    // ═══════════════════════════════════════════════════════════════════════════
    // FIND HIGHEST-CEILING PLAYER (Ownership + Value as Tie-Breakers)
    // ═══════════════════════════════════════════════════════════════════════════
    // Gary picks the BEST projected player that fits.
    // Tie-breakers (organic):
    //   1. Similar projection (~1.5 pts): prefer lower ownership
    //   2. Value contrarian (3-6 pts less): consider if saves $1500+ AND low-owned (<12%)
    let bestPlayer = null;
    let bestPts = -1;
    let bestOwnership = 100;
    let bestSalary = 0;
    
    // Candidates are already sorted by projected_pts (highest first)
    const candidates = playersByPosition[posSlot] || [];
    
    for (const player of candidates) {
      // Skip if already used
      if (usedPlayers.has(player.name)) continue;
      
      // Skip if would exceed available salary (cap minus reserved)
      if (player.salary > maxSalaryForThisSlot) continue;
      
      // Skip if player is OUT
      if (player.status === 'OUT') continue;
      
      // Skip if no salary (invalid player)
      if (!player.salary || player.salary <= 0) continue;

      // ═══════════════════════════════════════════════════════════════════════
      // PUNT AWARENESS (NO enforcement - Gary has agency)
      // ═══════════════════════════════════════════════════════════════════════
      // Gary can choose punt plays if he's investigated and found real upside:
      //   - Minutes increase (teammate injury/trade)
      //   - Usage spike (scheme change, hot streak)
      //   - Favorable DvP matchup
      //   - Price hasn't caught up to reality
      // The audit layer will flag high-punt lineups for Gary to explain his thesis.
      const isPunt = player.salary < puntThreshold;

      const pts = player.projected_pts || 0;
      const own = player.ownership || 15;
      const sal = player.salary || 5000;
      
      // Determine if this player should be selected
      const isBetter = pts > bestPts + 1.5; // Clearly better projection
      const isSimilarButLowerOwned = Math.abs(pts - bestPts) <= 1.5 && own < bestOwnership;
      
      // VALUE CONTRARIAN: 3-6 pts less but saves $1500+ AND low-owned (<12%)
      // Gary considers this if the savings could upgrade other positions
      const ptsDiff = bestPts - pts;
      const salarySaved = bestSalary - sal;
      const isValueContrarian = ptsDiff >= 3 && ptsDiff <= 6 && salarySaved >= 1500 && own < 12;
      
      if (isBetter || isSimilarButLowerOwned || bestPlayer === null) {
        bestPts = pts;
        bestOwnership = own;
        bestSalary = sal;
        bestPlayer = player;
      } else if (isValueContrarian && bestPlayer) {
        // Log this as a value contrarian consideration (Gary may choose it)
        // Only swap if we haven't already found someone clearly better
        console.log(`[Optimizer] 💡 Value contrarian option: ${player.name} (${pts.toFixed(1)} pts, ${own}% own, saves $${salarySaved})`);
      }
    }
    
    // ═══════════════════════════════════════════════════════════════════════════
    // SALARY OVERFLOW: No valid player within budget
    // ═══════════════════════════════════════════════════════════════════════════
    // If we can't find any player within budget, log it for investigation.
    // This usually means earlier picks were too expensive - but Gary may have
    // conviction in those star picks. The audit will flag salary allocation.
    if (!bestPlayer && candidates.length > 0) {
      console.warn(`[Optimizer] ⚠️ No player within budget for ${posSlot}`);
      console.warn(`[Optimizer]    → Budget remaining: $${maxSalaryForThisSlot}`);
      console.warn(`[Optimizer]    → Gary may need to investigate cheaper alternatives`);
      // Try to find ANY valid player (even if over typical budget)
      const anyValidPlayer = candidates.find(p =>
        !usedPlayers.has(p.name) && p.status !== 'OUT' && p.salary > 0
      );
      if (anyValidPlayer) {
        bestPlayer = anyValidPlayer;
        console.log(`[Optimizer] → Found ${anyValidPlayer.name} ($${anyValidPlayer.salary}) - over budget but completing lineup`);
      }
    }

    if (bestPlayer) {
      usedPlayers.add(bestPlayer.name);
      totalSalary += bestPlayer.salary;

      // Track punt count for fragile floor prevention
      if (bestPlayer.salary < puntThreshold) {
        currentPuntCount++;
        console.log(`[Optimizer] 🎯 Punt ${currentPuntCount}/${maxPunts}: ${bestPlayer.name} ($${bestPlayer.salary})`);
      }

      // Generate rationale and supporting stats for this pick
      const { rationale, supportingStats } = generatePlayerRationale(bestPlayer, sport, platform);
      
      lineup.push({
        position: posSlot,
        player: bestPlayer.name,
        team: bestPlayer.team,
        salary: bestPlayer.salary,
        projected_pts: bestPlayer.projected_pts || calculateProjectedPoints(bestPlayer, sport, platform),
        rationale,
        supportingStats,
        pivots: [], // Will be filled later
        // Include DFS context data
        ownership: bestPlayer.ownership,
        recentForm: bestPlayer.recentForm,
        dvpRank: bestPlayer.dvpRank,
        // Carry over ALL stats for deep reasoning
        seasonStats: bestPlayer.seasonStats,
        l5Stats: bestPlayer.l5Stats,
        ppg: bestPlayer.seasonStats?.ppg || bestPlayer.ppg,
        mpg: bestPlayer.seasonStats?.mpg || bestPlayer.mpg,
        apg: bestPlayer.seasonStats?.apg || bestPlayer.apg,
        rpg: bestPlayer.seasonStats?.rpg || bestPlayer.rpg,
        usage: bestPlayer.usage || bestPlayer.seasonStats?.usage,
        l5AvgPts: bestPlayer.l5Stats?.ppg || bestPlayer.l5AvgPts,
        // Narrative context
        usageBoost: bestPlayer.usageBoost,
        injuryBeneficiary: bestPlayer.injuryBeneficiary,
        narrativeNote: bestPlayer.narrativeNote,
        opponent: bestPlayer.opponent || bestPlayer.opp,
        rotation_status: bestPlayer.rotation_status,
        teammateOpportunity: bestPlayer.teammateOpportunity
      });
    }
  }
  
  return {
    lineup,
    totalSalary,
    projectedPoints: Math.round(lineup.reduce((sum, p) => sum + (p.projected_pts || 0), 0) * 10) / 10
  };
}

/**
 * Generate rationale and supporting stats for a player pick
 * ═══════════════════════════════════════════════════════════════════════════
 * BASKETBALL-FIRST RATIONALE - NOT salary-based
 * ═══════════════════════════════════════════════════════════════════════════
 * Gary explains WHY this player will perform well TONIGHT based on:
 * - Matchup advantages (DVP, defensive weaknesses)
 * - Usage/opportunity (injuries creating minutes)
 * - Recent performance trends (hot streaks, L5 stats)
 * - Game context (pace, revenge, rest advantage)
 * 
 * NOT based on: salary value, "unlocks spend", price efficiency
 * ═══════════════════════════════════════════════════════════════════════════
 * @param {Object} player - Player with stats and context
 * @param {string} sport - 'NBA' or 'NFL'
 * @param {string} platform - 'draftkings' or 'fanduel'
 * @returns {Object} { rationale: string, supportingStats: Array }
 */
function generatePlayerRationale(player, sport, platform) {
  const stats = player.seasonStats || player;
  const supportingStats = [];
  let rationale = '';
  
  // Game context for basketball-based rationales
  const opponent = player.opponent || player.opp || '';
  const dvpRank = player.dvpRank || null;
  const usageBoost = player.usageBoost;
  const narrativeNote = player.narrativeNote;
  const recentForm = player.recentForm || null; // 'hot', 'cold', 'neutral'
  const minutesTrend = player.minutesTrend || player.minutes_trend || null;
  const rotationStatus = player.rotationStatus || player.rotation_status || null;
  const isRevenge = player.isRevenge || false;
  const l5BestPts = player.l5BestPts || 0;
  const l5AvgPts = player.l5AvgPts || 0;
  
  if (sport === 'NBA') {
    const ppg = stats.ppg || stats.pts || 0;
    const rpg = stats.rpg || stats.reb || 0;
    const apg = stats.apg || stats.ast || 0;
    const mpg = stats.mpg || stats.min || 0;
    
    // Build supporting stats (basketball stats only, no value metrics)
    if (ppg > 0) supportingStats.push({ label: 'PPG', value: ppg.toFixed(1) });
    if (rpg > 0) supportingStats.push({ label: 'RPG', value: rpg.toFixed(1) });
    if (apg > 0) supportingStats.push({ label: 'APG', value: apg.toFixed(1) });
    if (mpg > 0) supportingStats.push({ label: 'MPG', value: mpg.toFixed(1) });
    
    // Trim to 4 max
    while (supportingStats.length > 4) supportingStats.pop();
    
    // ═══════════════════════════════════════════════════════════════════════════
    // BASKETBALL-BASED RATIONALE (NO SALARY MENTIONS)
    // Priority: Narrative > Usage Opportunity > Matchup > Recent Form > Stats
    // ═══════════════════════════════════════════════════════════════════════════
    
    if (narrativeNote && narrativeNote.length > 10) {
      // Use Gary's narrative context (should already be basketball-focused)
      rationale = narrativeNote;
    } else if (usageBoost) {
      // Usage opportunity from teammate injury
      rationale = `Elevated usage tonight with ${usageBoost} out. Should see increased touches and shot attempts.`;
    } else if (rotationStatus === 'expanded_role' || minutesTrend === 'increasing') {
      // Rising role/minutes
      rationale = `Minutes trending up recently. Earning a bigger role in the rotation.`;
    } else if (isRevenge && opponent) {
      // Revenge game narrative
      rationale = `Revenge game vs ${opponent}. Extra motivation facing former team.`;
    } else if (dvpRank && dvpRank <= 5 && opponent) {
      // Elite matchup
      rationale = `${opponent} ranks bottom-5 defending ${player.position || 'this position'}. Favorable matchup tonight.`;
    } else if (dvpRank && dvpRank <= 10 && opponent) {
      // Good matchup
      rationale = `Good matchup vs ${opponent} who struggle against ${player.position || 'this position'}.`;
    } else if (recentForm === 'hot' || (l5AvgPts > 0 && l5AvgPts > ppg * 1.15)) {
      // Hot streak
      const hotStat = l5AvgPts > 0 ? ` averaging ${l5AvgPts.toFixed(1)} over last 5` : '';
      rationale = `Hot streak${hotStat}. Confidence and rhythm are up.`;
    } else if (l5BestPts >= 40) {
      // Proven ceiling
      rationale = `Showed ${l5BestPts.toFixed(0)}-point upside recently. Ceiling is real.`;
    } else if (ppg >= 25) {
      // Star production
      rationale = `Averaging ${ppg.toFixed(1)} PPG this season. Consistent high-end production.`;
    } else if (rpg >= 10 && apg >= 5) {
      // Triple-double threat
      rationale = `Putting up ${ppg.toFixed(1)}/${rpg.toFixed(1)}/${apg.toFixed(1)} per game. Multi-category contributor.`;
    } else if (rpg >= 10) {
      // Elite rebounder
      rationale = `Averaging ${rpg.toFixed(1)} boards per game. Reliable rebounding production.`;
    } else if (apg >= 8) {
      // Elite playmaker
      rationale = `Dishing ${apg.toFixed(1)} assists per game. Primary playmaker for his team.`;
    } else if (mpg >= 30) {
      // High minutes = opportunity
      rationale = `Playing ${mpg.toFixed(0)}+ minutes per game. Heavy workload creates opportunity.`;
    } else if (ppg >= 15) {
      // Solid scorer
      rationale = `Scoring ${ppg.toFixed(1)} PPG with consistent minutes. Reliable production.`;
    } else {
      // Default - focus on role
      rationale = `Filling a key role in tonight's rotation. Should see adequate minutes.`;
    }
    
  } else if (sport === 'NFL') {
    const position = (player.position || '').toUpperCase();
    const passYds = stats.passing_yards_per_game || 0;
    const passTds = stats.passing_touchdowns || 0;
    const rushYds = stats.rushing_yards_per_game || 0;
    const rushTds = stats.rushing_touchdowns || 0;
    const recYds = stats.receiving_yards_per_game || 0;
    const recTds = stats.receiving_touchdowns || 0;
    const receptions = stats.receptions || 0;
    const targets = stats.receiving_targets || 0;
    
    if (position === 'QB') {
      if (passYds > 0) supportingStats.push({ label: 'Pass YPG', value: passYds.toFixed(0) });
      if (passTds > 0) supportingStats.push({ label: 'Pass TD', value: passTds.toFixed(0) });
      if (rushYds > 20) supportingStats.push({ label: 'Rush YPG', value: rushYds.toFixed(0) });
      rationale = rushYds > 30 
        ? `Dual-threat QB with rushing upside. Floor boosted by designed runs and scrambles.`
        : `Volume passer in pass-heavy offense. High-ceiling play in positive game script.`;
    } else if (position === 'RB') {
      if (rushYds > 0) supportingStats.push({ label: 'Rush YPG', value: rushYds.toFixed(0) });
      if (rushTds > 0) supportingStats.push({ label: 'Rush TD', value: rushTds.toFixed(0) });
      if (receptions > 0) supportingStats.push({ label: 'Rec', value: receptions.toFixed(0) });
      rationale = receptions >= 30 
        ? `Pass-catching back with ${platform === 'draftkings' ? 'full PPR upside' : 'receiving floor'}. Valuable in all game scripts.`
        : `Workhorse back with volume. TD-dependent but high-touch player.`;
    } else if (position === 'WR') {
      if (recYds > 0) supportingStats.push({ label: 'Rec YPG', value: recYds.toFixed(0) });
      if (recTds > 0) supportingStats.push({ label: 'Rec TD', value: recTds.toFixed(0) });
      if (targets > 0) supportingStats.push({ label: 'Targets', value: targets.toFixed(0) });
      if (receptions > 0) supportingStats.push({ label: 'Rec', value: receptions.toFixed(0) });
      rationale = targets >= 80 
        ? `Target hog with consistent volume. High-floor ${platform === 'draftkings' ? 'PPR monster' : 'yardage play'}.`
        : `Big-play threat with TD upside. Boom potential in the right matchup.`;
    } else if (position === 'TE') {
      if (recYds > 0) supportingStats.push({ label: 'Rec YPG', value: recYds.toFixed(0) });
      if (recTds > 0) supportingStats.push({ label: 'Rec TD', value: recTds.toFixed(0) });
      if (targets > 0) supportingStats.push({ label: 'Targets', value: targets.toFixed(0) });
      rationale = `Red zone weapon with TE premium. Positional scarcity makes him valuable at price.`;
    } else {
      rationale = `Solid contributor at the position. Good value relative to projections.`;
    }
    
    // Trim to 4 max and add value
    while (supportingStats.length > 3) supportingStats.pop();
    supportingStats.push({ label: 'Value', value: `${value}x` });
  }
  
  return { rationale, supportingStats };
}

/**
 * Add pivot alternatives to each lineup position
 * @param {Array} lineup - Optimized lineup
 * @param {Array} playerPool - Full player pool
 * @param {Object} constraints - Platform constraints
 * @param {string} sport - 'NBA' or 'NFL'
 * @param {string} platform - 'draftkings' or 'fanduel'
 * @returns {Array} Lineup with pivots
 */
export function addPivotsToLineup(lineup, playerPool, constraints, sport, platform) {
  const { positionRules } = constraints;
  
  // Get all players already in the lineup
  const lineupPlayers = new Set(lineup.map(slot => slot.player));
  
  return lineup.map(slot => {
    const rule = positionRules[slot.position];
    if (!rule) return slot;
    
    // Get all players eligible for this position (excluding those already in lineup)
    const eligiblePlayers = playerPool.filter(p => {
      const pSlots = getPlayerEligibleSlots(p, sport, platform);
      const isEligible = pSlots.includes(slot.position.toUpperCase());
      const notInLineup = !lineupPlayers.has(p.name);
      return isEligible && notInLineup;
    });
    
    // Find pivots from non-lineup players first
    let pivots = findPivotAlternatives(
      { player: slot.player, salary: slot.salary },
      eligiblePlayers,
      sport,
      platform
    );
    
    // ═══════════════════════════════════════════════════════════════════════════
    // FALLBACK: If no alternatives found, show lineup players as swap options
    // ═══════════════════════════════════════════════════════════════════════════
    // On small slates, sometimes all position-eligible players are in the lineup.
    // Show them as alternatives with note that it requires a lineup rearrangement.
    if (pivots.length === 0) {
      const lineupAlternatives = playerPool.filter(p => {
        const pSlots = getPlayerEligibleSlots(p, sport, platform);
        const isEligible = pSlots.includes(slot.position.toUpperCase());
        const inLineup = lineupPlayers.has(p.name);
        const notSelf = p.name !== slot.player;
        return isEligible && inLineup && notSelf;
      }).sort((a, b) => (b.projected_pts || 0) - (a.projected_pts || 0));
      
      if (lineupAlternatives.length > 0) {
        const alt = lineupAlternatives[0];
        const salaryDiff = alt.salary - slot.salary;
        pivots.push({
          tier: 'lineup_swap',
          tierLabel: 'Swap Option',
          tierDescription: 'Already in lineup - would require rearranging',
          player: alt.name,
          team: alt.team,
          salary: alt.salary,
          projected_pts: alt.projected_pts || calculateProjectedPoints(alt, sport, platform),
          salaryDiff,
          requiresSwap: true
        });
      }
    }
    
    return {
      ...slot,
      pivots
    };
  });
}

/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * NFL STACKING ENGINE - Mandatory Correlation Rules for GPP
 * ═══════════════════════════════════════════════════════════════════════════════
 * 
 * You CANNOT win large NFL tournaments without proper stacking.
 * This engine enforces three mandatory correlation rules:
 * 
 * RULE 1 - PRIMARY STACK: QB must be paired with 1-2 WR/TE from same team
 *   - If QB is from Team A, at least 1 WR/TE must be from Team A
 *   - This captures scoring correlation (QB throws → WR catches)
 * 
 * RULE 2 - BRINGBACK: Include 1 skill player from the opposing team
 *   - If stacking Team A vs Team B, include 1 WR/RB/TE from Team B
 *   - High-scoring games are shootouts where BOTH teams produce
 * 
 * RULE 3 - DEFENSIVE STACK (Optional): Pair DST with same-team RB
 *   - If Team A is winning, RB gets more clock-killing carries
 *   - Defense gets more sack/INT opportunities in positive game script
 * 
 * @param {Array} lineup - Current lineup (will be modified)
 * @param {Array} playerPool - Full player pool for swaps
 * @param {Object} constraints - Platform constraints
 * @param {string} platform - 'draftkings' or 'fanduel'
 * @param {Object} context - Context with game info
 * @returns {Object} { lineup, stackInfo, changes }
 */
export function applyNFLStackingRules(lineup, playerPool, constraints, platform, context = {}) {
  const changes = [];
  let stackInfo = {
    primaryStack: null,
    bringback: null,
    defensiveStack: null,
    compliant: false
  };
  
  // Find the QB in the lineup
  const qbSlot = lineup.find(s => s.position === 'QB');
  if (!qbSlot) {
    console.log('[Stacking] ⚠️ No QB in lineup - cannot apply stacking');
    return { lineup, stackInfo, changes };
  }
  
  const qbTeam = qbSlot.team;
  console.log(`[Stacking] 🏈 Building stack around ${qbSlot.player} (${qbTeam})`);
  
  // ═══════════════════════════════════════════════════════════════════════════
  // RULE 1: PRIMARY STACK - QB + WR/TE from same team
  // ═══════════════════════════════════════════════════════════════════════════
  const sameTeamReceivers = lineup.filter(s => 
    ['WR', 'TE'].includes(s.position) && s.team === qbTeam
  );
  
  if (sameTeamReceivers.length >= 1) {
    stackInfo.primaryStack = {
      qb: qbSlot.player,
      receivers: sameTeamReceivers.map(r => r.player),
      team: qbTeam
    };
    // Mark as stack players to prevent swapping in review
    sameTeamReceivers.forEach(r => { r.isStack = true; });
    qbSlot.isStack = true;
    console.log(`[Stacking] ✅ Primary stack: ${qbSlot.player} + ${sameTeamReceivers.map(r => r.player).join(', ')}`);
  } else {
    // Need to swap in a WR/TE from QB's team
    console.log(`[Stacking] ⚠️ No receivers from ${qbTeam} - looking for swap...`);
    
    // Find WR/TE from QB's team in player pool
    const qbTeamReceivers = playerPool.filter(p => 
      ['WR', 'TE'].includes(p.position?.toUpperCase()) &&
      p.team === qbTeam &&
      !lineup.some(s => s.player === p.name)
    ).sort((a, b) => (b.ceilingScore || b.projected_pts || 0) - (a.ceilingScore || a.projected_pts || 0));
    
    if (qbTeamReceivers.length > 0) {
      const bestReceiver = qbTeamReceivers[0];
      
      // Find the worst non-QB receiver to swap out
      const nonQbTeamReceivers = lineup.filter(s => 
        ['WR', 'TE'].includes(s.position) && s.team !== qbTeam
      ).sort((a, b) => (a.projected_pts || 0) - (b.projected_pts || 0));
      
      if (nonQbTeamReceivers.length > 0) {
        const swapOut = nonQbTeamReceivers[0];
        const swapIdx = lineup.findIndex(s => s.player === swapOut.player);
        
        if (swapIdx !== -1) {
          const oldPlayer = lineup[swapIdx].player;
          lineup[swapIdx] = {
            ...lineup[swapIdx],
            player: bestReceiver.name,
            team: bestReceiver.team,
            salary: bestReceiver.salary,
            projected_pts: bestReceiver.projected_pts || bestReceiver.ceilingScore,
            stackSwap: true
          };
          
          changes.push({
            type: 'PRIMARY_STACK',
            swappedOut: oldPlayer,
            swappedIn: bestReceiver.name,
            reason: `Stack ${bestReceiver.name} with QB ${qbSlot.player}`
          });
          
          console.log(`[Stacking] 🔄 Swapped ${oldPlayer} → ${bestReceiver.name} (QB stack)`);
          
          stackInfo.primaryStack = {
            qb: qbSlot.player,
            receivers: [bestReceiver.name],
            team: qbTeam
          };
        }
      }
    }
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // RULE 2: BRINGBACK - 1 skill player from opposing team
  // ═══════════════════════════════════════════════════════════════════════════
  // Find the opponent of the QB's team from game context
  const games = context.games || [];
  let opponentTeam = null;
  
  for (const game of games) {
    if (game.home_team === qbTeam) {
      opponentTeam = game.visitor_team || game.away_team;
      break;
    } else if (game.visitor_team === qbTeam || game.away_team === qbTeam) {
      opponentTeam = game.home_team;
      break;
    }
  }
  
  if (opponentTeam) {
    const opponentSkillPlayers = lineup.filter(s => 
      ['WR', 'RB', 'TE'].includes(s.position) && s.team === opponentTeam
    );
    
    if (opponentSkillPlayers.length >= 1) {
      stackInfo.bringback = {
        player: opponentSkillPlayers[0].player,
        team: opponentTeam
      };
      opponentSkillPlayers[0].isStack = true;
      console.log(`[Stacking] ✅ Bringback: ${opponentSkillPlayers[0].player} (${opponentTeam})`);
    } else {
      console.log(`[Stacking] ⚠️ No bringback from ${opponentTeam} - looking for swap...`);
      
      // Find skill player from opponent in player pool
      const opponentPlayers = playerPool.filter(p => 
        ['WR', 'RB', 'TE'].includes(p.position?.toUpperCase()) &&
        p.team === opponentTeam &&
        !lineup.some(s => s.player === p.name)
      ).sort((a, b) => (b.ceilingScore || b.projected_pts || 0) - (a.ceilingScore || a.projected_pts || 0));
      
      if (opponentPlayers.length > 0) {
        const bestBringback = opponentPlayers[0];
        
        // Find the worst skill player NOT from QB's team or opponent to swap out
        const swappablePlayers = lineup.filter(s => 
          ['WR', 'RB', 'TE'].includes(s.position) && 
          s.team !== qbTeam && 
          s.team !== opponentTeam
        ).sort((a, b) => (a.projected_pts || 0) - (b.projected_pts || 0));
        
        if (swappablePlayers.length > 0) {
          const swapOut = swappablePlayers[0];
          const swapIdx = lineup.findIndex(s => s.player === swapOut.player);
          
          if (swapIdx !== -1) {
            const oldPlayer = lineup[swapIdx].player;
            lineup[swapIdx] = {
              ...lineup[swapIdx],
              player: bestBringback.name,
              team: bestBringback.team,
              salary: bestBringback.salary,
              projected_pts: bestBringback.projected_pts || bestBringback.ceilingScore,
              bringbackSwap: true
            };
            
            changes.push({
              type: 'BRINGBACK',
              swappedOut: oldPlayer,
              swappedIn: bestBringback.name,
              reason: `Bringback from ${opponentTeam} (opponent of ${qbTeam})`
            });
            
            console.log(`[Stacking] 🔄 Swapped ${oldPlayer} → ${bestBringback.name} (Bringback)`);
            
            stackInfo.bringback = {
              player: bestBringback.name,
              team: opponentTeam
            };
          }
        }
      }
    }
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // RULE 3: DEFENSIVE STACK (Optional) - DST + RB from same team
  // ═══════════════════════════════════════════════════════════════════════════
  const dstSlot = lineup.find(s => s.position === 'DST');
  if (dstSlot) {
    const dstTeam = dstSlot.team;
    const sameTeamRB = lineup.filter(s => s.position === 'RB' && s.team === dstTeam);
    
    if (sameTeamRB.length >= 1) {
      stackInfo.defensiveStack = {
        dst: dstSlot.player,
        rb: sameTeamRB[0].player,
        team: dstTeam
      };
      console.log(`[Stacking] ✅ Defensive stack: ${dstSlot.player} + ${sameTeamRB[0].player} (${dstTeam})`);
    } else {
      // Defensive stack is optional - just log for now
      console.log(`[Stacking] ℹ️ No RB from ${dstTeam} for defensive stack (optional)`);
    }
  }
  
  // Check overall compliance
  stackInfo.compliant = !!(stackInfo.primaryStack && stackInfo.bringback);
  
  if (stackInfo.compliant) {
    console.log(`[Stacking] ✅ STACK COMPLETE: Primary=${stackInfo.primaryStack.team}, Bringback=${stackInfo.bringback?.team || 'none'}`);
  } else {
    console.log(`[Stacking] ⚠️ Stack incomplete - lineup may underperform in GPP`);
  }
  
  return { lineup, stackInfo, changes };
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * NBA GAME STACKING - 10 COMMANDMENTS ENFORCEMENT
 * ═══════════════════════════════════════════════════════════════════════════
 * "THOU SHALT CORRELATE THY LINEUP - 4-5 players from 1-2 games"
 * 
 * This function enforces game-based correlation for NBA GPPs.
 * Unlike NFL where we stack QB+WR, NBA stacking is about:
 * 1. Game stacks (players from both sides of a high-total game)
 * 2. Team stacks (2-3 from same team in good matchup)
 * 
 * @param {Array} lineup - Current lineup slots
 * @param {Array} players - Full player pool
 * @param {Object} context - Game context with Vegas lines
 * @returns {Object} Stacked lineup with correlation info
 */
function enforceNBAGameStacking(lineup, players, context = {}) {
  const stackInfo = { gameStacks: [], teamStacks: [], correlationScore: 0 };
  const changes = [];
  
  // Count players per game
  const gamesInLineup = {};
  const teamsInLineup = {};
  
  lineup.forEach(slot => {
    const gameId = slot.gameId || `${slot.team}_game`;
    const team = slot.team;
    
    gamesInLineup[gameId] = (gamesInLineup[gameId] || 0) + 1;
    teamsInLineup[team] = (teamsInLineup[team] || 0) + 1;
  });
  
  // Find games with multiple players (good correlation)
  const correlatedGames = Object.entries(gamesInLineup).filter(([, count]) => count >= 2);
  const totalCorrelatedPlayers = correlatedGames.reduce((sum, [, count]) => sum + count, 0);
  
  console.log(`\n[DFS Correlation] 🎯 GPP Stack Analysis:`);
  
  // Log team stacks
  Object.entries(teamsInLineup).filter(([, count]) => count >= 2).forEach(([team, count]) => {
    console.log(`   ✅ ${team}: ${count} players stacked (same-team correlation)`);
    stackInfo.teamStacks.push({ team, count });
  });
  
  // Log game stacks (players from both sides)
  const games = context.games || [];
  games.forEach(game => {
    const homeCount = teamsInLineup[game.homeTeam] || 0;
    const awayCount = teamsInLineup[game.awayTeam] || 0;
    if (homeCount >= 1 && awayCount >= 1) {
      const total = homeCount + awayCount;
      console.log(`   ✅ ${game.awayTeam} vs ${game.homeTeam}: ${total} players (game stack - shootout potential)`);
      stackInfo.gameStacks.push({
        game: `${game.awayTeam}@${game.homeTeam}`,
        homeCount,
        awayCount,
        total: game.total || 220
      });
    }
  });
  
  // Calculate correlation score (0-100)
  // Target: 4-5 players from 1-2 games
  const distinctGames = Object.keys(gamesInLineup).length;
  const maxTeamStack = Math.max(...Object.values(teamsInLineup));
  
  let correlationScore = 50; // Base score
  
  // Bonus for concentrated lineup (fewer games = more correlation)
  if (distinctGames <= 3) correlationScore += 20;
  else if (distinctGames <= 4) correlationScore += 10;
  else if (distinctGames >= 6) correlationScore -= 15; // Too spread out
  
  // Bonus for team stacks
  if (maxTeamStack >= 3) correlationScore += 15;
  else if (maxTeamStack >= 2) correlationScore += 5;
  
  // Bonus for game stacks (both sides of a game)
  if (stackInfo.gameStacks.length >= 1) correlationScore += 15;
  
  stackInfo.correlationScore = Math.min(100, Math.max(0, correlationScore));
  
  // If correlation is weak, log warning
  if (totalCorrelatedPlayers < 4) {
    console.log(`   ⚠️ LOW CORRELATION: Only ${totalCorrelatedPlayers} players correlated. GPPs need 4-5.`);
  } else {
    console.log(`   ✅ CORRELATION OK: ${totalCorrelatedPlayers} players correlated across ${correlatedGames.length} games`);
  }
  
  return { lineup, stackInfo, changes };
}

/**
 * Main entry point: Generate complete DFS lineup with pivots
 * @param {Object} params - Generation parameters
 * @param {string} params.platform - 'draftkings' or 'fanduel'
 * @param {string} params.sport - 'NBA' or 'NFL'
 * @param {Array} params.players - Player pool with salaries and stats
 * @param {Object} params.context - Optional narrative context (fadePlayers, targetPlayers, contestType)
 * @returns {Object} Complete lineup object
 */
export async function generateDFSLineup({ platform, sport, players, context = {} }) {
  const constraints = PLATFORM_CONSTRAINTS[platform]?.[sport];
  if (!constraints) {
    throw new Error(`Unsupported platform/sport combination: ${platform}/${sport}`);
  }
  
  // Get contest type (GPP or Cash) from context
  const contestType = context.contestType || 'gpp';
  const isGPP = contestType === 'gpp';
  
  // ═══════════════════════════════════════════════════════════════════════════
  // GARY'S SHARP DFS PHILOSOPHY
  // ═══════════════════════════════════════════════════════════════════════════
  // Gary is a GAMBLER who finds VALUE, not a MODEL that outputs highest projections.
  //
  // WHAT SEPARATES GARY FROM AN OPTIMIZER:
  // - Optimizer: "Player A projects 48.5, Player B projects 47.2, pick A"
  // - Gary: "Player B just got promoted to PP1 two days ago. His salary is still 
  //          priced for PP2. The projection sites haven't updated. I'm taking B."
  //
  // GARY'S APPROACH:
  // Investigate the factors. Understand the opportunity. Make the lineup based on his analysis.
  //
  // HARD FACTORS (Trust These): Usage, minutes, target share, DvP rankings
  // SOFT FACTORS (Verify These): Narratives, ownership, "hot streaks"
  // ═══════════════════════════════════════════════════════════════════════════
  
  // ═══════════════════════════════════════════════════════════════════════════
  // GARY'S AUTONOMY: No prescribed strategy - Gary builds what he believes wins
  // ═══════════════════════════════════════════════════════════════════════════
  // Gary uses his own DFS expertise and reasoning to build the optimal lineup.
  // He naturally considers all available data: usage, value, correlations, 
  // ownership, matchups, injuries, pace - and synthesizes his own strategy.
  //
  // We trust Gary's natural understanding of DFS construction. His edge comes
  // from independent analysis and conviction, not following preset archetypes.
  //
  // Build type identification happens AFTER Gary builds (for reporting only).
  // ═══════════════════════════════════════════════════════════════════════════
  
  // Get winning targets for this contest type
  const winningTargets = GARY_SHARP_KNOWLEDGE.winning_targets[sport]?.[platform] || {};
  const contestSize = context.contestSize || 'gpp_medium'; // Default to medium GPP
  const targetInfo = winningTargets[contestSize] || winningTargets['gpp_medium'] || { win: 350, cash: 280 };
  const winTarget = isGPP ? targetInfo.win : targetInfo.cash;
  
  console.log(`\n[DFS Lineup] 🎰 Generating ${platform.toUpperCase()} ${sport} lineup (${contestType.toUpperCase()})`);
  console.log(`[DFS Lineup] 🎯 Winning Target: ${winTarget}+ pts ${isGPP ? '(GPP 1st place)' : '(cash line)'}`);
  console.log(`[DFS Lineup] 🧠 Gary building lineup based on his analysis...`);
  
  // ═══════════════════════════════════════════════════════════════════════════
  // ROTOWIRE INTELLIGENCE: Benchmarking & Forced Locks
  // ═══════════════════════════════════════════════════════════════════════════
  const playersWithProjections = players.map(p => {
    let projected_pts = p.projected_pts || calculateProjectedPoints(p, sport, platform, contestType);
    
    // ═══════════════════════════════════════════════════════════════════════════
    // GARY'S AUTONOMY - Trust His Analysis
    // ═══════════════════════════════════════════════════════════════════════════
    // Gary makes his own decisions. Benchmark is INFORMATIONAL ONLY.
    // We log the comparison for transparency but DON'T override Gary's projection.
    // Gary's edge comes from independent analysis, not consensus-following.
    // ═══════════════════════════════════════════════════════════════════════════
    if (p.benchmarkProjection > 0) {
      const garyDiff = projected_pts - p.benchmarkProjection;
      const absDiff = Math.abs(garyDiff);
      
      // Log significant differences for transparency (no projection changes)
      if (absDiff > 10) {
        if (garyDiff > 0) {
          console.log(`[DFS Lineup] 📊 Gary's edge: ${p.name} - Gary ${projected_pts.toFixed(1)} vs Market ${p.benchmarkProjection.toFixed(1)} (+${garyDiff.toFixed(1)})`);
        } else {
          console.log(`[DFS Lineup] 📊 Gary's fade: ${p.name} - Gary ${projected_pts.toFixed(1)} vs Market ${p.benchmarkProjection.toFixed(1)} (${garyDiff.toFixed(1)})`);
        }
      }
      // Gary's projection stands - he makes his own decisions
    }

    return {
      ...p,
      projected_pts,
      // Pass confirmed starter flag for locking
      forcedLock: p.isConfirmedStarter || false
    };
  });

  // Step 1: Initial greedy optimization
  const initialResult = optimizeLineup(
    playersWithProjections,
    constraints,
    sport,
    platform,
    { ...context, contestType }
  );
  
  // Step 2: Apply Sport-Specific Stacking Rules (GPP only)
  let stackedResult = { lineup: initialResult.lineup, stackInfo: null, changes: [] };
  
  if (sport === 'NFL' && isGPP) {
    console.log(`\n[DFS Lineup] 🏈 Applying NFL Stacking Rules...`);
    stackedResult = applyNFLStackingRules(
      [...initialResult.lineup], // Copy to avoid mutation
      playersWithProjections,
      constraints,
      platform,
      context
    );
    
    if (stackedResult.changes.length > 0) {
      console.log(`[DFS Lineup] 📋 Stacking changes: ${stackedResult.changes.length}`);
      stackedResult.changes.forEach(c => {
        console.log(`   - ${c.type}: ${c.swappedOut} → ${c.swappedIn}`);
      });
    }
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // NBA GAME CORRELATION ANALYSIS (GPP only)
  // ═══════════════════════════════════════════════════════════════════════════
  // In NBA GPP, winning lineups often have 2-3 players from the same high-total game.
  // This captures "shootout" upside - if one player smashes, teammates likely benefit.
  // 
  // AWARENESS: Gary investigates correlation opportunities, doesn't force them.
  // ═══════════════════════════════════════════════════════════════════════════
  if (sport === 'NBA' && isGPP) {
    const currentLineup = stackedResult.lineup;
    
    // Analyze current team distribution
    const teamCounts = {};
    const gameTeams = {}; // Map teams to their opponents
    
    currentLineup.forEach(p => {
      if (p.team) {
        teamCounts[p.team] = (teamCounts[p.team] || 0) + 1;
      }
    });
    
    // Build game pairings from player pool (teams that play each other)
    const teamsInPool = [...new Set(playersWithProjections.map(p => p.team).filter(Boolean))];
    // Note: Game pairing info should come from context - this is awareness-based
    
    // Check for natural stacks (2+ from same team)
    const naturalStacks = Object.entries(teamCounts).filter(([_, count]) => count >= 2);
    
    // Check for game stacks (players from both sides of a matchup)
    const gameStacks = [];
    if (context.games && Array.isArray(context.games)) {
      context.games.forEach(game => {
        const homeTeam = game.home_team?.abbreviation || game.home_team;
        const awayTeam = game.visitor_team?.abbreviation || game.away_team || game.visitor_team;
        
        const homeCount = teamCounts[homeTeam] || 0;
        const awayCount = teamCounts[awayTeam] || 0;
        
        if (homeCount > 0 && awayCount > 0) {
          gameStacks.push({ home: homeTeam, away: awayTeam, total: homeCount + awayCount });
        }
      });
    }
    
    // Log correlation analysis
    if (naturalStacks.length > 0 || gameStacks.length > 0) {
      console.log(`\n[DFS Correlation] 🎯 GPP Stack Analysis:`);
      naturalStacks.forEach(([team, count]) => {
        console.log(`   ✅ ${team}: ${count} players stacked (same-team correlation)`);
      });
      gameStacks.forEach(gs => {
        console.log(`   ✅ ${gs.home} vs ${gs.away}: ${gs.total} players (game stack - shootout potential)`);
      });
      stackedResult.stackInfo = { naturalStacks, gameStacks };
    } else {
      // No correlation - flag for awareness (not automatic fix)
      console.log(`\n[DFS Correlation] ⚠️ No game correlation detected - lineup is diversified`);
      console.log(`   ℹ️ Diversification can cap ceiling in GPP. Consider if a game stack makes sense.`);
      stackedResult.stackInfo = { warning: 'no_correlation', teams: Object.keys(teamCounts) };
    }
  }
  
  // Step 3: Gary's 2-round self-review (salary efficiency + ownership)
  const reviewedResult = selfReviewLineup(
    stackedResult.lineup,
    playersWithProjections,
    constraints,
    sport,
    platform,
    { contestType } // Pass contest type for ownership logic
  );
  
  // Step 4: Add pivots to the reviewed lineup
  const lineupWithPivots = addPivotsToLineup(
    reviewedResult.lineup,
    playersWithProjections,
    constraints,
    sport,
    platform
  );
  
  // Calculate ceiling-based projected points for GPP
  const projectedPoints = isGPP
    ? Math.round(lineupWithPivots.reduce((sum, p) => sum + (p.ceilingScore || p.projected_pts || 0), 0) * 10) / 10
    : Math.round(reviewedResult.projectedPoints * 10) / 10;
  
  // ═══════════════════════════════════════════════════════════════════════════
  // ⚠️ CRITICAL: HARD SALARY CAP ENFORCEMENT
  // ═══════════════════════════════════════════════════════════════════════════
  // Fantasy contests CANNOT submit lineups over the cap - it's literally impossible
  // If we somehow ended up over (due to stacking/review logic), we MUST fix it
  // ═══════════════════════════════════════════════════════════════════════════
  let finalTotalSalary = reviewedResult.totalSalary;
  let finalLineup = lineupWithPivots;
  
  if (finalTotalSalary > constraints.salaryCap) {
    console.log(`\n[DFS Lineup] 🚨 CRITICAL: Lineup exceeds salary cap by $${finalTotalSalary - constraints.salaryCap}!`);
    console.log(`[DFS Lineup] 🔧 Applying emergency downgrade to meet cap...`);
    
    // Find the most expensive player and downgrade to next-best affordable option
    // Sort lineup by salary (highest first)
    const sortedByPrice = [...finalLineup].sort((a, b) => b.salary - a.salary);
    
    // Try to downgrade expensive players until we're under cap
    for (const expensiveSlot of sortedByPrice) {
      const overAmount = finalTotalSalary - constraints.salaryCap;
      if (overAmount <= 0) break; // We're good now
      
      // Find cheaper alternative for this position
      const position = expensiveSlot.position;
      const usedNames = new Set(finalLineup.map(p => p.player));
      usedNames.delete(expensiveSlot.player); // Allow replacing current player
      
      const alternatives = playersWithProjections.filter(p => {
        if (usedNames.has(p.name)) return false;
        if (p.status === 'OUT') return false;
        if (p.salary <= 0) return false;
        
        // Check if player can fill this position
        const pos = p.position?.toUpperCase();
        const eligibleSlots = getEligibleSlots(pos, sport);
        return eligibleSlots.includes(position);
      }).sort((a, b) => b.projected_pts - a.projected_pts); // Best first
      
      // Find alternative that saves enough money
      for (const alt of alternatives) {
        const savingsNeeded = overAmount;
        const actualSavings = expensiveSlot.salary - alt.salary;
        
        if (actualSavings >= savingsNeeded && alt.salary <= expensiveSlot.salary) {
          // Swap it out
          console.log(`[DFS Lineup] 💱 Downgrade: ${expensiveSlot.player} ($${expensiveSlot.salary}) → ${alt.name} ($${alt.salary}) | Saves $${actualSavings}`);
          
          const idx = finalLineup.findIndex(p => p.player === expensiveSlot.player);
          finalLineup[idx] = {
            position,
            player: alt.name,
            team: alt.team,
            salary: alt.salary,
            projected_pts: alt.projected_pts,
            rationale: `Emergency downgrade to meet salary cap`,
            supportingStats: [],
            pivots: [],
            ownership: alt.ownership,
            recentForm: alt.recentForm,
            dvpRank: alt.dvpRank
          };
          
          finalTotalSalary = finalLineup.reduce((sum, p) => sum + p.salary, 0);
          break;
        }
      }
    }
    
    // Final verification
    if (finalTotalSalary > constraints.salaryCap) {
      console.error(`[DFS Lineup] ❌ FAILED TO FIX SALARY CAP! Still over by $${finalTotalSalary - constraints.salaryCap}`);
      console.error(`[DFS Lineup] ❌ This lineup CANNOT be submitted to ${platform}!`);
    } else {
      console.log(`[DFS Lineup] ✅ Salary cap met: $${finalTotalSalary}/$${constraints.salaryCap}`);
    }
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // PHASE 1: VALIDATION & WARNINGS
  // ═══════════════════════════════════════════════════════════════════════════
  
  // 1. Validate punt count
  let puntValidation = validatePuntCount(finalLineup, platform, contestType);
  let puntFixAttempted = false;
  let puntFixSuccess = false;
  
  // ═══════════════════════════════════════════════════════════════════════════
  // FRAGILE FLOOR AWARENESS (Not Forced Auto-Fix)
  // ═══════════════════════════════════════════════════════════════════════════
  // Having 3-4 punt plays isn't always bad - it depends on the slate:
  // - If punts have high ceilings (breakout candidates), keep them
  // - If punts are low-floor/low-ceiling, consider upgrading
  // 
  // Gary investigates whether the punts are intentional (Stars & Scrubs strategy)
  // or accidental (optimizer couldn't find better options).
  // ═══════════════════════════════════════════════════════════════════════════
  if (!puntValidation.valid) {
    puntFixAttempted = true;
    console.log(`[DFS Self-Heal] ⚠️ Fragile floor detected: ${puntValidation.puntCount} punts (max: 2)`);
    
    // INVESTIGATE: Are these punts intentional high-ceiling plays?
    const puntPlayers = puntValidation.puntPlayers || [];
    const intentionalPunts = puntPlayers.filter(p => {
      const lineupPlayer = finalLineup.find(lp => lp.player === p.name);
      // High ceiling OR narrative target = intentional
      return (lineupPlayer?.ceilingScore || 0) > 25 || 
             lineupPlayer?.isTarget || 
             lineupPlayer?.narrativeModified ||
             lineupPlayer?.teammateOpportunity;
    });
    
    if (intentionalPunts.length >= puntValidation.puntCount - 1) {
      // Most punts are intentional high-ceiling plays - this is Stars & Scrubs
      console.log(`[DFS Self-Heal] ✅ ${intentionalPunts.length}/${puntValidation.puntCount} punts have ceiling upside - intentional strategy`);
      puntFixSuccess = true; // Mark as "handled" even though we didn't change anything
    } else {
      // Some punts are unintentional low-floor plays - try to upgrade
      const threshold = PUNT_SALARY_THRESHOLD[platform] || 4500;
      const midRangeMin = threshold + 500; // Just above punt threshold
      const midRangeMax = 7500; // More flexible range
      const salaryCap = constraints.salaryCap;
      
      // Calculate current salary and remaining budget
      const currentSalary = finalLineup.reduce((sum, p) => sum + (p.salary || 0), 0);
      let remaining = salaryCap - currentSalary;
      
      // Only upgrade punts that aren't intentional ceiling plays
      const puntsToUpgrade = puntPlayers
        .filter(p => !intentionalPunts.some(ip => ip.name === p.name))
        .sort((a, b) => a.salary - b.salary);
      
      // Only need to fix enough to get to max 2 punts
      const puntsToFix = Math.max(0, puntValidation.puntCount - 2 - intentionalPunts.length);
      let fixedCount = 0;
      
      if (puntsToFix === 0) {
        console.log(`[DFS Self-Heal] ✅ Intentional punts bring count to acceptable level`);
        puntFixSuccess = true;
      } else {
        // Need to upgrade some punts - try to find mid-range alternatives
        for (let i = 0; i < Math.min(puntsToFix, puntsToUpgrade.length); i++) {
      const puntPlayer = puntsToUpgrade[i];
      const slotIndex = finalLineup.findIndex(s => s.player === puntPlayer.name);
      if (slotIndex === -1) continue;
      
      const slot = finalLineup[slotIndex];
      const maxUpgradeSpend = remaining + slot.salary;
      
      // Find mid-range alternatives for this position
      const alternatives = players.filter(p => {
        const playerPos = p.position || '';
        const slotPos = slot.position || '';
        const salary = p.salary || 0;
        const alreadyUsed = finalLineup.some(s => s.player === p.name);
        
        // ⭐ Use Tank01's platform-specific positions when available
        const eligible = sport === 'NBA' 
          ? isPositionEligible(playerPos, slotPos, sport, p.allPositions)
          : playerPos === slotPos || slotPos === 'FLEX';
        
        return eligible && 
               !alreadyUsed && 
               salary >= midRangeMin && 
               salary <= Math.min(midRangeMax, maxUpgradeSpend);
      }).sort((a, b) => {
        // Sort by value (pts per $1k)
        const aVal = (a.projection || 0) / ((a.salary || 5000) / 1000);
        const bVal = (b.projection || 0) / ((b.salary || 5000) / 1000);
        return bVal - aVal;
      });
      
      if (alternatives.length > 0) {
        const upgrade = alternatives[0];
        const oldSalary = slot.salary;
        const newSalary = upgrade.salary || 5000;
        
        console.log(`[DFS Self-Heal] 🔄 Upgrading ${slot.player} ($${oldSalary}) → ${upgrade.name} ($${newSalary})`);
        
        // Swap the player
        finalLineup[slotIndex] = {
          position: slot.position,
          player: upgrade.name,
          team: upgrade.team,
          salary: newSalary,
          projected_pts: upgrade.projection || 0,
          ownership: upgrade.ownership || 15,
          ...upgrade
        };
        
        remaining -= (newSalary - oldSalary);
          fixedCount++;
        }
        }
        
        if (fixedCount > 0) {
          puntFixSuccess = true;
          console.log(`[DFS Self-Heal] ✅ Fixed ${fixedCount} punt plays`);
          // Re-validate after fixes
          puntValidation = validatePuntCount(finalLineup, platform, contestType);
        } else if (puntsToFix > 0) {
          console.log(`[DFS Self-Heal] ℹ️ Could not find mid-range upgrades - punts may be intentional`);
        }
      } // end else (puntsToFix > 0)
    } // end else (not all intentional)
  }
  
  // 2. Check anti-correlation
  const antiCorrelation = checkAntiCorrelation(finalLineup, sport);
  
  // 3. Check chalk fade opportunity
  const chalkFade = applyChalkFadeStrategy(players, finalLineup, contestType);
  
  // ═══════════════════════════════════════════════════════════════════════════
  // BUILD GARY'S NOTES - Deep statistical analysis with narrative context
  // ═══════════════════════════════════════════════════════════════════════════
  const garyNotes = [];
  
  // Helper to get player stats from context or player object
  const getPlayerStats = (p) => {
    const stats = p.seasonStats || {};
    const l5 = p.l5Stats || {};
    return {
      ppg: stats.ppg || p.ppg || 0,
      mpg: stats.mpg || p.mpg || 0,
      apg: stats.apg || p.apg || 0,
      rpg: stats.rpg || p.rpg || 0,
      usage: stats.usage || p.usage || 0,
      l5Ppg: l5.ppg || p.l5AvgPts || 0,
      l5Mpg: l5.mpg || 0,
      l5FPts: l5.fpts || p.l5AvgFpts || 0,
      recentForm: p.recentForm || (l5.ppg > (stats.ppg || 0) * 1.1 ? 'hot' : 'neutral')
    };
  };
  
  // Calculate lineup stats for insights
  const totalProjection = finalLineup.reduce((sum, p) => sum + (p.projected_pts || 0), 0);
  const totalSalary = finalLineup.reduce((sum, p) => sum + (p.salary || 0), 0);
  const avgOwnership = finalLineup.reduce((sum, p) => sum + (p.ownership || 15), 0) / finalLineup.length;
  
  // Sort players by projection for analysis
  const sortedByProjection = [...finalLineup].sort((a, b) => (b.projected_pts || 0) - (a.projected_pts || 0));
  const topPlay = sortedByProjection[0];
  const secondPlay = sortedByProjection[1];
  const thirdPlay = sortedByProjection[2];
  
  // Find players with specific edges
  const matchupPlays = finalLineup.filter(p => p.dvpRank && p.dvpRank <= 10);
  const usageBoostPlays = finalLineup.filter(p => 
    p.usageBoost || 
    p.narrativeNote || 
    p.injuryBeneficiary || 
    p.teammateOpportunity // From injury context
  );
  const hotPlays = finalLineup.filter(p => {
    const stats = getPlayerStats(p);
    return p.recentForm === 'hot' || (stats.l5Ppg > stats.ppg * 1.1);
  });
  const minutesPlays = finalLineup.filter(p => p.minutesTrend === 'increasing' || p.rotation_status === 'expanded_role');
  const puntPlays = finalLineup.filter(p => (p.salary || 0) < 4500);
  const coreStars = finalLineup.filter(p => (p.salary || 0) >= 8000);
  
  // ═══════════════════════════════════════════════════════════════════════════
  // CONCISE GARY'S NOTES - Just the key facts
  // ═══════════════════════════════════════════════════════════════════════════
  
  // Team stacks
  const teamCounts = {};
  finalLineup.forEach(p => {
    teamCounts[p.team] = (teamCounts[p.team] || 0) + 1;
  });
  const stacks = Object.entries(teamCounts).filter(([_, count]) => count >= 2).sort((a, b) => b[1] - a[1]);
  
  // Ownership stats
  const chalkPlays = finalLineup.filter(p => (p.ownership || 15) > 25);
  const contrarianPlays = finalLineup.filter(p => (p.ownership || 15) < 10);
  
  // Build concise notes
  
  // 1. CORE PLAYS (top 2 by salary)
  if (topPlay) {
    const topStats = getPlayerStats(topPlay);
    let topReason = '';
    if (topPlay.usageBoost || topPlay.injuryBeneficiary) {
      topReason = ` - ${topPlay.usageBoost || topPlay.injuryBeneficiary}`;
    } else if (topStats.l5Ppg > topStats.ppg * 1.1 && topStats.ppg > 0) {
      topReason = ` - Hot (${topStats.l5Ppg.toFixed(0)} L5 vs ${topStats.ppg.toFixed(0)} season)`;
    } else if (topPlay.dvpRank && topPlay.dvpRank <= 8) {
      topReason = ` - Elite matchup (#${topPlay.dvpRank} DvP)`;
    }
    garyNotes.push(`🎯 ANCHOR: ${topPlay.player} $${(topPlay.salary/1000).toFixed(1)}K${topReason}`);
  }
  
  if (secondPlay && secondPlay.projected_pts >= 30) {
    const secStats = getPlayerStats(secondPlay);
    let secReason = '';
    if (secondPlay.usageBoost) {
      secReason = ` - ${secondPlay.usageBoost}`;
    } else if (secStats.l5Ppg > secStats.ppg * 1.1 && secStats.ppg > 0) {
      secReason = ` - Trending up`;
    }
    garyNotes.push(`🎯 SECONDARY: ${secondPlay.player} $${(secondPlay.salary/1000).toFixed(1)}K${secReason}`);
  }
  
  // 2. USAGE BOOST (if any key injury plays)
  const keyUsagePlays = usageBoostPlays.slice(0, 2);
  if (keyUsagePlays.length > 0) {
    const usageNote = keyUsagePlays.map(p => {
      const outStar = p.teammateOpportunity?.outStars?.[0] || '';
      return `${p.player}${outStar ? ` (${outStar} OUT)` : ''}`;
    }).join(', ');
    garyNotes.push(`🚀 USAGE BOOST: ${usageNote}`);
  }
  
  // 3. STACKS (one line)
  if (stacks.length > 0) {
    const stackNote = stacks.map(([team, count]) => `${team} x${count}`).join(', ');
    garyNotes.push(`📊 STACKS: ${stackNote}`);
  }
  
  // 4. VALUE PLAYS (punts under $4.5K)
  if (puntPlays.length > 0) {
    const puntNote = puntPlays.slice(0, 3).map(p => {
      const val = ((p.projected_pts || 0) / ((p.salary || 4000) / 1000)).toFixed(1);
      return `${p.player} (${val}x)`;
    }).join(', ');
    garyNotes.push(`💎 VALUE: ${puntNote}`);
  }
  
  // 5. OWNERSHIP (one line)
  const ownNote = chalkPlays.length > 2 
    ? `Chalky build (${chalkPlays.length} over 25%)`
    : contrarianPlays.length >= 3
      ? `Contrarian (${contrarianPlays.length} under 10%)`
      : `Balanced (${avgOwnership.toFixed(0)}% avg)`;
  garyNotes.push(`📈 OWNERSHIP: ${ownNote}`);
  
  // 6. STARS RETURNING (if impacts lineup)
  const playersWithStarReturning = finalLineup.filter(p => p.starReturning);
  if (playersWithStarReturning.length > 0) {
    const stars = [...new Set(playersWithStarReturning.map(p => p.starReturning?.star))];
    const restrictions = playersWithStarReturning[0]?.starReturning?.minutesRestriction;
    const note = restrictions ? ` (${restrictions})` : '';
    garyNotes.push(`⚠️ MONITOR: ${stars.join(', ')} returning${note}`);
  }
  
  // 7. KEY RISK (if fragile build)
  if (puntPlays.length >= 3) {
    garyNotes.push(`⚠️ RISK: ${puntPlays.length} punts - needs stars to hit`);
  }
  
  // 8. INVESTIGATE FLAGS - Gary should verify large stacks
  const largeStacks = stacks.filter(([team, count]) => count >= 4);
  
  if (largeStacks.length > 0) {
    const stackNote = largeStacks.map(([team, count]) => `${team} x${count}`).join(', ');
    garyNotes.push(`🔍 STACK CHECK: ${stackNote} - verify game total/pace supports`);
  }
  
  // 9. PUNT INVESTIGATION - Flag punts that need verification
  const riskyPunts = puntPlays.filter(p => {
    const stats = getPlayerStats(p);
    // Flag punts with low MPG or no recent form data
    return stats.mpg < 20 || !p.l5Stats;
  });
  if (riskyPunts.length > 0) {
    const puntNames = riskyPunts.map(p => p.player).join(', ');
    garyNotes.push(`🔍 PUNT CHECK: ${puntNames} - low floor, verify minutes`);
  }
  
  // NFL Stack info (if present)
  if (stackedResult.stackInfo?.primaryStack) {
    const stack = stackedResult.stackInfo;
    garyNotes.push(`🏈 STACK: ${stack.primaryStack.qb} + ${stack.primaryStack.receivers?.slice(0, 2).join(', ')}`);
    if (stack.bringback) {
      garyNotes.push(`↩️ BRINGBACK: ${stack.bringback.player}`);
    }
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // SORT LINEUP BY PLATFORM POSITION ORDER
  // ═══════════════════════════════════════════════════════════════════════════
  // FanDuel NBA: PG, PG, SG, SG, SF, SF, PF, PF, C
  // DraftKings NBA: PG, SG, SF, PF, C, G, F, UTIL
  // Sort the final lineup to match the platform's expected roster order
  // ═══════════════════════════════════════════════════════════════════════════
  const positionOrder = constraints.positions;
  const sortedLineup = [];
  const positionCounts = {};
  
  // Sort lineup players into their correct roster slots
  for (const pos of positionOrder) {
    positionCounts[pos] = (positionCounts[pos] || 0) + 1;
    
    // Find the next player assigned to this position slot
    const player = finalLineup.find(p => {
      const matchesPosition = p.position === pos;
      const notYetPlaced = !sortedLineup.some(s => s.player === p.player);
      return matchesPosition && notYetPlaced;
    });
    
    if (player) {
      sortedLineup.push(player);
    }
  }
  
  // If some players weren't matched (edge case), append them
  for (const player of finalLineup) {
    if (!sortedLineup.some(s => s.player === player.player)) {
      sortedLineup.push(player);
    }
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // WINNING TARGET VALIDATION
  // ═══════════════════════════════════════════════════════════════════════════
  const winTargetMet = projectedPoints >= winTarget;
  const shortfall = winTargetMet ? 0 : Math.round(winTarget - projectedPoints);
  
  if (winTargetMet) {
    console.log(`[DFS Lineup] ✅ Winning range achieved: ${projectedPoints.toFixed(1)} pts (target: ${winTarget}+)`);
  } else {
    console.log(`[DFS Lineup] ⚠️ Below winning range: ${projectedPoints.toFixed(1)} pts (need ${winTarget}+, short by ${shortfall})`);
  }
  
  // Final Lineup Object
  const finalLineupData = {
    platform,
    sport,
    contestType,
    salary_cap: constraints.salaryCap,
    total_salary: finalTotalSalary,
    projected_points: projectedPoints,
    // Winning target info
    winning_target: winTarget,
    winning_target_met: winTargetMet,
    shortfall: shortfall,
    // GPP-specific: ceiling-based projection target
    ceiling_projection: isGPP ? projectedPoints : null,
    floor_projection: Math.round(sortedLineup.reduce((sum, p) => sum + (p.floorScore || p.projected_pts * 0.7 || 0), 0) * 10) / 10,
    total_ceiling: Math.round(sortedLineup.reduce((sum, p) => sum + (p.ceiling_projection || p.projected_pts * 1.2 || 0), 0) * 10) / 10,
    total_floor: Math.round(sortedLineup.reduce((sum, p) => sum + (p.floor_projection || p.projected_pts * 0.7 || 0), 0) * 10) / 10,
    // Stacking info for NFL
    stackInfo: stackedResult.stackInfo,
    lineup: sortedLineup,
    avg_ownership: sortedLineup.reduce((sum, p) => sum + (p.ownership || 15), 0) / sortedLineup.length,
    // Validation results
    puntValidation,
    antiCorrelation,
    chalkFade,
    // Gary's notes
    gary_notes: garyNotes.join('\n')
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // GARY'S SHARP AUDIT - The Final Polish
  // ═══════════════════════════════════════════════════════════════════════════
  // Gary grades his own work against sharp gambler principles.
  // If the grade is low, he applies sharp fixes before presentation.
  // ═══════════════════════════════════════════════════════════════════════════
  try {
    const auditedResult = await runSharpAuditCycle(finalLineupData, context, {
      sport,
      platform,
      contestType,
      originalPlayers: players // The full pool for fixes
    });
    
    // Merge Gary's notes with Audit insights if needed
    if (auditedResult.audit?.weaknesses?.length > 0) {
      const auditNotes = `\n\nSHARP AUDIT (Gary's Self-Correction):\n` + 
        auditedResult.audit.weaknesses.map(w => `• ${w}`).join('\n');
      auditedResult.gary_notes += auditNotes;
    }

    return auditedResult;
  } catch (err) {
    console.error(`[Sharp Audit] Error during audit cycle: ${err.message}`);
    return finalLineupData; // Return unaudited if it fails
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// PLATFORM-SPECIFIC POSITION ELIGIBILITY
// ═══════════════════════════════════════════════════════════════════════════════
// Tank01 API provides `allValidPositions` which are the ACTUAL positions the
// player is eligible for on DraftKings/FanDuel. These can differ between platforms!
// 
// Example: Kevin Durant
//   DK: ["SG", "SF"] 
//   FD: ["SF", "PF"]
// 
// We prioritize Tank01's platform-specific positions, then fall back to generic mapping.
// ═══════════════════════════════════════════════════════════════════════════════

// Helper function to check if a player position can fill a slot position
// Now accepts optional allPositions array from Tank01 for platform-specific eligibility
function isPositionEligible(playerPos, slotPos, sport = 'NBA', allPositions = null) {
  // If we have Tank01's platform-specific positions, use them directly
  if (allPositions && Array.isArray(allPositions) && allPositions.length > 0) {
    // Check if the slot matches any of the player's valid positions
    const normalizedSlot = slotPos.toUpperCase();
    const normalizedPositions = allPositions.map(p => p.toUpperCase());
    
    // Direct match with any valid position
    if (normalizedPositions.includes(normalizedSlot)) return true;
    
    // UTIL/FLEX slots accept anyone
    if (normalizedSlot === 'UTIL' || normalizedSlot === 'FLEX') return true;
    
    // G slot accepts PG or SG
    if (normalizedSlot === 'G' && normalizedPositions.some(p => ['PG', 'SG'].includes(p))) return true;
    
    // F slot accepts SF or PF
    if (normalizedSlot === 'F' && normalizedPositions.some(p => ['SF', 'PF'].includes(p))) return true;
    
    return false;
  }
  
  // Fallback to generic position mapping
  const eligibleSlots = getEligibleSlots(playerPos, sport);
  return eligibleSlots.includes(slotPos);
}

// Helper function to get eligible slots for a player position (fallback when Tank01 data unavailable)
function getEligibleSlots(playerPosition, sport) {
  const positionEligibility = {
    // NBA - Standard positions
    'PG': ['PG', 'G', 'UTIL'],
    'SG': ['SG', 'G', 'UTIL'],
    'SF': ['SF', 'F', 'UTIL'],
    'PF': ['PF', 'F', 'UTIL'],
    'C': ['C', 'UTIL'],
    // NBA - Generic/combo positions (BDL format)
    'G': ['PG', 'SG', 'G', 'UTIL'],
    'F': ['SF', 'PF', 'F', 'UTIL'],
    'G-F': ['PG', 'SG', 'SF', 'G', 'F', 'UTIL'],
    'F-G': ['PG', 'SG', 'SF', 'G', 'F', 'UTIL'],
    'F-C': ['PF', 'C', 'F', 'UTIL'],
    'C-F': ['PF', 'C', 'F', 'UTIL'],
    // NFL
    'QB': ['QB'],
    'RB': ['RB', 'FLEX'],
    'WR': ['WR', 'FLEX'],
    'TE': ['TE', 'FLEX'],
    'K': ['K'],
    'DST': ['DST'],
    'DEF': ['DST']
  };
  
  return positionEligibility[playerPosition] || [playerPosition];
}

// Helper to get all slots a player can fill, using platform-specific data when available
function getPlayerEligibleSlots(player, sport = 'NBA', platform = 'draftkings') {
  const slots = new Set();
  
  // ═══════════════════════════════════════════════════════════════════════════
  // TANK01 POSITIONS ARE SOURCE OF TRUTH - NO FALLBACKS
  // ═══════════════════════════════════════════════════════════════════════════
  // Tank01 returns `allValidPositions` which is the EXACT list of slots
  // a player can fill on DraftKings or FanDuel. 
  // 
  // NO FALLBACKS: If Tank01 doesn't provide positions, the player cannot
  // be used in lineups. We cannot guess at DFS positions.
  // 
  // DRAFTKINGS FLEX RULES (applied on top of Tank01 positions):
  // - G slot accepts: PG, SG (guards)
  // - F slot accepts: SF, PF (forwards)
  // - UTIL accepts: everyone
  // 
  // This is NOT expansion - this is DraftKings roster rules.
  // A PG can fill PG or G or UTIL. But G does NOT mean they can fill PG.
  // ═══════════════════════════════════════════════════════════════════════════
  
  if (!player.allPositions || !Array.isArray(player.allPositions) || player.allPositions.length === 0) {
    // NO TANK01 POSITION DATA = PLAYER CANNOT BE USED
    // Return empty array - this player won't be eligible for any slots
    console.warn(`[Position] ⚠️ ${player.name} has no Tank01 position data - cannot be used in lineup`);
    return [];
  }
  
  // Use Tank01's platform-specific positions EXACTLY as provided
  player.allPositions.forEach(pos => {
    if (pos) slots.add(pos.toUpperCase());
  });
  
  // ═══════════════════════════════════════════════════════════════════════════
  // DRAFTKINGS FLEX SLOT RULES (not expansion - actual DK roster rules)
  // ═══════════════════════════════════════════════════════════════════════════
  if (sport === 'NBA' && platform === 'draftkings') {
    // G slot accepts PG or SG
    if (slots.has('PG') || slots.has('SG')) {
      slots.add('G');
    }
    // F slot accepts SF or PF
    if (slots.has('SF') || slots.has('PF')) {
      slots.add('F');
    }
  }
  
  // UTIL is always valid for NBA
  if (sport === 'NBA' && !slots.has('UTIL')) {
    slots.add('UTIL');
  }
  
  // FLEX is always valid for NFL skill positions
  if (sport === 'NFL') {
    const hasSkillPos = ['RB', 'WR', 'TE'].some(p => slots.has(p));
    if (hasSkillPos && !slots.has('FLEX')) {
      slots.add('FLEX');
    }
  }
  
  return Array.from(slots);
}

/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * OWNERSHIP AWARENESS - GPP Tournament Leverage (AWARENESS, NOT PRESCRIPTIVE)
 * ═══════════════════════════════════════════════════════════════════════════════
 * 
 * Gary is AWARE that ownership matters in GPP tournaments:
 * 
 * HIGH OWNERSHIP (>25% "chalk"):
 *   - Must SMASH projection to help you climb leaderboard (many competing lineups)
 *   - Still pick if best play, but understand the leverage dynamics
 * 
 * LOW OWNERSHIP (<10% "contrarian"):
 *   - Massive differentiation if player hits ceiling
 *   - Can vault you up leaderboard with fewer competing lineups
 * 
 * Gary's Philosophy: 
 *   1. Pick the lineup with HIGHEST EXPECTED SCORE
 *   2. Use ownership as ONE data point (along with projection, ceiling, narrative)
 *   3. Don't force pivots based on arbitrary caps
 *   4. Be aware high ownership = need differentiation to win
 * 
 * CASH games don't need ownership awareness (consistency > differentiation)
 * ═══════════════════════════════════════════════════════════════════════════════
 */

/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * GARY'S SELF-REVIEW OPTIMIZATION (3 Rounds)
 * ═══════════════════════════════════════════════════════════════════════════════
 * 
 * After building the initial greedy lineup, Gary reviews it:
 * 
 * ROUND 1: SALARY EFFICIENCY
 * - Check if money was left on the table
 * - Upgrade weak spots with remaining salary
 * - Ensure we're maximizing total projected points
 * 
 * ROUND 2: OWNERSHIP AWARENESS
 * - Calculate total lineup ownership FOR AWARENESS ONLY
 * - Identify chalk plays (high ownership) and contrarian picks
 * - Log ownership data as informational context
 * - NO FORCED PIVOTS - Gary picks highest expected score lineup
 * - Ownership is ONE data point among many (projection, ceiling, narrative)
 * 
 * ═══════════════════════════════════════════════════════════════════════════════
 */
export function selfReviewLineup(lineup, playerPool, constraints, sport, platform, context = {}) {
  const { salaryCap } = constraints;
  const contestType = context.contestType || 'gpp';
  const isGPP = contestType === 'gpp';
  
  let currentLineup = [...lineup];
  let totalSalary = currentLineup.reduce((sum, p) => sum + (p.salary || 0), 0);
  let totalPts = currentLineup.reduce((sum, p) => sum + (p.projected_pts || 0), 0);
  
  console.log(`\n[Gary Self-Review] 🔍 Starting review... (${contestType.toUpperCase()})`);
  console.log(`[Gary Self-Review] Initial: $${totalSalary}/${salaryCap} | ${totalPts.toFixed(1)} pts`);
  
  // ═══════════════════════════════════════════════════════════════════════════
  // ROUND 1: LINEUP QUALITY CHECK (Awareness, Not Forced Optimization)
  // ═══════════════════════════════════════════════════════════════════════════
  // The salary cap is a CEILING, not a target. Gary doesn't swap players just
  // to use more salary. He only upgrades if there's a CLEARLY BETTER option
  // that improves the lineup quality (value, ceiling, or narrative fit).
  // 
  // Philosophy: If Gary likes his lineup, leave money on the table.
  // ═══════════════════════════════════════════════════════════════════════════
  let remainingSalary = salaryCap - totalSalary;
  
  // Log remaining salary but don't force usage
  if (remainingSalary >= 500) {
    console.log(`[Gary Self-Review] 💰 Round 1: $${remainingSalary} remaining under cap`);
    
    // Only look for upgrades if there's a CLEAR improvement available
    // "Clear" = better value (pts/$1k) AND better projection AND fits the narrative
    const sortedByValue = [...currentLineup].sort((a, b) => {
      const aVal = (a.projected_pts || 0) / ((a.salary || 5000) / 1000);
      const bVal = (b.projected_pts || 0) / ((b.salary || 5000) / 1000);
      return aVal - bVal; // Lowest value first
    });
    
    // Only check the single worst-value spot (not 3 like before)
    const worstValueSpot = sortedByValue[0];
    const worstValue = (worstValueSpot.projected_pts || 0) / ((worstValueSpot.salary || 5000) / 1000);
    
    // Only consider upgrade if current spot has BAD value (< 4x on low salary)
    const isBadValue = worstValue < 4.0 && worstValueSpot.salary < 6000;
    
    if (isBadValue) {
      const position = worstValueSpot.position;
      const currentPts = worstValueSpot.projected_pts || 0;
      const currentSalary = worstValueSpot.salary || 0;
      const maxUpgradeSalary = currentSalary + remainingSalary;
      
      // Find a CLEARLY better player (not just marginally better)
      const upgrades = playerPool.filter(p => {
        if (p.name === worstValueSpot.player) return false;
        if (currentLineup.some(l => l.player === p.name)) return false;
        if (p.status === 'OUT' || p.status === 'DOUBTFUL') return false;
        if (!p.salary || p.salary > maxUpgradeSalary) return false;
        
        // Protect stacks
        const isStackPlayer = worstValueSpot.stackSwap || worstValueSpot.bringbackSwap || worstValueSpot.isStack;
        if (isStackPlayer && p.team !== worstValueSpot.team) return false;
        
        // Check position eligibility (use platform-specific if available)
        const eligible = isPositionEligible(p.position, position, sport, p.allPositions);
        if (!eligible) return false;
        
        const upgradePts = p.projected_pts || calculateProjectedPoints(p, sport, platform, contestType);
        const upgradeValue = upgradePts / ((p.salary || 5000) / 1000);
        
        // CLEAR improvement = at least 3+ pts better AND better value
        return upgradePts > currentPts + 3 && upgradeValue > worstValue + 0.5;
      }).sort((a, b) => {
        // Sort by value, not just raw points
        const aVal = (a.projected_pts || 0) / ((a.salary || 5000) / 1000);
        const bVal = (b.projected_pts || 0) / ((b.salary || 5000) / 1000);
        return bVal - aVal;
      });
      
      if (upgrades.length > 0) {
        const upgrade = upgrades[0];
        const upgradePts = upgrade.projected_pts || calculateProjectedPoints(upgrade, sport, platform, contestType);
        const ptsGain = upgradePts - currentPts;
        const costIncrease = upgrade.salary - currentSalary;
        
        const newTotalSalary = totalSalary + costIncrease;
        if (newTotalSalary <= salaryCap) {
          console.log(`[Gary Self-Review] ⬆️ CLEAR UPGRADE: ${worstValueSpot.player} → ${upgrade.name} (+${ptsGain.toFixed(1)} pts, +$${costIncrease})`);
          
          const idx = currentLineup.findIndex(p => p.player === worstValueSpot.player);
          if (idx !== -1) {
            currentLineup[idx] = {
              ...currentLineup[idx],
              player: upgrade.name,
              team: upgrade.team,
              salary: upgrade.salary,
              projected_pts: upgradePts
            };
            totalSalary = newTotalSalary;
            totalPts += ptsGain;
          }
        }
      }
    }
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // ROUND 2: OWNERSHIP ANALYSIS
  // ═══════════════════════════════════════════════════════════════════════════
  // Calculate total lineup ownership and identify chalk/contrarian plays
  console.log(`[Gary Self-Review] 🎯 Round 2: Ownership analysis...`);
  
  // Get ownership data for current lineup players
  for (const lineupPlayer of currentLineup) {
    const poolPlayer = playerPool.find(p => p.name === lineupPlayer.player);
    if (poolPlayer) {
      lineupPlayer.ownership = poolPlayer.ownership || lineupPlayer.ownership || 15;
      lineupPlayer.ceilingScore = poolPlayer.ceilingScore || lineupPlayer.ceilingScore || lineupPlayer.projected_pts * 1.2;
      lineupPlayer.isChalk = lineupPlayer.ownership >= 25;
      lineupPlayer.isContrarian = lineupPlayer.ownership < 10;
    }
  }
  
  // Calculate total lineup ownership
  let totalOwnership = currentLineup.reduce((sum, p) => sum + (p.ownership || 15), 0);
  
  // Count ownership breakdown
  const chalkPlays = currentLineup.filter(p => (p.ownership || 15) >= 25);
  const contrarianPlays = currentLineup.filter(p => (p.ownership || 15) < 10);
  const rosterSize = currentLineup.length;
  
  console.log(`[Gary Self-Review] Total ownership: ${totalOwnership.toFixed(1)}%`);
  console.log(`[Gary Self-Review] Breakdown: ${chalkPlays.length} chalk (>25%), ${contrarianPlays.length} contrarian (<10%), ${rosterSize - chalkPlays.length - contrarianPlays.length} moderate`);
  
  // Log ownership awareness for Gary
  if (isGPP && totalOwnership > 130) {
    console.log(`[Gary Self-Review] 📊 High ownership lineup (${totalOwnership.toFixed(1)}%) - these players must smash to differentiate`);
  } else if (isGPP && totalOwnership < 100) {
    console.log(`[Gary Self-Review] 🎲 Contrarian lineup (${totalOwnership.toFixed(1)}%) - high leverage if hits ceiling`);
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // OWNERSHIP AWARENESS (No Forced Pivots)
  // ═══════════════════════════════════════════════════════════════════════════
  // Gary doesn't force pivots based on ownership caps. He simply logs the data
  // for awareness. Ownership is ONE factor among many (projection, ceiling, etc.)
  if (false) { // Disabled: No forced ownership pivots
    console.log(`[Gary Self-Review] ⚠️ Round 3: CHALK PIVOT - ownership ${totalOwnership.toFixed(1)}% (DISABLED - awareness only)`);
    
    // Sort chalk plays by ownership (highest first = best to swap out)
    const chalkSorted = [...chalkPlays]
      .filter(p => !p.forcedLock) // 🛡️ NEVER pivot confirmed starters (BDL lock)
      .sort((a, b) => (b.ownership || 0) - (a.ownership || 0));
    
    let pivotsMade = 0;
    const maxPivots = 2; // Limit pivots to avoid over-optimization
    
    for (const chalkPlayer of chalkSorted) {
      if (totalOwnership <= GPP_OWNERSHIP_CAP) break;
      if (pivotsMade >= maxPivots) break;
      
      // Find lower-owned alternative with similar ceiling
      const chalkCeiling = chalkPlayer.ceilingScore || chalkPlayer.projected_pts * 1.2;
      const chalkSalary = chalkPlayer.salary || 5000;
      const chalkOwnership = chalkPlayer.ownership || 25;
      
      // ═══════════════════════════════════════════════════════════════════════════
      // FLEXIBLE PIVOT SEARCH - Willing to trade some ceiling for ownership leverage
      // ═══════════════════════════════════════════════════════════════════════════
      // GPP math: A 10% ownership advantage can be worth 3-5 projection points
      // because you're sharing the win with fewer lineups if you hit.
      // 
      // The key insight: It's better to have a 45-ceiling player at 8% ownership
      // than a 50-ceiling player at 30% ownership in large-field GPPs.
      // ═══════════════════════════════════════════════════════════════════════════
      const alternatives = playerPool.filter(p => {
        if (p.name === chalkPlayer.player) return false;
        if (currentLineup.some(l => l.player === p.name)) return false;
        if (p.status === 'OUT' || p.status === 'DOUBTFUL') return false;
        
        const altOwnership = p.ownership || 15;
        const altCeiling = p.ceilingScore || (p.projected_pts || 0) * 1.2;
        const altSalary = p.salary || 5000;
        
        // Must be meaningfully lower ownership (at least 8% less)
        const ownershipGain = chalkOwnership - altOwnership;
        if (ownershipGain < 8) return false;
        
        // Allow ceiling tradeoff proportional to ownership gain
        // For every 5% ownership saved, accept up to 2 pts of ceiling loss
        const allowedCeilingLoss = (ownershipGain / 5) * 2;
        const ceilingLoss = chalkCeiling - altCeiling;
        if (ceilingLoss > allowedCeilingLoss) return false;
        
        // Must fit salary (more flexible - within $2500, or if cheaper that's fine)
        const salaryDiff = altSalary - chalkSalary;
        const currentTotal = currentLineup.reduce((sum, p) => sum + (p.salary || 0), 0);
        const wouldExceedCap = currentTotal + salaryDiff > salaryCap;
        if (salaryDiff > 2500 || wouldExceedCap) return false;
        
        // Check position eligibility (universal logic)
        const playerPos = (p.position || '').toUpperCase();
        const slotPos = chalkPlayer.position?.toUpperCase();
        const canFill = playerPos === slotPos || 
          (slotPos === 'FLEX' && ['RB', 'WR', 'TE'].includes(playerPos)) ||
          (slotPos === 'UTIL') || // UTIL can take anyone
          (slotPos === 'G' && ['PG', 'SG', 'G', 'G-F', 'F-G'].includes(playerPos)) ||
          (slotPos === 'F' && ['SF', 'PF', 'F', 'F-G', 'G-F', 'F-C', 'C-F'].includes(playerPos));
        
        return canFill;
      }).sort((a, b) => {
        // Score = ceiling - (ownership * 0.3) - prioritize low ownership with good ceiling
        const scoreA = (a.ceilingScore || (a.projected_pts || 0) * 1.2) - ((a.ownership || 15) * 0.3);
        const scoreB = (b.ceilingScore || (b.projected_pts || 0) * 1.2) - ((b.ownership || 15) * 0.3);
        return scoreB - scoreA;
      });
      
      if (alternatives.length > 0) {
        const alt = alternatives[0];
        const altOwnership = alt.ownership || 15;
        const ownershipSaved = chalkOwnership - altOwnership;
        
        // Apply the swap
        const idx = currentLineup.findIndex(p => p.player === chalkPlayer.player);
        if (idx !== -1) {
          const oldPlayer = currentLineup[idx].player;
          const salaryDiff = (alt.salary || 5000) - chalkSalary;
          
          currentLineup[idx] = {
            ...currentLineup[idx],
            player: alt.name,
            team: alt.team,
            salary: alt.salary || 5000,
            projected_pts: alt.projected_pts || alt.ceilingScore,
            ceilingScore: alt.ceilingScore,
            ownership: altOwnership,
            isChalk: false,
            isContrarian: altOwnership < 10,
            chalkPivot: true // Flag that this was a leverage swap
          };
          
          totalOwnership -= ownershipSaved;
          totalSalary += salaryDiff;
          pivotsMade++;
          
          console.log(`[Gary Self-Review] 🔄 CHALK PIVOT: ${oldPlayer} (${chalkOwnership}%) → ${alt.name} (${altOwnership}%) | Saved ${ownershipSaved.toFixed(1)}% ownership`);
        }
      }
    }
    
    if (pivotsMade > 0) {
      console.log(`[Gary Self-Review] ✅ Made ${pivotsMade} chalk pivots, new ownership: ${totalOwnership.toFixed(1)}%`);
    } else {
      console.log(`[Gary Self-Review] ℹ️ No suitable chalk pivots found - lineup stays as-is`);
    }
  }
  
  // Log any contrarian picks Gary made organically (bonus for tournament differentiation)
  const finalContrarian = currentLineup.filter(p => (p.ownership || 15) < 10);
  if (finalContrarian.length > 0) {
    console.log(`[Gary Self-Review] 🎲 Contrarian picks: ${finalContrarian.map(p => `${p.player} (${p.ownership || 15}%)`).join(', ')}`);
  }
  
  // Recalculate totals
  totalSalary = currentLineup.reduce((sum, p) => sum + (p.salary || 0), 0);
  totalPts = currentLineup.reduce((sum, p) => sum + (p.projected_pts || 0), 0);
  totalOwnership = currentLineup.reduce((sum, p) => sum + (p.ownership || 15), 0);
  
  console.log(`[Gary Self-Review] ✅ Final: $${totalSalary}/${salaryCap} | ${totalPts.toFixed(1)} pts | ${totalOwnership.toFixed(1)}% ownership\n`);
  
  return {
    lineup: currentLineup,
    totalSalary,
    projectedPoints: totalPts,
    totalOwnership
  };
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * PUNT VALIDATION - Prevent "Fragile Floor" Lineups
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Validates that lineup doesn't have too many minimum-salary players.
 * Too many punts = if one player duds (8 points), entire lineup collapses.
 * 
 * Example failure: 4 players at $3,800 = need 6.5x value from ALL to hit 390 pts
 * If ONE gets 12 pts instead of 25, you need other players to score 95 each.
 * 
 * @param {Array} lineup - Lineup slots
 * @param {string} platform - 'draftkings' or 'fanduel'
 * @param {string} contestType - 'gpp' or 'cash'
 * @returns {Object} { valid: boolean, error: string, puntPlayers: Array }
 */
export function validatePuntCount(lineup, platform, contestType = 'gpp') {
  const threshold = PUNT_SALARY_THRESHOLD[platform] || 4500;
  const maxPunts = MAX_PUNTS_PER_LINEUP[contestType] || 2;
  const MIN_MPG_FOR_PUNTS = 18; // Punts must have 18+ MPG unless injury boost
  
  const puntPlayers = lineup.filter(slot => slot.salary < threshold);
  const puntCount = puntPlayers.length;
  
  // ═══════════════════════════════════════════════════════════════════════════
  // MPG FILTER: Flag punts with insufficient minutes history
  // A player averaging <18 MPG with no injury boost = high bust risk
  // ═══════════════════════════════════════════════════════════════════════════
  const riskyPunts = puntPlayers.filter(p => {
    const mpg = p.mpg || p.seasonStats?.mpg || 0;
    const hasInjuryBoost = p.usageBoost || p.teammateOpportunity || p.injuryBeneficiary;
    const isRookie = !p.seasonStats?.ppg && !p.l5Stats?.ppg; // No historical stats = rookie
    
    // Risky if: low MPG AND no injury boost AND not a known quantity
    return mpg < MIN_MPG_FOR_PUNTS && !hasInjuryBoost && isRookie;
  });
  
  if (riskyPunts.length > 0) {
    console.log(`[Punt Validation] ⚠️ RISKY PUNTS (${riskyPunts.length}): ${riskyPunts.map(p => `${p.player} (${(p.mpg || p.seasonStats?.mpg || 0).toFixed(0)} MPG)`).join(', ')}`);
  }
  
  if (puntCount > maxPunts) {
    return {
      valid: false,
      puntCount, // Include puntCount for self-heal logic
      error: `FRAGILE FLOOR: ${puntCount} punt plays (max: ${maxPunts}). Replace cheap players with mid-range ($5k-$7k) for higher floor.`,
      puntPlayers: puntPlayers.map(p => ({ 
        name: p.player, 
        salary: p.salary, 
        position: p.position,
        mpg: p.mpg || p.seasonStats?.mpg || 0,
        isRisky: riskyPunts.some(rp => rp.player === p.player)
      })),
      riskyPunts: riskyPunts.map(p => p.player),
      suggestion: `Downgrade a star and upgrade ${puntCount - maxPunts} punt player(s)${riskyPunts.length > 0 ? ` - prioritize replacing: ${riskyPunts.map(p => p.player).join(', ')}` : ''}`
    };
  }
  
  return { 
    valid: true, 
    puntCount,
    puntPlayers: puntPlayers.map(p => ({ 
      name: p.player, 
      salary: p.salary, 
      position: p.position,
      mpg: p.mpg || p.seasonStats?.mpg || 0,
      isRisky: riskyPunts.some(rp => rp.player === p.player)
    })),
    riskyPunts: riskyPunts.map(p => p.player)
  };
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ANTI-CORRELATION DETECTION - Identify Conflicting Player Combinations
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Detects when you've stacked players who compete for same opportunities.
 * Example: Gui Santos + Trayce Jackson-Davis (both GSW bench)
 * - If Santos gets hot, coach leaves him in → Jackson-Davis sits
 * - If Jackson-Davis gets hot, Santos sits
 * - You're betting against yourself
 * 
 * @param {Array} lineup - Lineup slots
 * @param {string} sport - 'NBA' or 'NFL'
 * @returns {Object} { conflictScore: number, conflicts: Array }
 */
export function checkAntiCorrelation(lineup, sport = 'NBA') {
  let conflictScore = 0;
  const conflicts = [];
  
  for (let i = 0; i < lineup.length; i++) {
    for (let j = i + 1; j < lineup.length; j++) {
      const playerA = lineup[i];
      const playerB = lineup[j];
      
      for (const [ruleName, rule] of Object.entries(ANTI_CORRELATION_RULES)) {
        // Skip NFL-specific rules if NBA, and vice versa
        if (sport === 'NBA' && ruleName.includes('rb')) continue;
        if (sport === 'NFL' && ruleName.includes('bench_conflict')) continue;
        
        if (rule.check(playerA, playerB)) {
          conflictScore += rule.penalty;
          conflicts.push({
            players: [playerA.player, playerB.player],
            teams: [playerA.team, playerB.team],
            positions: [playerA.position, playerB.position],
            penalty: rule.penalty,
            reason: rule.reason,
            ruleName: rule.name
          });
          
          console.log(`[Anti-Correlation] ⚠️ ${rule.name}: ${playerA.player} + ${playerB.player} (${rule.reason})`);
        }
      }
    }
  }
  
  return { 
    conflictScore, 
    conflicts,
    hasConflicts: conflicts.length > 0
  };
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * CHALK FADE STRATEGY - Tournament Leverage Play
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * In large tournaments, if everyone plays the same "chalk" (high-owned players),
 * you can only win if EVERYONE in your lineup pops off.
 * 
 * Better strategy: Fade ONE chalk play for a contrarian alternative.
 * - If chalk busts → you're ahead of 50% of field
 * - If chalk hits → your contrarian better hit too, but you have differentiation
 * 
 * Example: Jalen Johnson at 50% ownership
 * - If he scores 45 instead of 73 → 50% of field is eliminated
 * - Pivoting to SGA (20% owned) creates leverage
 * 
 * @param {Array} playerPool - All available players
 * @param {Array} lineup - Current lineup
 * @param {string} contestType - 'gpp' or 'cash'
 * @returns {Object} { shouldFade: boolean, fadeCandidate: Object, alternative: Object }
 */
export function applyChalkFadeStrategy(playerPool, lineup, contestType = 'gpp') {
  if (contestType !== 'gpp') {
    return { shouldFade: false, reason: 'Only for GPP tournaments' };
  }
  
  // Find chalk players in lineup (>30% ownership)
  const chalkPlayers = lineup.filter(slot => (slot.ownership || 0) > 30);
  
  if (chalkPlayers.length <= 1) {
    return { shouldFade: false, reason: 'Acceptable chalk level (<= 1 player)' };
  }
  
  console.log(`[Chalk Fade] ⚠️ ${chalkPlayers.length} chalk plays detected (>30% owned)`);
  
  // Sort chalk by ownership (highest first)
  const highestChalk = chalkPlayers.sort((a, b) => (b.ownership || 0) - (a.ownership || 0))[0];
  
  // Find contrarian alternative (<15% owned, similar salary)
  const contrarianAlternatives = playerPool.filter(p => 
    p.position === highestChalk.position &&
    Math.abs(p.salary - highestChalk.salary) < 1500 &&
    (p.ownership || 15) < 15 &&
    (p.projected_pts || 0) >= (highestChalk.projected_pts || 0) * 0.85 && // At least 85% projection
    p.name !== highestChalk.player // Don't suggest swapping to same player
  ).sort((a, b) => (b.projected_pts || 0) - (a.projected_pts || 0));
  
  if (contrarianAlternatives.length > 0) {
    const alternative = contrarianAlternatives[0];
    
    console.log(`[Chalk Fade] 💡 LEVERAGE OPPORTUNITY:`);
    console.log(`   Fade: ${highestChalk.player} (${highestChalk.ownership}% owned, ${highestChalk.projected_pts} pts)`);
    console.log(`   Play: ${alternative.name} (${alternative.ownership || 'N/A'}% owned, ${alternative.projected_pts} pts)`);
    
    return {
      shouldFade: true,
      fadeCandidate: {
        name: highestChalk.player,
        salary: highestChalk.salary,
        ownership: highestChalk.ownership,
        projectedPts: highestChalk.projected_pts
      },
      alternative: {
        name: alternative.name,
        salary: alternative.salary,
        ownership: alternative.ownership || 10,
        projectedPts: alternative.projected_pts
      },
      leverageReason: `If ${highestChalk.player} has a mediocre game, ${Math.round(highestChalk.ownership)}% of field is eliminated. This pivot creates differentiation while maintaining similar ceiling.`
    };
  }
  
  return { 
    shouldFade: false, 
    reason: 'No suitable contrarian alternatives found',
    chalkCount: chalkPlayers.length
  };
}

/**
 * Validate a lineup meets all constraints
 * @param {Object} lineup - Lineup to validate
 * @param {string} platform - Platform name
 * @param {string} sport - Sport name
 * @returns {Object} { valid: boolean, errors: string[] }
 */
export function validateLineup(lineup, platform, sport) {
  const constraints = PLATFORM_CONSTRAINTS[platform]?.[sport];
  if (!constraints) {
    return { valid: false, errors: ['Invalid platform/sport combination'] };
  }
  
  const errors = [];
  
  // Check roster size
  if (lineup.lineup.length !== constraints.rosterSize) {
    errors.push(`Invalid roster size: ${lineup.lineup.length} (expected ${constraints.rosterSize})`);
  }
  
  // Check salary cap
  if (lineup.total_salary > constraints.salaryCap) {
    errors.push(`Exceeds salary cap: $${lineup.total_salary} (cap: $${constraints.salaryCap})`);
  }
  
  // Check position counts
  const positionCounts = {};
  for (const slot of lineup.lineup) {
    positionCounts[slot.position] = (positionCounts[slot.position] || 0) + 1;
  }
  
  // Verify expected positions
  const expectedPositions = {};
  for (const pos of constraints.positions) {
    expectedPositions[pos] = (expectedPositions[pos] || 0) + 1;
  }
  
  for (const [pos, count] of Object.entries(expectedPositions)) {
    if (positionCounts[pos] !== count) {
      errors.push(`Position ${pos}: have ${positionCounts[pos] || 0}, expected ${count}`);
    }
  }
  
  return {
    valid: errors.length === 0,
    errors
  };
}

// Export position helpers for testing
export { isPositionEligible, getPlayerEligibleSlots, getEligibleSlots };

export default {
  PLATFORM_CONSTRAINTS,
  LINEUP_ARCHETYPES,
  GARY_SHARP_KNOWLEDGE,
  GPP_VALUE_TARGETS,
  calculateProjectedPoints,
  calculateCeilingScore,
  calculateFloorScore,
  calculateValueScore,
  calculateDFSMetrics,
  calculateOpportunityScore,
  calculateGPPValueTarget,
  applyOpportunityBoost,
  isSmashSpot,
  findPivotAlternatives,
  optimizeLineup,
  applyNFLStackingRules,
  addPivotsToLineup,
  generateDFSLineup,
  selfReviewLineup,
  validateLineup,
  validatePuntCount,
  checkAntiCorrelation,
  applyChalkFadeStrategy,
  // Build analysis (non-prescriptive awareness)
  identifyBuildType,
  reflectOnBuild,
  generateReflectionNotes,
  // Position eligibility helpers
  isPositionEligible,
  getPlayerEligibleSlots,
  getEligibleSlots
};

