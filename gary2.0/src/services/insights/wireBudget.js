/**
 * One Wire pass spends a single clock across its leagues. Each league gets a
 * window with two parts: the subscription (Codex) search first, then the
 * native web-search fallback. The fallback keeps a reserved share of the
 * window, so a slow or capped subscription search can no longer consume the
 * whole league allowance and leave the fallback with seconds (Sep 17 2026:
 * NCAAF failed twice at "deadline exceeded" with MLB/NFL untouched).
 */
export function wireLeagueWindow({ remainingMs, floorMs, bridgeMaxMs, fallbackReserveMs }) {
  if (!(remainingMs >= floorMs)) return null;
  const timeoutMs = Math.min(remainingMs, bridgeMaxMs + fallbackReserveMs);
  const primary = timeoutMs - fallbackReserveMs;
  // Below the floor the subscription search cannot finish honestly; hand the
  // whole window to the fallback instead of starting a search doomed to time out.
  const bridgeTimeoutMs = primary >= floorMs ? Math.min(primary, bridgeMaxMs) : 0;
  return { bridgeTimeoutMs, timeoutMs };
}
