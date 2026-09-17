#!/usr/bin/env node
// Read-only: GETs consented web events and prints aggregate counts, never raw IDs.
// Supply existing deployment credentials via the environment; no secrets are logged.
import { weeklyFunnel } from '../lib/gary/funnel.ts';
import { WEB_EVENTS } from '../lib/gary/analytics-schema.ts';

const args = process.argv.slice(2);
if (args.includes('--help')) {
  console.log('Usage: npm run report:funnel -- [--week YYYY-MM-DD]\nDefaults to the previous complete Monday–Sunday UTC week. Requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY. Reads every consented web event through the report horizon plus the week\'s /go/app redirect rows (web_link_clicks); prints aggregates only: sessions, useful sessions, first/latest-touch channels, landing pages, X roll-up, returning browsers, App Store handoffs, paywall views, plan selections, signups, shares and personal tracking.');
  process.exit(0);
}
try {
  if (args.length && (args.length !== 2 || args[0] !== '--week')) throw new Error('Use --help for report arguments.');
  const now = new Date();
  const monday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7) - 7);
  const week = args[1] ?? monday.toISOString().slice(0, 10);
  weeklyFunnel([], week, now.toISOString()); // validate before any request
  const origin = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!origin || !key) throw new Error('Missing report credentials: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
  const horizon = new Date(Math.min(now.getTime(), Date.parse(`${week}T00:00:00Z`) + 14 * 86400000)).toISOString();
  const rows = [];
  let lastId = 0;
  for (;;) {
    const url = new URL('/rest/v1/web_events', origin);
    url.search = new URLSearchParams({
      select: 'id,event,identity,props,created_at',
      event: `in.(${WEB_EVENTS.join(',')})`,
      created_at: `lte.${horizon}`, id: `gt.${lastId}`, order: 'id.asc', limit: '1000',
    }).toString();
    const response = await fetch(url, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
    if (!response.ok) throw new Error(`Read-only analytics request failed (${response.status}); no report generated.`);
    const page = await response.json();
    if (!Array.isArray(page)) throw new Error('Invalid analytics response; no report generated.');
    if (page.length === 0) break;
    rows.push(...page);
    const nextId = Number(page.at(-1).id);
    if (!Number.isSafeInteger(nextId) || nextId <= lastId) throw new Error('Pagination did not advance; no partial report generated.');
    lastId = nextId;
    if (rows.length > 250_000) throw new Error('Report exceeds 250,000 events; use a database aggregation before reporting totals.');
  }
  // Consented /go/app redirect rows for the report week, joined to app_store_handoff events by click_id.
  const clicks = [];
  let lastClickId = 0;
  for (;;) {
    const url = new URL('/rest/v1/web_link_clicks', origin);
    const params = new URLSearchParams({
      select: 'id,click_id,surface,ct,referrer_host,latest_source,latest_medium,latest_campaign,latest_landing,created_at',
      id: `gt.${lastClickId}`, order: 'id.asc', limit: '1000',
    });
    params.append('created_at', `gte.${week}T00:00:00Z`);
    params.append('created_at', `lte.${horizon}`);
    url.search = params.toString();
    const response = await fetch(url, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
    if (!response.ok) throw new Error(`Read-only link-click request failed (${response.status}); no report generated.`);
    const page = await response.json();
    if (!Array.isArray(page)) throw new Error('Invalid link-click response; no report generated.');
    if (page.length === 0) break;
    const nextId = Number(page.at(-1).id);
    if (!Number.isSafeInteger(nextId) || nextId <= lastClickId) throw new Error('Link-click pagination did not advance; no partial report generated.');
    lastClickId = nextId;
    for (const click of page) { delete click.id; clicks.push(click); } // id is only for pagination; the aggregator never sees it
    if (clicks.length > 250_000) throw new Error('Report exceeds 250,000 link clicks; use a database aggregation before reporting totals.');
  }
  console.log(JSON.stringify(weeklyFunnel(rows, week, now.toISOString(), clicks), null, 2));
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Funnel report failed.');
  process.exitCode = 1;
}
