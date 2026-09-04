/** Pure, bounded operational summary. Error text is never copied into health output. */
export function socialRunHealth(body) {
  const failures = [body?.error, body?.metrics?.error, body?.recap?.error,
    body?.weekTape?.error, body?.verdict?.error, body?.arc?.error,
    ...(body?.results ?? []).map((result) => result?.error)].filter(Boolean).map(String);
  const issues = new Set();
  for (const failure of failures) {
    if (/NO_SAFE_COPY/.test(failure)) issues.add('NO_SAFE_COPY');
    else if (/402|credits?\s*(?:depleted|exhausted)|insufficient.*credit|payment.required/i.test(failure)) issues.add('X_CREDITS_UNAVAILABLE');
    else if (/429|rate.?limit/i.test(failure)) issues.add('PROVIDER_RATE_LIMIT');
    else if (/401|403|unauthori[sz]ed|forbidden/i.test(failure)) issues.add('PROVIDER_AUTH_FAILED');
    else issues.add('RUN_FAILED');
  }
  if (body?.metrics?.checked > 0 && body?.metrics?.updated === 0 && !body?.metrics?.skipped) issues.add('METRICS_UNAVAILABLE');
  if (body?.missed?.length) issues.add('MISSED_PREGAME_POSTS');
  return {
    status: issues.size ? 'degraded' : 'ok',
    issues: [...issues].sort(),
    failed_posts: (body?.results ?? []).filter((result) => result?.error).length,
    missed_picks: body?.missed?.length ?? 0,
    posted_picks: (body?.results ?? []).filter((result) => result?.posted).length,
  };
}
