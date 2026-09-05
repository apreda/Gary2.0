# Launch iteration — September 5, 2026

This continues the launch work in HANDOFF_2026-09-05_LAUNCH_EXECUTION.md. All six workstreams remain in scope; no claim that code completion proves adoption or App Store approval. Strategy scorecard: `GaryMarketing/launch-2026-09/EXECUTION_REVIEW_2026-09-05.md`.

## Shipped and verified

Commit `1228452b7bb65ab2280d4200e71d4cc2c1f2f191` is pushed to main. Vercel deployment `dpl_2RyfEinnv8v26tk4E8zVTCBUEJmX` is READY, target production, and owns www.betwithgary.ai. Build duration about 36 seconds. CI run 33968182988 succeeded for backend, edge helpers, web tests/types and fixture smoke. A subsequent small copy/documentation commit removes the universal 90-minute publishing headline and records this follow-up; verify its resulting deployment too.

- The signed-out Book explains manual/private tracking, self-settlement, notes/export and separate automatic tail/fade records. Browser verified on the live site.
- NHL/NCAAB removed from current-picks tabs; historical paths and graded records remain. Retired routes have archive titles and truthful empty-state copy. Browser verified live active tabs.
- Before any current picks publish, /picks offers a clearly historical archive path. The actual public archive → September 4 → Tigers/Guardians permanent analysis was traversed successfully while signed out; full reasoning and its recorded loss were visible. At later post-deploy checking, six current college calls existed, so the empty-board branch was not displayed in that live snapshot.
- /props no longer promises a morning release. /picks no longer promises every sport releases 90 minutes before first pitch.
- Optional Book milestones record opens and successful new manual saves/settlements without bet contents. Background refreshes do not produce opens. The report counts unique sessions and separates mature return to Book from a generic site return. No iOS/manual adoption is inferred from web telemetry.
- Migration `20260905125323_consented_book_milestones.sql` deployed. Read-only verification: service-role execution allowed, anon/authenticated denied, SECURITY INVOKER retained, unique per-browser/session milestone index present. PostgreSQL tests verify duplicates, session changes, private-field rejection and old event compatibility. Production API rejects absent consent with 403 and a synthetic private-field payload with 400; no QA events were inserted.
- Social-auto-post v98 ACTIVE, gateway JWT on; all 11 deployed source files exactly match local. The actual 13-pick September 4 deterministic replay changed 0 excerpts after the first patch, then 12 of 13 after evidence-driven revision. All 13 remain full verbatim sentences within the price/length rules. Argument cues, paragraph context and missing-reference/filler rejection improve selection; these are heuristics, not a semantic guarantee or an engagement-lift claim.
- Private draft generation's credit blocker remains; draft preservation/HTTP503 handling was shipped earlier. A natural scheduled poster response at 13:15 UTC was HTTP 200, health ok, zero failures/misses and zero posts before the queue's publishing windows. At 13:19 UTC: 45 scheduled, 6 stored, 39 future missing, 0 past-start misses. Do not call this all-day coverage proof.

## Validation and limits

Full local verification at 08:53 ET: 1,904 backend, 168 edge, 313 web tests and types passed; isolated fixture smoke passed afterward. Final social/database focused tests: 34 passed; final edge 168 passed. Final copy typecheck passed. CI validates committed source separately from concurrent uncommitted audit work. Vercel error/fatal scan for the exact deployment over 15 minutes returned no entries. No claim about configured drains or long-term error rates. Supabase advisor's only web_events finding was INFO “RLS Enabled No Policy,” expected for this service-only table; no public policy was added. Reference: https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy . Other project advisories predate this scope and are not certified resolved.

Remaining social reliability work includes durable game-identity recovery when X succeeds but post logging fails; v98 changes excerpt selection, not that failure mode. Do not silently claim exactly-once posting.

## Actual learning baseline

At 12:19 UTC the corrected website funnel had 2 consented sessions, 0 useful sessions, 1 browser and 0 mature return observations. Retention is unavailable, not 0%. A functional-data query at 13:08 UTC confirmed 129 retained Book entries placed in 30 days, 0 manual, 0 manually settled and 0 manual-entry accounts. Deleted rows/internal accounts are not separately identified. The personal-tracking use case and import demand remain unproven.

`PERSONAL_TRACKING_PILOT.md` now contains a five-adult usability round, a ten-person seven-day usefulness round, proposed decision gates, an empty anonymous worksheet and unsent recruitment/follow-up messages. Do not invent participants or count synthetic QA as acquisition. Participation is independent of optional analytics. `INTEGRATION_PACKET.md` now records the unmet manual-demand gate.

## Follow-through

A heartbeat named “Gary launch execution review” is ACTIVE in this same task, automation ID `gary-launch-execution-review`, daily 10 AM Eastern for 28 runs starting September 5. It revisits all six workstreams, continues authorized reversible work, uses correct observation windows and notifies only on material changes. It does not create a new unattended campaign publisher. On complete work, pause it early; after the October transition, give the final launch review.

Campaign pieces and new pin remain drafts. No participant, vendor or partner message sent. Instagram mobile 21+ control/link and username-consent issue remain; TikTok handle/eligibility and founder footage remain. App Store Connect login remains unavailable. Native build 2.25/900 is owned by task “Familiarize With Codebase”; that task reported an archive then a rebuild for its last Hub fixes, with upload still pending the latest message. Do not re-archive/upload 899 or certify 900 processing, attachment or privacy inventory from 899 evidence.

## Shared checkout

Latest coordinated update: production deployment `dpl_F7ssg3tEaJdanCpCn4ZA6CytZp7c` is READY and owns the production domains at `f97de41a8af66828b477f51d8abc1e40b8e77ed3`; CI `33972340278` success independently checked. The native task reports build 900's internal-drive archive succeeded, but a final exact-game-ID Hub patch and final archive/upload remain. Do not label 900 uploaded, processed or attached yet.

The native/reliability task also confirmed an obsolete 9 AM cron restart on the host. Crontab maintenance remains blocked by macOS protected access. That task reports Terminal already has Full Disk Access, but Computer Use explicitly denied Terminal control; no Full Disk Access settings were changed. The user was informed by that task. Keep this as an open launch reliability dependency. Do not automate clock-based scheduler restarts, change the production scheduler from this task, or use another interface to bypass the denied control.

Canonical checkout /Users/adam.preda/Desktop/Gary2.0, main. My 29 launch paths were committed explicitly. Other task owns native files, web/lib/gary/archive.ts, web/lib/gary/picks.ts, web/tests/picks-fetch.test.ts and operations work; preserve them. Preserve uncommitted ios/GaryApp/GoogleService-Info.plist. No scheduler restart by this task. The running scheduler is owned by the reliability task.

Local evidence: /tmp/gary-launch-iteration-verify.log, /tmp/gary-launch-iteration-smoke.log, /tmp/gary-launch-final-focused.log, /tmp/gary-launch-final-edge.log, /tmp/gary-launch-final-types.log, /tmp/gary-social-launch-final-source.json. Shareable aggregate evidence lives in the launch evidence directory. The content zip in the shared task workspace includes the updated plan and pilot alongside the existing eight exports; it contains no source credentials.
