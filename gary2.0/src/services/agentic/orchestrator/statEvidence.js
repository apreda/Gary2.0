/** Model-facing source records. Keep identity, scope and values in one packet.
 * No field whitelist, array cap, substring clipping, rounding or null-to-zero
 * conversion belongs at this boundary. Fetchers own the requested sample.
 */
export function renderStatEvidence(result, token, homeTeam, awayTeam) {
  const matchup = [awayTeam, homeTeam].filter(Boolean).join(' @ ');
  return `${token}${matchup ? ` — ${matchup}` : ''}:\n${JSON.stringify(result ?? { unavailable: 'No data returned' }, null, 2)}`;
}
