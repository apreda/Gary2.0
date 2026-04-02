#!/usr/bin/env node
/**
 * Gary Auto-Scheduler — Per-Game Scheduling
 *
 * Runs 24/7 on the local Mac. Every night at midnight ET, checks BDL for
 * tomorrow's games, and schedules EACH GAME individually 90 minutes before
 * its start time. Game picks run first, then props for the same game.
 *
 * This ensures lineups/injuries are as fresh as possible for each game.
 *
 * Usage:
 *   node scripts/scheduler.js          # Run the 24/7 scheduler
 *   node scripts/scheduler.js --now    # Run all today's sports immediately
 *   node scripts/scheduler.js --plan   # Show tomorrow's schedule without running
 *   node scripts/scheduler.js --plan --today  # Show today's schedule
 */

import '../src/loadEnv.js';
import { spawn } from 'child_process';
import { existsSync, mkdirSync, appendFileSync } from 'fs';
import { join } from 'path';

const PROJECT_DIR = join(import.meta.dirname, '..');
const LOG_DIR = join(PROJECT_DIR, 'logs', 'scheduler');
if (!existsSync(LOG_DIR)) mkdirSync(LOG_DIR, { recursive: true });

// ═══════════════════════════════════════════════════════════════════════════
// CONFIG
// ═══════════════════════════════════════════════════════════════════════════
const LEAD_TIME_MINUTES = 90;
const SPORTS = [
  { key: 'basketball_nba', flag: '--nba', label: 'NBA', propsScript: 'run-agentic-nba-props.js', dfs: true },
  { key: 'icehockey_nhl', flag: '--nhl', label: 'NHL', propsScript: 'run-agentic-nhl-props.js', dfs: false },
  { key: 'baseball_mlb', flag: '--mlb', label: 'MLB', propsScript: 'run-agentic-mlb-props.js', dfs: false },
];

// ═══════════════════════════════════════════════════════════════════════════
// LOGGING
// ═══════════════════════════════════════════════════════════════════════════
function log(msg) {
  const ts = new Date().toLocaleString('en-US', { timeZone: 'America/New_York' });
  const line = `[${ts}] ${msg}`;
  console.log(line);
  try {
    const logFile = join(LOG_DIR, `scheduler-${new Date().toISOString().split('T')[0]}.log`);
    appendFileSync(logFile, line + '\n');
  } catch {}
}

// ═══════════════════════════════════════════════════════════════════════════
// BDL: FETCH GAMES
// ═══════════════════════════════════════════════════════════════════════════
async function fetchGamesForDate(sportKey, dateStr) {
  try {
    const { ballDontLieService } = await import('../src/services/ballDontLieService.js');
    const games = await ballDontLieService.getGames(sportKey, { dates: [dateStr], per_page: 50 });
    return games || [];
  } catch (e) {
    log(`  ⚠️ Failed to fetch ${sportKey} games for ${dateStr}: ${e.message}`);
    return [];
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// PLAN: Build per-game schedule for the day
// ═══════════════════════════════════════════════════════════════════════════
async function buildPlan(dateStr) {
  log(`\n═══════════════════════════════════════════════════════════`);
  log(`🗓️  Building per-game plan for ${dateStr}`);
  log(`═══════════════════════════════════════════════════════════`);

  const schedule = []; // { sport, game, matchup, startTime, triggerTime }

  for (const sport of SPORTS) {
    const games = await fetchGamesForDate(sport.key, dateStr);
    if (games.length === 0) {
      log(`  ${sport.label}: No games`);
      continue;
    }

    log(`  ${sport.label}: ${games.length} games`);

    for (const game of games) {
      const homeTeam = game.home_team?.full_name || game.home_team?.name || 'Home';
      const awayTeam = game.visitor_team?.full_name || game.away_team?.full_name || game.visitor_team?.name || game.away_team?.name || 'Away';
      const matchup = `${awayTeam} @ ${homeTeam}`;

      const dt = game.datetime || game.start_time || game.date;
      if (!dt) {
        log(`    ⚠️ ${matchup}: No start time — skipping`);
        continue;
      }

      const startTime = new Date(dt);
      const triggerTime = new Date(startTime.getTime() - LEAD_TIME_MINUTES * 60 * 1000);
      const startET = startTime.toLocaleString('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit', hour12: true });
      const triggerET = triggerTime.toLocaleString('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit', hour12: true });

      // Use home team mascot as matchup filter (reliable for --matchup flag)
      const homeMascot = homeTeam.split(' ').pop();

      schedule.push({ sport, matchup, homeMascot, startTime, triggerTime, gameId: game.id });
      log(`    ${matchup} | Game: ${startET} | Trigger: ${triggerET}`);
    }
  }

  // Sort by trigger time
  schedule.sort((a, b) => a.triggerTime - b.triggerTime);

  log(`\n📋 Total: ${schedule.length} games scheduled`);
  return schedule;
}

// ═══════════════════════════════════════════════════════════════════════════
// RUN: Execute a single script
// ═══════════════════════════════════════════════════════════════════════════
function runScript(scriptPath, args = []) {
  return new Promise((resolve, reject) => {
    log(`  📡 Running: node ${scriptPath} ${args.join(' ')}`);
    const proc = spawn('node', [scriptPath, ...args], {
      cwd: PROJECT_DIR,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, NODE_OPTIONS: '' }
    });

    let output = '';
    proc.stdout.on('data', (data) => {
      output += data.toString();
      for (const line of data.toString().split('\n')) {
        if (line.includes('[Cost]') || line.includes('Total Picks') || line.includes('✅') || line.includes('❌')) {
          log(`    ${line.trim()}`);
        }
      }
    });
    proc.stderr.on('data', (data) => { output += data.toString(); });

    proc.on('close', (code) => {
      try {
        const logFile = join(LOG_DIR, `${new Date().toISOString().split('T')[0]}-${args.join('-')}.log`);
        appendFileSync(logFile, output);
      } catch {}
      if (code === 0) {
        log(`  ✅ Done`);
        resolve(output);
      } else {
        log(`  ❌ Failed (exit ${code})`);
        reject(new Error(`Exit code ${code}`));
      }
    });

    // 30 min safety timeout
    setTimeout(() => { proc.kill('SIGTERM'); reject(new Error('Timeout 30min')); }, 30 * 60 * 1000);
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// RUN: Execute picks + props for a single game
// ═══════════════════════════════════════════════════════════════════════════
async function runGame(entry) {
  const { sport, matchup, homeMascot } = entry;
  const startTime = Date.now();
  log(`\n🐻 ${sport.label}: ${matchup}`);

  try {
    // Game picks for this specific game
    await runScript('scripts/run-agentic-picks.js', [sport.flag, '--matchup', homeMascot, '--limit', '1']);

    // Props for this specific game (disk cache populated from game picks)
    await runScript(`scripts/${sport.propsScript}`, ['--matchup', homeMascot]);

    const elapsed = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
    log(`✅ ${matchup} complete in ${elapsed} min`);
  } catch (e) {
    log(`❌ ${matchup} error: ${e.message}`);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// EXECUTE: Run DFS once per sport after all games for that sport are done
// ═══════════════════════════════════════════════════════════════════════════
async function runDFS(sport) {
  if (!sport.dfs) return;
  log(`\n🎯 Running ${sport.label} DFS lineups`);
  try {
    await runScript('scripts/run-dfs-lineups.js', [sport.flag]);
    log(`✅ ${sport.label} DFS complete`);
  } catch (e) {
    log(`❌ ${sport.label} DFS error: ${e.message}`);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// EXECUTE: Process the full schedule
// ═══════════════════════════════════════════════════════════════════════════
async function executeSchedule(schedule) {
  if (schedule.length === 0) {
    log('No games scheduled — nothing to run.');
    return;
  }

  // Track which sports had games (for DFS at the end)
  const sportsWithGames = new Set();

  // Group games that start within 15 min of each other (run them as a batch)
  // This avoids scheduling 8 NBA games individually when they all start at 7 PM
  const batches = [];
  let currentBatch = [schedule[0]];

  for (let i = 1; i < schedule.length; i++) {
    const prevTrigger = currentBatch[currentBatch.length - 1].triggerTime.getTime();
    const thisTrigger = schedule[i].triggerTime.getTime();

    if (thisTrigger - prevTrigger <= 15 * 60 * 1000) {
      // Within 15 min — same batch
      currentBatch.push(schedule[i]);
    } else {
      batches.push(currentBatch);
      currentBatch = [schedule[i]];
    }
  }
  batches.push(currentBatch);

  log(`\n📦 ${batches.length} trigger windows for ${schedule.length} games`);

  for (const batch of batches) {
    const triggerTime = batch[0].triggerTime;
    const now = Date.now();
    const waitMs = triggerTime.getTime() - now;

    if (waitMs > 60000) { // More than 1 min away
      const waitMin = (waitMs / 1000 / 60).toFixed(0);
      const triggerET = triggerTime.toLocaleString('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit', hour12: true });
      log(`\n⏳ Next batch: ${batch.length} game(s) at ${triggerET} ET (${waitMin} min)`);
      log(`   Games: ${batch.map(e => e.matchup).join(', ')}`);
      await new Promise(resolve => setTimeout(resolve, waitMs));
    }

    log(`\n🔔 Trigger window: ${batch.length} game(s)`);

    // Group this batch by sport so we run game picks for the same sport together
    // (better for disk cache — all NHL picks, then all NHL props)
    const bySport = new Map();
    for (const entry of batch) {
      const key = entry.sport.key;
      if (!bySport.has(key)) bySport.set(key, []);
      bySport.get(key).push(entry);
      sportsWithGames.add(entry.sport);
    }

    for (const [sportKey, games] of bySport) {
      const sport = games[0].sport;
      log(`\n── ${sport.label}: ${games.length} game(s) ──`);

      // Run all game picks for this sport first
      for (const entry of games) {
        try {
          log(`  📊 Game picks: ${entry.matchup}`);
          await runScript('scripts/run-agentic-picks.js', [sport.flag, '--matchup', entry.homeMascot, '--limit', '1']);
        } catch (e) {
          log(`  ❌ Game picks failed: ${entry.matchup}: ${e.message}`);
        }
      }

      // Then run props for all games (disk cache from game picks)
      for (const entry of games) {
        try {
          log(`  🎯 Props: ${entry.matchup}`);
          await runScript(`scripts/${sport.propsScript}`, ['--matchup', entry.homeMascot]);
        } catch (e) {
          log(`  ❌ Props failed: ${entry.matchup}: ${e.message}`);
        }
      }
    }
  }

  // Run DFS after all games are done for each sport
  for (const sport of sportsWithGames) {
    await runDFS(sport);
  }

  log('\n🏁 All games complete for today.');
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════
function getTodayDateStr() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
}

function getTomorrowDateStr() {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  return tomorrow.toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
}

async function sleepUntilMidnightET() {
  const now = new Date();
  // Calculate next midnight ET
  const etNow = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const nextMidnight = new Date(etNow);
  nextMidnight.setDate(nextMidnight.getDate() + 1);
  nextMidnight.setHours(0, 5, 0, 0); // 12:05 AM ET

  // Convert back to local time
  const diffMs = nextMidnight.getTime() - etNow.getTime();
  const waitMs = Math.max(diffMs, 60000); // At least 1 min
  const waitHrs = (waitMs / 1000 / 60 / 60).toFixed(1);

  log(`\n💤 Sleeping ${waitHrs} hours until midnight ET`);
  await new Promise(resolve => setTimeout(resolve, waitMs));
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════════════════════
async function main() {
  const args = process.argv.slice(2);

  if (args.includes('--now')) {
    log('🚀 Running all sports NOW');
    const schedule = await buildPlan(getTodayDateStr());
    for (const entry of schedule) entry.triggerTime = new Date();
    await executeSchedule(schedule);
    return;
  }

  if (args.includes('--plan')) {
    const dateStr = args.includes('--today') ? getTodayDateStr() : getTomorrowDateStr();
    await buildPlan(dateStr);
    return;
  }

  // 24/7 scheduler
  log('═══════════════════════════════════════════════════════════');
  log('🐻 GARY AUTO-SCHEDULER STARTED (per-game mode)');
  log('═══════════════════════════════════════════════════════════');
  log(`Lead time: ${LEAD_TIME_MINUTES} min before each game`);
  log(`Sports: ${SPORTS.map(s => s.label).join(', ')}`);

  // Check today first
  const todaySchedule = await buildPlan(getTodayDateStr());
  const upcoming = todaySchedule.filter(e => e.triggerTime > new Date());
  if (upcoming.length > 0) {
    log(`\n⚡ ${upcoming.length} game(s) still upcoming today — running`);
    await executeSchedule(upcoming);
  } else {
    log('No upcoming games today.');
  }

  // Main loop
  while (true) {
    await sleepUntilMidnightET();
    const schedule = await buildPlan(getTodayDateStr());
    await executeSchedule(schedule);
  }
}

main().catch(e => {
  log(`💀 Scheduler crashed: ${e.message}`);
  console.error(e);
  process.exit(1);
});
