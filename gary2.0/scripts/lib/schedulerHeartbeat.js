import { appendFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

// Open each Eastern day's incident log before publishing that day's heartbeat,
// even when the scheduler is quietly waiting for its next scheduled job.
export function createSchedulerHeartbeat({ logDirectory, heartbeatFile, pid = process.pid,
  now = Date.now, append = appendFileSync, write = writeFileSync }) {
  let loggedDate;
  return function heartbeat() {
    const at = new Date(now());
    const date = at.toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
    try {
      if (date !== loggedDate) {
        const time = at.toLocaleString('en-US', { timeZone: 'America/New_York' });
        append(join(logDirectory, `scheduler-${date}.log`), `[${time}] Scheduler heartbeat: daily log opened.\n`);
        loggedDate = date;
      }
    } finally {
      // The process watchdog still measures liveness if logging fails. The
      // incident collector independently reports missing/unreadable logs.
      write(heartbeatFile, `${at.getTime()} pid=${pid}\n`);
    }
  };
}
