#!/usr/bin/env node
/**
 * Full DFS test: Discovers slates for both DK and FD, runs lineup generation
 * for each slate. Does NOT store to database.
 *
 * Run: node scripts/test-dfs-full.js
 */
import 'dotenv/config';
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
  console.log(`Archetype: ${result.archetype}`);
  console.log(`Thesis: ${result.buildThesis?.slice(0, 150)}...`);
  console.log(`Total Salary: $${result.totalSalary?.toLocaleString()}`);
  console.log(`Projected Ceiling: ${result.ceilingProjection} pts`);
  console.log(`Generation Time: ${result.generationTime}`);
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
  if (result.garyNotes) {
    console.log(`\nGary's Notes: ${result.garyNotes.slice(0, 200)}`);
  }
  console.log('');
}

async function runFullTest() {
  const dateStr = estToday();
  const allResults = [];

  console.log(`\n${'═'.repeat(80)}`);
  console.log(`DFS FULL TEST — ${dateStr}`);
  console.log(`${'═'.repeat(80)}\n`);

  // ──────────────────────────────────────────────────
  // PHASE 1: Discover all slates
  // ──────────────────────────────────────────────────
  console.log('PHASE 1: Discovering slates...\n');

  let dkSlates = [];
  let fdSlates = [];

  try {
    console.log('[DK] Fetching DraftKings slates...');
    dkSlates = await discoverDFSSlates('nba', 'draftkings', dateStr);
    console.log(`[DK] Found ${dkSlates.length} slates:`);
    for (const s of dkSlates) {
      console.log(`     ${s.name} — ${s.gameCount} games — ${s.startTime || 'TBD'}`);
    }
  } catch (err) {
    console.error(`[DK] Slate discovery FAILED: ${err.message}`);
  }

  console.log('');

  try {
    console.log('[FD] Fetching FanDuel slates...');
    fdSlates = await discoverDFSSlates('nba', 'fanduel', dateStr);
    console.log(`[FD] Found ${fdSlates.length} slates:`);
    for (const s of fdSlates) {
      console.log(`     ${s.name} — ${s.gameCount} games — ${s.startTime || 'TBD'}`);
    }
  } catch (err) {
    console.error(`[FD] Slate discovery FAILED: ${err.message}`);
  }

  const totalSlates = dkSlates.length + fdSlates.length;
  console.log(`\nTotal slates to process: ${totalSlates} (${dkSlates.length} DK + ${fdSlates.length} FD)\n`);

  if (totalSlates === 0) {
    console.log('No slates found. Exiting.');
    return;
  }

  // ──────────────────────────────────────────────────
  // PHASE 2: Generate lineups for each slate
  // ──────────────────────────────────────────────────
  console.log('PHASE 2: Generating lineups...\n');

  let slateNum = 0;

  // DraftKings slates
  for (const slate of dkSlates) {
    slateNum++;
    console.log(`\n${'─'.repeat(80)}`);
    console.log(`[${slateNum}/${totalSlates}] DraftKings — ${slate.name} (${slate.gameCount} games)`);
    console.log(`${'─'.repeat(80)}\n`);

    try {
      const result = await generateAgenticDFSLineup({
        platform: 'draftkings',
        sport: 'NBA',
        date: dateStr,
        slate,
        contestType: 'gpp'
      });
      printLineup(result, 'DraftKings', slate.name);
      allResults.push({ platform: 'DraftKings', slate: slate.name, result, error: null });
    } catch (err) {
      console.error(`  FAILED: ${err.message}`);
      allResults.push({ platform: 'DraftKings', slate: slate.name, result: null, error: err.message });
    }
  }

  // FanDuel slates
  for (const slate of fdSlates) {
    slateNum++;
    console.log(`\n${'─'.repeat(80)}`);
    console.log(`[${slateNum}/${totalSlates}] FanDuel — ${slate.name} (${slate.gameCount} games)`);
    console.log(`${'─'.repeat(80)}\n`);

    try {
      const result = await generateAgenticDFSLineup({
        platform: 'fanduel',
        sport: 'NBA',
        date: dateStr,
        slate,
        contestType: 'gpp'
      });
      printLineup(result, 'FanDuel', slate.name);
      allResults.push({ platform: 'FanDuel', slate: slate.name, result, error: null });
    } catch (err) {
      console.error(`  FAILED: ${err.message}`);
      allResults.push({ platform: 'FanDuel', slate: slate.name, result: null, error: err.message });
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
      console.log(`  ${r.platform} ${r.slate}: ${r.result.lineup?.length || 0} players, $${r.result.totalSalary?.toLocaleString()}, Ceiling: ${r.result.ceilingProjection} pts`);
    } else {
      console.log(`  ${r.platform} ${r.slate}: FAILED — ${r.error}`);
    }
  }

  const succeeded = allResults.filter(r => r.result).length;
  const failed = allResults.filter(r => !r.result).length;
  console.log(`\n  ${succeeded}/${totalSlates} succeeded, ${failed} failed\n`);
}

runFullTest().catch(err => {
  console.error('Full test failed:', err);
  process.exit(1);
});
