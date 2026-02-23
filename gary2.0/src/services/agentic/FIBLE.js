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
 * HOW GARY SHOULD USE THE FIBLE
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * The FIBLE is NOT a set of hard rules to follow blindly.
 * It is a KNOWLEDGE BASE of questions to ask and patterns to investigate.
 *
 * WRONG: "Player is on -10 favorite -> Apply 15% penalty"
 * RIGHT: "Player is on -10 favorite -> INVESTIGATE:
 *         - What does the data show about this player's situation on a heavy favorite?
 *         - Is blowout risk real for THIS specific matchup tonight?
 *         - What do recent game scripts reveal about how the team manages leads?
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
 * Contains:
 * - Winning score targets by platform/sport/contest type
 * - Investigation question framework (player, game, lineup, audit)
 * - Gary's DFS philosophy
 *
 * @module sharpDFSPlaybook_SOTA
 * @version 3.0.0
 */

// ============================================================================
// WINNING SCORE TARGETS (Updated 2024-2025)
// ============================================================================

export const WINNING_SCORE_TARGETS = {

  DRAFTKINGS_NBA: {
    LARGE_GPP: {
      firstPlace: { min: 370, typical: 385, ceiling: 420 },
      top1Percent: { min: 340, typical: 355 },
      top10Percent: { min: 300, typical: 315 },
      cashLine: { min: 270, typical: 285 },

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

      captainContext: {
        typicalCaptainOutputRange: '55-80 raw points (82.5-120 with 1.5x)',
        highOwnershipThreshold: 25,
      }
    },

    CASH: {
      cashLine: { min: 260, typical: 275 },
      safeTarget: 285,
    }
  },

  FANDUEL_NBA: {
    LARGE_GPP: {
      firstPlace: { min: 380, typical: 400 },
      top1Percent: { min: 350, typical: 365 },
      cashLine: { min: 280, typical: 295 }
    },
    SMALL_GPP: {
      firstPlace: { min: 360, typical: 380 },
      top1Percent: { min: 340, typical: 355 },
      cashLine: { min: 270, typical: 285 },
    },
    SHOWDOWN: {
      firstPlace: { min: 190, typical: 210 },
      top1Percent: { min: 175, typical: 185 },
      cashLine: { min: 150, typical: 160 },
    },
    CASH: {
      cashLine: { min: 270, typical: 290 },
      safeTarget: 300,
    }
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
    }
  },

  FANDUEL_NFL: {
    LARGE_GPP: {
      firstPlace: { min: 195, typical: 215 },
      top1Percent: { min: 180, typical: 195 },
      cashLine: { min: 135, typical: 150 }
    },
    SMALL_GPP: {
      firstPlace: { min: 185, typical: 200 },
      top1Percent: { min: 170, typical: 185 },
      cashLine: { min: 130, typical: 140 },
    },
    CASH: {
      cashLine: { min: 125, typical: 140 },
      safeTarget: 150,
    }
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
    }
  },

  FANDUEL_NHL: {
    LARGE_GPP: {
      firstPlace: { min: 55, typical: 65 },
      top1Percent: { min: 48, typical: 55 },
      cashLine: { min: 35, typical: 42 }
    },
    SMALL_GPP: {
      firstPlace: { min: 50, typical: 58 },
      top1Percent: { min: 43, typical: 50 },
      cashLine: { min: 32, typical: 38 },
    },
    CASH: {
      cashLine: { min: 30, typical: 37 },
      safeTarget: 42,
    }
  },

  SLATE_ADJUSTMENTS: {
    LARGE_SLATE: { games: '10+', multiplier: 1.0 },
    MEDIUM_SLATE: { games: '6-9', multiplier: 0.97 },
    SMALL_SLATE: { games: '3-5', multiplier: 0.94 },
    SHOWDOWN: { games: '1-2', multiplier: 0.55 }
  }
};

// ============================================================================
// GARY'S INVESTIGATION FRAMEWORK
// ============================================================================

/**
 * These are QUESTIONS to investigate, NOT rules to apply blindly.
 * Gary should use BDL stats and Gemini grounding to VERIFY each situation.
 */
export const GARY_INVESTIGATION_QUESTIONS = {

  PLAYER_QUESTIONS: [
    {
      question: "Is this player's recent form sustainable or an anomaly?",
      howToVerify: "Investigate the player's recent data. What's driving the trend — and is the cause temporary or structural?",
      whatToLookFor: "Ask: Is the recent performance driven by something that will be present tonight, or something that won't?"
    },
    {
      question: "Is the ownership projection accurate for this player?",
      howToVerify: "Investigate the likely ownership landscape for tonight's slate.",
      whatToLookFor: "Ask: What's driving the projected ownership for this player? Is it based on tonight's situation or something else?"
    },
    {
      question: "Does this player have a real path to ceiling tonight?",
      howToVerify: "Investigate the opponent's defensive profile and the game environment data.",
      whatToLookFor: "Ask: What does the data show about this player's path to a ceiling game tonight? What would need to happen?"
    },
    {
      question: "Is there an injury or rotation change affecting this player?",
      howToVerify: "Investigate the latest injury data and team context.",
      whatToLookFor: "Ask: How has this player's role and production changed in recent games? What does the data show about the current team situation?"
    }
  ],

  GAME_QUESTIONS: [
    {
      question: "Is this game total (O/U) accurate or has it moved?",
      howToVerify: "Investigate whether the line has moved and what might be driving the change.",
      whatToLookFor: "Ask: What does the line movement tell you about how the market views this game?"
    },
    {
      question: "Is blowout risk REAL for this specific matchup?",
      howToVerify: "Investigate the data for this specific matchup — recent results, home/away splits.",
      whatToLookFor: "Ask: Does this specific matchup have characteristics that make a blowout more or less likely than the spread implies?"
    },
    {
      question: "How does the game environment connect to the players on the slate?",
      howToVerify: "Investigate: How does this game's expected environment connect to the players available?",
      whatToLookFor: "Ask: What does the game environment suggest about the type of game likely to unfold, and which players' profiles fit?"
    }
  ],

  LINEUP_QUESTIONS: [
    {
      question: "Does my correlation make sense for tonight's slate?",
      howToVerify: "Investigate: What does the data show about the games you're stacking? Do the game environments support your thesis?",
      whatToLookFor: "Ask: What does the game environment data tell you about whether this game supports concentrated roster exposure?"
    },
    {
      question: "Are my value plays actually good value, or just cheap?",
      howToVerify: "Investigate: What does the data show about each low-salary player's current role and production level?",
      whatToLookFor: "Ask: For each value play, what does the data show about their path to production at this salary? Is there substance behind the price?"
    },
    {
      question: "Do I have a unique path to victory, or am I building the same lineup as everyone?",
      howToVerify: "Investigate: What does the likely field construction look like tonight? Where does your lineup diverge?",
      whatToLookFor: "Ask: Where is this lineup different from what the field will build? What happens if those differentiators hit — or miss?"
    }
  ],

  AUDIT_QUESTIONS: [
    {
      question: "How would you grade this lineup, and what drives that grade?",
      howToVerify: "Identify strengths and weaknesses. For each weakness, ask: Is this actually a problem for TONIGHT'S slate?",
      whatToLookFor: "Ask: For each weakness you identified, is it actually a problem tonight, or is there data that supports the construction?"
    },
    {
      question: "Can I improve this lineup without breaking something else?",
      howToVerify: "For each suggested swap, investigate whether the new player is actually better for this situation.",
      whatToLookFor: "Ask: For each swap you're considering, what specific data makes the new player a better fit for THIS lineup and THIS slate?"
    },
    {
      question: "Does my lineup tell a coherent story of how it wins?",
      howToVerify: "Explain in one sentence why this lineup could win tonight.",
      whatToLookFor: "Ask: Can you articulate the specific game conditions and player scenarios that lead to a winning score?"
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

    Good answer: "Based on my investigation, here's the specific data that supports this pick for tonight's slate."
    Bad answer: "This player scored high in my formula."
  `
};

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  WINNING_SCORE_TARGETS,
  GARY_INVESTIGATION_QUESTIONS,
  GARY_DFS_PHILOSOPHY
};
