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
import { spawn, execSync } from 'child_process';
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
// report HARD FAILs when batting orders aren't posted (checking BDL, then the
// official MLB Stats API), so games whose triggers all fire before lineups
// exist anywhere get no pick. To catch late posters without sacrificing early
// picks for on-time teams, we fire up to four triggers per game: T-90, T-60,
// T-30, T-15. The existing dedup in run-agentic-picks.js ("🚫 GAME ALREADY
// HAS PICK") makes subsequent triggers instant short-circuits once a pick has
// landed — cost per skip is the script startup overhead (~$0.001).
const LEAD_TIME_MINUTES = 90;       // Primary trigger (kept for any external reference)
const RETRY_LEAD_TIMES_MINUTES = [90, 60, 30, 15]; // First → fallbacks → final

const SPORTS = [
  { key: 'basketball_nba', flag: '--nba', label: 'NBA', propsScript: 'run-agentic-nba-props.js', dfs: true },
  { key: 'icehockey_nhl', flag: '--nhl', label: 'NHL', propsScript: 'run-agentic-nhl-props.js', dfs: false },
  // MLB DFS: deferred to the roadmap (user call, Jun 9 2026). The pipeline is
  // validated end-to-end — dry run built 3/3 DK slates with real salaries — so
  // re-enabling is dfs:true here (+ AppFlags.fantasyEnabled in iOS). Keep
  // dfsArgs ['--limit','1'] when it returns: ~$0.54/lineup at MLB context size,
  // so Main-only (~$33/mo) until the free labs feature earns full coverage.
  { key: 'baseball_mlb', flag: '--mlb', label: 'MLB', propsScript: 'run-agentic-mlb-props.js', dfs: false, dfsArgs: ['--limit', '1'] },
  // 2026 FIFA World Cup — game picks only. Runs at a FIXED 10:00 AM ET (not the
  // per-game T-90/60/30/15 lead times). Rationale (user call, Jun 13 2026): the
  // T-90 cascade exists to wait out NBA/NHL/MLB lineup posts; soccer has no such
  // gate, and fans want the WC read + reasoning early in the day, not 90 min
  // before kickoff. fixedTriggerET drives the fixed-time path in buildPlan().
  // WC runs on the same T-90/60/30/15 lead-time path as MLB (was fixed 10:00 ET).
  // Firing 90 min before each kickoff captures the confirmed starting XI + firm
  // injury news (both post ~2-2.5h pre-match, after a 10 AM run), and handles early
  // (e.g. midnight-ET) kickoffs that a fixed wall-clock trigger missed. Cost: WC picks
  // populate progressively through the day like MLB instead of all at the morning run.
  { key: 'soccer_world_cup', flag: '--wc', label: 'WC', propsScript: 'run-wc-props.js', dfs: false },
];

// Spaced retries for fixed-trigger sports, as minutes AFTER the fixed time
// (10:00 → 10:45 → 11:30 ET). Like the lead-time tiers, every retry after a
// successful pick hits run-agentic-picks.js's "already has pick" dedup and
// exits in ~1s, so the extra triggers are a cheap reliability net.
const FIXED_TRIGGER_RETRY_OFFSETS_MINUTES = [0, 45, 90];

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

// A 24/7 daemon must SURVIVE transient network blips. Waking from sleep often
// hits the network before DNS is ready — `getaddrinfo ENOTFOUND ...supabase.co`
// — and on Jun 21 2026 exactly that crashed the scheduler mid-morning (main()'s
// .catch exited the process), zeroing the whole day's picks until a manual
// restart. These handlers log and KEEP RUNNING for transient errors so a blip in
// one tick can't kill the process; the next scheduled tick re-fetches. A truly
// unexpected error still exits(1) for a clean watchdog restart with fresh state.
const TRANSIENT_NET = /ENOTFOUND|EAI_AGAIN|ETIMEDOUT|ECONNRESET|ECONNREFUSED|ENETDOWN|ENETUNREACH|EHOSTUNREACH|socket hang up|fetch failed|network|getaddrinfo/i;
process.on('unhandledRejection', (reason) => {
  const msg = reason?.message || String(reason);
  log(`⚠️ unhandledRejection (non-fatal — scheduler stays up): ${msg}`);
});
process.on('uncaughtException', (err) => {
  const msg = err?.message || String(err);
  if (TRANSIENT_NET.test(msg)) {
    log(`⚠️ Transient network error (non-fatal — scheduler stays up, next tick retries): ${msg}`);
    return;
  }
  log(`🔥 uncaughtException — exiting(1) for a clean watchdog restart: ${msg}`);
  console.error(err);
  process.exit(1);
});

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
      return null; // null = fetch FAILED (retryable); [] = genuinely no games
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
    return null; // null = fetch FAILED (retryable); [] = genuinely no games
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
  let fetchFailed = false; // true if ANY sport's fetch threw (vs. empty slate)

  for (const sport of SPORTS) {
    const games = await fetchGamesForETDate(sport.key, etDateStr);
    if (games === null) {
      // NOTE: buildPlanResilient only retries intra-day when the WHOLE slate is
      // empty. If another sport has games, this failed sport is dropped until the
      // next daily build — so "will retry" here means tomorrow, not in minutes.
      log(`  ${sport.label}: fetch FAILED — will retry on next daily build (intra-day only if no sport has games)`);
      fetchFailed = true;
      continue;
    }
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

      // Emit one schedule entry per trigger tier. Two shapes:
      //   • Fixed-time sports (WC): fire at a fixed ET wall-clock time + spaced
      //     retries (10:00/10:45/11:30 ET), capped so we never trigger after
      //     kickoff. leadMin is null → distinguishes these in the run logs.
      //   • Lead-time sports (NBA/NHL/MLB): fire at startTime − T-90/60/30/15.
      // Either way, run-agentic-picks.js's "already has pick" dedup turns every
      // tier after a successful pick into a ~1s no-op.
      const tierLabels = [];
      if (sport.fixedTriggerET) {
        const base = instantForETDate(etDateStr, sport.fixedTriggerET.hour, sport.fixedTriggerET.minute);
        const latest = new Date(startTime.getTime() - 15 * 60 * 1000); // never pick after kickoff
        for (let i = 0; i < FIXED_TRIGGER_RETRY_OFFSETS_MINUTES.length; i++) {
          let triggerTime = new Date(base.getTime() + FIXED_TRIGGER_RETRY_OFFSETS_MINUTES[i] * 60 * 1000);
          if (triggerTime > latest) {
            if (i === 0) triggerTime = latest; // early game: keep one trigger, fire ASAP
            else continue;                      // drop retries that would land after kickoff
          }
          schedule.push({ sport, matchup, homeTeam, awayTeam, startTime, triggerTime, gameId: game.id, tier: i + 1, leadMin: null });
          const triggerET = triggerTime.toLocaleString('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit', hour12: true });
          tierLabels.push(`fixed=${triggerET}`);
        }
      } else {
        for (let i = 0; i < RETRY_LEAD_TIMES_MINUTES.length; i++) {
          const leadMin = RETRY_LEAD_TIMES_MINUTES[i];
          const triggerTime = new Date(startTime.getTime() - leadMin * 60 * 1000);
          const tier = i + 1; // 1 = primary, 2 = first retry, 3 = final retry
          schedule.push({ sport, matchup, homeTeam, awayTeam, startTime, triggerTime, gameId: game.id, tier, leadMin });
          const triggerET = triggerTime.toLocaleString('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit', hour12: true });
          tierLabels.push(`T${leadMin}=${triggerET}`);
        }
      }
      log(`    ${matchup} | Game: ${startET} | ${tierLabels.join(' / ')} | id: ${game.id}`);
    }
  }

  schedule.sort((a, b) => a.triggerTime - b.triggerTime);
  // schedule.length is trigger ENTRIES, not unique games. Each game produces
  // up to RETRY_LEAD_TIMES_MINUTES.length entries (currently 4: T-90/60/30/15),
  // but only the first successful tier actually generates a pick — the rest
  // hit the picks-script dedup and exit in ~1 second.
  const uniqueGameIds = new Set(schedule.map(e => e.gameId));
  log(`\n📋 Total: ${schedule.length} trigger entries across ${uniqueGameIds.size} unique games (up to ${RETRY_LEAD_TIMES_MINUTES.length} retries per game)`);
  return { schedule, fetchFailed };
}

// Publish the day's full slate (all games + opening lines) to the daily_slate
// table so the app shows the whole schedule from the morning, with Gary's
// picks overlaying later. NON-FATAL by design — a slate-write failure must
// never block pick generation.
async function writeDailySlateNonFatal(dateStr) {
  try {
    const { writeDailySlate } = await import('../src/services/dailySlateService.js');
    const res = await writeDailySlate(dateStr);
    const summary = Object.entries(res.byLeague).map(([l, n]) => `${l}=${n}`).join(', ');
    log(`📋 Daily slate published: ${res.total} game(s)${summary ? ` (${summary})` : ''}`);
  } catch (e) {
    log(`⚠️ Daily slate write failed (non-fatal, picks unaffected): ${e.message}`);
  }
}

// Build the plan, but ride out transient fetch outages. A wifi/API failure at
// build time used to return an empty plan that then slept 24h — the bug that
// silently killed a whole slate (see Friday's "Sleeping 21.22 hours" log).
// Here, an empty plan caused by fetch FAILURES retries with backoff up to
// `maxWaitMs`. A clean empty (fetches succeeded, no games) returns at once; a
// partial result (some sport failed but others have games) proceeds rather
// than holding a good slate hostage to one flaky sport — the failed sport gets
// another shot on the next daily build. Returns the schedule array.
async function buildPlanResilient(dateStr, { maxWaitMs = 90 * 60 * 1000 } = {}) {
  const start = Date.now();
  let attempt = 0;
  while (true) {
    attempt++;
    const { schedule, fetchFailed } = await buildPlan(dateStr);
    if (schedule.length > 0 || !fetchFailed) {
      // Plan built (or genuinely no games) — snapshot the public slate for the app.
      await writeDailySlateNonFatal(dateStr);
      return schedule;
    }
    if (Date.now() - start >= maxWaitMs) {
      log(`⚠️ Plan still empty after ${attempt} attempts / ${Math.round((Date.now() - start) / 60000)}m of fetch failures — proceeding empty.`);
      return schedule;
    }
    const backoff = Math.min(20 * 60 * 1000, 60 * 1000 * 2 ** (attempt - 1)); // 1,2,4,8,16,20,20…m
    log(`🔁 Empty plan from fetch failures — retry in ${Math.round(backoff / 60000)}m (attempt ${attempt})`);
    await sleepUntilWallClock(new Date(Date.now() + backoff));
  }
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
    await runScript('scripts/run-dfs-lineups.js', [sport.flag, ...(sport.dfsArgs || [])]);
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

  // Coverage tracking. A game is a confirmed MISS once its FINAL retry tier has
  // fired and no pick is stored. We check the instant that last tier completes —
  // not at end-of-day — so an early slate (WC at 10 AM) surfaces by late morning
  // instead of after the night's last MLB game. (log + rollup; no real-time push.)
  const lastTierTime = new Map(); // gameId -> latest triggerTime (ms)
  for (const e of schedule) {
    const t = e.triggerTime.getTime();
    if (!lastTierTime.has(e.gameId) || t > lastTierTime.get(e.gameId)) lastTierTime.set(e.gameId, t);
  }
  const uniqueGameIds = new Set(schedule.map(e => e.gameId));
  const missedGames = [];
  let gameAlreadyHasPick = null;
  try { ({ gameAlreadyHasPick } = await import('../src/services/picksService.js')); }
  catch (e) { log(`⚠️ Coverage check disabled — picksService load failed: ${e.message}`); }

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
        const tierWord = entry.tier > 1 ? 'retry' : 'primary';
        const tierTag = entry.leadMin == null ? ` [${tierWord}, fixed 10AM]` : ` [${tierWord} T-${entry.leadMin}]`;
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
        const tierWord = entry.tier > 1 ? 'retry' : 'primary';
        const tierTag = entry.leadMin == null ? ` [${tierWord}, fixed 10AM]` : ` [${tierWord} T-${entry.leadMin}]`;
        try {
          log(`  🎯 Props: ${entry.matchup}${tierTag} (id ${entry.gameId})`);
          await runScript(`scripts/${sport.propsScript}`, ['--game-id', String(entry.gameId)]);
        } catch (e) {
          log(`  ❌ Props failed: ${entry.matchup}${tierTag}: ${e.message}`);
        }
      }
    }

    // Coverage: any game in this window whose FINAL tier just fired with no
    // stored pick is a confirmed miss — flag it now (picks store synchronously
    // during runScript above, so the DB read here is accurate). Checked once per
    // game (only at its last tier), so no duplicate warnings.
    if (typeof gameAlreadyHasPick === 'function') {
      for (const entry of batch) {
        if (entry.triggerTime.getTime() !== lastTierTime.get(entry.gameId)) continue;
        const etDate = entry.startTime.toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
        try {
          const res = await gameAlreadyHasPick(entry.sport.label, entry.homeTeam, entry.awayTeam, etDate, entry.gameId);
          if (!res?.exists) {
            missedGames.push(entry);
            log(`⚠️ MISSED PICK: ${entry.sport.label} ${entry.matchup} — 0 stored after all retry tiers (id ${entry.gameId})`);
          }
        } catch (e) {
          log(`⚠️ Coverage check failed for ${entry.sport.label} ${entry.matchup}: ${e.message}`);
        }
      }
    }
  }

  // Run DFS after all games are done for each sport
  for (const sport of sportsWithGames) {
    await runDFS(sport);
  }

  log('\n🏁 All games complete for today.');

  // End-of-day rollup from the per-game checks logged above (the Jun 5/8/10 NBA
  // outages were all silent — this makes a dead slate announce itself).
  const covered = uniqueGameIds.size - missedGames.length;
  if (missedGames.length === 0) {
    log(`📊 Daily pick coverage: ${covered}/${uniqueGameIds.size} games covered — no misses ✅`);
  } else {
    log(`📊 Daily pick coverage: ${covered}/${uniqueGameIds.size} covered — ${missedGames.length} MISSED: ${missedGames.map(g => `${g.sport.label} ${g.matchup}`).join(' | ')}`);
  }
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
    const { schedule } = await buildPlan(getTodayETDateStr());
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
  // Node caches modules at boot, so a long-running scheduler keeps executing the
  // code it started with — a stale process silently defeats every later fix. Log
  // the commit it's actually running so drift is visible at a glance in the logs.
  try {
    const sha = execSync('git rev-parse --short HEAD', { cwd: PROJECT_DIR }).toString().trim();
    const dirty = execSync('git status --porcelain', { cwd: PROJECT_DIR }).toString().trim() ? ' (+uncommitted changes)' : '';
    log(`🔖 Running commit: ${sha}${dirty} — restart the scheduler after pulling/committing to pick up code changes`);
  } catch { log('🔖 Running commit: (unavailable — not a git checkout)'); }
  log(`Lead time: ${LEAD_TIME_MINUTES} min before each game`);
  log(`Sports: ${SPORTS.map(s => s.label).join(', ')}`);

  // Check today first
  const todaySchedule = await buildPlanResilient(getTodayETDateStr());
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
    const schedule = await buildPlanResilient(getTodayETDateStr());
    await executeSchedule(schedule);

    // If execution ran past midnight into a new ET day, immediately build
    // and run that day's plan instead of sleeping past it.
    let currentDate = getTodayETDateStr();
    while (currentDate !== planDateBefore && currentDate !== getTomorrowETDateStr()) {
      log(`\n⚡ Execution spanned into ${currentDate} — building today's plan immediately`);
      const todaySchedule = await buildPlanResilient(currentDate);
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

// Supervise main()'s loop. A transient network error (DNS not ready after wake,
// a BDL/Supabase blip) should NOT end the scheduler — restart its loop in-process
// after a short backoff so it self-heals without waiting on the watchdog. Only a
// genuine non-transient fault exits(1), and the watchdog then restarts a fresh
// process. This is the fix for Jun 21 2026, when a single `getaddrinfo ENOTFOUND`
// killed the scheduler for the whole morning and zeroed the day's picks.
async function supervise() {
  for (let attempt = 1; ; attempt++) {
    try {
      await main();
      log('Scheduler main() returned — exiting cleanly.');
      return;
    } catch (e) {
      const msg = e?.message || String(e);
      if (TRANSIENT_NET.test(msg)) {
        const waitMs = Math.min(15000 * attempt, 60000);
        log(`⚠️ Transient network error — restarting the scheduler loop in ${Math.round(waitMs / 1000)}s (NOT exiting; common right after a wake): ${msg}`);
        await new Promise((r) => setTimeout(r, waitMs));
        continue;
      }
      log(`💀 Scheduler crashed (non-transient): ${msg} — exiting(1) for a clean watchdog restart`);
      console.error(e);
      process.exit(1);
    }
  }
}
supervise();
