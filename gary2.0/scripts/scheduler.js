#!/usr/bin/env node
/**
 * Gary Auto-Scheduler
 *
 * Runs 24/7 on the local Mac. Every night at midnight ET, checks BDL for
 * tomorrow's games, computes trigger times (90 min before first game per sport),
 * and runs game picks → props → DFS sequentially.
 *
 * Usage:
 *   node scripts/scheduler.js          # Run the scheduler
 *   node scripts/scheduler.js --now    # Run all sports immediately (testing)
 *   node scripts/scheduler.js --plan   # Show tomorrow's plan without running
 */

import '../src/loadEnv.js';
import { execSync, spawn } from 'child_process';
import { existsSync, mkdirSync, appendFileSync } from 'fs';
import { join } from 'path';

const PROJECT_DIR = join(import.meta.dirname, '..');
const LOG_DIR = join(PROJECT_DIR, 'logs', 'scheduler');
if (!existsSync(LOG_DIR)) mkdirSync(LOG_DIR, { recursive: true });

// ═══════════════════════════════════════════════════════════════════════════
// CONFIG
// ═══════════════════════════════════════════════════════════════════════════
const LEAD_TIME_MINUTES = 90;  // Run picks this many minutes before first game
const PLAN_CHECK_HOUR = 0;     // Midnight ET — check tomorrow's schedule
const PLAN_CHECK_MINUTE = 5;   // 12:05 AM ET
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
// BDL: FETCH TOMORROW'S GAMES
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

function getEarliestGameTime(games) {
  let earliest = null;
  for (const g of games) {
    const dt = g.datetime || g.start_time || g.date;
    if (!dt) continue;
    const d = new Date(dt);
    if (!earliest || d < earliest) earliest = d;
  }
  return earliest;
}

// ═══════════════════════════════════════════════════════════════════════════
// PLAN: Build tomorrow's schedule
// ═══════════════════════════════════════════════════════════════════════════
async function buildPlan(dateStr) {
  log(`\n═══════════════════════════════════════════════════════════`);
  log(`🗓️  Building plan for ${dateStr}`);
  log(`═══════════════════════════════════════════════════════════`);

  const plan = [];

  for (const sport of SPORTS) {
    const games = await fetchGamesForDate(sport.key, dateStr);
    if (games.length === 0) {
      log(`  ${sport.label}: No games found`);
      continue;
    }

    const earliest = getEarliestGameTime(games);
    if (!earliest) {
      log(`  ${sport.label}: ${games.length} games but no start times — scheduling for 11:00 AM ET`);
      // Default to 11:00 AM ET if no times available
      const defaultTime = new Date(dateStr + 'T15:00:00Z'); // 11 AM ET = 3 PM UTC
      plan.push({ sport, games: games.length, triggerTime: defaultTime });
      continue;
    }

    const triggerTime = new Date(earliest.getTime() - LEAD_TIME_MINUTES * 60 * 1000);
    const earliestET = earliest.toLocaleString('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit', hour12: true });
    const triggerET = triggerTime.toLocaleString('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit', hour12: true });

    log(`  ${sport.label}: ${games.length} games | First game: ${earliestET} ET | Trigger: ${triggerET} ET`);
    plan.push({ sport, games: games.length, triggerTime, earliestGame: earliest });
  }

  // Sort by trigger time (earliest first)
  plan.sort((a, b) => a.triggerTime - b.triggerTime);
  return plan;
}

// ═══════════════════════════════════════════════════════════════════════════
// RUN: Execute picks for a sport (game picks → props → DFS)
// ═══════════════════════════════════════════════════════════════════════════
function runScript(scriptPath, args = []) {
  return new Promise((resolve, reject) => {
    const logFile = join(LOG_DIR, `${new Date().toISOString().split('T')[0]}-${args[0] || 'run'}.log`);
    log(`  📡 Running: node ${scriptPath} ${args.join(' ')}`);

    const proc = spawn('node', [scriptPath, ...args], {
      cwd: PROJECT_DIR,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, NODE_OPTIONS: '' }
    });

    let output = '';
    proc.stdout.on('data', (data) => {
      output += data.toString();
      // Stream key lines to console
      const lines = data.toString().split('\n');
      for (const line of lines) {
        if (line.includes('[Cost]') || line.includes('Total Picks') || line.includes('✅') || line.includes('❌')) {
          log(`    ${line.trim()}`);
        }
      }
    });
    proc.stderr.on('data', (data) => { output += data.toString(); });

    proc.on('close', (code) => {
      try { appendFileSync(logFile, output); } catch {}
      if (code === 0) {
        log(`  ✅ Completed (exit 0)`);
        resolve(output);
      } else {
        log(`  ❌ Failed (exit ${code})`);
        reject(new Error(`Script exited with code ${code}`));
      }
    });

    // Safety timeout: 30 minutes per script
    setTimeout(() => {
      proc.kill('SIGTERM');
      reject(new Error('Script timed out after 30 minutes'));
    }, 30 * 60 * 1000);
  });
}

async function runSport(sport) {
  const startTime = Date.now();
  log(`\n🐻 Starting ${sport.label} pipeline`);
  log(`════════════════════════════════════════`);

  try {
    // 1. Game picks
    log(`  Step 1: ${sport.label} game picks`);
    await runScript('scripts/run-agentic-picks.js', [sport.flag]);

    // 2. Props (runs after game picks so disk cache is populated)
    log(`  Step 2: ${sport.label} props`);
    await runScript(`scripts/${sport.propsScript}`, []);

    // 3. DFS (NBA only for now)
    if (sport.dfs) {
      log(`  Step 3: ${sport.label} DFS`);
      await runScript('scripts/run-dfs-lineups.js', [sport.flag]);
    }

    const elapsed = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
    log(`✅ ${sport.label} pipeline complete in ${elapsed} min`);
  } catch (e) {
    log(`❌ ${sport.label} pipeline error: ${e.message}`);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// SCHEDULER: Wait for trigger times and execute
// ═══════════════════════════════════════════════════════════════════════════
async function executePlan(plan) {
  if (plan.length === 0) {
    log('No games scheduled — nothing to run.');
    return;
  }

  for (const entry of plan) {
    const now = Date.now();
    const waitMs = entry.triggerTime.getTime() - now;

    if (waitMs > 0) {
      const waitMin = (waitMs / 1000 / 60).toFixed(0);
      log(`⏳ Waiting ${waitMin} min for ${entry.sport.label} (trigger: ${entry.triggerTime.toLocaleString('en-US', { timeZone: 'America/New_York' })})`);
      await new Promise(resolve => setTimeout(resolve, waitMs));
    } else {
      log(`⚡ ${entry.sport.label} trigger time already passed — running now`);
    }

    await runSport(entry.sport);
  }

  log('\n🏁 All scheduled runs complete for today.');
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN LOOP: Run forever, plan each night at midnight ET
// ═══════════════════════════════════════════════════════════════════════════
async function getNextMidnightET() {
  const now = new Date();
  // Get current time in ET
  const etStr = now.toLocaleString('en-US', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' });
  const [month, day, year] = etStr.split('/');

  // Tomorrow at 00:05 ET
  const tomorrow = new Date(`${year}-${month}-${day}T00:00:00`);
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setMinutes(PLAN_CHECK_MINUTE);

  // Convert back to UTC by finding the offset
  const etOffset = new Date().toLocaleString('en-US', { timeZone: 'America/New_York', timeZoneName: 'shortOffset' });
  const offsetMatch = etOffset.match(/GMT([+-]\d+)/);
  const offsetHours = offsetMatch ? parseInt(offsetMatch[1]) : -4;

  const utcMidnight = new Date(tomorrow.getTime() - offsetHours * 60 * 60 * 1000);
  return utcMidnight;
}

function getTomorrowDateStr() {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  // Get tomorrow in ET
  return tomorrow.toLocaleDateString('en-CA', { timeZone: 'America/New_York' }); // YYYY-MM-DD format
}

function getTodayDateStr() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
}

async function main() {
  const args = process.argv.slice(2);

  // --now: Run all sports immediately
  if (args.includes('--now')) {
    log('🚀 Running all sports NOW (--now flag)');
    const dateStr = getTodayDateStr();
    const plan = await buildPlan(dateStr);
    // Set all trigger times to now
    for (const entry of plan) entry.triggerTime = new Date();
    await executePlan(plan);
    return;
  }

  // --plan: Show plan without executing
  if (args.includes('--plan')) {
    const dateStr = args.includes('--today') ? getTodayDateStr() : getTomorrowDateStr();
    await buildPlan(dateStr);
    return;
  }

  // Default: Run as 24/7 scheduler
  log('═══════════════════════════════════════════════════════════');
  log('🐻 GARY AUTO-SCHEDULER STARTED');
  log('═══════════════════════════════════════════════════════════');
  log(`Lead time: ${LEAD_TIME_MINUTES} minutes before first game`);
  log(`Sports: ${SPORTS.map(s => s.label).join(', ')}`);
  log(`Plan check: ${PLAN_CHECK_HOUR}:${String(PLAN_CHECK_MINUTE).padStart(2, '0')} AM ET nightly`);
  log('');

  // On first start, plan for today if games haven't started yet
  log('Checking today\'s games on startup...');
  const todayPlan = await buildPlan(getTodayDateStr());
  const futureTodayGames = todayPlan.filter(e => e.triggerTime > new Date());
  if (futureTodayGames.length > 0) {
    log(`Found ${futureTodayGames.length} sport(s) with upcoming games today — executing`);
    await executePlan(futureTodayGames);
  } else {
    log('No upcoming games today (already passed or no games). Waiting for tomorrow.');
  }

  // Main loop: plan each night, execute next day
  while (true) {
    // Wait until next midnight ET
    const nextCheck = await getNextMidnightET();
    const waitMs = nextCheck.getTime() - Date.now();
    const waitHrs = (waitMs / 1000 / 60 / 60).toFixed(1);
    log(`\n💤 Sleeping ${waitHrs} hours until next plan check (${nextCheck.toLocaleString('en-US', { timeZone: 'America/New_York' })})`);

    await new Promise(resolve => setTimeout(resolve, waitMs));

    // Build and execute tomorrow's plan
    const dateStr = getTodayDateStr(); // It's now "tomorrow" since we slept past midnight
    const plan = await buildPlan(dateStr);
    await executePlan(plan);
  }
}

main().catch(e => {
  log(`💀 Scheduler crashed: ${e.message}`);
  console.error(e);
  process.exit(1);
});
