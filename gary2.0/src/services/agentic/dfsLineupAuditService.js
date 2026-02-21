/**
 * DFS Lineup Audit Service
 * 
 * Grades lineups against Sharp DFS Principles and detects losing patterns.
 * Provides suggestions for fixes to improve the Sharp Score.
 * Now includes Harmony Analysis based on Advanced DFS Strategies.
 * 
 * REFERENCES THE FIBLE - Gary's Fantasy Bible for SOTA strategies.
 */

import { SHARP_DFS_PRINCIPLES, LOSING_PATTERNS } from './sharpDFSPrinciples.js';
import { analyzeLineupStacking } from './nbaStackingRules.js';

/**
 * Grades a lineup and provides an audit report.
 * 
 * @param {Object} lineup - The lineup to audit
 * @param {Object} context - Contest context (players, games, ownership)
 * @param {Object} options - Sport, platform, contestType
 * @returns {Promise<Object>} Audit report with grade, score, and suggestions
 */
export async function auditLineup(lineup, context, options = {}) {
  const { sport = 'NBA', platform = 'draftkings', contestType = 'gpp' } = options;
  const isGPP = contestType === 'gpp';
  
  let sharpScore = 100;
  const strengths = [];
  const weaknesses = [];
  const patterns = [];
  
  const players = lineup.lineup || [];
  
  // 0. Dead Air Analysis (Rotation/Injury Risk)
  const deadAirPlayers = players.filter(p => {
    // If we flagged them as fromSalaryDataOnly and they are cheap, they are high risk
    if (p.fromSalaryDataOnly && (p.salary || 0) < 4500) return true;
    
    // If they have effectively zero projected points (but somehow made it in)
    if ((p.projected_pts || 0) < 5) return true;
    
    return false;
  });
  
  if (deadAirPlayers.length > 0) {
    sharpScore -= (deadAirPlayers.length * 20); // Massive penalty for zeros
    patterns.push({ id: 'DEAD_AIR', name: 'Dead Air', description: 'Including players with zero rotation probability or stale injury data.' });
    weaknesses.push(`Dead Air: ${deadAirPlayers.length} players (${deadAirPlayers.map(p => p.player).join(', ')}) are high-risk for DNP or zero production.`);
  }

  // 1. Punt Analysis (Punt Overload)
  const puntThreshold = platform === 'fanduel' ? 4500 : 4000;
  const punts = players.filter(p => (p.salary || 0) <= puntThreshold);
  
  if (punts.length >= 3) {
    sharpScore -= 15;
    patterns.push(LOSING_PATTERNS.PUNT_OVERLOAD);
    weaknesses.push(`Punt Overload: ${punts.length} players at min-salary creates a fragile floor.`);
  } else if (punts.length > 0) {
    strengths.push(`Controlled punt exposure (${punts.length} punt plays).`);
  }

  // 2. Ownership/Leverage Analysis (Chalk Lock)
  const avgOwnership = players.reduce((sum, p) => sum + (p.ownership || 15), 0) / players.length;
  
  if (isGPP) {
    if (avgOwnership > 25) {
      sharpScore -= 20;
      patterns.push(LOSING_PATTERNS.CHALK_LOCK);
      weaknesses.push(`Avg ownership: ${avgOwnership.toFixed(1)}%. Investigate whether this ownership concentration is justified for each player.`);
    } else if (avgOwnership < 15) {
      strengths.push(`Excellent GPP leverage (Avg own: ${avgOwnership.toFixed(1)}%).`);
    } else {
      strengths.push(`Balanced ownership profile (${avgOwnership.toFixed(1)}%).`);
    }
  }

  // 3. Correlation Analysis (Harmony)
  let harmonyInsights = [];
  if (sport.toUpperCase() === 'NBA') {
    const stackingAnalysis = analyzeLineupStacking(players, context);
    
    strengths.push(...stackingAnalysis.strengths);
    weaknesses.push(...stackingAnalysis.weaknesses);
    sharpScore += (stackingAnalysis.sharpScore - 0); // stackingAnalysis.sharpScore is relative, but here we add its bonus/penalty
    
    if (stackingAnalysis.grade === 'D' || stackingAnalysis.grade === 'F') {
      patterns.push(LOSING_PATTERNS.CORRELATION_BLINDNESS);
    }
    
    if (stackingAnalysis.gameStacks.length > 0) {
      stackingAnalysis.gameStacks.forEach(gs => {
        harmonyInsights.push(`Capture Shootout: Game stack in ${gs} leverages shootout potential.`);
      });
    }
  } else if (sport.toUpperCase() === 'NFL') {
    const teamCounts = {};
    players.forEach(p => {
      if (p.team) teamCounts[p.team] = (teamCounts[p.team] || 0) + 1;
    });
    
    const stacks = Object.entries(teamCounts).filter(([_, count]) => count >= 2);

    const qb = players.find(p => p.position === 'QB');
    if (qb) {
      const qbTeammates = players.filter(p => p.team === qb.team && p.position !== 'QB');
      if (qbTeammates.length === 0 && isGPP) {
        sharpScore -= 15;
        patterns.push(LOSING_PATTERNS.CORRELATION_BLINDNESS);
        weaknesses.push(`Naked QB: ${qb.player} has no pass catchers stacked.`);
      } else if (qbTeammates.length >= 1) {
        strengths.push(`Sharp NFL Stack: ${qb.player} with ${qbTeammates.map(p => p.player).join(', ')}.`);
        harmonyInsights.push(`Ceiling Synergy: ${qb.player} paired with ${qbTeammates.length} weapons.`);
      }
    }
  }

  // 4. Matchup Analysis
  const badMatchups = players.filter(p => p.dvpRank && p.dvpRank > 25);
  if (badMatchups.length >= 2) {
    sharpScore -= 10;
    weaknesses.push(`${badMatchups.length} players facing bottom-5 DvP matchups. Investigate what the matchup data shows for each.`);
  }

  // 6. Blowout Risk Analysis
  const blowoutRiskPlayers = players.filter(p => {
    const spread = p.teamSpread || p.spread || 0;
    const salary = p.salary || 0;
    // Flag: expensive player on heavy favorite
    return salary >= 7000 && spread <= -10;
  });
  
  if (blowoutRiskPlayers.length > 0 && isGPP) {
    sharpScore -= (blowoutRiskPlayers.length * 8);
    blowoutRiskPlayers.forEach(p => {
      const spread = Math.abs(p.teamSpread || p.spread || 10);
      weaknesses.push(`BLOWOUT RISK: ${p.player} ($${p.salary}) on -${spread} favorite. Investigate minutes outlook.`);
    });
    if (blowoutRiskPlayers.length >= 2) {
      patterns.push({ id: 'BLOWOUT_RISK', name: 'Blowout Risk', description: 'Multiple expensive players on heavy favorites. Investigate minutes profiles.' });
    }
  }
  
  // Underdog stars — minutes profile observation
  const underdogStars = players.filter(p => {
    const spread = p.teamSpread || p.spread || 0;
    const salary = p.salary || 0;
    return salary >= 8000 && spread >= 5; // Underdog by 5+
  });

  if (underdogStars.length > 0 && isGPP) {
    strengths.push(`Underdog stars: ${underdogStars.map(p => p.player).join(', ')} on underdogs (+5 or more). Investigate minutes profiles.`);
  }

  // 7. Salary Efficiency
  const cap = lineup.salary_cap || (platform === 'fanduel' ? 60000 : 50000);
  const used = players.reduce((sum, p) => sum + (p.salary || 0), 0);
  const remaining = cap - used;
  
  if (remaining > 2000) {
    sharpScore -= 10;
    weaknesses.push(`$${remaining.toLocaleString()} unused salary. Investigate whether an upgrade at any position improves the lineup.`);
  } else if (remaining < 500) {
    strengths.push(`Maximum salary efficiency ($${remaining} left).`);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // FIBLE AWARENESS: Gary reflects on lineup quality (non-prescriptive)
  // ═══════════════════════════════════════════════════════════════════════════
  // 
  // The FIBLE doesn't give Gary specific scores - it gives him QUESTIONS to ask
  // and AREAS to investigate. Gary then makes his own judgment.
  // 
  if (isGPP) {
    const fibleReflections = reflectOnFIBLEPrinciples(players, context, platform);
    
    // Add observations (not score adjustments)
    strengths.push(...fibleReflections.observations.filter(o => o.type === 'strength').map(o => o.text));
    weaknesses.push(...fibleReflections.observations.filter(o => o.type === 'concern').map(o => o.text));
    
    // Add areas Gary should investigate further
    fibleReflections.investigationNeeded.forEach(area => {
      patterns.push({
        id: `INVESTIGATE_${area.id}`,
        name: area.name,
        description: area.question
      });
    });
    
    // Add harmony insights from FIBLE reflection
    harmonyInsights.push(...fibleReflections.harmonyInsights);
  }

  const result = {
    grade: calculateGrade(sharpScore),
    sharpScore: Math.max(0, Math.min(100, sharpScore)), // Clamp to 0-100
    strengths,
    weaknesses,
    patterns,
    harmonyInsights,
    auditDate: new Date().toISOString()
  };

  return result;
}

/**
 * FIBLE-guided reflection on lineup quality.
 * 
 * IMPORTANT: This is NOT prescriptive scoring. Gary observes patterns and
 * asks questions. He then uses BDL/Gemini to investigate and make judgments.
 * 
 * The FIBLE teaches Gary WHAT TO LOOK FOR, not WHAT TO DO.
 */
function reflectOnFIBLEPrinciples(players, context, platform) {
  const observations = [];
  const investigationNeeded = [];
  const harmonyInsights = [];
  
  // ─────────────────────────────────────────────────────────────────────────
  // OBSERVE: How concentrated is this lineup?
  // (FIBLE reminds Gary that correlation matters in GPPs)
  // ─────────────────────────────────────────────────────────────────────────
  const teamCounts = {};
  players.forEach(p => {
    if (p.team) teamCounts[p.team] = (teamCounts[p.team] || 0) + 1;
  });
  
  const teamsUsed = Object.keys(teamCounts).length;
  const maxFromOneTeam = Math.max(...Object.values(teamCounts), 0);
  
  if (maxFromOneTeam >= 3) {
    observations.push({
      type: 'strength',
      text: `Correlation observed: ${maxFromOneTeam} players from same team - check if game environment supports this`
    });
    harmonyInsights.push(`Team stack present: ${maxFromOneTeam} players from one team. Investigate game environment.`);
  }
  
  if (teamsUsed >= 6) {
    observations.push({
      type: 'concern',
      text: `Lineup spread across ${teamsUsed} teams. Investigate whether concentration could affect ceiling.`
    });
    investigationNeeded.push({
      id: 'CORRELATION',
      name: 'Correlation Check',
      question: 'Is this lineup too scattered? Which games tonight have the best stacking potential?'
    });
  }
  
  // ─────────────────────────────────────────────────────────────────────────
  // OBSERVE: Does this lineup have differentiation potential?
  // (FIBLE reminds Gary that leverage matters, but doesn't dictate thresholds)
  // ─────────────────────────────────────────────────────────────────────────
  const lowOwnedPlayers = players.filter(p => (p.ownership || 15) < 12);
  const highOwnedPlayers = players.filter(p => (p.ownership || 15) > 25);
  
  if (lowOwnedPlayers.length > 0) {
    observations.push({
      type: 'strength',
      text: `Differentiation potential: ${lowOwnedPlayers.map(p => p.player).join(', ')} are low-owned - verify they have real upside`
    });
  }
  
  if (highOwnedPlayers.length >= 4) {
    observations.push({
      type: 'concern',
      text: `${highOwnedPlayers.length} high-owned players - lineup may look like everyone else's`
    });
    investigationNeeded.push({
      id: 'LEVERAGE',
      name: 'Ownership Check',
      question: 'What is driving the ownership on these players? Investigate whether it reflects the data or other factors.'
    });
  }
  
  // ─────────────────────────────────────────────────────────────────────────
  // OBSERVE: Does Gary have a clear reason for each pick?
  // (FIBLE reminds Gary that "he's good" is not a reason)
  // ─────────────────────────────────────────────────────────────────────────
  const playersWithoutContext = players.filter(p => 
    p.fromSalaryDataOnly || 
    (!p.l5Stats && !p.seasonStats)
  );
  
  if (playersWithoutContext.length > 0) {
    observations.push({
      type: 'concern',
      text: `${playersWithoutContext.length} player(s) lack statistical context: ${playersWithoutContext.map(p => p.player).join(', ')}`
    });
    investigationNeeded.push({
      id: 'DATA_GAPS',
      name: 'Data Verification',
      question: 'These players lack statistical context. Investigate whether they are in the active rotation and what their role is.'
    });
  }
  
  // ─────────────────────────────────────────────────────────────────────────
  // OBSERVE: What's the ceiling potential?
  // (FIBLE reminds Gary that GPPs need upside, but Gary decides what's enough)
  // ─────────────────────────────────────────────────────────────────────────
  const totalCeiling = players.reduce((sum, p) => sum + (p.ceilingScore || p.projected_pts || 0), 0);
  
  observations.push({
    type: 'observation',
    text: `Ceiling projection: ${totalCeiling.toFixed(0)} pts. Investigate whether this is competitive for tonight's slate.`
  });
  
  // Check for blowout risk situations
  const blowoutRiskPlayers = players.filter(p => {
    const spread = p.teamSpread || p.spread || 0;
    const salary = p.salary || 0;
    return salary >= 7000 && spread <= -10;
  });
  
  if (blowoutRiskPlayers.length > 0) {
    observations.push({
      type: 'concern',
      text: `Blowout risk: ${blowoutRiskPlayers.map(p => p.player).join(', ')} are expensive stars on heavy favorites`
    });
    investigationNeeded.push({
      id: 'BLOWOUT',
      name: 'Blowout Risk',
      question: 'Will these games actually blow out? Check head-to-head history and upset potential.'
    });
  }
  
  return {
    observations,
    investigationNeeded,
    harmonyInsights
  };
}

function calculateGrade(score) {
  if (score >= 90) return 'A';
  if (score >= 80) return 'B';
  if (score >= 70) return 'C';
  if (score >= 60) return 'D';
  return 'F';
}

// ═══════════════════════════════════════════════════════════════════════════
// LATE SWAP ALERTS - Generate actionable suggestions for Notes section
// ═══════════════════════════════════════════════════════════════════════════
// Since lineups are locked once set, Gary provides "if/then" alerts to monitor

export function generateLateSwapAlerts(lineup, playerPool, context = {}) {
  const alerts = [];
  const players = lineup.lineup || lineup.players || [];
  
  // Find players in lineup who are questionable or have injury risk
  const riskyPlayers = players.filter(p => {
    const status = (p.status || '').toUpperCase();
    return status === 'QUESTIONABLE' || status === 'PROBABLE' || status === 'GTD';
  });
  
  riskyPlayers.forEach(player => {
    // Find backup options at same position
    const backups = playerPool.filter(p => 
      p.team === player.team &&
      p.name !== player.player &&
      p.position === player.position &&
      (p.salary || 0) <= (player.salary || 10000)
    ).sort((a, b) => (b.projected_pts || 0) - (a.projected_pts || 0)).slice(0, 2);
    
    if (backups.length > 0) {
      alerts.push({
        type: 'QUESTIONABLE_PLAYER',
        trigger: `If ${player.player} is ruled OUT`,
        action: `INVESTIGATE: ${backups[0].name} — check recent production and salary`,
        salary: backups[0].salary,
        priority: 'HIGH'
      });
    }
  });
  
  // Find stars in lineup who could be rested (back-to-back, blowout risk)
  const restRiskPlayers = players.filter(p => {
    const isExpensive = (p.salary || 0) >= 8000;
    const isB2B = p.isB2B || context.isB2B;
    return isExpensive && isB2B;
  });
  
  restRiskPlayers.forEach(player => {
    alerts.push({
      type: 'REST_RISK',
      trigger: `If ${player.player} sits (B2B rest)`,
      action: `Check 30 min before tip for usage beneficiary`,
      priority: 'MEDIUM'
    });
  });
  
  // Find injury situations where teammates would benefit
  const injuredStars = context.injuries?.filter(inj => 
    inj.status === 'OUT' && (inj.salary || 0) >= 7000
  ) || [];
  
  injuredStars.forEach(injury => {
    const beneficiaries = playerPool.filter(p =>
      p.team === injury.team &&
      p.name !== injury.player
    ).sort((a, b) => (b.projected_pts || 0) - (a.projected_pts || 0)).slice(0, 2);
    
    if (beneficiaries.length > 0 && !players.some(p => p.player === beneficiaries[0].name)) {
      alerts.push({
        type: 'MISSED_VALUE',
        trigger: `${injury.player} is OUT`,
        action: `Consider: ${beneficiaries[0].name} ($${beneficiaries[0].salary}) inherits usage`,
        priority: 'INFO'
      });
    }
  });
  
  return alerts;
}

// ═══════════════════════════════════════════════════════════════════════════
// GARY'S SELF-IMPROVEMENT SYSTEM - Grade to A
// ═══════════════════════════════════════════════════════════════════════════
// Gary reviews his own lineup and suggests specific fixes to improve the grade

/**
 * Generate improvement plan based on FIBLE investigation framework.
 * 
 * IMPORTANT: This generates QUESTIONS to investigate, not automatic swaps.
 * Gary should use BDL stats and Gemini grounding to VALIDATE each suggestion.
 */
export function generateImprovementPlan(auditResult, lineup, playerPool, context = {}) {
  const improvements = [];
  const investigations = []; // Questions Gary should investigate
  const players = lineup.lineup || lineup.players || [];
  const { grade, sharpScore, weaknesses } = auditResult;
  
  // Already an A - still suggest validations
  if (grade === 'A') {
    return {
      currentGrade: grade,
      targetGrade: 'A',
      improvements: [],
      investigations: [{
        question: "Is each pick validated by real data?",
        howToVerify: "Review each player's L5 stats via BDL, confirm matchup advantage via Gemini grounding.",
        fibleReference: "GARY_DFS_PHILOSOPHY.validation"
      }],
      message: 'Lineup scored well. Verify each pick is backed by investigation data.'
    };
  }
  
  const pointsNeeded = 90 - sharpScore;
  
  // Analyze weaknesses and suggest INVESTIGATIONS (not automatic fixes)
  weaknesses.forEach(weakness => {
    // Punt Overload - investigate if punts are actually bad
    if (weakness.includes('Punt Overload')) {
      const punts = players.filter(p => (p.salary || 0) <= 4500)
        .sort((a, b) => (a.projected_pts || 0) - (b.projected_pts || 0));
      
      if (punts.length > 0) {
        const worstPunt = punts[0];
        
        // Add investigation question (FIBLE approach)
        investigations.push({
          question: `Are the punt plays (${punts.map(p => p.player).join(', ')}) actually bad, or do they have real upside?`,
          howToVerify: "Check BDL for each punt's recent minutes & usage. Use Gemini to find if any have role changes or injury benefits.",
          fibleReference: "GARY_INVESTIGATION_QUESTIONS.LINEUP_QUESTIONS[1]"
        });
        
        const upgrades = playerPool.filter(p =>
          p.salary > worstPunt.salary &&
          p.salary <= worstPunt.salary + 2000 &&
          (p.projected_pts || 0) > (worstPunt.projected_pts || 0) * 1.3
        ).sort((a, b) => (b.projected_pts || 0) - (a.projected_pts || 0)).slice(0, 1);
        
        if (upgrades.length > 0) {
          improvements.push({
            issue: 'Punt Overload',
            fix: `INVESTIGATE: ${worstPunt.player} ($${worstPunt.salary}) → ${upgrades[0].name} ($${upgrades[0].salary})`,
            impact: '+10-15 points',
            reasoning: 'Verify upgrade has real role before swapping. Check BDL for minutes.',
            requiresValidation: true
          });
        }
      }
    }
    
    // Chalk Lock - investigate if ownership is accurate
    if (weakness.includes('Chalk Lock')) {
      const chalkPlayers = players.filter(p => (p.ownership || 15) >= 25)
        .sort((a, b) => (b.ownership || 15) - (a.ownership || 15));
      
      if (chalkPlayers.length > 0) {
        const highestChalk = chalkPlayers[0];
        
        // Add investigation question
        investigations.push({
          question: `Is ${highestChalk.player}'s ${highestChalk.ownership}% ownership justified, or is it recency bias?`,
          howToVerify: "Investigate what is driving this player's expected ownership. Check recent production data.",
          fibleReference: "ADVANCED_OWNERSHIP_LEVERAGE.chalkFadeIndicators"
        });
        
        const pivots = playerPool.filter(p =>
          p.position === highestChalk.position &&
          Math.abs(p.salary - highestChalk.salary) <= 1000 &&
          (p.ownership || 15) < 15 &&
          (p.projected_pts || 0) >= (highestChalk.projected_pts || 0) * 0.85
        ).slice(0, 1);
        
        if (pivots.length > 0) {
          improvements.push({
            issue: 'Chalk Lock (High Ownership)',
            fix: `INVESTIGATE PIVOT: ${highestChalk.player} (${highestChalk.ownership}%) → ${pivots[0].name} (${pivots[0].ownership || 10}%)`,
            impact: '+15-20 leverage points',
            reasoning: 'Verify pivot has similar ceiling before swapping',
            requiresValidation: true
          });
        }
      }
    }
    
    // Blowout Risk - investigate if blowout is actually likely
    if (weakness.includes('BLOWOUT RISK')) {
      const match = weakness.match(/BLOWOUT RISK: ([^(]+)/);
      if (match) {
        const playerName = match[1].trim();
        const player = players.find(p => p.player === playerName);
        
        if (player) {
          // Add investigation question
          investigations.push({
            question: `What does the data show about blowout probability for ${playerName}'s game?`,
            howToVerify: "Investigate recent head-to-head results and the matchup dynamics.",
            fibleReference: "MINUTES_INHERITANCE.blowoutRiskModeling"
          });
          
          // Find underdog alternative
          const underdogAlts = playerPool.filter(p =>
            p.position === player.position &&
            Math.abs(p.salary - player.salary) <= 1500 &&
            (p.teamSpread || 0) >= 3 // Underdog
          ).sort((a, b) => (b.projected_pts || 0) - (a.projected_pts || 0)).slice(0, 1);
          
          if (underdogAlts.length > 0) {
            improvements.push({
              issue: 'Blowout Risk (Star on Heavy Favorite)',
              fix: `INVESTIGATE: ${player.player} → ${underdogAlts[0].name} (underdog, plays full game)`,
              impact: '+8-10 points',
              reasoning: 'First verify if blowout risk is real for this specific matchup',
              requiresValidation: true
            });
          }
        }
      }
    }
    
    // No Game Stack - investigate best stack opportunities
    if (weakness.includes('No game correlation') || weakness.includes('NO CORRELATION')) {
      // Add investigation question
      investigations.push({
        question: "Which games tonight have game environments that support stacking?",
        howToVerify: "Investigate O/U totals, spreads, and pace data for each game.",
        fibleReference: "CORRELATION_STRATEGY.gameStackStrategy.idealGameProfile"
      });
      
      const teamCounts = {};
      players.forEach(p => {
        if (p.team) teamCounts[p.team] = (teamCounts[p.team] || 0) + 1;
      });
      
      const games = context.games || [];
      const highTotalGames = games.filter(g => (g.total || 220) >= 230);
      
      if (highTotalGames.length > 0) {
        const bestGame = highTotalGames[0];
        improvements.push({
          issue: 'No Game Correlation',
          fix: `INVESTIGATE STACK: ${bestGame.homeTeam} vs ${bestGame.awayTeam} (O/U: ${bestGame.total})`,
          impact: '+15-20 ceiling points',
          reasoning: 'Verify game environment is real shootout potential, not just high total',
          requiresValidation: true
        });
      }
    }
  });
  
  // Add general validation question based on FIBLE philosophy
  investigations.push({
    question: "Does this lineup tell a coherent 'story' of how it wins?",
    howToVerify: "Explain in one sentence the path to victory. If you can't, the lineup may be scattered.",
    fibleReference: "GARY_DFS_PHILOSOPHY.validation"
  });
  
  // Calculate projected new grade
  const potentialPoints = improvements.reduce((sum, imp) => {
    const match = imp.impact.match(/\+(\d+)/);
    return sum + (match ? parseInt(match[1]) : 5);
  }, 0);
  
  const projectedScore = Math.min(100, sharpScore + potentialPoints);
  const projectedGrade = calculateGrade(projectedScore);
  
  return {
    currentGrade: grade,
    currentScore: sharpScore,
    targetGrade: 'A',
    projectedGrade,
    projectedScore,
    pointsNeeded,
    improvements,
    investigations, // Questions Gary should verify with BDL/Gemini
    fibleReminder: "Investigate each suggestion against tonight's data before acting.",
    message: improvements.length > 0 
      ? `📈 ${improvements.length} possible improvements - INVESTIGATE to verify`
      : '⚠️ No clear formula-based improvements - use FIBLE questions to investigate manually'
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// FORMAT LATE SWAP ALERTS FOR NOTES
// ═══════════════════════════════════════════════════════════════════════════

export function formatLateSwapAlerts(alerts) {
  if (!alerts || alerts.length === 0) {
    return '';
  }
  
  let output = '\n⚡ LATE SWAP ALERTS (monitor before tip)\n';
  output += '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n';
  
  alerts.forEach(alert => {
    const priorityIcon = alert.priority === 'HIGH' ? '🔴' : 
                         alert.priority === 'MEDIUM' ? '🟡' : '🔵';
    output += `${priorityIcon} ${alert.trigger}\n`;
    output += `   → ${alert.action}\n`;
  });
  
  return output;
}

export default {
  auditLineup,
  generateLateSwapAlerts,
  generateImprovementPlan,
  formatLateSwapAlerts
};
