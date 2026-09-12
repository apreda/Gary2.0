# September 12 — X audience selection and posting cadence

Adam asked to keep tweeting a substantial selection of MLB/NCAAF picks while
prioritizing timing, audience appeal, eyeballs and followers. This replaces the
summer “every game until football season” setting, which was still allowing
30 pick posts/day and eight per run. Ten picks had already posted today,
including eight college posts within seconds at 10 AM ET.

## Live behavior

Source **890c1c3a** is on `origin/main`. `social-auto-post` **v110** was deployed
September 12 at 15:39 UTC. Existing `social-auto-post-hourly` pg_cron remains
active every 15 minutes; no duplicate automation was created.

- The daily target is roughly 40% of scheduled games, rounded up, with a
  **12-pick ceiling**. Coverage across available sport/day-part combinations
  can raise a small slate's target within that ceiling. It is a target, not
  a promise to fill every slot regardless of research or deadlines.
- September 12 alone has a **16-pick ceiling**: ten inherited posts plus room
  for six later features. September 13 onward automatically returns to 12.
- One root pick post per run, at least **30 minutes** after the previous
  pick post. With the 15-minute cron and request latency, actual gaps may be
  longer. Existing recaps and replies are separate from the pick count.
- The hard pregame window remains **5–120 minutes before scheduled start**.
  Posting hours remain 8 AM–11 PM ET. Cancelled, postponed, suspended,
  finished or in-progress games cannot enter the selected queue.
- Plan from the full daily schedule, including games whose research has not
  arrived. Reserve coverage for each active sport and morning/afternoon/
  evening/late window before allocating extra space by audience priority.
- NCAA audience priors now use full school identities and AP rankings,
  including ranked-vs-ranked matchups. College mascots no longer accidentally
  inherit MLB audience tiers. Existing MLB/NFL priors remain editorial
  judgments, not claimed measurements of TV audiences or betting handle.
- Mature, measured X impressions and profile visits adjust those priorities.
  Use only same-league pick posts aged 24 hours–28 days; require five team
  samples or ten window samples, shrink small samples and bound adjustments.
  Missing metrics are not zero. Older receipts identify only the team named
  in the ticket; new receipts store both teams and the selection explanation.
  These metrics do not establish unique viewers or attributable follows.
- If a preferred game's safe published pick is absent at T-45, another real
  eligible pick in its window can fill the reserved place. No pick or factual
  sentence is fabricated to meet a target.

Selection changes neither Gary's bet nor his original rationale. Existing
verbatim factual-sentence checks, bare-pick copy, prop replies and handoffs
remain. No June prompt, decision rule, Winners selector or research routing
was changed. June era remains `ddea440c3b63`.

## Publication and database safeguards

Migration `20260912153703_social_audience_cadence.sql` adds the nullable
`social_post_log.audience_selection` field and updates the existing
`claim_social_publication` RPC. The existing transaction lock serializes both
the daily cap and interval across simultaneous runs. Confirmed receipts and
uncertain in-flight attempts occupy the interval; expired unsent attempts
release their reservation. Orphaned confirmed receipts still count toward
the cap, and a receipt plus its intent count only once.

Resuming prepared copy rechecks the same RPC before sending. Original payloads
stay frozen and the existing compare-and-set publication states prevent
duplicate sends. Already-tweeted originals stay in schedule identity matching
so older matchup-key receipts cannot appear as unposted provider-ID games.

Ordinary omitted games appear in `skipped_pregame`; they do not trigger a false
missed-post alert. An attempted publication missing its deadline still appears
in `missed` and degrades health. Source failures and uncertain sends remain
visible. Missing audience history uses editorial priors with a source warning;
an unavailable full schedule pauses new selection.

## Verification

- **376 backend test files / 4,113 tests passed**, including eight isolated
  PostgreSQL cadence cases and the real-handler prepared-retry HTTP fixture.
- **235 edge tests passed**. These include full-day mixed-sport simulation,
  later research arrival, spacing/deadlines, transition reservations,
  cancellation, duplicate identity, measured-metric handling and health.
- Deno type-check passed. Deployment succeeded. Both dry-run and normal
  production probes returned HTTP 200, `audience-drip-v1`, health `ok`, no
  source errors and the expected remaining-window plan. At those probes all
  ten published picks had already been tweeted and spacing was active;
  **no new tweet was sent by the probes**.
- The preview's remaining preferred matchups included Padres–Giants,
  Phillies–Braves, Mariners–Athletics, Rice–Notre Dame, Louisiana–USC and
  Ohio State–Texas. These are schedule priorities, not claims that their
  research or tweets had already been published. The plan can adapt to new
  data and unavailable picks.
- RPC access remains service-only, `SECURITY INVOKER`, fixed empty search
  path. Security advisor results were unchanged from the pre-edit baseline:
  52 no-policy informational findings; existing warning counts 19 mutable
  function paths, 2 exposed materialized views, 16 anonymous and 31
  authenticated definer-function execution findings. See the
  [Supabase database linter](https://supabase.com/docs/guides/database/database-linter)
  for those existing categories. No new advisor finding was introduced.
- `supabase db push --linked --dry-run` encountered preexisting remote/local
  migration-history drift. Do not apply its suggested bulk history repair.
  Only this reviewed migration was applied through Supabase MCP, and its
  local version was aligned with the recorded remote version.
- Production truth verified the canonical scheduler, running Winners worker,
  June era, edge deployment timestamps and no unpushed source. Its exit was
  **1** solely for the known private `GoogleService-Info.plist` difference.
  The private file remains untouched and unstaged; this is not a globally
  green repository-parity result.

Logs: `/tmp/gary-social-final-backend-tests.log`,
`/tmp/gary-social-edge-tests.log`, `/tmp/gary-social-final-focused-tests.log`,
`/tmp/gary-social-deno.log`, `/tmp/gary-social-deploy.log`,
`/tmp/gary-social-dry-probe.json`, `/tmp/gary-social-live-probe.json`,
`/tmp/gary-social-production-truth.log`.

Earlier native release and football discussion remain in
`HANDOFF_2026-09-12_FEED_929.md`. This backend deployment does not resolve the
Apple account session needed to upload build 929 or establish phone frame-rate
improvement. Weekly football market-awareness prompt changes remain a recorded
recommendation, not an implementation in this release.
