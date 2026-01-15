#!/usr/bin/env node

/**
 * Test ALL NBA DFS Slates (No Database)
 * Shows lineups for All, Turbo, Night (DK) and Main, Express, After Hours (FD)
 */

import 'dotenv/config';
import { generateDFSLineup } from './src/services/dfsLineupService.js';
import { buildDFSContext, discoverDFSSlates } from './src/services/agentic/dfsAgenticContext.js';

// Use date from command line or default to Jan 13, 2026
const TODAY = process.argv[2] || '2026-01-13';

async function runTest() {
  console.log(`\n┏${'━'.repeat(88)}┓`);
  console.log(`┃  ◆ GARY DFS OPTIMIZER                                                    ${TODAY}  ┃`);
  console.log(`┗${'━'.repeat(88)}┛`);

  const platforms = [process.argv[3] || 'draftkings', 'fanduel'].filter((p, i, a) => process.argv[3] ? p === process.argv[3] : true);
  
  for (const platform of platforms) {
    const platformIcon = platform === 'draftkings' ? '◆' : '◇';
    console.log(`\n\n${'▓'.repeat(90)}`);
    console.log(`  ${platformIcon} ${platform.toUpperCase()} LINEUPS`);
    console.log(`${'▓'.repeat(90)}`);
    
    // 1. Discover Slates
    const slates = await discoverDFSSlates('NBA', platform, TODAY);
    if (!slates || slates.length === 0) {
      console.log('  ⊘ No slates found');
      continue;
    }

    // 2. Iterate through all discovered classic slates
    for (const slate of slates) {
      if (process.argv[4] && !slate.name.toLowerCase().includes(process.argv[4].toLowerCase())) {
        continue;
      }
      console.log(`\n┌${'─'.repeat(88)}┐`);
      console.log(`│  ▸ ${slate.name.toUpperCase().padEnd(20)} ${slate.gameCount} games │ Lock: ${slate.startTime.padEnd(12)}                              │`);
      console.log(`└${'─'.repeat(88)}┘`);

      // Build Context
      console.log(`[Context] Loading players for ${slate.name}...`);
      const context = await buildDFSContext(platform, 'NBA', TODAY, slate);
      
      if (!context.players || context.players.length === 0) {
        console.log(`⚠️  No players found for slate ${slate.name}`);
        continue;
      }

      // Generate GPP Lineup
      console.log(`[Lineup] Building optimal GPP lineup...`);
      const result = await generateDFSLineup({
        platform,
        sport: 'NBA',
        players: context.players,
        context: {
          ...context,
          contestType: 'gpp',
          archetype: 'balanced_build',
          slate: slate
        }
      });

      // Print Final Lineup with Player Rationales
      const gradeEmoji = result.audit?.sharpScore >= 90 ? '★' : result.audit?.sharpScore >= 75 ? '●' : '○';
      console.log(`\n┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓`);
      console.log(`┃  ${gradeEmoji} GRADE: ${result.audit?.grade || '?'} (${result.audit?.sharpScore || 0}/100)                                                                      ┃`);
      console.log(`┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛`);
      
      // Show audit insights with cleaner formatting
      if (result.audit?.strengths?.length > 0) {
        console.log(`\n┌─ STRENGTHS`);
        result.audit.strengths.slice(0, 3).forEach(s => console.log(`│  ▸ ${s}`));
      }
      if (result.audit?.weaknesses?.length > 0) {
        console.log(`├─ CONCERNS`);
        result.audit.weaknesses.slice(0, 2).forEach(w => console.log(`│  ▹ ${w}`));
      }
      
      console.log(`\n${'━'.repeat(90)}`);
      console.log(`  LINEUP BREAKDOWN                                                        GARY'S ANALYSIS`);
      console.log(`${'━'.repeat(90)}`);
      
      result.lineup.forEach((slot, idx) => {
        const p = context.players.find(pl => pl.name === slot.player) || {};
        const ownership = p.ownership ? `${p.ownership.toFixed(1)}%` : '15.0%';
        const l5ppg = p.l5Stats?.ppg ? p.l5Stats.ppg.toFixed(1) : null;
        const l5rpg = p.l5Stats?.rpg ? p.l5Stats.rpg.toFixed(1) : null;
        const l5apg = p.l5Stats?.apg ? p.l5Stats.apg.toFixed(1) : null;
        const seasonPpg = p.seasonStats?.ppg || p.ppg || null;
        const seasonRpg = p.seasonStats?.rpg || p.rpg || null;
        const seasonApg = p.seasonStats?.apg || p.apg || null;
        const seasonMpg = p.seasonStats?.mpg || p.mpg || null;
        const form = p.recentForm || 'neutral';
        
        // Form indicator symbol
        const formIcon = form === 'hot' ? '▲' : form === 'cold' ? '▼' : '●';
        
        // Check for injury status (should never happen in lineup)
        const statusWarning = (p.status && ['OUT', 'DOUBTFUL', 'QUESTIONABLE'].includes(p.status.toUpperCase())) 
          ? ` ⊘ ${p.status}` : '';
        
        // Compact player header line - show CEILING for GPP (not floor!)
        const playerName = slot.player.padEnd(22);
        const salaryStr = `$${(slot.salary/1000).toFixed(1)}K`.padStart(6);
        // GPP: Use ceiling projection (1.5x base) - ceiling wins tournaments!
        const basePts = slot.projected_pts || 0;
        const ceilingPts = slot.ceilingScore || p.ceilingScore || basePts * 1.5;
        const projStr = `${ceilingPts.toFixed(1)}fp`.padStart(7);
        const ownStr = ownership.padStart(6);
        
        console.log(`\n  ${(idx + 1).toString().padStart(2)}│ ${slot.position.padEnd(4)} ${playerName} ${slot.team}  ${salaryStr}  ${projStr}  ${formIcon} ${ownStr}${statusWarning}`);
        
        // Stats line - compact format
        const seasonLine = seasonPpg 
          ? `SZN: ${seasonPpg.toFixed(1)}/${seasonRpg ? seasonRpg.toFixed(1) : '-'}/${seasonApg ? seasonApg.toFixed(1) : '-'}${seasonMpg ? ` [${seasonMpg.toFixed(0)}m]` : ''}`
          : 'SZN: --';
        const l5Line = l5ppg 
          ? `L5: ${l5ppg}/${l5rpg || '-'}/${l5apg || '-'}`
          : 'L5: --';
        console.log(`    │       ${seasonLine}  │  ${l5Line}`);
        
        // Build SPECIFIC rationale based on actual data
        // Using clean, modern Unicode indicators (matches Lucide icon aesthetic)
        let rationale = '';
        {
          const reasons = [];
          
          // ═══════════════════════════════════════════════════════════════
          // ICON LEGEND (High-tech terminal aesthetic):
          // ▲ = Trending Up (hot)      ▼ = Trending Down (buy-low)
          // ◉ = High Ownership (chalk) ◎ = Low Ownership (contrarian)
          // ★ = Elite Tier             ● = Strong Tier
          // ◆ = Premium Anchor         ◇ = Value/Punt
          // ⚡ = Upside Play            ⊘ = Warning/Risk
          // ▸ = Benchmark/Expert       ⏱ = Minutes
          // ═══════════════════════════════════════════════════════════════
          
          // Form-based insights (most important)
          if (form === 'hot' && l5ppg && seasonPpg) {
            const pctUp = ((parseFloat(l5ppg) / seasonPpg - 1) * 100).toFixed(0);
            reasons.push(`▲ HOT [+${pctUp}%] L5 ${l5ppg} vs ${seasonPpg.toFixed(1)} szn`);
          } else if (form === 'cold' && l5ppg && seasonPpg) {
            const pctDown = ((1 - parseFloat(l5ppg) / seasonPpg) * 100).toFixed(0);
            reasons.push(`▼ BUY-LOW [-${pctDown}%] L5 ${l5ppg} vs ${seasonPpg.toFixed(1)} szn`);
          }
          
          // High ownership chalk
          if (p.isChalk || (p.ownership && p.ownership > 25)) {
            reasons.push(`◉ CHALK ${ownership}`);
          }
          
          // Low ownership contrarian
          if (p.isContrarian || (p.ownership && p.ownership < 10)) {
            reasons.push(`◎ CONTRARIAN ${ownership}`);
          }
          
          // Scoring tier
          if (seasonPpg && seasonPpg >= 25) {
            reasons.push(`★ ELITE ${seasonPpg.toFixed(1)}ppg`);
          } else if (seasonPpg && seasonPpg >= 18) {
            reasons.push(`● CORE ${seasonPpg.toFixed(1)}ppg`);
          }
          
          // High volume player
          if (seasonMpg && seasonMpg >= 34) {
            reasons.push(`⏱ ${seasonMpg.toFixed(0)}min`);
          }
          
          // Double-double threat
          if (seasonPpg && seasonRpg && seasonPpg >= 15 && seasonRpg >= 8) {
            reasons.push(`⚡ 2x2 upside`);
          }
          
          // Playmaker
          if (seasonApg && seasonApg >= 7) {
            reasons.push(`⚡ ${seasonApg.toFixed(1)}ast`);
          }
          
          // Value based on salary
          if (slot.salary >= 9000) {
            reasons.push(`◆ ANCHOR $${(slot.salary/1000).toFixed(1)}K`);
          } else if (slot.salary <= 4500) {
            if (seasonPpg && seasonPpg >= 8) {
              reasons.push(`◇ VALUE ${seasonPpg.toFixed(1)}ppg@$${(slot.salary/1000).toFixed(1)}K`);
            } else {
              reasons.push(`◇ PUNT $${(slot.salary/1000).toFixed(1)}K`);
            }
          } else if (slot.salary >= 6000 && slot.salary <= 8000) {
            reasons.push(`● MID $${(slot.salary/1000).toFixed(1)}K`);
          }
          
          // Expert benchmark
          if (p.benchmarkProjection && p.benchmarkProjection > 30) {
            reasons.push(`▸ PROJ ${p.benchmarkProjection.toFixed(1)}`);
          }
          
          // No data fallback (concerning)
          if (!seasonPpg && !l5ppg) {
            reasons.push(`⊘ NO-DATA ~${(slot.salary / 1000 * 5).toFixed(1)}fp est`);
          }
          
          rationale = reasons.length > 0 ? reasons.join('  ┃  ') : '● SOLID';
        }
        console.log(`   └─ ${rationale}`);
      });
      
      const totalSalary = result.lineup.reduce((sum, s) => sum + s.salary, 0);
      const totalProj = result.lineup.reduce((sum, s) => sum + (s.projected_pts || 0), 0);
      // GPP CEILING: Use ceiling projections (what wins tournaments!)
      const totalCeiling = result.lineup.reduce((sum, s) => {
        const p = context.players.find(pl => pl.name === s.player) || {};
        return sum + (s.ceilingScore || p.ceilingScore || (s.projected_pts || 0) * 1.5);
      }, 0);
      const salaryCap = platform === 'draftkings' ? 50000 : 60000;
      const salaryRemaining = salaryCap - totalSalary;
      
      // Slate size determines GPP target
      const slateGames = slate.gameCount || 7;
      const gppTarget = slateGames >= 7 ? 320 : slateGames >= 4 ? 305 : 290;
      const ceilingStatus = totalCeiling >= gppTarget ? '✓ GPP-VIABLE' : `⚠️ Below ${gppTarget} target`;
      
      console.log(`\n${'━'.repeat(90)}`);
      console.log(`  SALARY: $${(totalSalary/1000).toFixed(1)}K / $${(salaryCap/1000).toFixed(0)}K  │  CEILING: ${totalCeiling.toFixed(0)} fp ${ceilingStatus}  │  GRADE: ${result.audit?.grade || '?'}`);
      console.log(`${'━'.repeat(90)}`);
      
      // VALIDATION: Check for injured players in lineup
      const injuredInLineup = result.lineup.filter(slot => {
        const p = context.players.find(pl => pl.name === slot.player);
        return p && p.status && ['OUT', 'DOUBTFUL'].includes(p.status.toUpperCase());
      });
      
      if (injuredInLineup.length > 0) {
        console.log(`\n  ⊘ VALIDATION FAILED`);
        injuredInLineup.forEach(slot => {
          const p = context.players.find(pl => pl.name === slot.player);
          console.log(`    └─ ${slot.player} is ${p?.status} - INVALID`);
        });
      } else {
        console.log(`  ✓ All players confirmed ACTIVE`);
      }
      
      // Show players with no data (concerning)
      const noDataPlayers = result.lineup.filter(slot => {
        const p = context.players.find(pl => pl.name === slot.player);
        return !p?.seasonStats?.ppg && !p?.l5Stats?.ppg;
      });
      if (noDataPlayers.length > 0) {
        console.log(`  ⊘ DATA GAPS: ${noDataPlayers.length} players using salary-based projections`);
        noDataPlayers.forEach(slot => console.log(`    └─ ${slot.player} ($${slot.salary})`));
      }
      
      // ═══════════════════════════════════════════════════════════════════════
      // LATE SWAP ALERTS (for Notes section)
      // ═══════════════════════════════════════════════════════════════════════
      if (result.lateSwapAlerts && result.lateSwapAlerts.length > 0) {
        console.log(`\n⚡ LATE SWAP ALERTS (monitor before tip)`);
        console.log(`${'─'.repeat(50)}`);
        result.lateSwapAlerts.forEach(alert => {
          const icon = alert.priority === 'HIGH' ? '🔴' : alert.priority === 'MEDIUM' ? '🟡' : '🔵';
          console.log(`  ${icon} ${alert.trigger}`);
          console.log(`     → ${alert.action}`);
        });
      }
      
      // ═══════════════════════════════════════════════════════════════════════
      // GARY'S IMPROVEMENT PLAN (FIBLE-based investigation)
      // ═══════════════════════════════════════════════════════════════════════
      if (result.improvementPlan) {
        const plan = result.improvementPlan;
        
        if (plan.improvements?.length > 0 || plan.investigations?.length > 0) {
          console.log(`\n📖 GARY'S FIBLE-BASED REVIEW`);
          console.log(`${'─'.repeat(60)}`);
          console.log(`  Current: ${plan.currentGrade} (${plan.currentScore}/100) → Target: A (90+)`);
          
          // Show investigation questions (FIBLE approach)
          if (plan.investigations?.length > 0) {
            console.log(`\n  🔍 QUESTIONS TO INVESTIGATE (verify with BDL/Gemini):`);
            plan.investigations.slice(0, 3).forEach((inv, i) => {
              console.log(`  ${i + 1}. ${inv.question}`);
              console.log(`     └─ How: ${inv.howToVerify.substring(0, 80)}...`);
            });
          }
          
          // Show suggested fixes (require validation)
          if (plan.improvements?.length > 0) {
            console.log(`\n  💡 POSSIBLE IMPROVEMENTS (requires validation):`);
            plan.improvements.forEach((imp, i) => {
              console.log(`  ${i + 1}. ${imp.issue}`);
              console.log(`     ▸ ${imp.fix}`);
              if (imp.requiresValidation) {
                console.log(`     ⚠️ Verify this is correct for tonight's slate!`);
              }
            });
          }
          
          if (plan.fibleReminder) {
            console.log(`\n  📖 ${plan.fibleReminder}`);
          }
        }
      }
    }
  }
}

runTest().catch(console.error);
