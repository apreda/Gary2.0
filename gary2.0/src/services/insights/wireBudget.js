/**
 * One Wire pass spends a single clock across its leagues. The search and
 * recovery allowances bound each league's combined window; the shared
 * subscription cascade divides that window among its available accounts.
 */
export function wireLeagueWindow({ remainingMs, floorMs, bridgeMaxMs, fallbackReserveMs }) {
  if (!(remainingMs >= floorMs)) return null;
  const timeoutMs = Math.min(remainingMs, bridgeMaxMs + fallbackReserveMs);
  const primary = timeoutMs - fallbackReserveMs;
  // Retain the caller's timing shape while the account cascade owns routing.
  const bridgeTimeoutMs = primary >= floorMs ? Math.min(primary, bridgeMaxMs) : 0;
  return { bridgeTimeoutMs, timeoutMs };
}
