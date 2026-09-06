import { runContentStage } from './dailyContentPipeline.js';

/** A daemon can hold yesterday's ESM exports while today's files import new
 * ones. Each publication needs a fresh module graph, just like pick children.
 */
export async function publishSchedulerSnapshot(kind, date, { cwd, log = () => {}, runStage = runContentStage } = {}) {
  if (!['slate', 'board'].includes(kind) || !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('Invalid snapshot kind or date');
  const args = kind === 'slate'
    ? ['scripts/run-daily-slate.js', '--date', date]
    : ['scripts/run-tomorrow-board.js', '--date', date, '--table', 'tomorrow_board'];
  try {
    const result = await runStage({ id: `${kind}:${date}`, args, timeoutMs: 480_000 }, { cwd });
    const ok = result.status === 'ok';
    log(`${ok ? '✅' : '⚠️'} ${kind} snapshot ${date}: ${result.status} (fresh process, exit ${result.exit_code})`);
    return { ok, result };
  } catch (error) {
    log(`⚠️ ${kind} snapshot ${date} failed (non-fatal): ${error.message}`);
    return { ok: false, error };
  }
}
