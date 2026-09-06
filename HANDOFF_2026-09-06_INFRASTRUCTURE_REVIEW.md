# Infrastructure review — September 6, 2026

The founder requested a full infrastructure review after recurring morning
failures. Continue to read the database capacity, deployment reliability and
morning reliability handoffs for the earlier repairs. This review made the
following additional changes without changing pick prompts or restarting
the production scheduler.

**Dated web pages repaired and deployed.** The earlier `connection()` change
made database reads request-only, but four open-ended page families still
exported an empty `generateStaticParams`. Vercel emitted ISR functions that
failed with `DYNAMIC_SERVER_USAGE`. Removed those exports from archive date,
archive month, sport/date and game-detail pages. Per-fetch caching remains;
the sitemap inventory's explicit forced-static ISR contract remains.
The outage smoke now checks the actual prerender manifest, because local
`next start` alone had missed the deployment adapter conflict. Fixture checks
cover all four families.

Commit `0bffa6bf600d37779f1c2b58b8ebed972248b570` is live as
`dpl_HFqJwzgVYvZX86kvHGwA1tBdqox6`, ready at 13:42:27 UTC. Four previously
failing URLs and ten additional public URLs returned 200; there were no
5xx runtime logs for that deployment from 13:42:27–13:48:35 UTC. Verify CI
run `34036880516` passed. Receipt:
`/tmp/gary-infra-web-live-2026-09-06.json`.

**Legacy account privacy repaired.** Applied migration
`20260906134536_restrict_legacy_user_reads` to production. It removes the
permissive public account-read policy, preserves authenticated owner reads,
and removes unnecessary client write grants. Anonymous REST access is now
denied; the service-role read still succeeds. Eleven isolated PostgreSQL
checks cover anonymous denial, owner isolation, client write denial and
service-role access. A role-switch check through MCP was unavailable because
its database role may not assume `authenticated`; do not describe that check
as a live authenticated-user test. No account records were modified.

**Dependency alerts repaired.** Updated the backend development dependency
`@humanfs/node` to 0.16.8. Upgraded the local video tool to pinned
`puppeteer-core` 25.10.0, removing the vulnerable `extract-zip` dependency
and updating its IP handling dependencies. The renderer uses the current
`headless: true` option. A disposable local fixture rendered a real two-frame
1080×1920 H.264 video through Chrome and ffmpeg. Backend, web and video npm
audits reported zero known vulnerabilities at verification time. This is a
local rendering tool, not a Vercel function; its installed dependencies were
updated on the production Mac. No production clip or existing frame folder
was overwritten.

**Job configurations captured.** All nine installed production LaunchAgent
definitions are now represented under `gary2.0/scripts/launchd`, including
the five definitions previously missing from source control. They match the
installed files and pass plist validation. See that directory's README for
ownership, times and recovery prerequisites. No job was reloaded for this
inventory change.

**Disk pressure reduced.** The Mac had only 1,224,445,952 bytes free. Removed
verified inactive, reproducible Gary Xcode build/index caches, a temporary
web dependency install, and the unused local web `.next` cache. Free space
increased to 4,254,957,568 bytes. Actual free space fluctuates; this remains
limited headroom, not a long-term capacity solution. Preserved deliverable
archives, user files, logs, source checkouts and current credentials. Receipt:
`/tmp/gary-infra-build-cache-cleanup-2026-09-06.json`.

**Checks.** Backend: 2,021 tests in 233 files, including the new privacy
contract. Native edge helpers: 168 tests. Web at commit `0bffa6bf`: 341 tests
in 47 files and Next/TypeScript checks. The removed unit test merely asserted
the obsolete empty static-params export; the build-manifest regression
replaces it. The full-build database-outage/ISR test and expanded
credential-free fixture smoke passed. The renderer smoke passed; its metadata
receipt is `/tmp/gary-infra-video-smoke-2026-09-06.json`.

**Remaining infrastructure risks.** The Mac is the sole scheduled writer
host. GitHub's manual model workflows still reference retired provider
configuration and lack the current subscription bridge; they must not be
presented as tested failover. Time Machine has no destination configured.
Supabase physical backups are completed (including one after today's resize),
but PITR is disabled and no restore drill was performed. The Mac's credentials
and sessions require a separate secure recovery source. Storage objects are
not included in a database backup. A dedicated always-on worker and an
independent health observer require a reviewed hosting/authentication plan;
this session purchased no host and enabled no duplicate scheduled writer.

Additional Supabase hardening findings and their application dependencies
are recorded in the private review. They are distinct from the repaired
account-read vulnerability and the capacity outage; permission changes must
be tested against the corresponding writers before deployment.

The founder's other existing task is independently reviewing game-pick
publication validation and malformed-data handling. Coordinate before
touching that source; this infrastructure review does not claim that work
complete. Preserve its concurrent web data-recovery changes and the real
local `ios/GaryApp/GoogleService-Info.plist` configuration exception.

The detailed private infrastructure review is at
`/Users/adam.preda/Documents/ChatGPT/Gary/INFRASTRUCTURE_REVIEW_2026-09-06.md`.
It includes the remaining recovery, monitoring and cloud configuration work.
The next overnight run has not yet happened and is not verified by current
passing health checks.

## Second review — September 6, 10:19–10:31 ET

The publication repair described in `HANDOFF_2026-09-06_PICK_PUBLICATION.md`
is released at `3173b93c` with passing Verify and a Ready Vercel deployment.
The earlier paragraph describing concurrent uncommitted publication work is
historical. All 14 public page/XML checks passed against that deployment.

The post-resize database sample contains 178 successful cron runs, no new
failures, and 153 retained downstream HTTP responses, all 200 without detected
transport errors or explicit failure flags. There are no blocked sessions or
ungranted locks. At 10:21 ET, available database memory was 471 MiB; the Mac
had 4.9 GiB free disk. The 750 retained failed cron attempts are historical.

Current coverage passes: 18/18 board games, MLB insights for 15 games,
college insights for three, complete cards, and 45/45 yesterday grades and
recaps. Picks remain pending before MLB's first 10:40 ET window. Scheduler
86368 and Winners 11032 run in the canonical checkout; all nine installed
LaunchAgents exactly match their versioned definitions. AC power and sleep
prevention are active. No observation attributes the database incident to
the Mac going offline; the measured capacity defect is documented separately.

A pure reproduction found one additional parser/publication mismatch. A valid
ticket with optional model metadata such as `total: "44.5"` passed decision
validation, then failed the strict writer after the model retry loop ended.
Storage retried the same invalid object. This was a code-path reproduction,
not an observed failure of today's scheduled picks.

The parser now resolves authoritative market precedence first, normalizes
finite numeric strings in the five published market metadata fields, and
returns malformed values to the existing decision retry path. Missing values
remain null; confidence, market selection, prompts and unrelated `totalOdds`
behavior are unchanged. The 61 focused parser/publication tests and all 2,139
backend tests across 234 suites passed with isolated PostgreSQL 17 enabled.
Full backend receipt: `/tmp/gary-second-review-backend-20260906.log`.

No daemon restart is needed for this parser-only change: neither scheduler
nor Winners imports it, and every pick run starts a fresh Node child in the
canonical checkout. Fresh children compute the changed game era themselves;
the scheduler's startup era banner is a historical value. Release/CI and
final production-truth receipts are recorded in the private review.

One non-blocking logging issue remains: scheduler lines 1798, 1817 and 1840
label queued attempts as games (72 attempts for 18 games at four tiers).
There are not 72 distinct games or duplicate schedule owners. No cosmetic
scheduler edit or restart was made for that wording. The next overnight
cycle and the first new ticket remain unobserved at this review snapshot.
