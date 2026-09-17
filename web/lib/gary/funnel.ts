export type FunnelEvent = {
  id: number;
  event: string;
  identity: string;
  props: Record<string, unknown>;
  created_at: string;
};

/** One consented `/go/app` redirect row (`web_link_clicks`); joined to `app_store_handoff` events by `click_id`. */
export type LinkClickRow = {
  click_id: string;
  surface: string;
  ct: string | null;
  referrer_host: string | null;
  latest_source: string | null;
  latest_medium: string | null;
  latest_campaign: string | null;
  latest_landing: string | null;
  created_at: string;
};

const DAY = 86_400_000;
const rate = (n: number, d: number) => d ? Math.round(10_000 * n / d) / 100 : null;
const token = (value: unknown, fallback = 'unknown') => typeof value === 'string' ? value : fallback;
const sessionKey = (row: FunnelEvent) => `${row.identity}:${row.props.session_id}`;

/** Pure aggregation. Output contains counts and campaign labels, never browser IDs. */
export function weeklyFunnel(rows: FunnelEvent[], weekStart: string, asOf: string, linkClicks: LinkClickRow[] = []) {
  const start = Date.parse(`${weekStart}T00:00:00.000Z`);
  const now = Date.parse(asOf);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(weekStart) || !Number.isFinite(start) || !Number.isFinite(now)
    || new Date(start).toISOString().slice(0, 10) !== weekStart || start > now) throw new Error('Invalid report dates');
  const end = start + 7 * DAY;
  const ordered = rows.filter(r => Number.isFinite(Date.parse(r.created_at)) && Date.parse(r.created_at) <= now)
    .sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at) || a.id - b.id);
  const sessions = new Map<string, FunnelEvent>();
  const first = new Map<string, FunnelEvent>();
  for (const row of ordered) {
    if (row.event !== 'session_started' || typeof row.props.session_id !== 'string') continue;
    const key = sessionKey(row);
    if (!sessions.has(key)) sessions.set(key, row);
    if (!first.has(row.identity)) first.set(row.identity, row);
  }
  const useful = new Set<string>();
  for (const row of ordered) {
    if (row.event !== 'meaningful_pick_view' || row.props.measurement_version !== 'reasoning_v2') continue;
    const key = sessionKey(row);
    const session = sessions.get(key);
    // Separate requests can arrive out of order; the shared session UUID joins them.
    if (session) useful.add(key);
  }
  const inWeek = (row: FunnelEvent) => Date.parse(row.created_at) >= start && Date.parse(row.created_at) < end;
  const weekSessions = [...sessions.values()].filter(inWeek);
  const bookRows = ordered.filter(row =>
    ['book_opened', 'manual_bet_saved', 'manual_bet_settled'].includes(row.event)
    && sessions.has(sessionKey(row)));
  const firstManualSave = new Map<string, FunnelEvent>();
  for (const row of bookRows) {
    if (row.event === 'manual_bet_saved' && !firstManualSave.has(row.identity)) firstManualSave.set(row.identity, row);
  }
  const manualCohort = [...firstManualSave.values()].filter(inWeek);
  const matureManual = manualCohort.filter(row => Date.parse(row.created_at) + 7 * DAY <= now);
  const returnedToBook = matureManual.filter(row => bookRows.some(later => {
    const elapsed = Date.parse(later.created_at) - Date.parse(row.created_at);
    return later.event === 'book_opened' && later.identity === row.identity
      && sessionKey(later) !== sessionKey(row) && elapsed >= DAY && elapsed < 7 * DAY;
  }));
  const bookSessionCount = (event: string) => new Set(bookRows
    .filter(row => row.event === event && inWeek(row)).map(sessionKey)).size;
  const cohort = [...first.values()].filter(inWeek);
  const matured = cohort.filter(row => Date.parse(row.created_at) + 7 * DAY <= now);
  const sessionsByBrowser = new Map<string, FunnelEvent[]>();
  for (const row of sessions.values()) {
    const visits = sessionsByBrowser.get(row.identity) ?? [];
    visits.push(row);
    sessionsByBrowser.set(row.identity, visits);
  }
  const returned = matured.filter(row => sessionsByBrowser.get(row.identity)!.some(later => {
    const elapsed = Date.parse(later.created_at) - Date.parse(row.created_at);
    return later.identity === row.identity && elapsed >= DAY && elapsed < 7 * DAY;
  }));
  const summarize = (items: FunnelEvent[]) => {
    const reads = items.filter(row => useful.has(sessionKey(row))).length;
    return { sessions: items.length, useful_sessions: reads, useful_session_percent: rate(reads, items.length), small_sample: items.length < 20 };
  };
  const channels = new Map<string, FunnelEvent[]>();
  for (const row of weekSessions) {
    const key = JSON.stringify([
      token(row.props.latest_source), token(row.props.latest_medium),
      token(row.props.latest_campaign, '(none)'), token(row.props.latest_content, '(none)'),
    ]);
    const visits = channels.get(key) ?? [];
    visits.push(row);
    channels.set(key, visits);
  }
  const count = (items: Iterable<string>) => { const m = new Map<string, number>(); for (const k of items) m.set(k, (m.get(k) ?? 0) + 1); return m; };
  const weekRows = ordered.filter(inWeek);
  const bySession = (rows: FunnelEvent[]) => new Set(rows.map(sessionKey)).size;
  const firstTouch = new Map<string, FunnelEvent[]>();
  for (const row of weekSessions) {
    const key = JSON.stringify([token(row.props.first_source), token(row.props.first_medium), token(row.props.first_campaign, '(none)'), token(row.props.first_content, '(none)')]);
    firstTouch.set(key, [...(firstTouch.get(key) ?? []), row]);
  }
  const landings = new Map<string, FunnelEvent[]>();
  for (const row of weekSessions) {
    const key = token(row.props.latest_landing, '(unknown)');
    landings.set(key, [...(landings.get(key) ?? []), row]);
  }
  const X_HOSTS = new Set(['t.co', 'x.com', 'twitter.com', 'mobile.twitter.com']);
  const xSessions = weekSessions.filter(row => token(row.props.latest_source) === 'x' || X_HOSTS.has(token(row.props.latest_source)) || X_HOSTS.has(token(row.props.latest_referrer)));
  const returningBrowsers = new Set([...sessions.values()].filter(row => Date.parse(row.created_at) < start).map(row => row.identity));
  const handoffs = weekRows.filter(row => row.event === 'app_store_handoff');
  const clickIds = new Set(linkClicks.filter(c => Date.parse(c.created_at) >= start && Date.parse(c.created_at) < end).map(c => c.click_id));
  const paywallRows = weekRows.filter(row => row.event === 'paywall_viewed');
  const planRows = weekRows.filter(row => row.event === 'plan_selected');
  const byMethod = (event: string) => Object.fromEntries(count(weekRows.filter(r => r.event === event).map(r => token(r.props.method))));
  const shareStarted = weekRows.filter(r => r.event === 'share_started');
  const shareCompleted = weekRows.filter(r => r.event === 'share_completed');
  return {
    week_start_utc: weekStart, week_end_exclusive_utc: new Date(end).toISOString(), as_of: asOf,
    partial_week: now < end,
    definitions: {
      scope: 'Consented website browsers only; IDs can reset and do not identify people or app installs.',
      useful_session: 'At least one pick reasoning block visible for five continuous foreground seconds; reasoning_v2 only.',
      cohort: 'First observed session_started per browser in the selected week; not proof of a first-ever visit.',
      return: 'Another observed session at least 24 hours and less than seven days after cohort entry; only fully observed seven-day windows count.',
      missing: 'Declined consent, blocked requests/storage, other devices and legacy page-load events are outside this funnel. Fewer than 20 observations are flagged.',
      personal_tracking: 'Consented web milestones only, from September 5 instrumentation onward; session counts, not bet counts. Activation is the first observed successful manual save. Return requires a successfully loaded Book in another session, 24 hours to less than seven days later. Automated refreshes do not log opens. No historical activity is backfilled.',
    },
    ...summarize(weekSessions),
    personal_tracking: {
      book_open_sessions: bookSessionCount('book_opened'),
      manual_save_sessions: bookSessionCount('manual_bet_saved'),
      manual_settlement_sessions: bookSessionCount('manual_bet_settled'),
      observed_first_manual_save_browsers: manualCohort.length,
      eligible_for_seven_day_return: matureManual.length,
      awaiting_seven_day_window: manualCohort.length - matureManual.length,
      returned_to_book_within_seven_days: returnedToBook.length,
      seven_day_book_return_percent: rate(returnedToBook.length, matureManual.length),
      small_sample: matureManual.length < 20,
    },
    cohort: {
      observed_new_browsers: cohort.length,
      useful_first_sessions: cohort.filter(row => useful.has(sessionKey(row))).length,
      eligible_for_seven_day_return: matured.length,
      awaiting_seven_day_window: cohort.length - matured.length,
      returned_within_seven_days: returned.length,
      seven_day_return_percent: rate(returned.length, matured.length),
      useful_first_sessions_eligible_for_return: matured.filter(row => useful.has(sessionKey(row))).length,
      useful_first_sessions_returned: returned.filter(row => useful.has(sessionKey(row))).length,
      useful_first_session_return_percent: rate(
        returned.filter(row => useful.has(sessionKey(row))).length,
        matured.filter(row => useful.has(sessionKey(row))).length,
      ),
      small_sample: matured.length < 20,
    },
    channels: [...channels].map(([key, items]) => {
      const [source, medium, campaign, content] = JSON.parse(key) as string[];
      return { source, medium, campaign, content, ...summarize(items) };
    }).sort((a, b) => b.sessions - a.sessions),
    first_touch_channels: [...firstTouch].map(([key, items]) => { const [source, medium, campaign, content] = JSON.parse(key) as string[]; return { source, medium, campaign, content, ...summarize(items) }; }).sort((a, b) => b.sessions - a.sessions),
    landing_pages: [...landings].map(([landing, items]) => ({ landing, ...summarize(items) })).sort((a, b) => b.sessions - a.sessions).slice(0, 20),
    x_channel: { definition: 'latest_source x, or a t.co/x.com/twitter.com source or referrer; the detailed channel rows are not relabelled.', ...summarize(xSessions) },
    returning: { sessions_from_returning_browsers: weekSessions.filter(row => returningBrowsers.has(row.identity)).length, return_visit_events: weekRows.filter(row => row.event === 'return_visit').length },
    app_store: {
      definition: 'handoff_clicks are consented App Store button clicks; redirects_logged are /go/app rows joined by click_id. Installs and purchases are not observable here.',
      handoff_clicks: handoffs.length, handoff_sessions: bySession(handoffs),
      redirects_logged: handoffs.filter(row => typeof row.props.click_id === 'string' && clickIds.has(row.props.click_id)).length,
      by_surface: [...count(handoffs.map(r => token(r.props.surface)))].map(([surface, clicks]) => ({ surface, clicks })).sort((a, b) => b.clicks - a.clicks),
      tracked_links: [...count(linkClicks.filter(c => clickIds.has(c.click_id)).map(c => `${c.surface}|${c.ct ?? '(none)'}`))].map(([k, clicks]) => { const [surface, ct] = k.split('|'); return { surface, ct, clicks }; }),
    },
    paywall: {
      paywall_sessions: bySession(paywallRows), plan_selection_clicks: planRows.length, plan_selection_sessions: bySession(planRows),
      by_plan: [...count(planRows.map(r => JSON.stringify([token(r.props.plan), token(r.props.billing), token(r.props.sport, '(all)')])))].map(([k, clicks]) => { const [plan, billing, sport] = JSON.parse(k) as string[]; return { plan, billing, sport, clicks }; }),
      note: 'A plan click is not a purchase. Paid subscriptions come only from the Stripe-backed user_entitlements table.',
    },
    signups: { signup_started: byMethod('signup_started'), signup_completed: byMethod('signup_completed'), email_signup_completed: Object.fromEntries(count(weekRows.filter(r => r.event === 'email_signup_completed').map(r => token(r.props.cadence)))) },
    shares: { started: shareStarted.length, completed: shareCompleted.length, by_surface: [...count([...shareStarted, ...shareCompleted].map(r => `${token(r.props.surface)}|${token(r.props.method)}|${r.event}`))].map(([k, n]) => { const [surface, method, event] = k.split('|'); return { surface, method, event, count: n }; }) },
  };
}
