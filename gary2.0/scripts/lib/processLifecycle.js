const DEFAULT_FLUSH_TIMEOUT_MS = 1_000;

/**
 * Queue a zero-byte write behind all existing output and resolve once the
 * stream has flushed. `process.exit()` can otherwise truncate the final
 * scheduler outcome marker when stdout/stderr are pipes.
 */
export function flushWritable(stream, timeoutMs = DEFAULT_FLUSH_TIMEOUT_MS) {
  return new Promise((resolve) => {
    let settled = false;
    let timer = null;
    const finish = () => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      resolve();
    };
    timer = setTimeout(finish, Math.max(0, Number(timeoutMs) || 0));

    if (!stream || stream.destroyed || stream.writableEnded || typeof stream.write !== 'function') {
      finish();
      return;
    }

    try {
      stream.write('', finish);
    } catch {
      finish();
    }
  });
}

/**
 * Flush the scheduler-facing output before forcing a short-lived CLI child to
 * exit. Provider HTTP clients may retain idle sockets after all awaited work
 * and cache writes have completed; those sockets must not delay the next
 * exact-game props job.
 */
export async function exitAfterFlushing(code = 0, options = {}) {
  const stdout = options.stdout ?? process.stdout;
  const stderr = options.stderr ?? process.stderr;
  const exit = options.exit ?? process.exit;
  const timeoutMs = options.timeoutMs ?? DEFAULT_FLUSH_TIMEOUT_MS;

  await Promise.all([
    flushWritable(stdout, timeoutMs),
    flushWritable(stderr, timeoutMs),
  ]);
  exit(code);
}

export default { exitAfterFlushing, flushWritable };
