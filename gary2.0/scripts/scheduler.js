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
// Multi-tier retry windows. Most teams post lineups 2-3 hours before first
// pitch (some — Pirates, Marlins, Rockies — closer to 60-90 min). The scout
// report HARD FAILs when batting orders aren't posted, so games whose first
// trigger fires before the team has released get no pick. To catch late
// posters without sacrificing early picks for on-time teams, we fire up to
// three triggers per game: T-90, T-60, T-30. The existing dedup in
// run-agentic-picks.js ("🚫 GAME ALREADY HAS PICK") makes subsequent triggers
// instant short-circuits once a pick has landed — cost per skip is the script
// startup overhead (~$0.001).
const LEAD_TIME_MINUTES = 90;       // Primary trigger (kept for any external reference)
const RETRY_LEAD_TIMES_MINUTES = [90, 60, 30]; // First → fallback → final

const SPORTS = [
  { key: 'basketball_nba', flag: '--nba', label: 'NBA', propsScript: 'run-agentic-nba-props.js', dfs: true },
  { key: 'icehockey_nhl', flag: '--nhl', label: 'NHL', propsScript: 'run-agentic-nhl-props.js', dfs: false },
  { key: 'baseball_mlb', flag: '--mlb', label: 'MLB', propsScript: 'run-agentic-mlb-props.js', dfs: false },
  { key: 'soccer_world_cup', flag: '--wc', label: 'WC', propsScript: null, dfs: false }, // 2026 FIFA World Cup — game picks only
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

// Per-sport game start time field. Explicit, no fallbacks — if the field is
// missing the game is broken upstream and we want to know about it.
function extractStartTimeIso(game, sportKey) {
  if (sportKey === 'basketball_nba') return game.datetime;
  if (sportKey === 'icehockey_nhl') return game.start_time_utc;
  if (sportKey === 'baseball_mlb') return game.date;
  throw new Error(`extractStartTimeIso: unknown sportKey ${sportKey}`);
}

function getETDateStr(date) {
  return date.toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
}

function addDaysISO(dateStr, days) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// Fetch games whose ET game-day matches `etDateStr`. We query both the ET date
// and the next UTC date, because MLB indexes by UTC date — a 9pm ET game lives
// under tomorrow's UTC date. Then we filter by actual ET start time.
async function fetchGamesForETDate(sportKey, etDateStr) {
  // SOCCER (World Cup): fixtures come from the FIFA service, not BDL. Return raw
  // FIFA matches (shape: { id, datetime, home_team:{name}, away_team:{name} }),
  // which buildPlan already reads. Skip TBD knockout slots (null teams).
  if (sportKey === 'soccer_world_cup') {
    const wc = await import('../src/services/fifaWorldCupService.js');
    let matches;
    try {
      matches = await wc.getMatches({});
    } catch (e) {
      log(`  ❌ ${sportKey}: FIFA fetch failed: ${e.message}`);
      return [];
    }
    const out = [];
    const seen = new Set();
    for (const m of (Array.isArray(matches) ? matches : [])) {
      if (!m.home_team || !m.away_team || !m.datetime) continue;
      const start = new Date(m.datetime);
      if (Number.isNaN(start.getTime())) continue;
      if (getETDateStr(start) !== etDateStr) continue;
      if (seen.has(m.id)) continue;
      seen.add(m.id);
      out.push({ raw: m, startTime: start });
    }
    return out;
  }

  const { ballDontLieService } = await import('../src/services/ballDontLieService.js');
  const dates = [etDateStr, addDaysISO(etDateStr, 1)];
  let games;
  try {
    games = await ballDontLieService.getGames(sportKey, { dates, per_page: 100 });
  } catch (e) {
    log(`  ❌ ${sportKey}: BDL fetch failed for ${dates.join(',')}: ${e.message}`);
    return [];
  }
  if (!Array.isArray(games)) return [];

  const filtered = [];
  for (const g of games) {
    const startIso = extractStartTimeIso(g, sportKey);
    if (!startIso) {
      log(`  ⚠️ ${sportKey} game ${g.id}: missing start time field — skipping`);
      continue;
    }
    const start = new Date(startIso);
    if (Number.isNaN(start.getTime())) {
      log(`  ⚠️ ${sportKey} game ${g.id}: unparseable start time "${startIso}" — skipping`);
      continue;
    }
    if (getETDateStr(start) !== etDateStr) continue;
    filtered.push({ raw: g, startTime: start });
  }
  // Dedupe in case a game appears in both UTC date queries (rare but possible)
  const seen = new Set();
  return filtered.filter(({ raw }) => {
    if (seen.has(raw.id)) return false;
    seen.add(raw.id);
    return true;
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// PLAN: Build per-game schedule for the day
// ═══════════════════════════════════════════════════════════════════════════
async function buildPlan(etDateStr) {
  log(`\n═══════════════════════════════════════════════════════════`);
  log(`🗓️  Building per-game plan for ${etDateStr} (ET)`);
  log(`═══════════════════════════════════════════════════════════`);

  const schedule = [];

  for (const sport of SPORTS) {
    const games = await fetchGamesForETDate(sport.key, etDateStr);
    if (games.length === 0) {
      log(`  ${sport.label}: No games`);
      continue;
    }

    log(`  ${sport.label}: ${games.length} games`);

    for (const { raw: game, startTime } of games) {
      const homeTeam = game.home_team?.full_name || game.home_team?.name || 'Home';
      const awayTeam = game.visitor_team?.full_name || game.away_team?.full_name || game.visitor_team?.name || game.away_team?.name || 'Away';
      const matchup = `${awayTeam} @ ${homeTeam}`;
      const startET = startTime.toLocaleString('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit', hour12: true });

      // Emit one schedule entry per retry tier. Each fires at startTime - tier.
      // The pick + props scripts' own dedup ("already has pick" / props) makes
      // entries after a successful pick into ~instant no-ops.
      const tierLabels = [];
      for (let i = 0; i < RETRY_LEAD_TIMES_MINUTES.length; i++) {
        const leadMin = RETRY_LEAD_TIMES_MINUTES[i];
        const triggerTime = new Date(startTime.getTime() - leadMin * 60 * 1000);
        const tier = i + 1; // 1 = primary, 2 = first retry, 3 = final retry
        schedule.push({
          sport,
          matchup,
          startTime,
          triggerTime,
          gameId: game.id,
          tier,
          leadMin,
        });
        const triggerET = triggerTime.toLocaleString('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit', hour12: true });
        tierLabels.push(`T${leadMin}=${triggerET}`);
      }
      log(`    ${matchup} | Game: ${startET} | ${tierLabels.join(' / ')} | id: ${game.id}`);
    }
  }

  schedule.sort((a, b) => a.triggerTime - b.triggerTime);
  // schedule.length is trigger ENTRIES, not unique games. Each game produces
  // up to RETRY_LEAD_TIMES_MINUTES.length entries (currently 3: T-90/60/30),
  // but only the first successful tier actually generates a pick — the rest
  // hit the picks-script dedup and exit in ~1 second.
  const uniqueGameIds = new Set(schedule.map(e => e.gameId));
  log(`\n📋 Total: ${schedule.length} trigger entries across ${uniqueGameIds.size} unique games (up to ${RETRY_LEAD_TIMES_MINUTES.length} retries per game)`);
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

    // 45 min safety timeout — Pro-model game picks with retries can run long
    setTimeout(() => { proc.kill('SIGTERM'); reject(new Error('Timeout 45min')); }, 45 * 60 * 1000);
  });
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
      await sleepUntilWallClock(triggerTime);
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

      // Run all game picks for this sport first.
      // We pass --game-id (BDL game id) so we always target the exact game,
      // never a substring match (which would collide on Red/White Sox or doubleheaders).
      for (const entry of games) {
        const tierTag = entry.tier > 1 ? ` [retry T-${entry.leadMin}]` : ` [primary T-${entry.leadMin}]`;
        try {
          log(`  📊 Game picks: ${entry.matchup}${tierTag} (id ${entry.gameId})`);
          await runScript('scripts/run-agentic-picks.js', [sport.flag, '--game-id', String(entry.gameId)]);
        } catch (e) {
          log(`  ❌ Game picks failed: ${entry.matchup}${tierTag}: ${e.message}`);
        }
      }

      // Then run props for all games (disk cache from game picks). Sports with no
      // propsScript (e.g. World Cup — game picks only) skip this entirely.
      for (const entry of games) {
        if (!sport.propsScript) break;
        const tierTag = entry.tier > 1 ? ` [retry T-${entry.leadMin}]` : ` [primary T-${entry.leadMin}]`;
        try {
          log(`  🎯 Props: ${entry.matchup}${tierTag} (id ${entry.gameId})`);
          await runScript(`scripts/${sport.propsScript}`, ['--game-id', String(entry.gameId)]);
        } catch (e) {
          log(`  ❌ Props failed: ${entry.matchup}${tierTag}: ${e.message}`);
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
function getTodayETDateStr() {
  return getETDateStr(new Date());
}

function getTomorrowETDateStr() {
  return addDaysISO(getTodayETDateStr(), 1);
}

// Returns the UTC instant for "12:05 AM ET on `etDateStr`". DST-safe: we use
// formatToParts to read what UTC offset ET has at that civil time, then build
// the instant from the parts.
function instantForETDate(etDateStr, hourET, minuteET) {
  // Start with a candidate UTC instant assuming ET is UTC-5, then correct.
  let candidate = new Date(`${etDateStr}T${String(hourET).padStart(2, '0')}:${String(minuteET).padStart(2, '0')}:00Z`);
  // Loop twice to settle DST boundaries (one correction is enough except at
  // the spring-forward instant; two is bulletproof).
  for (let i = 0; i < 2; i++) {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York',
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
      hour12: false
    }).formatToParts(candidate);
    const obj = Object.fromEntries(parts.map(p => [p.type, p.value]));
    const civilET = `${obj.year}-${obj.month}-${obj.day}T${obj.hour === '24' ? '00' : obj.hour}:${obj.minute}:${obj.second}`;
    const targetCivil = `${etDateStr}T${String(hourET).padStart(2, '0')}:${String(minuteET).padStart(2, '0')}:00`;
    const driftMs = new Date(targetCivil + 'Z').getTime() - new Date(civilET + 'Z').getTime();
    if (driftMs === 0) break;
    candidate = new Date(candidate.getTime() + driftMs);
  }
  return candidate;
}

// Sleep until a wall-clock target, polling every 60s so laptop sleep can't
// kill a multi-hour setTimeout. The next 60s tick fires the moment macOS
// resumes the process — naturally self-recovering after sleep.
async function sleepUntilWallClock(targetDate) {
  while (Date.now() < targetDate.getTime()) {
    const remaining = targetDate.getTime() - Date.now();
    await new Promise(r => setTimeout(r, Math.min(60_000, remaining)));
  }
}

async function sleepUntilPlanTime() {
  // Build each day's plan at 5:00 AM ET — early enough that no game trigger
  // is missed (earliest MLB triggers are ~10:30 AM ET for 12 PM games).
  const todayET = getTodayETDateStr();
  let target = instantForETDate(todayET, 5, 0); // 5:00 AM ET today
  // If 5 AM today has already passed, aim for 5 AM tomorrow
  if (target.getTime() <= Date.now()) {
    const tomorrowET = getTomorrowETDateStr();
    target = instantForETDate(tomorrowET, 5, 0);
  }
  const waitMs = Math.max(target.getTime() - Date.now(), 60_000);
  const waitHrs = (waitMs / 1000 / 60 / 60).toFixed(2);
  log(`\n💤 Sleeping ${waitHrs} hours until 5:00 AM ET (${target.toISOString()})`);
  await sleepUntilWallClock(target);
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════════════════════
async function main() {
  const args = process.argv.slice(2);

  if (args.includes('--now')) {
    log('🚀 Running all sports NOW');
    const schedule = await buildPlan(getTodayETDateStr());
    for (const entry of schedule) entry.triggerTime = new Date();
    await executeSchedule(schedule);
    return;
  }

  if (args.includes('--plan')) {
    const dateStr = args.includes('--today') ? getTodayETDateStr() : getTomorrowETDateStr();
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
  const todaySchedule = await buildPlan(getTodayETDateStr());
  // Filter by GAME start time, not trigger time — if the game itself hasn't started, run picks
  // even if the 90-min lead window has already passed (picks just trigger immediately).
  const upcoming = todaySchedule.filter(e => e.startTime > new Date());
  if (upcoming.length > 0) {
    log(`\n⚡ ${upcoming.length} game(s) still upcoming today — running`);
    await executeSchedule(upcoming);
  } else {
    log('No upcoming games today.');
  }

  // Main loop — after each day's games complete, check if we've crossed into
  // a new day (late West Coast games can finish at 1-3 AM ET). If so, build
  // today's plan immediately instead of sleeping through it.
  while (true) {
    const planDateBefore = getTodayETDateStr();
    await sleepUntilPlanTime();
    const schedule = await buildPlan(getTodayETDateStr());
    await executeSchedule(schedule);

    // If execution ran past midnight into a new ET day, immediately build
    // and run that day's plan instead of sleeping past it.
    let currentDate = getTodayETDateStr();
    while (currentDate !== planDateBefore && currentDate !== getTomorrowETDateStr()) {
      log(`\n⚡ Execution spanned into ${currentDate} — building today's plan immediately`);
      const todaySchedule = await buildPlan(currentDate);
      // Filter by GAME start time, not trigger time — if the game itself hasn't started, run picks
  // even if the 90-min lead window has already passed (picks just trigger immediately).
  const upcoming = todaySchedule.filter(e => e.startTime > new Date());
      if (upcoming.length > 0) {
        log(`⚡ ${upcoming.length} game(s) still upcoming — running`);
        await executeSchedule(upcoming);
      } else {
        log('No upcoming games for today.');
      }
      currentDate = getTodayETDateStr();
      // If we're still on the same date after execution, break to normal sleep
      break;
    }
  }
}

main().catch(e => {
  log(`💀 Scheduler crashed: ${e.message}`);
  console.error(e);
  process.exit(1);
});
