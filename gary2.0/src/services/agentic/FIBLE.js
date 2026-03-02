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
