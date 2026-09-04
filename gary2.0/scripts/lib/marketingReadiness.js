/** Evaluate already-stored evidence; never contacts X or posts anything. */
export function evaluateMarketingReadiness(snapshot) {
  const issues = [];
  const now = Date.parse(snapshot.checked_at);
  if (!Number.isFinite(now) || !/^\d{4}-\d{2}-\d{2}$/.test(snapshot.et_date ?? '')) {
    throw new Error('Snapshot has no valid observation clock');
  }
  const ageMinutes = (stamp) => (now - Date.parse(stamp)) / 60000;
  const issue = (code, severity, detail) => issues.push({ code, severity, detail });
  const poster = snapshot.jobs.find((j) => j.jobname === 'social-auto-post-hourly');
  if (!poster) issue('POSTER_CRON_MISSING', 'action_required', 'The expected posting cron is absent.');
  else if (!poster.active) issue('POSTER_CRON_INACTIVE', 'action_required', 'The posting cron is inactive.');
  else if (!Number.isFinite(ageMinutes(poster.last_started_at)) || ageMinutes(poster.last_started_at) > 40) {
    issue('POSTER_CRON_STALE', 'action_required', 'No posting cron start within 40 minutes.');
  } else if (poster.last_sql_status !== 'succeeded' && poster.last_sql_status !== 'running') {
    issue('POSTER_CRON_FAILED', 'action_required', 'The most recent cron SQL invocation failed.');
  }
  const response = snapshot.latest_poster_response;
  if (!response) issue('POSTER_RESPONSE_UNVERIFIED', 'unverified', 'No labeled scheduled response in pg_net retention; enqueue success alone cannot verify X.');
  else if (!Number.isFinite(ageMinutes(response.created)) || ageMinutes(response.created) > 40) {
    issue('POSTER_RESPONSE_STALE', 'action_required', 'No completed poster response within 40 minutes; inspect function and pg_net history.');
  } else if (!response.health || !['ok', 'degraded'].includes(response.health.status)) {
    issue('POSTER_HEALTH_UNVERIFIED', 'unverified', 'The latest response has no recognized health summary.');
  } else if (response.status_code >= 400 || response.health.status !== 'ok') {
    issue('POSTER_DEGRADED', 'action_required', `Latest poster issues: ${(response.health.issues ?? []).join(', ') || 'HTTP failure'}.`);
  }
  const engagementJob = snapshot.jobs.find((j) => j.jobname === 'engagement-sheet-daily');
  if (engagementJob?.active) {
    const lastDay = snapshot.engagement.latest_sheet_date;
    const daysOld = (Date.parse(snapshot.et_date) - Date.parse(lastDay)) / 86400000;
    if (!Number.isFinite(daysOld) || daysOld > 2) {
      issue('ENGAGEMENT_DRAFTS_STALE', 'action_required', `Daily engagement cron is active; latest draft day is ${lastDay ?? 'missing'}.`);
    }
  }
  const currentSlate = { stored_picks: 0, logged_pick_threads: 0, pending_picks: 0, deadline_passed_without_log: 0, missing_or_invalid_start: 0 };
  for (const pick of snapshot.today_picks ?? []) {
    currentSlate.stored_picks++;
    if (pick.logged) { currentSlate.logged_pick_threads++; continue; }
    const start = Date.parse(pick.commence_time);
    if (!Number.isFinite(start)) currentSlate.missing_or_invalid_start++;
    else if (start - now < 5 * 60000) currentSlate.deadline_passed_without_log++;
    else currentSlate.pending_picks++;
  }
  if (currentSlate.deadline_passed_without_log || currentSlate.missing_or_invalid_start) {
    issue('PREGAME_COVERAGE_GAP', 'action_required', `${currentSlate.deadline_passed_without_log} stored picks passed the posting deadline without a log; ${currentSlate.missing_or_invalid_start} have no usable start. This does not establish when the source pick became available.`);
  }
  const { today_picks: _privateWorkingRows, ...evidence } = snapshot;
  const status = issues.some((i) => i.severity === 'action_required') ? 'action_required'
    : issues.length ? 'unverified' : 'ready';
  return {
    status, exit_code: status === 'ready' ? 0 : status === 'action_required' ? 1 : 2,
    issues, current_slate: currentSlate, ...evidence,
    measurement_notes: [
      '14 completed Eastern dates; today is excluded from audience comparisons.',
      'Mature observed = published at least 6 days ago with a metric snapshot at least 5 days after publication; all other rows are separate.',
      'Every metric reports its non-null denominator. Null is unavailable, never zero.',
      'Impressions and clicks sum thread components, not unique people; reply totals include own replies and are not an audience conversation count.',
      'Legacy verdict metrics also include the quoted original pick via cta_tweet_id; their totals overlap the original pick and must not be added as incremental reach.',
      'Legacy and new redirect tables are reported separately and never summed: overlap, bots, and repeat visitors are unresolved. Obvious test/audit/smoke/qa campaign labels are excluded, not all test traffic.',
      'pg_net retains a limited recent response history. A successful cron enqueue is not proof of a successful X post.',
      'No X balance, installation, revenue, or retention claim is inferred from this readout. No external APIs are refreshed.',
    ],
  };
}

export function formatMarketingReadiness(report) {
  const lines = [`MARKETING READINESS — ${report.et_date} ET`, `Status: ${report.status} (exit ${report.exit_code})`,
    `Observed: ${report.checked_at}`, `Audience window: ${report.window.start_inclusive} through ${report.window.end_exclusive} exclusive, Eastern dates`];
  for (const item of report.issues) lines.push(`${item.severity.toUpperCase()} ${item.code}: ${item.detail}`);
  lines.push(`Current slate: ${report.current_slate.logged_pick_threads}/${report.current_slate.stored_picks} logged; ${report.current_slate.pending_picks} pending; ${report.current_slate.deadline_passed_without_log} past deadline without a log; ${report.current_slate.missing_or_invalid_start} missing start`);
  lines.push('Stored audience cohorts (sum of thread metrics):');
  for (const row of report.cohorts) {
    const metric = (key, denominator) => `${row[key] ?? 'unavailable'} (${row[denominator]}/${row.posts} measured)`;
    lines.push(`  ${row.cohort} / ${row.thread_format}: ${row.posts} posts; impressions ${metric('impressions', 'measured_impressions')}; mean ${row.mean_impressions ?? 'n/a'}, median ${row.median_impressions ?? 'n/a'}`,
      `    likes ${metric('likes', 'measured_likes')}; replies ${metric('replies', 'measured_replies')}; reposts ${metric('reposts', 'measured_reposts')}`,
      `    profile clicks ${metric('profile_clicks', 'measured_profile_clicks')}; bookmarks ${metric('bookmarks', 'measured_bookmarks')}; link clicks ${metric('link_clicks', 'measured_link_clicks')}`,
      `    ${row.threads_with_own_reply} threads include own replies; observation age ${row.min_observation_days ?? 'n/a'}–${row.max_observation_days ?? 'n/a'} days`);
  }
  lines.push(`Cadence: ${report.daily.map((row) => `${row.date}=${row.pick_threads}`).join(', ')} pick threads`,
    `Engagement: ${report.engagement.draft_rows} stored drafts; latest ${report.engagement.latest_sheet_date ?? 'none'}; queue ${JSON.stringify(report.reply_queue)}`,
    `Redirects, kept separate: ${JSON.stringify(report.redirects_separate_sources)}`,
    `Legacy waitlist: ${report.waitlist_rows}; email subscriptions by status: ${JSON.stringify(report.email_subscriptions)}`,
    `Poster responses retained: ${report.retained_poster_responses}; degraded: ${report.retained_degraded_responses}`,
    ...report.measurement_notes.map((note) => `Note: ${note}`));
  return lines.join('\n');
}
