import { readFileSync, writeFileSync, renameSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { etDate } from './morningHealth.js';
import { runContentStage } from './dailyContentPipeline.js';

export async function runMorningWatch({ now = new Date(), markerPath, cwd, signal, timeoutMs = 75_000, runStage = runContentStage }) {
  const date = etDate(now);
  const hour = Number(new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: 'numeric', hourCycle: 'h23' }).format(now));
  if (hour !== 7) return { skipped: 'outside 7–8AM ET window' };
  let previous;
  try { previous = JSON.parse(readFileSync(markerPath, 'utf8')); }
  catch (error) { if (error.code !== 'ENOENT') throw new Error(`Health marker unreadable: ${error.message}`); }
  if (previous?.date === date && previous.completed_at) return { skipped: 'already checked', previous };
  if (previous?.date === date && Date.parse(now) - Date.parse(previous.attempted_at) < timeoutMs + 5000) return { skipped: 'attempt still within its deadline', previous };
  const attemptedAt = new Date(now).toISOString();
  const save = value => {
    mkdirSync(dirname(markerPath), { recursive: true });
    const temp = `${markerPath}.${process.pid}.tmp`;
    writeFileSync(temp, JSON.stringify(value));
    renameSync(temp, markerPath);
  };
  save({ date, attempted_at: attemptedAt, status: 'running' });
  // Mark an attempt complete only after a process result exists. A wrapper
  // crash leaves a running marker that a later tick can recover after 80s.
  const result = await runStage({ id: '7am-health', timeoutMs, args: ['scripts/morning-health.js', '--date', date, '--json'] }, { cwd, signal, maxAttempts: 3 });
  const marker = { date, attempted_at: attemptedAt, completed_at: new Date().toISOString(), status: result.status, exit_code: result.exit_code };
  save(marker); // a failed or timed-out check is retained as failed, never OK
  return marker;
}
