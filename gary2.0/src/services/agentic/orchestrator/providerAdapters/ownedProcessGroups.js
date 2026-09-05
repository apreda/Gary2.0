// Only explicitly cancellable bridge calls get separate process groups.
// The scheduler still owns the ordinary child group; these groups must also
// die if their Node parent is stopped before its research deadline fires.
const ownedGroups = new Set();

function killOwnedGroups() {
  for (const pid of ownedGroups) {
    try { process.kill(-pid, 'SIGKILL'); } catch { /* already gone */ }
  }
}

function removeHooks() {
  process.removeListener('SIGTERM', onTerm);
  process.removeListener('SIGINT', onInt);
  process.removeListener('exit', killOwnedGroups);
}

function shutdown(signal) {
  killOwnedGroups();
  ownedGroups.clear();
  removeHooks();
  // Preserve existing application shutdown handlers. Without one, restore
  // the normal signal action after synchronously cleaning up our children.
  if (process.listenerCount(signal) === 0) process.kill(process.pid, signal);
}
const onTerm = () => shutdown('SIGTERM');
const onInt = () => shutdown('SIGINT');

export function registerOwnedProcessGroup(pid) {
  if (!Number.isInteger(pid)) return () => {};
  if (ownedGroups.size === 0) {
    // run-agentic-picks exits immediately from its signal handler. Cleanup
    // must run before it, and also cover an explicit process.exit().
    process.prependListener('SIGTERM', onTerm);
    process.prependListener('SIGINT', onInt);
    process.on('exit', killOwnedGroups);
  }
  ownedGroups.add(pid);
  return () => {
    ownedGroups.delete(pid);
    if (ownedGroups.size === 0) removeHooks();
  };
}
