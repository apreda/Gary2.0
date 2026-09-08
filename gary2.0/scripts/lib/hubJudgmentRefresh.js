/** Frequent checks reuse unchanged judgments; only changed evidence asks Gary
 * for another view. Existing daily runs still own the research collectors. */
export function hubJudgmentRefreshStages(date, now = new Date()) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '')) throw new Error('Expected Hub refresh date');
  const hour = Number(new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York',
    hour: 'numeric', hourCycle: 'h23' }).format(now));
  if (hour < 6) return [];
  return ['MLB', 'NFL', 'NCAAF', 'NBA'].map(league => ({
    id: `${league.toLowerCase()}-hub-judgments`, timeoutMs: 480_000,
    args: ['run-insight-connections.js', '--date', date, '--league', league, '--judgments-only'],
  }));
}
