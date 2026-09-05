export function draftFailureCode(error) {
  const message = String(error);
  if (/credit|payment.required|\b402\b/i.test(message)) return 'MODEL_CREDITS_UNAVAILABLE';
  if (/\b(401|403)\b|unauthori[sz]ed|forbidden/i.test(message)) return 'MODEL_AUTH_FAILED';
  if (/\b429\b|rate.?limit/i.test(message)) return 'MODEL_RATE_LIMIT';
  if (/timeout|timed.out|abort/i.test(message)) return 'MODEL_TIMEOUT';
  return 'DRAFT_FAILED';
}

/** Provider failures are different from a deliberate editorial skip. */
export async function collectEngagementDrafts(candidates, draftOne, maxRows = 10) {
  const rows = [], issues = new Set();
  let attempted = 0, skipped = 0, failed = 0;
  for (const candidate of candidates) {
    if (rows.length >= maxRows) break;
    attempted++;
    try {
      const row = await draftOne(candidate);
      if (row == null) skipped++;
      else rows.push(row);
    } catch (error) {
      failed++;
      const code = draftFailureCode(error);
      issues.add(code);
      // The rest of the batch cannot repair an exhausted account or rate cap.
      if (['MODEL_CREDITS_UNAVAILABLE', 'MODEL_AUTH_FAILED', 'MODEL_RATE_LIMIT', 'MODEL_TIMEOUT'].includes(code)) break;
    }
  }
  return { rows, attempted, skipped, failed, health: { status: issues.size ? 'degraded' : 'ok', issues: [...issues] } };
}

export async function persistEngagementDrafts(date, batch, replace) {
  // Keep the prior sheet on a failed or empty generation. Partial batches stay
  // available in a dry run for inspection, but never erase a healthy sheet.
  if (batch.failed || !batch.rows.length) return { generated: 0, preserved_existing: true };
  const count = await replace(date, batch.rows);
  if (count !== batch.rows.length) throw new Error('DRAFT_STORAGE_COUNT_MISMATCH');
  return { generated: count, preserved_existing: false };
}
/** Do not attach unrelated betting facts because a tweet mentions "State". */
export function findEngagementPick(text, picks) {
  const normalize = value => ` ${String(value ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()} `;
  const tweet = normalize(text);
  const matches = picks.filter(pick => [pick.awayTeam, pick.homeTeam].some(team => {
    const name = normalize(team);
    return name.trim().length > 3 && tweet.includes(name);
  }));
  return matches.length === 1 ? matches[0] : null;
}
