import { spawn } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { getTodayETDateStr } from './schedulerClock.js';

export const CHILD_MAX_RUNTIME_MS = 45 * 60 * 1000;
const CHILD_TERMINATION_GRACE_MS = 5 * 1000;

export class SchedulerChildDeadlineError extends Error {
  constructor({ scriptPath, timeoutMs, deadlineAt, limitingReason }) {
    const deadline = deadlineAt instanceof Date ? deadlineAt : new Date(deadlineAt);
    const deadlineText = Number.isFinite(deadline.getTime()) ? deadline.toISOString() : 'unknown';
    super(`Child deadline reached before ${limitingReason} (${scriptPath}; budget ${Math.round(timeoutMs / 1000)}s; deadline ${deadlineText})`);
    this.name = 'SchedulerChildDeadlineError';
    this.code = 'SCHEDULER_CHILD_DEADLINE';
    this.retryable = true;
    this.scriptPath = scriptPath;
    this.timeoutMs = timeoutMs;
    this.deadlineAt = deadlineText;
    this.limitingReason = limitingReason;
  }
}

function signalChildProcessGroup(proc, signal) {
  // Each runner owns a process group so its model/search subprocesses cannot
  // outlive a deadline and keep researching or writing after the queue moves.
  try {
    if (Number.isInteger(proc?.pid)) process.kill(-proc.pid, signal);
  } catch {
    try { proc?.kill(signal); } catch {}
  }
}

/** Own one child process tree from spawn through exit or deadline cleanup. */
export function createSchedulerProcessRunner({ projectDir: PROJECT_DIR, logDir: LOG_DIR,
  log = () => {}, spawnProcess = spawn, signalProcessGroup = signalChildProcessGroup }) {
  return function runScript(scriptPath, args = [], options = {}) {
  return new Promise((resolve, reject) => {
    const timeoutMs = Number.isFinite(Number(options.timeoutMs))
      ? Math.max(0, Math.floor(Number(options.timeoutMs)))
      : CHILD_MAX_RUNTIME_MS;
    const limitingReason = options.limitingReason || 'hard_cap';
    const deadlineAt = options.deadlineAt instanceof Date
      ? options.deadlineAt
      : new Date(Date.now() + timeoutMs);
    const deadlineError = () => new SchedulerChildDeadlineError({
      scriptPath,
      timeoutMs,
      deadlineAt,
      limitingReason,
    });

    // Do not start a process that cannot finish inside a safe wall-clock
    // window. Its untouched later tier remains in the dynamic queue.
    if (timeoutMs <= 0) {
      reject(deadlineError());
      return;
    }

    log(`  📡 Running: node ${scriptPath} ${args.join(' ')}`);
    const proc = spawnProcess('node', [scriptPath, ...args], {
      cwd: PROJECT_DIR,
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: true,
      env: {
        ...process.env,
        NODE_OPTIONS: '',
        // Optional research must leave time for Gary's decision before the
        // parent terminates this exact game's process tree.
        GARY_CHILD_DEADLINE_AT: deadlineAt.toISOString(),
      }
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

    let settled = false;
    let timedOut = false;
    let killTimer = null;
    const persistOutput = () => {
      try {
        const logFile = join(LOG_DIR, `${getTodayETDateStr()}-${args.join('-')}.log`);
        appendFileSync(logFile, output);
      } catch {}
    };
    const timeout = setTimeout(() => {
      if (settled) return;
      timedOut = true;
      signalProcessGroup(proc, 'SIGTERM');
      // Do not advance the queue while a timed-out writer is still alive.
      // Wait through the grace period even if the direct Node child closes:
      // model/search descendants share the group and must be gone too.
      killTimer = setTimeout(() => {
        signalProcessGroup(proc, 'SIGKILL');
        if (settled) return;
        settled = true;
        persistOutput();
        log(`  ⏱️ Deadline stopped child tree before ${limitingReason}; later tier remains eligible`);
        reject(deadlineError());
      }, CHILD_TERMINATION_GRACE_MS);
    }, timeoutMs);

    proc.on('error', (error) => {
      if (settled) return;
      if (timedOut) return; // deadline timer owns group cleanup + rejection
      settled = true;
      clearTimeout(timeout);
      if (killTimer) clearTimeout(killTimer);
      reject(error);
    });

    proc.on('close', (code) => {
      if (settled) return;
      if (timedOut) return; // wait for the group cleanup grace period
      settled = true;
      clearTimeout(timeout);
      if (killTimer) clearTimeout(killTimer);
      persistOutput();
      if (code === 0) {
        log(`  ✅ Done`);
        resolve(output);
      } else {
        // Why it failed, in the scheduler log itself (Sep 25 2026: the Sep 20
        // Commanders @ Cowboys T-240 exit read only "Exit code 1"; the reason,
        // both model accounts at their limits and web search down, sat in the
        // per-game file). The last error lines the child printed, verbatim.
        const reasons = output.split('\n').map((l) => l.trim())
          .filter((l) => /^(Fatal error|⚠️\s+Error|\[Orchestrator\] Error|Error:|PickDataError)/.test(l)).slice(-2);
        log(`  ❌ Failed (exit ${code})${reasons.length ? `: ${reasons.join(' | ')}` : ''}`);
        reject(new Error(`Exit code ${code}`));
      }
    });
  });
};
}
