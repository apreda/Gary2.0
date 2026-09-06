# Deployment failures and obsolete alerts — September 6, 2026

The founder asked to fix recurring Gary failures and clean up old failure
messages. The screenshot was Vercel's failed production attempt for b35c98b8
at 06:22 ET. Vercel confirms that the same source recovered at 06:25:56 ET in
`dpl_Fits9hU4d3raMvoL4xqRZLsspaar`, with both public domains assigned. This
was a recovered build attempt, not evidence that the current deployment failed.

## Failure and repair

That build tried to prerender `/archive/inventory.xml` while the database was
recovering and received `PostgREST 500: archive_day_index`. A full isolated
build with every database request returning 503 also exposed the archive,
RSS feed and Results as deployment-time database dependencies.

Shared public REST reads now await Next's `connection()` before fetching.
They render at request time while retaining their explicit fetch-cache
intervals and last-good data. Results lets the original error propagate;
Today rethrows framework control signals before reporting actual feed errors.
Static pages without live data remain static. This shifts data-backed page
rendering to the server per request; cached queries still avoid repeated
database reads. Do not describe these pages as whole-page ISR anymore.

The archive sitemap, sitemap index and game shards retain whole-response ISR
through `/sitemap-data/[inventory]`, an ordinary dynamic route with an empty
`generateStaticParams()` list. Public URLs remain unchanged through rewrites.
They generate on the first request and revalidate every ten minutes. Failed
regeneration throws, preserving last-good XML; a cold failure remains an error
instead of a false successful empty inventory. The index still expands at
40,000 URLs per game shard.

## Verification before publication

- 342 web unit tests across 47 files and Next/TypeScript passed.
- Full credential-free fixture smoke passed Home, Picks, Results, Leaderboard,
  permanent matchup/archive links, RSS, all sitemap URLs and results export.
- `npm run smoke:sitemaps` builds a disposable full app with all database
  requests returning 503, then exercises cold errors, successful first reads,
  failed ISR refreshes retaining XML, cached archive-page data, and new dates
  appearing after recovery. It passed and now runs in GitHub Verify.
- That integration test shortens cache intervals only in its temporary copy
  and uses Next's font mock hook, keeping it independent of Google Fonts.
- Local Vercel production build with Next 16.3.2/Turbopack passed. Its output
  contains a Node 22 sitemap function and an on-demand prerender configuration
  with a null fallback, rather than a frozen static XML asset.

## Alert cleanup

Archived and marked read **76** obsolete Gary Vercel/GitHub failure messages
in apreda31@gmail.com, retaining them in All Mail. Two were recovered Vercel
attempts; the remaining messages were older successful/replaced workflows or
retired schedules. Hub Insights, Daily Results and Football Results all have
later successful GitHub runs. NBA/NHL/NCAAB/DFS cloud lanes are disabled or
retired. Manual backstops remain manual. The final matching Inbox search
returned zero messages. No mail was sent and no alert subscription was muted.

## Still open: database infrastructure incident

The 08:27 ET morning-health check was OK: today's board covered 18/18 games,
MLB had 90 insights across 15 games, NCAAF had 23 across three, all game cards
were present, and all 45 yesterday results had recaps. Picks were correctly
pending before their publication windows. Earlier runtime repairs are in
`HANDOFF_2026-09-06_MORNING_RELIABILITY.md`.

The repeated underlying Supabase stall is not diagnosed or permanently
resolved. Historical infrastructure metrics require dashboard sign-in; the
open Supabase tab still showed the sign-in form during this turn. Do not infer
a root cause from the current healthy state or suppress a future real outage.
The prepared support note has not been sent.

The real local Firebase plist remains intentionally uncommitted. Production
deployment and exact-commit CI receipts will be appended after publication.
