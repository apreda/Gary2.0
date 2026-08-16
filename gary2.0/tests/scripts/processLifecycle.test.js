import { describe, expect, it } from 'vitest';
import { exitAfterFlushing, flushWritable } from '../../scripts/lib/processLifecycle.js';

function asynchronousStream(events, label) {
  return {
    destroyed: false,
    writableEnded: false,
    write(_chunk, callback) {
      events.push(`${label}:queued`);
      queueMicrotask(() => {
        events.push(`${label}:flushed`);
        callback();
      });
      return true;
    },
  };
}

describe('short-lived CLI process lifecycle', () => {
  it('does not call exit until both scheduler-facing streams have flushed', async () => {
    const events = [];
    await exitAfterFlushing(7, {
      stdout: asynchronousStream(events, 'stdout'),
      stderr: asynchronousStream(events, 'stderr'),
      exit: (code) => events.push(`exit:${code}`),
      timeoutMs: 50,
    });

    expect(events).toEqual([
      'stdout:queued',
      'stderr:queued',
      'stdout:flushed',
      'stderr:flushed',
      'exit:7',
    ]);
  });

  it('fails open after the bounded timeout when a broken stream never acknowledges its flush', async () => {
    const started = Date.now();
    await flushWritable({
      destroyed: false,
      writableEnded: false,
      write() { return false; },
    }, 10);

    expect(Date.now() - started).toBeGreaterThanOrEqual(5);
  });
});
