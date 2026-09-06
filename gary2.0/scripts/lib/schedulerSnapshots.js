import { runContentStage } from './dailyContentPipeline.js';

/** A daemon can hold yesterday's ESM exports while today's files import new
 * ones. Each publication needs a fresh module graph, just like pick children.
 */
export async function publishSchedulerSnapshot(kind, date, { cwd, log = () => {}, runStage = runContentStage } = {}) {
  if (!['slate', 'board'].includes(kind) || !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('Invalid snapshot kind or date');
  const args = kind === 'slate'
    ? ['scripts/run-daily-slate.js', '--date', date]
    : ['scripts/run-tomorrow-board.js', '--date', date, '--table', 'tomorrow_board'];
  const controller = new AbortController();
  let stopping;
  const stop = signal => {
    stopping = signal;
    controller.abort(new Error(`Scheduler received ${signal}`));
  };
  const term = () => stop('SIGTERM');
  const interrupt = () => stop('SIGINT');
  process.once('SIGTERM', term);
  process.once('SIGINT', interrupt);
  try {
    const result = await runStage({ id: `${kind}:${date}`, args, timeoutMs: 480_000 }, { cwd, signal: controller.signal });
    const ok = result.status === 'ok';
    log(`${ok ? '✅' : '⚠️'} ${kind} snapshot ${date}: ${result.status} (fresh process, exit ${result.exit_code})`);
    return { ok, result };
  } catch (error) {
    log(`⚠️ ${kind} snapshot ${date} failed (non-fatal): ${error.message}`);
    return { ok: false, error };
  } finally {
    process.removeListener('SIGTERM', term);
    process.removeListener('SIGINT', interrupt);
    // Default Node signal termination does not emit the exit hook used by
    // runContentStage. Reap the detached snapshot first, then stop the daemon;
    // never swallow its stop request and begin another publication.
    if (stopping) process.exit(stopping === 'SIGTERM' ? 143 : 130);
  }
}
