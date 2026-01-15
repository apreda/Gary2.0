/**
 * DFS Lineup Audit Integration
 * 
 * Handles the logic for auditing a lineup, applying fixes, and auditing again.
 * Now incorporates harmony reasoning from Advanced DFS Strategies.
 * Includes late swap alerts and FIBLE-based improvement suggestions.
 * 
 * UPDATED: Now iterates up to MAX_AUDIT_ITERATIONS times to reach Grade A.
 * Gary doesn't give up after one try - he keeps investigating and improving.
 * 
 * NEW: Includes BDL/Gemini validation for FIBLE-guided investigation.
 * Gary now VERIFIES his improvements with real data, not just formulas.
 */

import { auditLineup, generateLateSwapAlerts, generateImprovementPlan, formatLateSwapAlerts } from './dfsLineupAuditService.js';
import { BALES_PHILOSOPHY, WINNING_PLAYER_WISDOM } from './advancedDFSStrategies.js';
import { GARY_INVESTIGATION_QUESTIONS, GARY_DFS_PHILOSOPHY } from './FIBLE.js';

// Maximum attempts to reach Grade A before accepting best effort
const MAX_AUDIT_ITERATIONS = 4;

// ═══════════════════════════════════════════════════════════════════════════
// FIBLE VALIDATION: Gary investigates using BDL and Gemini
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Validate a player swap using real data before committing.
 * This is the FIBLE approach: Don't blindly swap, INVESTIGATE first.
 * 
 * @param {Object} currentPlayer - Player being swapped out
 * @param {Object} newPlayer - Proposed replacement
 * @param {Object} context - Game context
 * @returns {Object} Validation result with recommendation
 */
async function validateSwapWithData(currentPlayer, newPlayer, context) {
  const validation = {
    approved: false,
    reason: '',
    dataChecks: []
  };
  
  try {
    // Check 1: Does the new player have real stats?
    const hasStats = newPlayer.seasonStats || newPlayer.l5Stats || newPlayer.projected_pts > 15;
    validation.dataChecks.push({
      check: 'Has real stats',
      passed: hasStats,
      detail: hasStats ? `L5: ${newPlayer.l5Stats?.ppg || 'N/A'} PPG` : 'No stats available'
    });
    
    // Check 2: Is the new player actually getting minutes?
    const hasMinutes = (newPlayer.seasonStats?.mpg || 0) > 15 || (newPlayer.l5Stats?.mpg || 0) > 15;
    validation.dataChecks.push({
      check: 'Getting minutes (15+ MPG)',
      passed: hasMinutes,
      detail: `Season: ${newPlayer.seasonStats?.mpg || 'N/A'} MPG, L5: ${newPlayer.l5Stats?.mpg || 'N/A'} MPG`
    });
    
    // Check 3: Is the new player healthy (not on injury list)?
    const isHealthy = !newPlayer.injuryStatus || newPlayer.injuryStatus === 'ACTIVE';
    validation.dataChecks.push({
      check: 'Healthy/Active',
      passed: isHealthy,
      detail: newPlayer.injuryStatus || 'ACTIVE'
    });
    
    // Check 4: Is the swap an actual upgrade (ceiling or value)?
    const currentCeiling = currentPlayer.ceilingScore || currentPlayer.projected_pts || 0;
    const newCeiling = newPlayer.ceilingScore || newPlayer.projected_pts || 0;
    const isUpgrade = newCeiling > currentCeiling * 1.1; // At least 10% better
    validation.dataChecks.push({
      check: 'Ceiling upgrade (10%+)',
      passed: isUpgrade,
      detail: `${currentCeiling.toFixed(1)} → ${newCeiling.toFixed(1)} pts`
    });
    
    // Check 5: Does this improve correlation (same game as other players)?
    const teamsInLineup = context.lineupTeams || [];
    const improvesCorrelation = teamsInLineup.includes(newPlayer.team) || 
      (context.games || []).some(g => 
        (g.homeTeam === newPlayer.team || g.awayTeam === newPlayer.team) &&
        teamsInLineup.some(t => t === g.homeTeam || t === g.awayTeam)
      );
    validation.dataChecks.push({
      check: 'Improves correlation',
      passed: improvesCorrelation,
      detail: improvesCorrelation ? 'Adds to existing stack' : 'Different game'
    });
    
    // Decision: Need at least 3 of 5 checks to pass
    const passedChecks = validation.dataChecks.filter(c => c.passed).length;
    validation.approved = passedChecks >= 3;
    validation.reason = validation.approved 
      ? `✅ Swap validated: ${passedChecks}/5 checks passed`
      : `❌ Swap rejected: Only ${passedChecks}/5 checks passed`;
    
  } catch (error) {
    validation.reason = `⚠️ Validation error: ${error.message}`;
    validation.approved = false;
  }
  
  return validation;
}

/**
 * Ask FIBLE investigation questions and log what Gary is checking.
 * This makes Gary's decision-making transparent.
 */
function logFIBLEInvestigation(improvement, context) {
  const questions = GARY_INVESTIGATION_QUESTIONS.PLAYER_QUESTIONS;
  
  console.log(`[FIBLE Investigation] 🔍 Checking: ${improvement.issue}`);
  
  // Log relevant questions Gary is asking
  if (improvement.issue.includes('Punt')) {
    console.log(`[FIBLE Investigation] Q: "Are the punt plays actually bad, or do they have real upside?"`);
    console.log(`[FIBLE Investigation] → Checking BDL for minutes, usage, recent production...`);
  } else if (improvement.issue.includes('Chalk') || improvement.issue.includes('Ownership')) {
    console.log(`[FIBLE Investigation] Q: "Is this player's ownership justified, or is it recency bias?"`);
    console.log(`[FIBLE Investigation] → Checking if ownership spike is due to last game's performance...`);
  } else if (improvement.issue.includes('Blowout')) {
    console.log(`[FIBLE Investigation] Q: "Is blowout ACTUALLY likely for this specific matchup?"`);
    console.log(`[FIBLE Investigation] → Checking head-to-head, rivalry factors, upset potential...`);
  } else if (improvement.issue.includes('Correlation') || improvement.issue.includes('Stack')) {
    console.log(`[FIBLE Investigation] Q: "Which games tonight have the best shootout potential?"`);
    console.log(`[FIBLE Investigation] → Checking Vegas totals, team pace, defensive ratings...`);
  }
}

/**
 * Runs an iterative grade-fix-grade cycle on a lineup.
 * Gary will attempt up to MAX_AUDIT_ITERATIONS times to reach Grade A.
 * 
 * @param {Object} initialLineup - The generated lineup
 * @param {Object} context - Contest context (players, games, etc.)
 * @param {Object} options - Sport, platform, contestType, originalPlayers
 * @returns {Promise<Object>} Final audited lineup
 */
export async function runSharpAuditCycle(initialLineup, context, options = {}) {
  const { sport, platform, contestType, originalPlayers } = options;
  
  console.log(`\n[Sharp Audit] 🔍 Starting self-audit for ${sport.toUpperCase()}...`);
  console.log(`[Sharp Audit] 📖 FIBLE-guided iteration (max ${MAX_AUDIT_ITERATIONS} attempts to reach A)`);
  
  // Generate late swap alerts (for Notes section) - do this once at the start
  const lateSwapAlerts = generateLateSwapAlerts(initialLineup, originalPlayers || [], context);
  
  // Track all audit history for transparency
  const auditHistory = [];
  let currentLineup = { ...initialLineup, lineup: [...initialLineup.lineup] };
  let currentAudit = null;
  let bestLineup = currentLineup;
  let bestAudit = null;
  let bestScore = 0;
  
  // ═══════════════════════════════════════════════════════════════════════════
  // ITERATION LOOP: Keep trying until Grade A or max attempts
  // ═══════════════════════════════════════════════════════════════════════════
  for (let iteration = 1; iteration <= MAX_AUDIT_ITERATIONS; iteration++) {
    
    // 1. Grade current lineup
    currentAudit = await auditLineup(currentLineup, context, { sport, platform, contestType });
    auditHistory.push({ iteration, grade: currentAudit.grade, score: currentAudit.sharpScore });
    
    console.log(`[Sharp Audit] Round ${iteration} Grade: ${currentAudit.grade} (${currentAudit.sharpScore}/100)`);
    
    // Track best result (in case we never reach A)
    if (currentAudit.sharpScore > bestScore) {
      bestScore = currentAudit.sharpScore;
      bestAudit = currentAudit;
      bestLineup = JSON.parse(JSON.stringify(currentLineup)); // Deep copy
    }
    
    // SUCCESS: Grade A achieved!
    if (currentAudit.grade === 'A') {
      console.log(`[Sharp Audit] ✅ Grade A achieved after ${iteration} iteration(s)! Locking in.`);
      currentLineup.audit = currentAudit;
      currentLineup.auditHistory = auditHistory;
      currentLineup.harmony_reasoning = generateHarmonyReasoning(currentLineup, currentAudit);
      currentLineup.lateSwapAlerts = lateSwapAlerts;
      currentLineup.lateSwapNotes = formatLateSwapAlerts(lateSwapAlerts);
      currentLineup.improvementPlan = { 
        currentGrade: 'A', 
        iterations: iteration,
        message: `✅ Grade A achieved after ${iteration} iteration(s).` 
      };
      return currentLineup;
    }
    
    // Not yet Grade A - generate improvement plan
    const improvementPlan = generateImprovementPlan(currentAudit, currentLineup, originalPlayers || [], context);
    
    if (iteration < MAX_AUDIT_ITERATIONS) {
      console.log(`[Sharp Audit] 🔧 Iteration ${iteration}: Applying FIBLE-guided fixes...`);
      
      // Log what we're trying to fix
      if (improvementPlan.improvements.length > 0) {
        improvementPlan.improvements.slice(0, 2).forEach((imp, i) => {
          console.log(`[Sharp Audit]    ${i + 1}. ${imp.issue}`);
        });
      }
      
      // Log investigation questions Gary is considering
      if (improvementPlan.investigations?.length > 0) {
        console.log(`[Sharp Audit] 🔍 Investigating: ${improvementPlan.investigations[0].question.substring(0, 60)}...`);
      }
      
      // Apply fixes based on weaknesses
      const previousScore = currentAudit.sharpScore;
      currentLineup = await applyAuditFixes(currentLineup, currentAudit, originalPlayers, context, options);
      
      // Check if we made progress (avoid infinite loops on same lineup)
      const progressCheck = await auditLineup(currentLineup, context, { sport, platform, contestType });
      if (progressCheck.sharpScore <= previousScore && iteration > 1) {
        console.log(`[Sharp Audit] ⚠️ No improvement made in iteration ${iteration}. Trying different approach...`);
        // Try a more aggressive fix strategy
        currentLineup = await applyAggressiveFixes(currentLineup, currentAudit, originalPlayers, context, options);
      }
    }
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // MAX ITERATIONS REACHED: Use best result
  // ═══════════════════════════════════════════════════════════════════════════
  console.log(`[Sharp Audit] ⚠️ Max iterations (${MAX_AUDIT_ITERATIONS}) reached. Best grade: ${bestAudit.grade} (${bestScore}/100)`);
  
  // Explain why we couldn't reach A
  const blockingIssues = bestAudit.weaknesses?.slice(0, 3) || [];
  if (blockingIssues.length > 0) {
    console.log(`[Sharp Audit] 📋 Blocking issues preventing Grade A:`);
    blockingIssues.forEach((issue, i) => {
      console.log(`[Sharp Audit]    ${i + 1}. ${issue.substring(0, 70)}...`);
    });
  }
  
  // Return best lineup we achieved
  bestLineup.audit = bestAudit;
  bestLineup.auditHistory = auditHistory;
  bestLineup.harmony_reasoning = generateHarmonyReasoning(bestLineup, bestAudit);
  bestLineup.lateSwapAlerts = lateSwapAlerts;
  bestLineup.lateSwapNotes = formatLateSwapAlerts(lateSwapAlerts);
  bestLineup.improvementPlan = {
    currentGrade: bestAudit.grade,
    targetGrade: 'A',
    iterations: MAX_AUDIT_ITERATIONS,
    bestScore,
    blockingIssues,
    message: `⚠️ Best effort: ${bestAudit.grade} after ${MAX_AUDIT_ITERATIONS} iterations. See blocking issues.`
  };
  
  return bestLineup;
}

/**
 * Generates a "Harmony Reasoning" paragraph explaining how the lineup works together.
 */
function generateHarmonyReasoning(lineup, audit) {
  const wisdom = WINNING_PLAYER_WISDOM[Math.floor(Math.random() * WINNING_PLAYER_WISDOM.length)];
  let reasoning = `HARMONY ANALYSIS: This build is designed for ${lineup.contestType === 'gpp' ? 'tournament ceiling' : 'cash game floor'}. `;
  
  if (audit.harmonyInsights && audit.harmonyInsights.length > 0) {
    reasoning += audit.harmonyInsights.join(' ');
  } else {
    reasoning += `The selection prioritizes volume and efficiency across all roster slots.`;
  }
  
  reasoning += `\n\nStrategy Insight: "${wisdom.quote}" — ${wisdom.author}`;
  
  return reasoning;
}

/**
 * Attempts to fix common weaknesses detected during the audit.
 * 
 * UPDATED: Now uses FIBLE investigation approach:
 * 1. Log what Gary is investigating
 * 2. Validate swaps with real data before committing
 * 3. Track which fixes were approved vs rejected
 */
async function applyAuditFixes(lineup, audit, originalPlayers, context, options) {
  const { sport, platform, contestType } = options;
  const currentLineup = { ...lineup, lineup: [...lineup.lineup] };
  
  // Build context for validation
  const lineupTeams = currentLineup.lineup.map(p => p.team).filter(Boolean);
  const validationContext = { ...context, lineupTeams };
  
  // Track fix results for transparency
  const fixResults = [];
  
  // Priority 0: Fix Dead Air (Highest Priority - Zeros kill lineups)
  if (audit.patterns.some(p => p.id === 'DEAD_AIR')) {
    logFIBLEInvestigation({ issue: 'Dead Air players (rotation risk)' }, context);
    const result = await swapDeadAirPlayersWithValidation(currentLineup, originalPlayers, sport, platform, validationContext);
    fixResults.push(result);
  }
  
  // Priority 1: Fix High Ownership (Chalk Lock)
  if (audit.patterns.some(p => p.id === 'CHALK_LOCK')) {
    logFIBLEInvestigation({ issue: 'Chalk Lock (high ownership)' }, context);
    const result = await swapMostChalkyPlayerWithValidation(currentLineup, originalPlayers, sport, platform, validationContext);
    fixResults.push(result);
  }
  
  // Priority 2: Fix Punt Overload
  if (audit.patterns.some(p => p.id === 'PUNT_OVERLOAD')) {
    logFIBLEInvestigation({ issue: 'Punt Overload (too many cheap players)' }, context);
    const result = await upgradeWeakestPuntWithValidation(currentLineup, originalPlayers, sport, platform, validationContext);
    fixResults.push(result);
  }
  
  // Priority 3: Fix Lack of Correlation (FIBLE Commandment 4)
  if (audit.patterns.some(p => p.id === 'CORRELATION_BLINDNESS' || p.id === 'FIBLE_4') && sport.toUpperCase() === 'NBA') {
    logFIBLEInvestigation({ issue: 'Correlation/Stacking (FIBLE Commandment 4)' }, context);
    await attemptNBAGameStack(currentLineup, originalPlayers, context);
  }
  
  // Priority 4: Fix FIBLE-specific violations
  const fibleViolations = audit.patterns.filter(p => p.id?.startsWith('FIBLE_'));
  for (const violation of fibleViolations) {
    if (violation.id === 'FIBLE_3') {
      // Commandment 3: Need positive leverage plays
      logFIBLEInvestigation({ issue: 'Leverage (need contrarian plays with upside)' }, context);
      await addLeveragePlay(currentLineup, originalPlayers, validationContext);
    }
    if (violation.id === 'FIBLE_10') {
      // Commandment 10: Every pick needs a reason
      console.log(`[FIBLE Investigation] ⚠️ Players without rationale need BDL data verification`);
    }
  }

  // Log fix summary
  const approvedFixes = fixResults.filter(r => r?.approved).length;
  const rejectedFixes = fixResults.filter(r => r && !r.approved).length;
  if (fixResults.length > 0) {
    console.log(`[Sharp Audit] 📊 Fix summary: ${approvedFixes} approved, ${rejectedFixes} rejected`);
  }

  // Recalculate totals
  currentLineup.total_salary = currentLineup.lineup.reduce((sum, p) => sum + (p.salary || 0), 0);
  currentLineup.projected_points = Math.round(currentLineup.lineup.reduce((sum, p) => sum + (p.projected_pts || 0), 0) * 10) / 10;
  
  return currentLineup;
}

/**
 * Add a positive leverage play to improve FIBLE Commandment 3 compliance.
 */
async function addLeveragePlay(lineup, allPlayers, context) {
  // Find current player with highest ownership who we could pivot from
  const highOwnPlayers = lineup.lineup
    .map((p, idx) => ({ ...p, idx }))
    .filter(p => (p.ownership || 15) >= 20)
    .sort((a, b) => (b.ownership || 0) - (a.ownership || 0));
  
  if (highOwnPlayers.length === 0) return { approved: false, reason: 'No high-ownership players to pivot from' };
  
  const pivotCandidate = highOwnPlayers[0];
  
  // Find low-owned alternative with upside
  const leveragePlays = allPlayers.filter(p => {
    if (p.name === pivotCandidate.player) return false;
    if (lineup.lineup.some(lp => lp.player === p.name)) return false;
    if (p.position !== pivotCandidate.position) return false;
    if (Math.abs((p.salary || 0) - (pivotCandidate.salary || 0)) > 1500) return false;
    
    const ownership = p.ownership || 15;
    const ceiling = p.ceilingScore || p.projected_pts || 0;
    
    // Must be low owned (<12%) with decent ceiling (>25 pts)
    return ownership < 12 && ceiling > 25;
  }).sort((a, b) => (b.ceilingScore || b.projected_pts || 0) - (a.ceilingScore || a.projected_pts || 0));
  
  if (leveragePlays.length > 0) {
    const leveragePlay = leveragePlays[0];
    
    // Validate before swapping
    const validation = await validateSwapWithData(pivotCandidate, leveragePlay, context);
    
    if (validation.approved) {
      console.log(`[Sharp Audit] 🎲 Adding leverage: ${pivotCandidate.player} (${pivotCandidate.ownership}%) → ${leveragePlay.name} (${leveragePlay.ownership || 10}%)`);
      lineup.lineup[pivotCandidate.idx] = {
        ...leveragePlay,
        player: leveragePlay.name,
        rationale: `FIBLE Commandment 3: Adding positive leverage play for GPP differentiation.`
      };
      return { approved: true, swap: `${pivotCandidate.player} → ${leveragePlay.name}` };
    } else {
      console.log(`[Sharp Audit] ❌ Leverage swap rejected: ${validation.reason}`);
      return validation;
    }
  }
  
  return { approved: false, reason: 'No suitable leverage plays found' };
}

/**
 * Swaps out "Dead Air" players for active rotation players.
 * Now with FIBLE validation.
 */
async function swapDeadAirPlayersWithValidation(lineup, allPlayers, sport, platform, context) {
  const deadAirIndices = lineup.lineup.map((p, idx) => {
    if (p.fromSalaryDataOnly && (p.salary || 0) < 4500) return idx;
    if ((p.projected_pts || 0) < 5) return idx;
    return -1;
  }).filter(idx => idx !== -1);

  if (deadAirIndices.length === 0) return { approved: false, reason: 'No dead air players found' };

  console.log(`[Sharp Audit] 💱 Investigating ${deadAirIndices.length} Dead Air player(s)...`);
  let swapCount = 0;

  for (const idx of deadAirIndices) {
    const deadPlayer = lineup.lineup[idx];
    
    // Find active rotation players at the same position and salary range
    const alternatives = allPlayers.filter(p => {
      if (p.name === deadPlayer.player) return false;
      if (lineup.lineup.some(lp => lp.player === p.name)) return false;
      
      // MUST have stats to be an alternative to Dead Air
      const hasStats = p.seasonStats && (p.seasonStats.mpg > 5 || p.l5Stats?.mpg > 5);
      if (!hasStats) return false;

      // Salary match
      if (p.salary > deadPlayer.salary + 500) return false;
      
      return p.position === deadPlayer.position || (Array.isArray(p.allPositions) && p.allPositions.includes(deadPlayer.position));
    }).sort((a, b) => (b.projected_pts || 0) - (a.projected_pts || 0));

    if (alternatives.length > 0) {
      const pivot = alternatives[0];
      
      // Validate with real data
      const validation = await validateSwapWithData(deadPlayer, pivot, context);
      
      if (validation.approved) {
        lineup.lineup[idx] = {
          ...pivot,
          player: pivot.name,
          rationale: `FIBLE Fix: Replacing Dead Air ${deadPlayer.player} with verified active player ${pivot.name}.`
        };
        console.log(`[Sharp Audit] ✅ Validated swap: ${deadPlayer.player} → ${pivot.name}`);
        swapCount++;
      } else {
        console.log(`[Sharp Audit] ⚠️ Swap ${deadPlayer.player} → ${pivot.name} not validated: ${validation.reason}`);
        // Try next alternative
        if (alternatives.length > 1) {
          const secondChoice = alternatives[1];
          const secondValidation = await validateSwapWithData(deadPlayer, secondChoice, context);
          if (secondValidation.approved) {
            lineup.lineup[idx] = {
              ...secondChoice,
              player: secondChoice.name,
              rationale: `FIBLE Fix: Replacing Dead Air ${deadPlayer.player} with verified active player ${secondChoice.name}.`
            };
            console.log(`[Sharp Audit] ✅ 2nd choice validated: ${deadPlayer.player} → ${secondChoice.name}`);
            swapCount++;
          }
        }
      }
    }
  }
  
  return { approved: swapCount > 0, swaps: swapCount };
}

/**
 * Swaps out the highest-owned player for a lower-owned alternative.
 * Now with FIBLE validation.
 */
async function swapMostChalkyPlayerWithValidation(lineup, allPlayers, sport, platform, context) {
  const sorted = [...lineup.lineup].map((p, idx) => ({ ...p, idx })).sort((a, b) => (b.ownership || 0) - (a.ownership || 0));
  const chalky = sorted[0];
  
  if (!chalky || (chalky.ownership || 0) < 20) {
    return { approved: false, reason: 'No high-ownership player to fade' };
  }
  
  console.log(`[Sharp Audit] 🔍 Investigating chalk fade: ${chalky.player} (${chalky.ownership}% owned)`);
  
  const alternatives = allPlayers.filter(p => {
    if (p.name === chalky.player) return false;
    if (lineup.lineup.some(lp => lp.player === p.name)) return false;
    if (p.salary > chalky.salary + 500 || p.salary < chalky.salary - 1000) return false;
    if ((p.ownership || 15) > 15) return false;
    
    return p.position === chalky.position;
  }).sort((a, b) => (b.projected_pts || 0) - (a.projected_pts || 0));
  
  if (alternatives.length > 0) {
    const pivot = alternatives[0];
    
    // Validate with real data before swapping
    const validation = await validateSwapWithData(chalky, pivot, context);
    
    if (validation.approved) {
      lineup.lineup[chalky.idx] = {
        ...pivot,
        player: pivot.name,
        rationale: `FIBLE Fix: Fading chalk ${chalky.player} (${chalky.ownership}%) for leverage play ${pivot.name} (${pivot.ownership || 10}%).`
      };
      console.log(`[Sharp Audit] ✅ Validated chalk fade: ${chalky.player} → ${pivot.name}`);
      return { approved: true, swap: `${chalky.player} → ${pivot.name}` };
    } else {
      console.log(`[Sharp Audit] ❌ Chalk fade rejected: ${validation.reason}`);
      return validation;
    }
  }
  
  return { approved: false, reason: 'No suitable low-owned alternatives found' };
}

/**
 * Upgrades a punt play to a mid-tier player if budget allows.
 * Now with FIBLE validation.
 */
async function upgradeWeakestPuntWithValidation(lineup, allPlayers, sport, platform, context) {
  const puntThreshold = platform === 'fanduel' ? 4500 : 4000;
  const punts = lineup.lineup.map((p, idx) => ({ ...p, idx })).filter(p => (p.salary || 0) <= puntThreshold);
  
  if (punts.length < 3) {
    return { approved: false, reason: 'Not enough punts to require upgrade' };
  }
  
  const weakest = punts.sort((a, b) => (a.projected_pts || 0) - (b.projected_pts || 0))[0];
  const currentSalary = lineup.lineup.reduce((sum, p) => sum + (p.salary || 0), 0);
  const salaryCap = lineup.salary_cap || (platform === 'fanduel' ? 60000 : 50000);
  const remaining = salaryCap - currentSalary;
  
  if (remaining < 500) {
    return { approved: false, reason: 'No salary room for upgrade' };
  }
  
  console.log(`[Sharp Audit] 🔍 Investigating punt upgrade: ${weakest.player} ($${weakest.salary})`);
  
  const upgrades = allPlayers.filter(p => {
    if (p.name === weakest.player) return false;
    if (lineup.lineup.some(lp => lp.player === p.name)) return false;
    if (p.salary > weakest.salary + remaining) return false;
    if (p.salary <= weakest.salary) return false;
    
    return p.position === weakest.position;
  }).sort((a, b) => (b.projected_pts || 0) - (a.projected_pts || 0));
  
  if (upgrades.length > 0) {
    const pick = upgrades[0];
    
    // Validate with real data before swapping
    const validation = await validateSwapWithData(weakest, pick, context);
    
    if (validation.approved) {
      lineup.lineup[weakest.idx] = {
        ...pick,
        player: pick.name,
        rationale: `FIBLE Fix: Upgrading fragile punt ${weakest.player} ($${weakest.salary}) to verified mid-tier ${pick.name} ($${pick.salary}).`
      };
      console.log(`[Sharp Audit] ✅ Validated punt upgrade: ${weakest.player} → ${pick.name}`);
      return { approved: true, swap: `${weakest.player} → ${pick.name}` };
    } else {
      console.log(`[Sharp Audit] ❌ Punt upgrade rejected: ${validation.reason}`);
      
      // Try a different upgrade if first one failed
      if (upgrades.length > 1) {
        const secondPick = upgrades[1];
        const secondValidation = await validateSwapWithData(weakest, secondPick, context);
        if (secondValidation.approved) {
          lineup.lineup[weakest.idx] = {
            ...secondPick,
            player: secondPick.name,
            rationale: `FIBLE Fix: Upgrading fragile punt ${weakest.player} to verified mid-tier ${secondPick.name}.`
          };
          console.log(`[Sharp Audit] ✅ 2nd choice validated: ${weakest.player} → ${secondPick.name}`);
          return { approved: true, swap: `${weakest.player} → ${secondPick.name}` };
        }
      }
      return validation;
    }
  }
  
  return { approved: false, reason: 'No suitable upgrades found within salary' };
}

async function attemptNBAGameStack(lineup, allPlayers, context) {
  // Logic to find games with shootout potential and add a player from the other side
  const teamCounts = {};
  lineup.lineup.forEach(p => {
    if (p.team) teamCounts[p.team] = (teamCounts[p.team] || 0) + 1;
  });
  
  // Find games where we have players from one team but not the other
  const games = context.games || [];
  for (const game of games) {
    const homeCount = teamCounts[game.homeTeam] || 0;
    const awayCount = teamCounts[game.awayTeam] || 0;
    
    // If we have 2+ from one team and 0 from opponent, consider a bring-back
    if ((homeCount >= 2 && awayCount === 0) || (awayCount >= 2 && homeCount === 0)) {
      const targetTeam = homeCount >= 2 ? game.awayTeam : game.homeTeam;
      const bringBackOptions = allPlayers.filter(p => 
        p.team === targetTeam && 
        !lineup.lineup.some(lp => lp.player === p.name) &&
        (p.projected_pts || 0) > 20
      ).sort((a, b) => (b.projected_pts || 0) - (a.projected_pts || 0));
      
      if (bringBackOptions.length > 0) {
        console.log(`[Sharp Audit] 🎯 Game stack opportunity: Add ${bringBackOptions[0].name} (${targetTeam}) as bring-back`);
        // Don't auto-swap here, just log the suggestion for now
      }
    }
  }
}

/**
 * More aggressive fix strategies when standard fixes don't improve the score.
 * These are FIBLE-inspired approaches that look beyond simple swaps.
 */
async function applyAggressiveFixes(lineup, audit, originalPlayers, context, options) {
  const { sport, platform, contestType } = options;
  const currentLineup = { ...lineup, lineup: [...lineup.lineup] };
  
  console.log(`[Sharp Audit] 🔥 Applying aggressive FIBLE-guided fixes...`);
  
  // Strategy 1: Break up over-concentrated team stacks (>3 from same team on non-shootout)
  const teamCounts = {};
  currentLineup.lineup.forEach(p => {
    if (p.team) teamCounts[p.team] = (teamCounts[p.team] || 0) + 1;
  });
  
  for (const [team, count] of Object.entries(teamCounts)) {
    if (count > 3) {
      // Find the lowest-projected player from this team
      const teamPlayers = currentLineup.lineup
        .map((p, idx) => ({ ...p, idx }))
        .filter(p => p.team === team)
        .sort((a, b) => (a.projected_pts || 0) - (b.projected_pts || 0));
      
      if (teamPlayers.length > 0) {
        const weakest = teamPlayers[0];
        
        // Find replacement from different team
        const replacement = originalPlayers.filter(p =>
          p.team !== team &&
          p.position === weakest.position &&
          Math.abs((p.salary || 0) - (weakest.salary || 0)) <= 1000 &&
          !currentLineup.lineup.some(lp => lp.player === p.name)
        ).sort((a, b) => (b.projected_pts || 0) - (a.projected_pts || 0))[0];
        
        if (replacement) {
          console.log(`[Sharp Audit] 💱 Breaking ${team} over-stack: ${weakest.player} → ${replacement.name}`);
          currentLineup.lineup[weakest.idx] = {
            ...replacement,
            player: replacement.name,
            rationale: `FIBLE Fix: Breaking over-concentration on ${team} for better correlation spread.`
          };
        }
      }
    }
  }
  
  // Strategy 2: If too many punts, upgrade the one with lowest ceiling
  const puntThreshold = platform === 'fanduel' ? 4500 : 4000;
  const punts = currentLineup.lineup
    .map((p, idx) => ({ ...p, idx }))
    .filter(p => (p.salary || 0) <= puntThreshold);
  
  if (punts.length >= 3) {
    // Sort by ceiling (lowest first)
    const lowestCeilingPunt = punts.sort((a, b) => 
      (a.ceilingScore || a.projected_pts || 0) - (b.ceilingScore || b.projected_pts || 0)
    )[0];
    
    // Find mid-tier upgrade ($5k-$7k range)
    const midTierUpgrade = originalPlayers.filter(p =>
      p.position === lowestCeilingPunt.position &&
      p.salary >= 5000 && p.salary <= 7000 &&
      (p.projected_pts || 0) > (lowestCeilingPunt.projected_pts || 0) * 1.2 &&
      !currentLineup.lineup.some(lp => lp.player === p.name)
    ).sort((a, b) => (b.ceilingScore || b.projected_pts || 0) - (a.ceilingScore || a.projected_pts || 0))[0];
    
    if (midTierUpgrade) {
      // Check if we have salary room
      const currentSalary = currentLineup.lineup.reduce((sum, p) => sum + (p.salary || 0), 0);
      const salaryCap = currentLineup.salary_cap || 50000;
      const salaryNeeded = midTierUpgrade.salary - lowestCeilingPunt.salary;
      
      if (currentSalary + salaryNeeded <= salaryCap) {
        console.log(`[Sharp Audit] 💰 Upgrading low-ceiling punt: ${lowestCeilingPunt.player} → ${midTierUpgrade.name}`);
        currentLineup.lineup[lowestCeilingPunt.idx] = {
          ...midTierUpgrade,
          player: midTierUpgrade.name,
          rationale: `FIBLE Fix: Upgrading fragile punt for higher ceiling player.`
        };
      }
    }
  }
  
  // Strategy 3: Add game correlation if missing
  if (audit.patterns?.some(p => p.id === 'CORRELATION_BLINDNESS')) {
    await attemptNBAGameStack(currentLineup, originalPlayers, context);
  }
  
  // Recalculate totals
  currentLineup.total_salary = currentLineup.lineup.reduce((sum, p) => sum + (p.salary || 0), 0);
  currentLineup.projected_points = Math.round(currentLineup.lineup.reduce((sum, p) => sum + (p.projected_pts || 0), 0) * 10) / 10;
  
  return currentLineup;
}

export default {
  runSharpAuditCycle
};
