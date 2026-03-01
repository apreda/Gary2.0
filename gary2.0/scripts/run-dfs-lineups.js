#!/usr/bin/env node
/**
 * DFS Lineup Generation — CLI Runner
 * Discovers slates, generates agentic lineups, and stores in Supabase.
 *
 * Usage:
 *   node scripts/run-dfs-lineups.js                    # NBA, both platforms, production
 *   node scripts/run-dfs-lineups.js --test             # NBA, both platforms, test table
 *   node scripts/run-dfs-lineups.js --dk               # DraftKings only
 *   node scripts/run-dfs-lineups.js --fd               # FanDuel only
 *   node scripts/run-dfs-lineups.js --nfl              # NFL instead of NBA
 *   node scripts/run-dfs-lineups.js --nhl              # NHL instead of NBA
 *   node scripts/run-dfs-lineups.js --nfl --dk --test  # NFL DraftKings, test table
 *   node scripts/run-dfs-lineups.js --dry-run          # Generate + print only, NO Supabase
 *   node scripts/run-dfs-lineups.js --limit 1          # Limit to first N slates PER PLATFORM
 *   node scripts/run-dfs-lineups.js --force            # Regenerate even if lineup exists (ignored in --dry-run)
 *   node scripts/run-dfs-lineups.js --dry-run --limit 1 --dk  # Quick test: 1 DK slate, no storage
 */
// MUST load env vars FIRST before any other imports
import '../src/loadEnv.js';
import { createClient } from '@supabase/supabase-js';
import { discoverDFSSlates } from '../src/services/agentic/dfsSlateDiscoveryService.js';
import { generateAgenticDFSLineup } from '../src/services/agentic/dfs/dfsAgenticOrchestrator.js';
import { PLATFORM_CONSTRAINTS } from '../src/services/dfsLineupService.js';

// ─── helpers ─────────────────────────────────────────────────────────────────

function estToday() {
  const now = new Date();
  const options = { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' };
  const estDate = new Intl.DateTimeFormat('en-US', options).format(now);
  const [month, day, year] = estDate.split('/');
  return `${year}-${month}-${day}`;
}

function getSupabaseAdmin() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!url || !serviceKey) {
    throw new Error('Missing Supabase env (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)');
  }
  return createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
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
  if (result.garyNotes) {
    console.log(`\nGary's Notes: ${result.garyNotes}`);
  }
  console.log('');
}

// ─── main ────────────────────────────────────────────────────────────────────

async function run() {
  const dateStr = estToday();
  const allResults = [];
  const errors = [];

  const args = process.argv.slice(2);
  const isTestMode = args.includes('--test');
  const fdOnly = args.includes('--fanduel') || args.includes('--fd');
  const dkOnly = args.includes('--draftkings') || args.includes('--dk');
  const isNFL = args.includes('--nfl');
  const isNHL = args.includes('--nhl');
  const isDryRun = args.includes('--dry-run');
  const limitIdx = args.indexOf('--limit');
  const slateLimit = limitIdx >= 0 ? parseInt(args[limitIdx + 1], 10) : Infinity;
  const sport = isNFL ? 'NFL' : isNHL ? 'NHL' : 'NBA';
  const supabase = isDryRun ? null : getSupabaseAdmin();
  const sportLower = sport.toLowerCase();
  const platforms = fdOnly ? ['fanduel'] : dkOnly ? ['draftkings'] : ['draftkings', 'fanduel'];
  const tableName = isTestMode ? 'test_dfs_lineups' : 'dfs_lineups';

  console.log(`\n${'═'.repeat(80)}`);
  console.log(`DFS LINEUP GENERATION — ${dateStr} — ${sport}${isTestMode ? ' [TEST MODE]' : ''}`);
  console.log(`${'═'.repeat(80)}\n`);

  if (isDryRun) {
    console.log(`*** DRY RUN: Lineups will be generated and printed only — NO Supabase storage ***\n`);
  } else if (isTestMode) {
    console.log(`*** TEST MODE: Lineups will be stored in "${tableName}" (not production) ***\n`);
  }

  // ── PHASE 1: Discover all slates ──
  console.log('PHASE 1: Discovering slates...\n');

  const allSlates = {}; // { platform: slates[] }

  for (const platform of platforms) {
    try {
      console.log(`[${platform.toUpperCase()}] Fetching ${sport} slates...`);
      const slates = await discoverDFSSlates(sportLower, platform, dateStr);
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

  const totalDiscovered = Object.values(allSlates).reduce((sum, s) => sum + s.length, 0);
  // Apply --limit to get the actual count we'll process
  const totalToProcess = Object.values(allSlates).reduce((sum, s) => sum + Math.min(s.length, slateLimit), 0);
  console.log(`Total slates discovered: ${totalDiscovered}${slateLimit < Infinity ? ` (processing ${totalToProcess} with --limit ${slateLimit})` : ''}\n`);

  if (totalDiscovered === 0) {
    console.log('No slates found. Exiting.');
    return;
  }

  // ── PHASE 2: Generate lineups for each slate ──
  console.log(`PHASE 2: Generating lineups + storing in Supabase (${tableName})...\n`);

  let slateNum = 0;

  for (const platform of platforms) {
    const platformSlates = (allSlates[platform] || []).slice(0, slateLimit);
    for (const slate of platformSlates) {
      slateNum++;
      console.log(`\n${'─'.repeat(80)}`);
      console.log(`[${slateNum}/${totalToProcess}] ${platform.toUpperCase()} — ${slate.name} (${slate.gameCount} games)`);
      console.log(`${'─'.repeat(80)}\n`);

      // Deduplication: skip if lineup already exists for this slate today
      if (!isDryRun) {
        try {
          const { data: existing } = await supabase
            .from(tableName)
            .select('date')
            .eq('date', dateStr)
            .eq('platform', platform)
            .eq('sport', sport)
            .eq('slate_name', slate.name)
            .eq('contest_type', 'gpp')
            .limit(1);

          if (existing && existing.length > 0) {
            console.log(`[SKIP] Lineup already exists for ${platform.toUpperCase()} ${slate.name} — use --force to regenerate`);
            if (!args.includes('--force')) {
              allResults.push({ platform, slate: slate.name, result: null, error: 'Already exists (skipped)' });
              continue;
            }
            console.log(`[FORCE] Regenerating anyway due to --force flag`);
          }
        } catch (_) {
          // If dedup check fails, proceed with generation
        }
      }

      try {
        // Generate lineup
        const result = await generateAgenticDFSLineup({
          platform,
          sport,
          date: dateStr,
          slate
        });

        printLineup(result, platform, slate.name);

        // Build record for Supabase
        const salaryCap = PLATFORM_CONSTRAINTS[platform]?.[sport]?.salaryCap || 50000;
        const lineupRecord = {
          date: dateStr,
          platform,
          sport,
          slate_name: slate.name,
          slate_start_time: slate.startTime || null,
          slate_game_count: slate.gameCount || 0,
          contest_type: 'gpp',
          salary_cap: salaryCap,
          total_salary: result.totalSalary,
          projected_points: result.projectedPoints,
          ceiling_projection: result.ceilingProjection,
          floor_projection: result.floorProjection,
          stack_info: null,
          lineup: result.lineup.map(p => ({
            player: p.name || p.player,
            position: p.position,
            salary: p.salary,
            team: p.team,
            projected_pts: p.projectedPoints || p.projected_pts || 0,
            rationale: p.reasoning || p.rationale || null,
            ceiling_projection: p.ceilingProjection,
            ownership: p.ownership ?? null,
            valueScore: p.valueScore ?? null,
            recentForm: p.recentForm ?? null,
            opponent: p.opponent ?? null,
            pivots: (p.pivots || []).map(pv => ({
              tier: pv.tier,
              tierLabel: pv.tierLabel,
              player: pv.player,
              team: pv.team,
              salary: pv.salary,
              projected_pts: pv.projected_pts || 0,
              salaryDiff: pv.salaryDiff || 0
            }))
          })),
          gary_notes: result.garyNotes,
          harmony_reasoning: result.ceilingScenario,
          archetype: result.archetype,
          build_thesis: result.buildThesis,
          updated_at: new Date().toISOString()
        };

        // Upsert to Supabase (skip in dry-run mode)
        if (isDryRun) {
          console.log(`[DRY RUN] Lineup generated — skipping Supabase storage`);
        } else {
          const { error: upsertError } = await supabase
            .from(tableName)
            .insert(lineupRecord);

          if (upsertError) {
            console.error(`[SUPABASE] Upsert FAILED: ${upsertError.message}`);
            errors.push({ platform, slate: slate.name, error: `Upsert: ${upsertError.message}` });
          } else {
            console.log(`[SUPABASE] Stored ${platform.toUpperCase()} ${slate.name} lineup → ${tableName}`);
          }
        }

        allResults.push({ platform, slate: slate.name, result, error: null });
      } catch (err) {
        console.error(`  FAILED: ${err.message}`);
        errors.push({ platform, slate: slate.name, error: err.message });
        allResults.push({ platform, slate: slate.name, result: null, error: err.message });
      }
    }
  }

  // ── SUMMARY ──
  console.log(`\n\n${'═'.repeat(80)}`);
  console.log(`FINAL SUMMARY${isTestMode ? ' [TEST MODE]' : ''}`);
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
  console.log(`\n  ${succeeded}/${totalToProcess} succeeded, ${failed} failed`);
  console.log(`  Table: ${tableName}`);

  if (errors.length > 0) {
    console.log(`\n  ERRORS:`);
    for (const e of errors) {
      console.log(`    ${e.platform?.toUpperCase() || '??'} ${e.slate || 'N/A'}: ${e.error}`);
    }
  }
  console.log('');
}

run().catch(err => {
  console.error('DFS lineup generation failed:', err);
  process.exit(1);
});
