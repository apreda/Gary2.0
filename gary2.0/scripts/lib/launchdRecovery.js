/** Only process IDs leave this parser: process titles may contain credentials. */
export function busySchedulerProcesses(psOutput, schedulerPid) {
  const rows = String(psOutput).split('\n').flatMap(line => {
    const match = line.trim().match(/^(\d+)\s+(\d+)\s+(.+)$/);
    return match ? [{ pid: Number(match[1]), parent: Number(match[2]), command: match[3] }] : [];
  });
  if (!rows.length) throw new Error('Cannot inspect active writers; empty process snapshot');
  const descendants = new Set(schedulerPid ? [schedulerPid] : []);
  let changed = true;
  while (changed) {
    changed = false;
    for (const row of rows) {
      if (descendants.has(row.parent) && !descendants.has(row.pid)) {
        descendants.add(row.pid); changed = true;
      }
    }
  }
  return rows.filter(row => row.pid !== schedulerPid && (
    (descendants.has(row.pid) && !/^(?:\S*\/)?caffeinate(?:\s|$)/.test(row.command))
    // Detached pick children can survive their parent and become launchd's
    // children. They must finish before a replacement scheduler is started.
    || /^(?:\S*\/)?node(?:js)?(?:\s+--\S+)*\s+\S*\brun-agentic-(?:picks|[\w-]+-props)\.js(?:\s|$)/.test(row.command)
  )).map(row => row.pid).sort((a, b) => a - b);
}

export function launchdJob(result) {
  if (result.status === 0) {
    return { loaded: true, pid: Number(String(result.stdout).match(/^\s*pid = (\d+)\s*$/m)?.[1]) || null };
  }
  if (result.status === 113 || /could not find service/i.test(result.stderr || '')) return { loaded: false, pid: null };
  throw new Error('Cannot verify the launchd job; recovery withheld');
}

export async function recoverLaunchdJob({ label, domain, plist, ageSeconds, staleSeconds, protectPickWorkers = false }, {
  run, sleep = ms => new Promise(resolve => setTimeout(resolve, ms)),
}) {
  if (ageSeconds <= staleSeconds) return { action: 'fresh' };
  const service = `${domain}/${label}`;
  const inspect = () => launchdJob(run('/bin/launchctl', ['print', service]));
  const before = inspect();
  if (protectPickWorkers) {
    const processes = run('/bin/ps', ['-axo', 'pid=,ppid=,command=']);
    if (processes.status !== 0) throw new Error('Cannot inspect active writers; recovery withheld');
    const busy = busySchedulerProcesses(processes.stdout, before.pid);
    if (busy.length) return { action: 'deferred', active_process_ids: busy };
  }
  if (before.loaded) {
    const unloaded = run('/bin/launchctl', ['bootout', service]);
    if (unloaded.status !== 0 && inspect().loaded) throw new Error('Could not unload the old job; replacement withheld');
  }
  for (let attempt = 1; attempt <= 3; attempt++) {
    const loaded = run('/bin/launchctl', ['bootstrap', domain, plist]);
    if (loaded.status === 0 || inspect().loaded) {
      // Both managed jobs use RunAtLoad. A subsequent kickstart -k would
      // terminate the process bootstrap has just launched.
      return { action: 'reloaded', attempts: attempt };
    }
    if (attempt < 3) await sleep(2000);
  }
  throw new Error('Bootstrap failed after three attempts; job remains unloaded');
}
