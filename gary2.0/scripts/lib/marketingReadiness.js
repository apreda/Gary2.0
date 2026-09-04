import { sameSourceGame, mergeSocialPickSources, hasPostedSourcePick } from '../../supabase/functions/social-auto-post/pickSources.js';
export const sameSlateGame = sameSourceGame;

/** Website's active weekly NFL source, restricted to this ET game date. */
export function mergePublishedSlatePicks(daily, weekly, etDate) {
  return mergeSocialPickSources(daily, { week_start: weekly[0]?.week_start, picks: weekly }, etDate);
}

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
  const publishedSlatePicks = mergePublishedSlatePicks(snapshot.today_picks ?? [], snapshot.current_week_nfl_picks ?? [], snapshot.et_date);
  const currentSlate = { stored_picks: 0, logged_pick_threads: 0, pending_picks: 0, deadline_passed_without_log: 0, missing_or_invalid_start: 0 };
  for (const pick of publishedSlatePicks) {
    currentSlate.stored_picks++;
    const logged = hasPostedSourcePick(pick, snapshot.today_post_logs ?? []);
    if (logged) { currentSlate.logged_pick_threads++; continue; }
    const start = Date.parse(pick.commence_time);
    if (!Number.isFinite(start)) currentSlate.missing_or_invalid_start++;
    else if (start - now < 5 * 60000) currentSlate.deadline_passed_without_log++;
    else currentSlate.pending_picks++;
  }
  if (currentSlate.deadline_passed_without_log || currentSlate.missing_or_invalid_start) {
    issue('PREGAME_COVERAGE_GAP', 'action_required', `${currentSlate.deadline_passed_without_log} stored picks passed the posting deadline without a log; ${currentSlate.missing_or_invalid_start} have no usable start. This does not establish when the source pick became available.`);
  }
  const slateCoverage = { scheduled_games: 0, games_with_stored_pick: 0, scheduled_start_passed_without_pick: 0,
    future_games_without_pick: 0, interrupted_games_without_pick: 0, unknown_start_without_pick: 0, stored_picks_without_matching_slate: 0 };
  if (!Array.isArray(snapshot.today_slate)) {
    issue('SLATE_COVERAGE_UNVERIFIED', 'unverified', 'No daily_slate snapshot; stored-pick posting coverage does not prove full game coverage.');
  } else {
    for (const game of snapshot.today_slate) {
      slateCoverage.scheduled_games++;
      if (publishedSlatePicks.some((pick) => sameSlateGame(game, pick))) { slateCoverage.games_with_stored_pick++; continue; }
      if (['delayed', 'postponed', 'suspended', 'cancelled', 'canceled'].includes(String(game.game_status ?? '').toLowerCase())) {
        slateCoverage.interrupted_games_without_pick++; continue;
      }
      const start = Date.parse(game.commence_time);
      if (!Number.isFinite(start)) slateCoverage.unknown_start_without_pick++;
      else if (start <= now) slateCoverage.scheduled_start_passed_without_pick++;
      else slateCoverage.future_games_without_pick++;
    }
    slateCoverage.stored_picks_without_matching_slate = publishedSlatePicks.filter((pick) => !snapshot.today_slate.some((game) => sameSlateGame(game, pick))).length;
    if (slateCoverage.scheduled_start_passed_without_pick) issue('SLATE_PICK_COVERAGE_GAP', 'action_required', `${slateCoverage.scheduled_start_passed_without_pick} slate games have passed their stored scheduled start without a matching published game pick. Inspect generation and schedule status; this does not prove the games actually started.`);
    if (slateCoverage.unknown_start_without_pick) issue('SLATE_START_UNVERIFIED', 'unverified', `${slateCoverage.unknown_start_without_pick} uncovered slate games have no usable scheduled start.`);
  }
  const { today_picks: _privateWorkingRows, current_week_nfl_picks: _weeklyRows, today_slate: _slateRows, today_post_logs: _postRows, ...evidence } = snapshot;
  const status = issues.some((i) => i.severity === 'action_required') ? 'action_required'
    : issues.length ? 'unverified' : 'ready';
  return {
    status, exit_code: status === 'ready' ? 0 : status === 'action_required' ? 1 : 2,
    issues, current_slate: currentSlate, slate_coverage: slateCoverage, ...evidence,
    measurement_notes: [
      '14 completed Eastern dates; today is excluded from audience comparisons.',
      'Current stored-pick posting coverage is separate from full daily_slate coverage. Game IDs take precedence; fallback matching requires league, both exact normalized teams and exact start, so one doubleheader pick cannot cover both games.',
      'Both publication and posting coverage use the poster\'s shared daily_picks + latest active weekly_nfl_picks merge, restricted to the weekly game\'s ET date and deduplicated by game identity; daily picks take precedence.',
      'Stored schedule times/statuses may lag real events; interrupted games are separate and future games are not declared missed.',
      'Publisher dedup remains conservative by exact ticket text per date, matching its existing unique database index. Readiness requires exact start for logged coverage; identical-ticket doubleheaders and corrected start times can therefore produce an honest unverified coverage gap. Full game-identity logging and cross-run recovery after a tweet succeeds but logging fails remain separate work.',
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
  lines.push(`Stored pick posting: ${report.current_slate.logged_pick_threads}/${report.current_slate.stored_picks} logged; ${report.current_slate.pending_picks} pending; ${report.current_slate.deadline_passed_without_log} past deadline without a log; ${report.current_slate.missing_or_invalid_start} missing start`);
  const slate = report.slate_coverage;
  lines.push(`Daily slate: ${slate.games_with_stored_pick}/${slate.scheduled_games} games have a stored pick; uncovered: ${slate.scheduled_start_passed_without_pick} scheduled starts passed, ${slate.future_games_without_pick} future, ${slate.interrupted_games_without_pick} interrupted, ${slate.unknown_start_without_pick} unknown start; ${slate.stored_picks_without_matching_slate} stored picks have no matching slate game`);
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
