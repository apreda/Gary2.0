#!/usr/bin/env node
// Read-only: GETs consented web events and prints aggregate counts, never raw IDs.
// Supply existing deployment credentials via the environment; no secrets are logged.
import { weeklyFunnel } from '../lib/gary/funnel.ts';

const args = process.argv.slice(2);
if (args.includes('--help')) {
  console.log('Usage: npm run report:funnel -- [--week YYYY-MM-DD]\nDefaults to the previous complete Monday–Sunday UTC week. Requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY. Reads all session history through the report horizon; prints aggregates only.');
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
      event: 'in.(session_started,meaningful_pick_view,book_opened,manual_bet_saved,manual_bet_settled)',
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
  console.log(JSON.stringify(weeklyFunnel(rows, week, now.toISOString()), null, 2));
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Funnel report failed.');
  process.exitCode = 1;
}
