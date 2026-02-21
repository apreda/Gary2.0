/**
 * DFS Agentic Orchestrator
 *
 * This is the MAIN entry point for Gary's DFS lineup generation.
 * Unlike the old mathematical optimizer, this system has Gary
 * actually REASON about lineup decisions using Gemini.
 *
 * FLOW:
 * 1. Context Building (existing dfsAgenticContext.js)
 * 2. Slate Analysis (Gemini investigates the slate via tool calling)
 * 3. Build Thesis Formation (Gemini forms strategy)
 * 4. Player Investigation (Gemini per position via tool calling)
 * 5. Lineup Decision (Gemini with thinkingLevel: HIGH)
 * 6. Self-Audit (Gemini reviews his choices)
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
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`[Gary DFS] ${label} timed out after ${ms / 1000}s`)), ms)
    )
  ]);
}

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

    // Guard: Fail if salary data is missing — lineup would be meaningless
    const realSalaryCount = context.players.filter(p => p.salary > 0 && !p.estimatedSalary).length;
    const salaryCoverage = realSalaryCount / context.players.length;
    if (salaryCoverage < 0.5) {
      throw new Error(`[Gary DFS] Salary data missing: only ${realSalaryCount}/${context.players.length} players have real salaries (${(salaryCoverage * 100).toFixed(0)}%). Tank01 may not cover this slate. Skipping to avoid invalid lineup.`);
    }

    console.log(`[Gary DFS] ✓ Found ${context.players.length} players across ${context.games?.length || 0} games`);

    // Add winning score targets for Gary's awareness
    const winningTargets = getWinningTargets(platform, sport, contestType, slate);
    context.winningTargets = winningTargets;

    console.log(`[Gary DFS] ✓ Target to WIN: ${winningTargets.toWin} pts | Cash line: ${winningTargets.toCash} pts`);

    // ═══════════════════════════════════════════════════════════════════════════
    // OWNERSHIP PROXY (GPP only)
    // No direct ownership data — use salary + situation as proxy for field
    // concentration. Gives Gary awareness of likely chalk vs leverage plays.
    // ═══════════════════════════════════════════════════════════════════════════
    if (contestType !== 'cash') {
      computeOwnershipProxy(context);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 2: SLATE ANALYSIS (Gemini → retry once on failure)
    // ═══════════════════════════════════════════════════════════════════════════
    console.log('\n[Gary DFS] Phase 2: Gary analyzing the slate...');

    let slateAnalysis;
    try {
      slateAnalysis = await withTimeout(
        analyzeSlateWithFlash(genAI, context, { modelName: GEMINI_FLASH_MODEL }),
        180000, // 3 min wall-clock timeout
        'Phase 2 slate analysis'
      );
    } catch (flashError) {
      if (flashError.status === 429 || flashError.status === 503 || flashError.message?.includes('timeout')) {
        console.warn(`[Gary DFS] Phase 2: Flash failed (${flashError.message}) — retrying once`);
        slateAnalysis = await withTimeout(
          analyzeSlateWithFlash(genAI, context, { modelName: GEMINI_FLASH_MODEL }),
          180000,
          'Phase 2 slate analysis retry'
        );
      } else {
        throw flashError;
      }
    }

    if (!slateAnalysis) {
      throw new Error('[Gary DFS] Phase 2 FAILED: Slate analysis returned null');
    }

    console.log(`[Gary DFS] ✓ Injury report: ${slateAnalysis.injuryReport?.length || 0} teams with injuries`);
    console.log(`[Gary DFS] ✓ Identified ${slateAnalysis.gameProfiles?.length || 0} game profiles`);
    console.log(`[Gary DFS] ✓ Identified ${slateAnalysis.gameEnvironments?.length || 0} game environments`);

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 3: BUILD THESIS (Gemini → retry on failure)
    // ═══════════════════════════════════════════════════════════════════════════
    console.log('\n[Gary DFS] Phase 3: Gary forming build thesis...');

    let buildThesis;
    try {
      buildThesis = await withTimeout(
        formBuildThesis(genAI, slateAnalysis, context, {
          modelName: GEMINI_PRO_MODEL,
          constitution: getDFSConstitution(sport, contestType)
        }),
        180000, // 3 min wall-clock timeout
        'Phase 3 build thesis'
      );
    } catch (proError) {
      if (proError.status === 429 || proError.status === 503 || proError.message?.includes('timeout')) {
        console.warn(`[Gary DFS] Phase 3: Pro failed (${proError.message}) — falling back to Flash`);
        buildThesis = await withTimeout(
          formBuildThesis(genAI, slateAnalysis, context, {
            modelName: GEMINI_FLASH_MODEL,
            constitution: getDFSConstitution(sport, contestType)
          }),
          180000,
          'Phase 3 build thesis (Flash fallback)'
        );
      } else {
        throw proError;
      }
    }

    if (!buildThesis || !buildThesis.edges || buildThesis.edges.length === 0 || !buildThesis.thesis) {
      throw new Error('[Gary DFS] Phase 3 FAILED: Did not produce valid build thesis');
    }

    console.log(`[Gary DFS] ✓ Edges: ${buildThesis.edges.map(e => e.type).join(', ')}`);
    console.log(`[Gary DFS] ✓ Target Games: ${buildThesis.targetGames?.join(', ') || 'Balanced'}`);
    console.log(`[Gary DFS] ✓ Thesis: "${buildThesis.thesis?.slice(0, 100)}..."`);

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 4: PLAYER INVESTIGATION (Gemini per position → retry on failure)
    // ═══════════════════════════════════════════════════════════════════════════
    console.log('\n[Gary DFS] Phase 4: Gary investigating player candidates...');

    let playerInvestigations;
    try {
      playerInvestigations = await withTimeout(
        investigatePlayersForPositions(genAI, buildThesis, context, { modelName: GEMINI_PRO_MODEL }),
        300000, // 5 min wall-clock timeout (multiple positions)
        'Phase 4 player investigation'
      );
    } catch (proError) {
      if (proError.status === 429 || proError.status === 503 || proError.message?.includes('timeout')) {
        console.warn(`[Gary DFS] Phase 4: Pro failed (${proError.message}) — retrying once`);
        playerInvestigations = await withTimeout(
          investigatePlayersForPositions(genAI, buildThesis, context, { modelName: GEMINI_PRO_MODEL }),
          300000,
          'Phase 4 player investigation retry'
        );
      } else {
        throw proError;
      }
    }

    if (!playerInvestigations || Object.keys(playerInvestigations).length === 0) {
      throw new Error('[Gary DFS] Phase 4 FAILED: Gary did not investigate any players');
    }

    const investigatedCount = Object.values(playerInvestigations).flat().length;
    if (investigatedCount === 0) {
      throw new Error('[Gary DFS] Phase 4 FAILED: Zero players investigated across all positions');
    }
    console.log(`[Gary DFS] ✓ Investigated ${investigatedCount} players across all positions`);

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 5: LINEUP DECISION (Gemini, thinkingLevel: HIGH)
    // ═══════════════════════════════════════════════════════════════════════════
    console.log('\n[Gary DFS] Phase 5: Gary making lineup decisions...');

    let lineup;
    try {
      lineup = await withTimeout(
        decideLineupWithPro(genAI, buildThesis, playerInvestigations, context, {
          modelName: GEMINI_PRO_MODEL,
          thinkingLevel: 'high'
        }),
        300000, // 5 min wall-clock timeout (deep reasoning)
        'Phase 5 lineup decision'
      );
    } catch (proError) {
      if (proError.status === 429 || proError.status === 503 || proError.message?.includes('429') || proError.message?.includes('503') || proError.message?.includes('quota') || proError.message?.includes('timeout')) {
        console.warn(`[Gary DFS] Phase 5: Pro failed (${proError.message}) — falling back to Flash`);
        lineup = await withTimeout(
          decideLineupWithPro(genAI, buildThesis, playerInvestigations, context, {
            modelName: GEMINI_FLASH_MODEL,
            thinkingLevel: 'high'
          }),
          300000,
          'Phase 5 lineup decision (Flash fallback)'
        );
      } else {
        throw proError;
      }
    }

    if (!lineup || !lineup.players || lineup.players.length === 0) {
      throw new Error('[Gary DFS] Phase 5 FAILED: Did not produce any lineup');
    }

    const expectedPlayers = platform?.toLowerCase() === 'fanduel' ? 9 : 8;
    if (lineup.players.length !== expectedPlayers) {
      throw new Error(`[Gary DFS] Phase 5 FAILED: Lineup has ${lineup.players.length} players, need ${expectedPlayers}`);
    }

    console.log(`[Gary DFS] ✓ Selected ${lineup.players.length} players`);
    console.log(`[Gary DFS] ✓ Total Salary: $${lineup.totalSalary?.toLocaleString()}`);
    console.log(`[Gary DFS] ✓ Projected Ceiling: ${lineup.ceilingProjection} pts`);

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 6: SELF-AUDIT (Gemini) — enrichment, not critical path
    // The lineup is already decided at Phase 5. Audit adds notes and may swap
    // players, but a failure here should NOT throw away a valid lineup.
    // ═══════════════════════════════════════════════════════════════════════════
    console.log('\n[Gary DFS] Phase 6: Gary auditing his lineup...');

    let auditedLineup;
    try {
      auditedLineup = await withTimeout(
        auditLineupWithPro(genAI, lineup, buildThesis, context, {
          modelName: GEMINI_PRO_MODEL
        }),
        180000, // 3 min wall-clock timeout
        'Phase 6 lineup audit'
      );
      if (!auditedLineup || !auditedLineup.players || auditedLineup.players.length === 0) {
        console.warn('[Gary DFS] Phase 6: Audit returned empty lineup — using pre-audit lineup');
        auditedLineup = lineup;
      } else {
        console.log(`[Gary DFS] ✓ Audit complete`);
        if (auditedLineup.adjustments?.length > 0) {
          console.log(`[Gary DFS] ✓ Made ${auditedLineup.adjustments.length} post-audit adjustments`);
        }
      }
    } catch (auditError) {
      // If Pro is unavailable (429/503), try Flash before giving up
      if (auditError.status === 429 || auditError.status === 503 || auditError.message?.includes('429') || auditError.message?.includes('503') || auditError.message?.includes('quota')) {
        console.warn(`[Gary DFS] Phase 6: Pro unavailable — trying Flash audit`);
        try {
          auditedLineup = await withTimeout(
            auditLineupWithPro(genAI, lineup, buildThesis, context, {
              modelName: GEMINI_FLASH_MODEL
            }),
            180000,
            'Phase 6 lineup audit (Flash fallback)'
          );
          if (!auditedLineup || !auditedLineup.players || auditedLineup.players.length === 0) {
            auditedLineup = lineup;
          }
        } catch (flashError) {
          console.warn(`[Gary DFS] Phase 6 Flash audit also failed — using pre-audit lineup`);
          auditedLineup = lineup;
        }
      } else {
        console.warn(`[Gary DFS] Phase 6 audit failed: ${auditError.message}`);
        console.warn('[Gary DFS] Using pre-audit lineup from Phase 5');
        auditedLineup = lineup;
      }
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
      edges: buildThesis.edges,
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
  const sportUpper = (sport || 'NBA').toUpperCase();
  const platformPrefix = platform.toUpperCase() === 'FANDUEL' ? 'FANDUEL' : 'DRAFTKINGS';
  const platformKey = `${platformPrefix}_${sportUpper}`;
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
// OWNERSHIP PROXY
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Tag each player with RAW OWNERSHIP SIGNALS instead of pre-concluded labels.
 * Gary reasons about these signals himself to assess field concentration.
 *
 * Signals provided:
 * - salaryRankAtPosition: e.g., "1st of 12 PGs" (high salary = high ownership)
 * - recentFormVsSeason: e.g., 1.25 (L5 is 25% above season avg = hot = high ownership)
 * - gamePopularity: e.g., "highest O/U on slate" (popular games draw more ownership)
 */
function computeOwnershipProxy(context) {
  const { players, games } = context;
  if (!players || players.length === 0) return;

  // Rank games by O/U total to identify popular games
  const gameTotals = (games || []).map(g => ({
    teams: new Set([
      (g.homeTeam || g.home_team || '').toUpperCase(),
      (g.awayTeam || g.visitor_team || g.away_team || '').toUpperCase()
    ]),
    total: g.total || g.overUnder || 0,
    matchup: `${g.awayTeam || g.visitor_team || g.away_team || ''}@${g.homeTeam || g.home_team || ''}`
  })).filter(g => g.total > 0).sort((a, b) => b.total - a.total);

  // Build team -> O/U rank map
  const teamOURank = new Map();
  gameTotals.forEach((g, idx) => {
    const rank = idx + 1;
    const label = rank === 1 ? 'highest O/U on slate'
      : rank === 2 ? '2nd highest O/U on slate'
      : rank <= Math.ceil(gameTotals.length / 2) ? 'top half O/U'
      : 'bottom half O/U';
    for (const t of g.teams) {
      if (t) teamOURank.set(t, label);
    }
  });

  // Group players by position to find salary rank within position
  const byPosition = {};
  for (const p of players) {
    const pos = p.position || p.positions?.[0] || 'UTIL';
    if (!byPosition[pos]) byPosition[pos] = [];
    byPosition[pos].push(p);
  }
  for (const pos of Object.keys(byPosition)) {
    byPosition[pos].sort((a, b) => (b.salary || 0) - (a.salary || 0));
  }

  let enrichedCount = 0;
  for (const p of players) {
    const pos = p.position || p.positions?.[0] || 'UTIL';
    const posPlayers = byPosition[pos] || [];
    const salaryRank = posPlayers.findIndex(pp => pp.name === p.name) + 1;

    const l5Ppg = p.l5Stats?.ppg || 0;
    const seasonPpg = p.ppg || p.seasonStats?.ppg || 0;
    const formRatio = seasonPpg > 0 ? parseFloat((l5Ppg / seasonPpg).toFixed(2)) : null;

    const gameOURank = teamOURank.get((p.team || '').toUpperCase()) || null;

    p.ownershipSignals = {
      salaryRankAtPosition: `${salaryRank}${salaryRank === 1 ? 'st' : salaryRank === 2 ? 'nd' : salaryRank === 3 ? 'rd' : 'th'} of ${posPlayers.length} ${pos}s`,
      recentFormVsSeason: formRatio,
      gamePopularity: gameOURank
    };
    enrichedCount++;
  }

  console.log(`[Gary DFS] Ownership signals: enriched ${enrichedCount} players with raw salary rank, form ratio, and game popularity`);
}

// ═══════════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════════

export default {
  generateAgenticDFSLineup
};
