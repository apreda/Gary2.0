/**
 * DFS Agentic Orchestrator
 *
 * This is the MAIN entry point for Gary's DFS lineup generation.
 * Gary REASONS about lineup decisions using Gemini.
 *
 * FLOW:
 * 1.   Context Building (existing dfsAgenticContext.js)
 * 1.5. Per-Game DFS Scouting Reports (pure data formatting, no Gemini)
 * 2.   Per-Game Flash Research (Flash per game — all games, parallel)
 * 3.   Gary's DFS Agent Loop (Pro with tools, multi-pass, advisor spawned mid-loop)
 * 4.   Self-Audit (Pro reviews his choices)
 * 5.   Pivots + Final Output
 *
 * FOLLOWS CLAUDE.md:
 * - Gary INVESTIGATES before deciding (not formulas)
 * - Gary has AWARENESS of sharp strategies (from FIBLE)
 * - Gary DECIDES with conviction (not rules)
 */

import { buildDfsScoutReports } from './dfsScoutReportBuilder.js';
import { researchAllGames } from './dfsAgenticGameResearcher.js';
import { runDfsAgentLoop } from './dfsAgentLoop.js';
import { auditLineupWithPro } from './dfsAgenticAudit.js';
import { getRosterSlots } from './dfsSportConfig.js';
import { WINNING_SCORE_TARGETS } from '../FIBLE.js';
import { buildDFSContext } from '../dfsAgenticContext.js';
import { findPivotAlternatives } from '../../dfsLineupService.js';
import {
  GEMINI_FLASH_MODEL, GEMINI_PRO_MODEL,
  getGeminiClient
} from '../modelConfig.js';

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
 * @returns {Object} - Gary's lineup with reasoning
 */
export async function generateAgenticDFSLineup(options) {
  // Support both 'date' and 'slateDate' parameter names
  const { platform, sport, date, slateDate, slate, context: passedContext } = options;
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
    const realSalaryCount = context.players.filter(p => p.salary > 0).length;
    const salaryCoverage = realSalaryCount / context.players.length;
    if (salaryCoverage < 0.5) {
      throw new Error(`[Gary DFS] Salary data missing: only ${realSalaryCount}/${context.players.length} players have real salaries (${(salaryCoverage * 100).toFixed(0)}%). Tank01 may not cover this slate. Skipping to avoid invalid lineup.`);
    }

    console.log(`[Gary DFS] ✓ Found ${context.players.length} players across ${context.games?.length || 0} games`);

    // Add winning score targets for Gary's awareness
    const winningTargets = getWinningTargets(platform, sport, slate);
    context.winningTargets = winningTargets;

    // Surface slate game count for downstream phases (raw number, no label)
    context.slateSize = winningTargets.gameCount;

    console.log(`[Gary DFS] ✓ Target to WIN: ${winningTargets.toWin} pts | Top 1%: ${winningTargets.top1Percent} pts | ${winningTargets.gameCount} games`);

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 1.5: PER-GAME DFS SCOUTING REPORTS
    // Pure data formatting — no Gemini calls. Every player with salary visible.
    // ═══════════════════════════════════════════════════════════════════════════
    console.log('\n[Gary DFS] Phase 1.5: Building per-game scouting reports...');

    const scoutReports = buildDfsScoutReports(context);

    console.log(`[Gary DFS] ✓ Built ${scoutReports.length} scouting reports`);
    for (const r of scoutReports) {
      console.log(`[Gary DFS]   → ${r.game}`);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 2: PER-GAME FLASH RESEARCH (Flash per game — parallel)
    // Every game on the slate gets a dedicated Flash research session with
    // DFS-specific investigation factors. All games run in parallel.
    // ═══════════════════════════════════════════════════════════════════════════
    console.log('\n[Gary DFS] Phase 2: Deep-diving every game on the slate...');

    let flashResearch;
    try {
      flashResearch = await researchAllGames(genAI, scoutReports, context, {
        modelName: GEMINI_FLASH_MODEL
      });
    } catch (flashError) {
      const isRetryable = flashError.status === 429 || flashError.status === 503 || flashError.status === 500 ||
        flashError.message?.includes('timeout') || flashError.message?.includes('ECONNRESET') ||
        flashError.message?.includes('fetch failed') || flashError.code === 'ECONNREFUSED';
      if (isRetryable) {
        console.warn(`[Gary DFS] Phase 2: Flash failed (${flashError.message}) — retrying once`);
        flashResearch = await researchAllGames(genAI, scoutReports, context, {
          modelName: GEMINI_FLASH_MODEL
        });
      } else {
        throw flashError;
      }
    }

    console.log(`[Gary DFS] ✓ Flash research complete: ${flashResearch.length} games researched`);
    for (const brief of flashResearch) {
      console.log(`[Gary DFS]   → ${brief.game}: ${brief.briefing?.length || 0} chars, ${brief.calledTools?.length || 0} tool calls`);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 3: GARY'S DFS AGENT LOOP (Pro with tools, multi-pass)
    // Gary investigates the slate himself with tool calling. Advisor theses
    // are spawned and injected mid-loop. Gary submits via SUBMIT_LINEUP tool.
    // ═══════════════════════════════════════════════════════════════════════════
    console.log('\n[Gary DFS] Phase 3: Gary investigating and building lineup...');

    const loopResult = await runDfsAgentLoop({
      genAI,
      scoutReports,
      flashResearch,
      context,
      options: { modelName: GEMINI_FLASH_MODEL }
    });

    if (!loopResult || !loopResult.lineup || !loopResult.lineup.players || loopResult.lineup.players.length === 0) {
      throw new Error('[Gary DFS] Phase 3 FAILED: Agent loop did not produce a lineup');
    }

    const expectedPlayers = getRosterSlots(platform, sport).length;
    if (loopResult.lineup.players.length !== expectedPlayers) {
      throw new Error(`[Gary DFS] Phase 3 FAILED: Lineup has ${loopResult.lineup.players.length} players, need ${expectedPlayers}`);
    }

    console.log(`[Gary DFS] ✓ Selected ${loopResult.lineup.players.length} players`);
    console.log(`[Gary DFS] ✓ Total Salary: $${loopResult.lineup.totalSalary?.toLocaleString()}`);
    console.log(`[Gary DFS] ✓ Ceiling: ${loopResult.lineup.ceilingProjection} pts`);
    console.log(`[Gary DFS] ✓ Agent loop: ${loopResult.toolCallHistory?.length || 0} tool calls, ${loopResult.generationTime}`);

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 4: SELF-AUDIT (Gemini) — REQUIRED. No fallback to unaudited lineup.
    // Gary audits his own work. If the audit fails, the pipeline fails.
    // ═══════════════════════════════════════════════════════════════════════════
    console.log('\n[Gary DFS] Phase 4: Gary auditing his lineup...');

    const auditedLineup = await auditLineupWithPro(
      genAI, loopResult.lineup, context, loopResult, {
        modelName: GEMINI_FLASH_MODEL
      }
    );

    if (!auditedLineup || !auditedLineup.players || auditedLineup.players.length === 0) {
      throw new Error('[Gary DFS] Phase 4 FAILED: Audit returned empty lineup');
    }

    console.log(`[Gary DFS] ✓ Audit complete`);
    if (auditedLineup.adjustments?.length > 0) {
      console.log(`[Gary DFS] ✓ Made ${auditedLineup.adjustments.length} post-audit adjustments`);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 5: PIVOT ALTERNATIVES — 2 per player (Direct Swap + Budget)
    // ═══════════════════════════════════════════════════════════════════════════
    const lineupWithPivots = addPivotsToAgenticLineup(
      auditedLineup.players, context.players, sport, platform
    );

    // ═══════════════════════════════════════════════════════════════════════════
    // FORMAT FINAL OUTPUT
    // ═══════════════════════════════════════════════════════════════════════════
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

    const result = {
      // Core lineup data
      lineup: lineupWithPivots,
      totalSalary: auditedLineup.totalSalary,
      projectedPoints: auditedLineup.projectedPoints,
      ceilingProjection: auditedLineup.ceilingProjection,
      floorProjection: auditedLineup.floorProjection,

      // Gary's reasoning (the key differentiator)
      garyNotes: auditedLineup.garyNotes,
      ceilingScenario: auditedLineup.ceilingScenario,

      // Per-player reasoning
      perPlayerReasoning: auditedLineup.perPlayerReasoning,

      // Audit results
      auditNotes: auditedLineup.auditNotes,
      winConditionAnalysis: auditedLineup.winConditionAnalysis,

      // Targets
      winningTargets,

      // Metadata
      platform,
      sport,
      slate: slate?.name || 'Main',
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
// PIVOT ALTERNATIVES — Attach swap options to each lineup slot
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Attach pivot alternatives to each player in the agentic lineup.
 * Reuses findPivotAlternatives from dfsLineupService but adapts field names
 * between the agentic pipeline (name/projectedPoints) and legacy service (player/projected_pts).
 *
 * Returns max 2 pivots per player: Direct Swap first, then Budget.
 * Mid Value is only included as fallback if no Direct Swap exists.
 */
function addPivotsToAgenticLineup(lineupPlayers, contextPlayers, sport, platform) {
  const lineupNames = new Set(lineupPlayers.map(p => (p.name || p.player || '').toLowerCase()));

  // Build eligible pool in the format findPivotAlternatives expects
  const pool = contextPlayers
    .filter(p => !lineupNames.has((p.name || '').toLowerCase()) && p.salary > 0)
    .map(p => ({
      name: p.name,
      team: p.team,
      salary: p.salary,
      allPositions: p.positions || p.allPositions || [],
      projected_pts: p.benchmarkProjection || p.seasonStats?.dkFpts || p.projectedPoints || 0,
      status: p.injuryStatus
    }));

  return lineupPlayers.map(slot => {
    const slotPos = (slot.position || '').toUpperCase();

    // Filter pool to position-eligible players
    const eligible = pool.filter(p => {
      const positions = (p.allPositions || []).map(pos => pos.toUpperCase());
      // Direct position match OR flex eligibility
      if (positions.includes(slotPos)) return true;
      if (sport === 'NBA' && platform === 'draftkings') {
        if (slotPos === 'G' && (positions.includes('PG') || positions.includes('SG'))) return true;
        if (slotPos === 'F' && (positions.includes('SF') || positions.includes('PF'))) return true;
        if (slotPos === 'UTIL') return true;
      }
      if (sport === 'NBA' && platform === 'fanduel') {
        // FanDuel NBA has strict positions: PG/SG/SF/PF/C
        return positions.includes(slotPos);
      }
      return false;
    });

    // Get all pivots from legacy function
    const allPivots = findPivotAlternatives(
      { player: slot.name || slot.player, salary: slot.salary },
      eligible,
      sport,
      platform
    );

    // Take first 2 unique-named pivots (no duplicate players)
    // allPivots is already sorted by tier priority (direct → mid → budget → best_available)
    const pivots = [];
    const seen = new Set();
    for (const pv of allPivots) {
      const pvName = (pv.player || '').toLowerCase();
      if (seen.has(pvName)) continue;
      seen.add(pvName);
      pivots.push(pv);
      if (pivots.length >= 2) break;
    }

    // ── Enrich with metrics from context ──
    const ctxName = (slot.name || slot.player || '').toLowerCase();
    const ctxPlayer = contextPlayers.find(cp => (cp.name || '').toLowerCase() === ctxName);

    // Value score = projected FPTS / (salary / 1000) — 5x baseline, 6x+ elite
    const projPts = slot.projectedPoints || slot.projected_pts || 0;
    const salK = (slot.salary || 0) / 1000;
    const valueScore = (projPts > 0 && salK > 0) ? Math.round((projPts / salK) * 10) / 10 : null;

    // Recent form: L5 DK FPTS avg / season DK FPTS ratio (raw number, no labels)
    let recentFormRatio = null;
    const l5Fpts = ctxPlayer?.l5Stats?.dkFptsAvg || 0;
    const seasonFpts = ctxPlayer?.seasonStats?.dkFpts || 0;
    if (l5Fpts > 0 && seasonFpts > 0) {
      recentFormRatio = parseFloat((l5Fpts / seasonFpts).toFixed(2));
    }

    // Opponent from context (game matchup)
    const opponent = ctxPlayer?.opponent || ctxPlayer?.game?.opponent || null;

    // Q/GTD direct salary swap — closest salary match at same position, healthy only
    const isQ = ctxPlayer?.isQuestionable || false;
    let questionableSwap = null;
    if (isQ) {
      const healthyEligible = eligible.filter(p => {
        const st = (p.status || '').toUpperCase();
        return !st.includes('QUESTIONABLE') && !st.includes('GTD') && !st.includes('DAY-TO-DAY');
      });
      const bySalaryDist = [...healthyEligible].sort((a, b) =>
        Math.abs(a.salary - slot.salary) - Math.abs(b.salary - slot.salary)
      );
      if (bySalaryDist.length > 0) {
        const sw = bySalaryDist[0];
        questionableSwap = {
          player: sw.name,
          team: sw.team,
          salary: sw.salary,
          salaryDiff: sw.salary - slot.salary,
          projected_pts: sw.projected_pts
        };
      }
    }

    return { ...slot, pivots, valueScore, recentFormRatio, opponent, isQuestionable: isQ, questionableSwap };
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// HELPER: Get winning score targets from FIBLE
// ═══════════════════════════════════════════════════════════════════════════════

function getWinningTargets(platform, sport, slate) {
  const sportUpper = (sport || 'NBA').toUpperCase();
  const platformPrefix = (platform || 'draftkings').toUpperCase() === 'FANDUEL' ? 'FANDUEL' : 'DRAFTKINGS';
  const platformKey = `${platformPrefix}_${sportUpper}`;
  const targets = WINNING_SCORE_TARGETS[platformKey];

  if (!targets) {
    // Default targets if not in FIBLE
    return {
      toWin: 380,
      top1Percent: 355,
      slateMultiplier: 1.0
    };
  }

  const gameCount = slate?.gameCount || slate?.games?.length || 8;

  // Select contest targets based on slate size — use calibrated targets instead of blanket multiplier
  let contestTargets;
  let contestSlateMultiplier = 1.0;

  if (gameCount <= 2 && targets.SHOWDOWN) {
    contestTargets = targets.SHOWDOWN;
  } else if (gameCount <= 5 && targets.SMALL_GPP) {
    contestTargets = targets.SMALL_GPP;
  } else if (gameCount >= 10) {
    contestTargets = targets.LARGE_GPP;
  } else {
    // Medium slates (6-9 games): use LARGE_GPP with slight adjustment
    contestTargets = targets.LARGE_GPP;
    contestSlateMultiplier = WINNING_SCORE_TARGETS.SLATE_ADJUSTMENTS.MEDIUM_SLATE.multiplier;
  }

  return {
    toWin: Math.round((contestTargets.firstPlace?.typical || 385) * contestSlateMultiplier),
    top1Percent: Math.round((contestTargets.top1Percent?.typical || 355) * contestSlateMultiplier),
    slateMultiplier: contestSlateMultiplier,
    gameCount
  };
}
