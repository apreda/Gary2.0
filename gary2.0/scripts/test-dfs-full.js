#!/usr/bin/env node
/**
 * Full DFS test: Discovers slates for both DK and FD, runs lineup generation
 * for each slate. Does NOT store to database.
 *
 * Run: node scripts/test-dfs-full.js
 */

// MUST load env vars FIRST before any other imports
import '../src/loadEnv.js';
import { discoverDFSSlates } from '../src/services/agentic/dfsSlateDiscoveryService.js';
import { generateAgenticDFSLineup } from '../src/services/agentic/dfs/dfsAgenticOrchestrator.js';

function estToday() {
  const now = new Date();
  const options = { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' };
  const estDate = new Intl.DateTimeFormat('en-US', options).format(now);
  const [month, day, year] = estDate.split('/');
  return `${year}-${month}-${day}`;
}

function printLineup(result, platform, slateName) {
  console.log(`\n${'═'.repeat(80)}`);
  console.log(`LINEUP: ${platform.toUpperCase()} — ${slateName}`);
  console.log(`${'═'.repeat(80)}`);
  if (result.archetype) {
    console.log(`Archetype: ${result.archetype}`);
  }
  console.log(`Total Salary: $${result.totalSalary?.toLocaleString()}`);
  console.log(`Projected Ceiling: ${result.ceilingProjection} pts`);
  console.log(`Floor Projection: ${result.floorProjection} pts`);
  console.log(`Generation Time: ${result.generationTime}`);
  if (result.conviction) {
    console.log(`Conviction: ${result.conviction}`);
  }
  console.log('');
  console.log('POS  PLAYER                  TEAM   SAL      GAME');
  console.log('─'.repeat(65));
  for (const p of (result.lineup || [])) {
    const pos = (p.position || p.pos || '??').padEnd(4);
    const name = (p.name || p.player || '???').padEnd(24);
    const team = (p.team || '??').padEnd(6);
    const sal = `$${(p.salary || 0).toLocaleString()}`.padEnd(8);
    const game = p.game || p.opponent || '';
    console.log(`${pos} ${name} ${team} ${sal} ${game}`);
  }
  console.log('─'.repeat(65));
  console.log(`TOTAL: $${result.totalSalary?.toLocaleString()} | Ceiling: ${result.ceilingProjection} pts`);

  // Full Gary's Notes — no truncation
  if (result.garyNotes) {
    console.log(`\nGary's Notes:\n${result.garyNotes}`);
  }

  // Per-player reasoning
  if (result.perPlayerReasoning) {
    console.log('\nPer-Player Reasoning:');
    for (const [player, reasoning] of Object.entries(result.perPlayerReasoning)) {
      const text = typeof reasoning === 'string' ? reasoning : JSON.stringify(reasoning, null, 2);
      console.log(`  ${player}: ${text}`);
    }
  }

  // Audit notes
  if (result.auditNotes) {
    const auditText = typeof result.auditNotes === 'string' ? result.auditNotes : JSON.stringify(result.auditNotes, null, 2);
    console.log(`\nAudit Notes:\n${auditText}`);
  }

  console.log('');
}

async function runFullTest() {
  const dateStr = estToday();
  const allResults = [];
  const errors = [];

  console.log(`\n${'═'.repeat(80)}`);
  console.log(`DFS FULL TEST (NO STORAGE) — ${dateStr}`);
  console.log(`${'═'.repeat(80)}\n`);

  // ──────────────────────────────────────────────────
  // PHASE 1: Discover all slates
  // ──────────────────────────────────────────────────
  console.log('PHASE 1: Discovering slates...\n');

  const args = process.argv.slice(2);
  const fdOnly = args.includes('--fanduel') || args.includes('--fd');
  const dkOnly = args.includes('--draftkings') || args.includes('--dk');
  const platforms = fdOnly ? ['fanduel'] : dkOnly ? ['draftkings'] : ['draftkings', 'fanduel'];
  const allSlates = {};

  for (const platform of platforms) {
    try {
      console.log(`[${platform.toUpperCase()}] Fetching slates...`);
      const slates = await discoverDFSSlates('nba', platform, dateStr);
      allSlates[platform] = slates || [];
      console.log(`[${platform.toUpperCase()}] Found ${allSlates[platform].length} slates:`);
      for (const s of allSlates[platform]) {
        console.log(`     ${s.name} — ${s.gameCount} games — ${s.startTime || 'TBD'}`);
      }
    } catch (err) {
      console.error(`[${platform.toUpperCase()}] Slate discovery FAILED: ${err.message}`);
      allSlates[platform] = [];
      errors.push({ platform, error: `Slate discovery: ${err.message}` });
    }
    console.log('');
  }

  const totalSlates = Object.values(allSlates).reduce((sum, s) => sum + s.length, 0);
  console.log(`Total slates to process: ${totalSlates}\n`);

  if (totalSlates === 0) {
    console.log('No slates found. Exiting.');
    return;
  }

  // ──────────────────────────────────────────────────
  // PHASE 2: Generate lineups for each slate
  // ──────────────────────────────────────────────────
  console.log('PHASE 2: Generating lineups (NO Supabase storage)...\n');

  let slateNum = 0;

  for (const platform of platforms) {
    for (const slate of (allSlates[platform] || [])) {
      slateNum++;
      console.log(`\n${'─'.repeat(80)}`);
      console.log(`[${slateNum}/${totalSlates}] ${platform.toUpperCase()} — ${slate.name} (${slate.gameCount} games)`);
      console.log(`${'─'.repeat(80)}\n`);

      try {
        const result = await generateAgenticDFSLineup({
          platform,
          sport: 'NBA',
          date: dateStr,
          slate,
          contestType: 'gpp'
        });
        printLineup(result, platform, slate.name);
        allResults.push({ platform, slate: slate.name, result, error: null });
      } catch (err) {
        console.error(`  FAILED: ${err.message}`);
        errors.push({ platform, slate: slate.name, error: err.message });
        allResults.push({ platform, slate: slate.name, result: null, error: err.message });
      }
    }
  }

  // ──────────────────────────────────────────────────
  // SUMMARY
  // ──────────────────────────────────────────────────
  console.log(`\n\n${'═'.repeat(80)}`);
  console.log('FINAL SUMMARY');
  console.log(`${'═'.repeat(80)}\n`);

  for (const r of allResults) {
    if (r.result) {
      console.log(`  ${r.platform.toUpperCase()} ${r.slate}: ${r.result.lineup?.length || 0} players, $${r.result.totalSalary?.toLocaleString()}, Ceiling: ${r.result.ceilingProjection} pts`);
    } else {
      console.log(`  ${r.platform.toUpperCase()} ${r.slate}: FAILED — ${r.error}`);
    }
  }

  const succeeded = allResults.filter(r => r.result).length;
  const failed = allResults.filter(r => !r.result).length;
  console.log(`\n  ${succeeded}/${totalSlates} succeeded, ${failed} failed`);

  if (errors.length > 0) {
    console.log(`\n  ERRORS:`);
    for (const e of errors) {
      console.log(`    ${e.platform?.toUpperCase() || '??'} ${e.slate || 'N/A'}: ${e.error}`);
    }
  }
  console.log('');
}

runFullTest().catch(err => {
  console.error('Full test failed:', err);
  process.exit(1);
});
