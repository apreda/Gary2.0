/**
 * DFS Agentic Orchestrator
 *
 * This is the MAIN entry point for Gary's DFS lineup generation.
 * Gary REASONS about lineup decisions using Gemini.
 *
 * FLOW:
 * 1. Context Building (existing dfsAgenticContext.js)
 * 2. Slate Analysis (Gemini investigates the slate via tool calling)
 * 3. Player Investigation (Gemini per position via tool calling)
 * 4. Lineup Decision (Gemini with thinkingLevel: HIGH)
 * 5. Self-Audit (Gemini reviews his choices)
 *
 * FOLLOWS CLAUDE.md:
 * - Gary INVESTIGATES before deciding (not formulas)
 * - Gary has AWARENESS of sharp strategies (from FIBLE)
 * - Gary DECIDES with conviction (not rules)
 */

import { analyzeSlateWithFlash, fetchOwnershipFromFTA } from './dfsAgenticSlateAnalyzer.js';
import { investigatePlayersForPositions } from './dfsAgenticPlayerInvestigator.js';
import { decideLineupWithPro } from './dfsAgenticLineupDecider.js';
import { auditLineupWithPro } from './dfsAgenticAudit.js';
import { getRosterSlots, getFormRatioFields } from './dfsSportConfig.js';
import { WINNING_SCORE_TARGETS } from '../FIBLE.js';
import { buildDFSContext } from '../dfsAgenticContext.js';
import { findPivotAlternatives } from '../../dfsLineupService.js';
import {
  GEMINI_FLASH_MODEL, GEMINI_PRO_MODEL,
  getGeminiClient
} from '../modelConfig.js';

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
    // OWNERSHIP PROXY (GPP only)
    // No direct ownership data — use salary + situation as proxy for field
    // concentration. Gives Gary awareness of likely chalk vs leverage plays.
    // ═══════════════════════════════════════════════════════════════════════════
    computeOwnershipProxy(context);

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
      const isRetryable = flashError.status === 429 || flashError.status === 503 || flashError.status === 500 ||
        flashError.message?.includes('timeout') || flashError.message?.includes('ECONNRESET') ||
        flashError.message?.includes('fetch failed') || flashError.code === 'ECONNREFUSED';
      if (isRetryable) {
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
    console.log(`[Gary DFS] ✓ Tool calls: ${slateAnalysis.calledTools?.length || 0} | Narrative briefing: ${slateAnalysis.narrativeBriefing?.length || 0} chars`);

    // ═══════════════════════════════════════════════════════════════════════════
    // OWNERSHIP GROUNDING (supplemental — does not affect player selection)
    // FTA projected ownership enriches Gary's awareness but lineups are valid without it.
    // Separate from the function-calling session — grounding and FC can't mix.
    // ═══════════════════════════════════════════════════════════════════════════
    try {
      console.log('[Gary DFS] Fetching ownership projections via Grounding...');
      const ownershipData = await withTimeout(
        fetchOwnershipFromFTA(genAI, context),
        15000, // 15s — direct HTML fetch + parse
        'Ownership fetch'
      );
      if (ownershipData.length > 0) {
        slateAnalysis.ownershipProjections = ownershipData;
        console.log(`[Gary DFS] ✓ Ownership data: ${ownershipData.length} players with projected ownership`);

        // Attach ownership to player objects so downstream phases can see it
        // FTA names may differ from BDL names (compound names, hyphens, suffixes)
        // Use normalized comparison: strip non-alpha, lowercase
        const normalize = s => (s || '').toLowerCase().replace(/[^a-z]/g, '');
        let ftaMatchCount = 0;
        for (const entry of ownershipData) {
          const entryNorm = normalize(entry.player);
          const player = context.players.find(p => {
            const pNorm = normalize(p.name);
            return pNorm === entryNorm || pNorm.includes(entryNorm) || entryNorm.includes(pNorm);
          });
          if (player) {
            player.projectedOwnership = entry.projectedOwnership;
            ftaMatchCount++;
          }
        }
        // When FTA covers enough players, clear proxy signals to avoid redundant/conflicting data
        if (ftaMatchCount >= context.players.length * 0.3) {
          for (const p of context.players) {
            if (p.projectedOwnership != null) delete p.ownershipSignals;
          }
          console.log(`[Gary DFS] FTA matched ${ftaMatchCount} players — cleared proxy signals for players with real ownership`);
        }
      } else {
        console.log('[Gary DFS] Ownership grounding returned no data — continuing without');
        slateAnalysis.ownershipProjections = [];
        slateAnalysis.ownershipMissing = true;
      }
    } catch (err) {
      console.warn(`[Gary DFS] Ownership grounding failed (${err.message}) — continuing without`);
      slateAnalysis.ownershipProjections = [];
      slateAnalysis.ownershipMissing = true;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 3: PLAYER INVESTIGATION (Gemini per position → retry on failure)
    // Gary investigates freely — no thesis anchoring. The lineup emerges
    // from what the data shows, not from a pre-committed strategy.
    // ═══════════════════════════════════════════════════════════════════════════
    console.log('\n[Gary DFS] Phase 3: Gary investigating player candidates...');

    let playerInvestigations;
    try {
      // Phase 3 is factual data gathering (tool calling) — Flash is faster and cheaper than Pro.
      // Pro's deep reasoning is reserved for Phase 4 (decision) and Phase 5 (audit).
      playerInvestigations = await withTimeout(
        investigatePlayersForPositions(genAI, slateAnalysis, context, { modelName: GEMINI_FLASH_MODEL }),
        300000, // 5 min wall-clock timeout (multiple positions)
        'Phase 3 player investigation'
      );
    } catch (flashError) {
      const isRetryable = flashError.status === 429 || flashError.status === 503 || flashError.status === 500 ||
        flashError.message?.includes('timeout') || flashError.message?.includes('ECONNRESET') ||
        flashError.message?.includes('fetch failed') || flashError.code === 'ECONNREFUSED';
      if (isRetryable) {
        console.warn(`[Gary DFS] Phase 3: Flash failed (${flashError.message}) — retrying once`);
        playerInvestigations = await withTimeout(
          investigatePlayersForPositions(genAI, slateAnalysis, context, { modelName: GEMINI_FLASH_MODEL }),
          300000,
          'Phase 3 player investigation retry'
        );
      } else {
        throw flashError;
      }
    }

    if (!playerInvestigations || Object.keys(playerInvestigations).length === 0) {
      throw new Error('[Gary DFS] Phase 3 FAILED: Gary did not investigate any players');
    }

    const investigatedCount = Object.values(playerInvestigations).flat().length;
    if (investigatedCount === 0) {
      throw new Error('[Gary DFS] Phase 3 FAILED: Zero players investigated across all positions');
    }
    console.log(`[Gary DFS] ✓ Investigated ${investigatedCount} players across all positions`);

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 4: LINEUP DECISION (Gemini, thinkingLevel: HIGH)
    // ═══════════════════════════════════════════════════════════════════════════
    console.log('\n[Gary DFS] Phase 4: Gary making lineup decisions...');

    let lineup;
    try {
      lineup = await withTimeout(
        decideLineupWithPro(genAI, slateAnalysis, playerInvestigations, context, {
          modelName: GEMINI_PRO_MODEL
        }),
        480000, // 8 min wall-clock timeout (deep reasoning on large slates)
        'Phase 4 lineup decision'
      );
    } catch (proError) {
      // No fallback to Flash — Phase 4 is the actual lineup decision.
      // If Pro can't handle it, the lineup should fail with a diagnostic.
      throw new Error(`[Gary DFS] Phase 4 FAILED: Gemini Pro unavailable (${proError.message}). Lineup generation cannot proceed without Pro for the decision phase.`);
    }

    if (!lineup || !lineup.players || lineup.players.length === 0) {
      throw new Error('[Gary DFS] Phase 4 FAILED: Did not produce any lineup');
    }

    const expectedPlayers = getRosterSlots(platform, sport).length;
    if (lineup.players.length !== expectedPlayers) {
      throw new Error(`[Gary DFS] Phase 4 FAILED: Lineup has ${lineup.players.length} players, need ${expectedPlayers}`);
    }

    console.log(`[Gary DFS] ✓ Selected ${lineup.players.length} players`);
    console.log(`[Gary DFS] ✓ Total Salary: $${lineup.totalSalary?.toLocaleString()}`);
    console.log(`[Gary DFS] ✓ Projected Ceiling: ${lineup.ceilingProjection} pts`);

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 5: SELF-AUDIT (Gemini) — REQUIRED. No fallback to unaudited lineup.
    // Gary audits his own work. If the audit fails, the pipeline fails.
    // ═══════════════════════════════════════════════════════════════════════════
    console.log('\n[Gary DFS] Phase 5: Gary auditing his lineup...');

    // Pass investigation data to audit so Gary can evaluate swaps with full context
    context.playerInvestigations = playerInvestigations;

    const auditedLineup = await withTimeout(
      auditLineupWithPro(genAI, lineup, slateAnalysis, context, {
        modelName: GEMINI_PRO_MODEL
      }),
      180000, // 3 min wall-clock timeout
      'Phase 5 lineup audit'
    );

    if (!auditedLineup || !auditedLineup.players || auditedLineup.players.length === 0) {
      throw new Error('[Gary DFS] Phase 5 FAILED: Audit returned empty lineup');
    }

    console.log(`[Gary DFS] ✓ Audit complete`);
    if (auditedLineup.adjustments?.length > 0) {
      console.log(`[Gary DFS] ✓ Made ${auditedLineup.adjustments.length} post-audit adjustments`);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PIVOT ALTERNATIVES — 2 per player (Direct Swap + Budget)
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

    // Ownership from FTA grounding search (stored as projectedOwnership in context)
    const ownership = ctxPlayer?.projectedOwnership ?? null;

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

    return { ...slot, pivots, ownership, valueScore, recentFormRatio, opponent };
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
    // SHOWDOWN targets are already calibrated for 1-2 game slates
  } else if (gameCount <= 5 && targets.SMALL_GPP) {
    contestTargets = targets.SMALL_GPP;
    // SMALL_GPP targets are already calibrated for 3-5 game slates
  } else if (gameCount >= 10) {
    contestTargets = targets.LARGE_GPP;
    // LARGE_GPP targets are for full slates — no adjustment
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

// ═══════════════════════════════════════════════════════════════════════════════
// OWNERSHIP PROXY
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Tag each player with RAW OWNERSHIP SIGNALS instead of pre-concluded labels.
 * Gary reasons about these signals himself to assess field concentration.
 *
 * Signals provided:
 * - salaryRankAtPosition: e.g., "1st of 12 PGs" (salary rank within position group)
 * - recentFormVsSeason: e.g., 1.25 (L5/season FPTS ratio)
 * - gamePopularity: e.g., "O/U rank 1 of 8" (game's O/U rank on the slate)
 */
function computeOwnershipProxy(context) {
  const { players, games, sport } = context;
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

  // Build team -> O/U rank map (raw rank number + total game count, no labels)
  const teamOURank = new Map();
  const totalGamesOnSlate = gameTotals.length;
  gameTotals.forEach((g, idx) => {
    const rank = idx + 1;
    for (const t of g.teams) {
      if (t) teamOURank.set(t, `O/U rank ${rank} of ${totalGamesOnSlate}`);
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

    const { l5Field, seasonField } = getFormRatioFields(sport);
    const l5Val = p.l5Stats?.[l5Field] || 0;
    const seasonVal = p[seasonField] || p.seasonStats?.[seasonField] || 0;
    const formRatio = seasonVal > 0 ? parseFloat((l5Val / seasonVal).toFixed(2)) : null;

    const gameOURank = teamOURank.get((p.team || '').toUpperCase()) || null;

    p.ownershipSignals = {
      salaryRankAtPosition: `${salaryRank}${(salaryRank % 100 >= 11 && salaryRank % 100 <= 13) ? 'th' : salaryRank % 10 === 1 ? 'st' : salaryRank % 10 === 2 ? 'nd' : salaryRank % 10 === 3 ? 'rd' : 'th'} of ${posPlayers.length} ${pos}s`,
      recentFormVsSeason: formRatio,
      gamePopularity: gameOURank
    };
    enrichedCount++;
  }

  console.log(`[Gary DFS] Ownership signals: enriched ${enrichedCount} players with raw salary rank, form ratio, and game popularity`);
}

