import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';

function cap(env, name, fallback) {
  const n = Number(env[name]);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

// Keep one serial writer. Home's board and Wire are independent of the long
// football computations, and base player packs deserve their own early slot.
export function dailyContentStages(date, env = process.env) {
  const stage = (id, variable, seconds, args) => ({ id, timeoutMs: cap(env, variable, seconds) * 1000, args });
  const insight = (league, mode) => ['run-insight-connections.js', '--date', date, '--league', league, mode];
  return [
    stage('board', 'GARY_CAP_BOARD', 480, ['scripts/run-tomorrow-board.js', '--date', date, '--table', 'tomorrow_board']),
    stage('wire', 'GARY_CAP_WIRE', 180, ['run-wire-items.js', '--date', date]),
    stage('mlb-insights', 'GARY_CAP_INSIGHTS', 900, insight('MLB,NBA', '--skip-cards')),
    stage('mlb-cards', 'GARY_CAP_CARDS_MLB', 600, insight('MLB,NBA', '--cards-only')),
    stage('nfl-cards', 'GARY_CAP_CARDS_NFL', 600, insight('NFL', '--cards-only')),
    stage('ncaaf-cards', 'GARY_CAP_CARDS_NCAAF', 900, insight('NCAAF', '--cards-only')),
    stage('nfl-insights', 'GARY_CAP_NFL', 1500, insight('NFL', '--skip-cards')),
    stage('ncaaf-insights', 'GARY_CAP_NCAAF', 1500, insight('NCAAF', '--skip-cards')),
    // Insights can name players after the early base packs were completed.
    // The card ledger now reopens only games missing those exact subjects.
    stage('ncaaf-card-subjects', 'GARY_CAP_CARDS_NCAAF', 900, insight('NCAAF', '--cards-only')),
    stage('card-watch', 'GARY_CAP_CARDWATCH', 180, ['scripts/check-card-coverage.js', `--date=${date}`]),
    stage('morning-health', 'GARY_CAP_HEALTH', 90, ['scripts/morning-health.js', '--date', date]),
  ];
}

/** A recovery runs an explicit subset in the normal dependency order. */
export function selectContentStages(stages, requested) {
  if (requested == null) return stages;
  const ids = String(requested).split(',').map(id => id.trim()).filter(Boolean);
  const known = new Set(stages.map(stage => stage.id));
  if (!ids.length || ids.some(id => !known.has(id)) || new Set(ids).size !== ids.length) {
    throw new Error(`Expected unique --stages from: ${[...known].join(',')}`);
  }
  const selected = new Set(ids);
  return stages.filter(stage => selected.has(stage.id));
}

// Saturday college slates need hours of provider capacity, not another short
// eight-minute pass. The existing job owns this early phase too, so a delayed
// overnight pass cannot overlap its own 6AM run. Per-game checkpoints survive
// the outer cap and daytime passes resume remaining/partial games.
export function collegeCardStages(date, env = process.env) {
  return [{
    id: 'overnight-football-cards',
    timeoutMs: cap(env, 'GARY_CAP_NIGHT_NCAAF_CARDS', 180 * 60) * 1000,
    env: { GARY_NCAAF_LANE_BUDGET_MS: String(cap(env, 'GARY_NCAAF_OVERNIGHT_BUDGET_MS', 165 * 60_000)) },
    args: ['run-insight-connections.js', '--date', date, '--league', 'NFL,NCAAF', '--cards-only'],
  }];
}

/** A cap owns the whole subprocess group, including ordinary bridge children.
 * SIGTERM lets explicitly cancellable bridge groups run their shutdown hooks;
 * SIGKILL then clears descendants even when their direct parent has exited.
 */
export async function runContentStage(stage, {
  cwd, env = process.env, node = process.execPath, signal,
  graceMs = 1000, startupRetryMs = 5000, maxAttempts = 3,
  onEvent = () => {}, stdio = 'inherit',
} = {}) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    signal?.throwIfAborted();
    const started = Date.now();
    onEvent({ event: 'stage-start', stage: stage.id, attempt, at: new Date(started).toISOString(), timeout_ms: stage.timeoutMs });
    let pid;
    let stopReason;
    let killTimer;
    let deadlineTimer;
    let stoppedResolve;
    const stopped = new Promise(resolve => { stoppedResolve = resolve; });
    const killGroup = (sig) => {
      if (!pid) return;
      try { process.kill(-pid, sig); } catch { /* group already reaped */ }
    };
    const onExit = () => killGroup('SIGKILL');
    const stop = (reason) => {
      if (stopReason) return;
      stopReason = reason;
      killGroup('SIGTERM');
      killTimer = setTimeout(() => { killGroup('SIGKILL'); stoppedResolve(); }, graceMs);
    };
    const onAbort = () => stop('cancelled');
    let outcome;
    let startupError = '';
    try {
      const child = spawn(node, stage.args, { cwd, env: { ...env, ...stage.env }, detached: true, stdio: stdio === 'inherit' ? ['inherit', 'inherit', 'pipe'] : stdio });
      child.stderr?.on('data', chunk => {
        if (stdio === 'inherit') process.stderr.write(chunk);
        if (startupError.length < 64_000) startupError += chunk.toString().slice(0, 64_000 - startupError.length);
      });
      pid = child.pid;
      process.once('exit', onExit);
      signal?.addEventListener('abort', onAbort, { once: true });
      deadlineTimer = setTimeout(() => stop('timeout'), stage.timeoutMs);
      if (signal?.aborted) onAbort();
      outcome = await new Promise(resolve => {
        child.once('error', err => resolve({ code: 1, error: err.message, errorCode: err.code }));
        child.once('exit', (code, exitSignal) => resolve({ code: code ?? 1, signal: exitSignal }));
      });
      if (stopReason) await stopped;
      else killGroup('SIGKILL'); // no successful stage may leave work behind
    } finally {
      clearTimeout(deadlineTimer);
      clearTimeout(killTimer);
      signal?.removeEventListener('abort', onAbort);
      process.removeListener('exit', onExit);
    }
    const durationMs = Date.now() - started;
    const result = {
      event: 'stage-end', stage: stage.id, attempt, at: new Date().toISOString(),
      duration_ms: durationMs, status: stopReason || (outcome.code === 0 ? 'ok' : 'failed'),
      exit_code: stopReason === 'timeout' ? 124 : stopReason === 'cancelled' ? 130 : outcome.code,
      ...(outcome.error ? { error: outcome.error } : {}),
    };
    onEvent(result);
    if (signal?.aborted) signal.throwIfAborted();
    // Preserve the existing launchd workaround for Node's immediate uv_cwd
    // EINTR startup exits. A timed-out or already-working stage never repeats.
    const transientStartup = outcome.errorCode === 'EINTR' || /EINTR[\s\S]*uv_cwd|uv_cwd[\s\S]*EINTR/.test(startupError);
    if (result.status !== 'failed' || !transientStartup || durationMs > 15_000 || attempt >= maxAttempts) return result;
    await delay(startupRetryMs, undefined, { signal });
  }
}

export async function runDailyContent(stages, options = {}) {
  const results = [];
  const runStage = options.runStage || runContentStage;
  for (const stage of stages) {
    options.signal?.throwIfAborted();
    results.push(await runStage(stage, options));
  }
  return results;
}
