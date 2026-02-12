/**
 * DFS Agentic Orchestrator
 *
 * This is the MAIN entry point for Gary's DFS lineup generation.
 * Unlike the old mathematical optimizer, this system has Gary (Gemini Pro)
 * actually REASON about lineup decisions.
 *
 * FLOW:
 * 1. Context Building (existing dfsAgenticContext.js)
 * 2. Slate Analysis (Gemini Flash investigates the slate)
 * 3. Build Thesis Formation (Gemini Pro forms strategy)
 * 4. Player Investigation (Gemini Flash per position)
 * 5. Lineup Decision (Gemini Pro with thinkingLevel: HIGH)
 * 6. Self-Audit (Gemini Pro reviews his choices)
 *
 * FOLLOWS CLAUDE.md:
 * - Gary INVESTIGATES before deciding (not formulas)
 * - Gary has AWARENESS of sharp strategies (from FIBLE)
 * - Gary DECIDES with conviction (not rules)
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import { analyzeSlateWithFlash } from './dfsAgenticSlateAnalyzer.js';
import { formBuildThesis } from './dfsAgenticThesisBuilder.js';
import { investigatePlayersForPositions } from './dfsAgenticPlayerInvestigator.js';
import { decideLineupWithPro } from './dfsAgenticLineupDecider.js';
import { auditLineupWithPro } from './dfsAgenticAudit.js';
import { getDFSConstitution } from './constitution/dfsAgenticConstitution.js';
import { WINNING_SCORE_TARGETS } from '../FIBLE.js';
import { buildDFSContext } from '../dfsAgenticContext.js';

// ═══════════════════════════════════════════════════════════════════════════════
// GEMINI MODEL CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════════

const GEMINI_FLASH_MODEL = process.env.GEMINI_FLASH_MODEL || 'gemini-3-flash-preview';
const GEMINI_PRO_MODEL = process.env.GEMINI_PRO_MODEL || 'gemini-3-pro-preview';

function getGeminiClient() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY not set');
  }
  return new GoogleGenerativeAI(apiKey);
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN ORCHESTRATOR
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Generate a DFS lineup using Gary's agentic reasoning
 *
 * @param {Object} options
 * @param {string} options.platform - 'draftkings' or 'fanduel'
 * @param {string} options.sport - 'NBA', 'NFL', etc.
 * @param {string} options.date - Date string (YYYY-MM-DD)
 * @param {Object} options.slate - Slate info (name, games, lock time)
 * @param {string} options.contestType - 'gpp' or 'cash'
 * @returns {Object} - Gary's lineup with reasoning
 */
export async function generateAgenticDFSLineup(options) {
  // Support both 'date' and 'slateDate' parameter names
  const { platform, sport, date, slateDate, slate, contestType = 'gpp', context: passedContext } = options;
  const effectiveDate = date || slateDate;
  const startTime = Date.now();

  console.log('\n═══════════════════════════════════════════════════════════════════════════════');
  console.log('[Gary DFS] Starting Agentic Lineup Generation');
  console.log(`[Gary DFS] Platform: ${platform} | Sport: ${sport} | Slate: ${slate?.name || 'Main'}`);
  console.log('═══════════════════════════════════════════════════════════════════════════════\n');

  const genAI = getGeminiClient();

  try {
    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 1: BUILD CONTEXT (Data Gathering)
    // ═══════════════════════════════════════════════════════════════════════════

    // Use pre-built context if provided, otherwise build it
    let context;
    if (passedContext && passedContext.players && passedContext.players.length > 0) {
      console.log('[Gary DFS] Phase 1: Using pre-built context...');
      context = passedContext;
    } else {
      console.log('[Gary DFS] Phase 1: Building comprehensive context...');
      context = await buildDFSContext(platform, sport, effectiveDate, slate);
    }

    if (!context.players || context.players.length === 0) {
      throw new Error('No players found for this slate');
    }

    console.log(`[Gary DFS] ✓ Found ${context.players.length} players across ${context.games?.length || 0} games`);

    // Add winning score targets for Gary's awareness
    const winningTargets = getWinningTargets(platform, sport, contestType, slate);
    context.winningTargets = winningTargets;

    console.log(`[Gary DFS] ✓ Target to WIN: ${winningTargets.toWin} pts | Cash line: ${winningTargets.toCash} pts`);

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 2: SLATE ANALYSIS (Gemini Flash)
    // ═══════════════════════════════════════════════════════════════════════════
    console.log('\n[Gary DFS] Phase 2: Gary Flash analyzing the slate...');

    const slateAnalysis = await analyzeSlateWithFlash(genAI, context, {
      modelName: GEMINI_FLASH_MODEL
    });

    // NO FALLBACKS: Validate slate analysis succeeded
    if (!slateAnalysis) {
      throw new Error('[Gary DFS] Phase 2 FAILED: Slate analysis returned null');
    }

    console.log(`[Gary DFS] ✓ Identified ${slateAnalysis.usageVacuums?.length || 0} usage vacuums`);
    console.log(`[Gary DFS] ✓ Identified ${slateAnalysis.stackTargets?.length || 0} stack targets`);
    console.log(`[Gary DFS] ✓ Identified ${slateAnalysis.priceLags?.length || 0} price lag opportunities`);

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 3: BUILD THESIS (Gemini Pro)
    // ═══════════════════════════════════════════════════════════════════════════
    console.log('\n[Gary DFS] Phase 3: Gary Pro forming build thesis...');

    const buildThesis = await formBuildThesis(genAI, slateAnalysis, context, {
      modelName: GEMINI_PRO_MODEL,
      constitution: getDFSConstitution(sport, contestType)
    });

    // NO FALLBACKS: Validate Gary Pro formed a real thesis
    if (!buildThesis || !buildThesis.archetype || !buildThesis.thesis) {
      throw new Error('[Gary DFS] Phase 3 FAILED: Gary Pro did not produce valid build thesis');
    }

    console.log(`[Gary DFS] ✓ Build Archetype: ${buildThesis.archetype}`);
    console.log(`[Gary DFS] ✓ Target Games: ${buildThesis.targetGames?.join(', ') || 'Balanced'}`);
    console.log(`[Gary DFS] ✓ Thesis: "${buildThesis.thesis?.slice(0, 100)}..."`);

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 4: PLAYER INVESTIGATION (Gemini Flash per position)
    // ═══════════════════════════════════════════════════════════════════════════
    console.log('\n[Gary DFS] Phase 4: Gary Flash investigating player candidates...');

    const playerInvestigations = await investigatePlayersForPositions(genAI, buildThesis, context, {
      modelName: GEMINI_FLASH_MODEL
    });

    // NO FALLBACKS: Validate player investigations completed
    if (!playerInvestigations || Object.keys(playerInvestigations).length === 0) {
      throw new Error('[Gary DFS] Phase 4 FAILED: Gary Flash did not investigate any players');
    }

    const investigatedCount = Object.values(playerInvestigations).flat().length;
    if (investigatedCount === 0) {
      throw new Error('[Gary DFS] Phase 4 FAILED: Zero players investigated across all positions');
    }
    console.log(`[Gary DFS] ✓ Investigated ${investigatedCount} players across all positions`);

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 5: LINEUP DECISION (Gemini Pro with thinkingLevel: HIGH)
    // ═══════════════════════════════════════════════════════════════════════════
    console.log('\n[Gary DFS] Phase 5: Gary Pro making lineup decisions...');

    const lineup = await decideLineupWithPro(genAI, buildThesis, playerInvestigations, context, {
      modelName: GEMINI_PRO_MODEL,
      thinkingLevel: 'high'
    });

    // NO FALLBACKS: Validate Gary Pro built a complete lineup
    if (!lineup || !lineup.players || lineup.players.length === 0) {
      throw new Error('[Gary DFS] Phase 5 FAILED: Gary Pro did not produce any lineup');
    }

    const expectedPlayers = platform?.toLowerCase() === 'fanduel' ? 9 : 8;
    if (lineup.players.length !== expectedPlayers) {
      throw new Error(`[Gary DFS] Phase 5 FAILED: Lineup has ${lineup.players.length} players, need ${expectedPlayers}`);
    }

    console.log(`[Gary DFS] ✓ Selected ${lineup.players.length} players`);
    console.log(`[Gary DFS] ✓ Total Salary: $${lineup.totalSalary?.toLocaleString()}`);
    console.log(`[Gary DFS] ✓ Projected Ceiling: ${lineup.ceilingProjection} pts`);

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 6: SELF-AUDIT (Gemini Pro)
    // ═══════════════════════════════════════════════════════════════════════════
    console.log('\n[Gary DFS] Phase 6: Gary Pro auditing his lineup...');

    const auditedLineup = await auditLineupWithPro(genAI, lineup, buildThesis, context, {
      modelName: GEMINI_PRO_MODEL
    });

    // NO FALLBACKS: Validate Gary Pro completed the audit
    if (!auditedLineup || !auditedLineup.players || auditedLineup.players.length === 0) {
      throw new Error('[Gary DFS] Phase 6 FAILED: Audit resulted in empty lineup');
    }

    console.log(`[Gary DFS] ✓ Audit complete`);
    if (auditedLineup.adjustments?.length > 0) {
      console.log(`[Gary DFS] ✓ Made ${auditedLineup.adjustments.length} post-audit adjustments`);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // FORMAT FINAL OUTPUT
    // ═══════════════════════════════════════════════════════════════════════════
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

    const result = {
      // Core lineup data
      lineup: auditedLineup.players,
      totalSalary: auditedLineup.totalSalary,
      projectedPoints: auditedLineup.projectedPoints,
      ceilingProjection: auditedLineup.ceilingProjection,
      floorProjection: auditedLineup.floorProjection,

      // Gary's reasoning (the key differentiator)
      buildThesis: buildThesis.thesis,
      archetype: buildThesis.archetype,
      garyNotes: auditedLineup.garyNotes,
      ceilingScenario: auditedLineup.ceilingScenario,

      // Per-player reasoning
      perPlayerReasoning: auditedLineup.perPlayerReasoning,

      // Audit results
      auditNotes: auditedLineup.auditNotes,

      // Targets
      winningTargets,

      // Metadata
      platform,
      sport,
      slate: slate?.name || 'Main',
      contestType,
      generatedAt: new Date().toISOString(),
      generationTime: `${elapsed}s`
    };

    // FINAL VALIDATION: Ensure we have a real, complete lineup
    if (!result.lineup || result.lineup.length === 0) {
      throw new Error('[Gary DFS] FINAL CHECK FAILED: No players in final lineup');
    }

    if (!result.totalSalary || result.totalSalary <= 0) {
      throw new Error('[Gary DFS] FINAL CHECK FAILED: Invalid salary total');
    }

    console.log('\n═══════════════════════════════════════════════════════════════════════════════');
    console.log(`[Gary DFS] ✅ Lineup complete in ${elapsed}s`);
    console.log(`[Gary DFS] Ceiling: ${result.ceilingProjection} pts`);
    console.log('═══════════════════════════════════════════════════════════════════════════════\n');

    return result;

  } catch (error) {
    console.error('[Gary DFS] ❌ Error generating lineup:', error.message);
    throw error;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// HELPER: Get winning score targets from FIBLE
// ═══════════════════════════════════════════════════════════════════════════════

function getWinningTargets(platform, sport, contestType, slate) {
  const platformKey = platform.toUpperCase() === 'FANDUEL' ? 'FANDUEL_NBA' : 'DRAFTKINGS_NBA';
  const targets = WINNING_SCORE_TARGETS[platformKey];

  if (!targets) {
    // Default targets if not in FIBLE
    return {
      toWin: 380,
      top1Percent: 355,
      toCash: 285,
      slateMultiplier: 1.0
    };
  }

  // Determine slate size multiplier
  const gameCount = slate?.gameCount || slate?.games?.length || 8;
  let slateMultiplier = 1.0;

  if (gameCount >= 10) {
    slateMultiplier = WINNING_SCORE_TARGETS.SLATE_ADJUSTMENTS.LARGE_SLATE.multiplier;
  } else if (gameCount >= 6) {
    slateMultiplier = WINNING_SCORE_TARGETS.SLATE_ADJUSTMENTS.MEDIUM_SLATE.multiplier;
  } else if (gameCount >= 3) {
    slateMultiplier = WINNING_SCORE_TARGETS.SLATE_ADJUSTMENTS.SMALL_SLATE.multiplier;
  } else {
    slateMultiplier = WINNING_SCORE_TARGETS.SLATE_ADJUSTMENTS.SHOWDOWN.multiplier;
  }

  // Get contest-specific targets
  const contestTargets = contestType === 'cash'
    ? targets.CASH
    : targets.LARGE_GPP;

  return {
    toWin: Math.round((contestTargets.firstPlace?.typical || 385) * slateMultiplier),
    top1Percent: Math.round((contestTargets.top1Percent?.typical || 355) * slateMultiplier),
    toCash: Math.round((contestTargets.cashLine?.typical || 285) * slateMultiplier),
    slateMultiplier,
    gameCount
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════════

export default {
  generateAgenticDFSLineup
};
