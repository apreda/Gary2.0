# September 12 follow-through and remaining gates

Later native/readability follow-up: see `HANDOFF_2026-09-12_FEED_929.md`.
Signed build 929 supersedes the ready 928 archive below; Apple upload is still
blocked by Xcode's account session. Earlier backend/Winners decisions remain.

Updated after Adam’s subscription-first and required-window-coverage follow-up.
This receipt supersedes pending decisions in the earlier September 12 handoffs.
Adam authorized the work, asked Codex to own Winners selection, reaffirmed June
unchanged, and approved the NCAAF rank placement with consistent card dimensions.

## The eleven work areas

| Work | Verified outcome / remaining gate |
| --- | --- |
| 1. NCAAF cards | Picked-team rank is beside its headline; opponent rank stays in the usual opponent line. Significance is in the footer beside the chevron. Existing frame and padding are preserved. Simulator checks covered a ranked opponent and `#6 OREGON` as the pick. Included in signed archive 928. |
| 2. MLB research and restart | **Sonnet 5 subscription → Codex GPT-5.6 Luna subscription → paid Haiku 4.5 research**. Adam explicitly authorized paid research after included capacity. Full successful messages and pending tool results survive provider switches. The shared NFL/NBA researcher uses the same order. Claude subscription usage credits stay off so Sonnet cannot spend before the Luna attempt; the separate API account is funded and has its existing auto-reload enabled (details below). The MLB scheduler hold was removed and the plist reloaded. Metered search is explicitly capped at zero. The game brain remains Sol. |
| 3. Apple submission | **2.25 build 928** archived and passed strict signature verification. Upload failed with `exportArchive Failed to Use Accounts`, exit 70. App Store Connect is still signed out. **928 is not confirmed uploaded or in TestFlight.** Adam must restore the Apple sessions. |
| 4. Winners admission | `daily-curation-v2` and its migration are live; the independent worker was restarted on the new code. Original evidence is compared across the actual daily start windows. Details below. |
| 5. June / xERA | Original commit `c27db5f0` contains xERA references. They remain. June prompt/checklist/desk pin tests pass unchanged. The Reds-fan line and bullpen object/string quirk remain as requested. |
| 6. Dependency alerts | Web Next 16.3.5, Vitest 4.1.11 and sharp 0.35.4 are deployed. js-yaml is 4.3.2 in both packages. GitHub reports **zero open Dependabot alerts**. Backend npm audit also reports zero vulnerabilities. |
| 7. Uncertain X receipt | Found the exact already-posted September 10 prop reply; recorded its ID and completed the interrupted publication idempotently. No new post or reply was sent. The subsequent normal poster cycle cleared the degraded warning. Marketing readiness is **ready**, with zero unresolved or uncertain sends. |
| 8. NFL articles | Implemented subscription URL discovery, public publisher fetches, dated Readability extraction, disk storage and complete-text rendering. One article per topic, with deduplication and explicit missing coverage. A live Rams/49ers retrieval obtained two dated bodies (7,426 and 14,689 characters); four topics lacked qualifying coverage. Discovery prose is never substituted for publisher text. |
| 9. Auth / Xcode Cloud | Supabase email OTP expiry is **30 minutes** and leaked-password protection is enabled; the Auth advisor warnings cleared. Xcode Cloud stays deferred under Adam's instruction: local signed archiving works, so Cloud is not the upload blocker. |
| 10. Launch follow-through | Product Hunt is saved for **September 20, 2026, 12:01 AM PDT / 3:01 AM EDT**. Campaign announcements are held until then; the existing launch automation and packet use the new dates. Normal pick publishing continues. Live Home, Book entry and signup destinations were checked. Fresh consented-web funnel evidence is below. |
| 11. September cleanup | Importers were traced. Shared routers, props/shadow work, historical Winners evidence and the generic orchestrator still consume these modules. Deletion remains deferred until the 300-pick observation period and consumer-by-consumer removal. No frozen June edits were made. |

## Winners policy

- Plan each sport independently from its actual `daily_slate`. Starts less than
  two hours from a window's first game share a window; NFL 4:05/4:25 stays together.
  If there are more than five windows, merge the closest adjacent windows.
- Normal target: `min(5, max(window count, ceil(slate count × 0.25)))`. Reserve
  one place per window; allocate extra normal places to larger batches.
- Fill normal places with the strongest available relative reads. Grades describe
  the evidence; **toss-up**, **unsupported**, or a delayed review cannot veto
  scheduled coverage. No Gary confidence score or automatic underdog rule is used.
- A separate 15-second clock operates independently of model reads and evidence
  recovery. A lone scheduled game enters as soon as its valid ticket is published.
  Other windows fill their normal quota by T−60 minutes if tickets are available.
  Use a completed independent comparison first; without one, use availability of
  original evidence and stable publication order. Record that as schedule coverage,
  never as a fabricated strong-read assessment. Later windows retain reservations.
- PASS, missing/invalid odds, missing identity/start, mismatched slate time, canceled,
  postponed, started and duplicate-game tickets cannot enter. An unrelated slate row
  with a missing start no longer blocks valid games. No admission can manufacture a
  ticket that Gary has not published. Late publication fills on the next clock tick.
- A sixth is allowed only in the final window, when the normal target is five,
  no later reservation remains, and **all six** judgments are clear. Six is the
  hard limit per sport for game picks. For the September 12 transition, up to six
  can preserve later coverage alongside immutable legacy admissions; this exception
  does not pretend those six were all judged clear. Props retain their separate policy.
- Read complete original sources, tool outputs, rationale and both cases.
  Large windows use bounded whole-record batches, followed by comparison of
  validated findings with the full original rationales and cases. The final
  comparison cannot change a batch's grade, quotes, reason or opposing case.
  Every original byte remains in the immutable database snapshot.
- The independent reader uses Sol on the Codex subscription. Supporting quotes
  are checked against original source and rationale text. CLI tool use invalidates
  the comparison; an ordinary CLI diagnostic is not a tool read.
- Claims open at T−90. Allow an incomplete early batch to arrive until T−65,
  then compare the existing decisions while reserving later places. Changed
  evidence/slates, kickoff, stale leases and concurrent attempts cannot silently
  publish stale or duplicate tickets. Completed comparisons are not repeatedly
  resampled until a desired grade appears. The independent publication clock can
  fill an ordinary place without a completed comparison.

At verification, MLB had 15 games → target 4 across four windows. NCAAF had
45 games → normal target 5 across four windows. Three noon tickets were already
published by the legacy rule, so today's explicit transition target is **6**:
those three plus at least one in each later window. All original tickets stay
immutable. New days normally stay at five, with the six-clear exception above.

The live read-only rehearsal covered nine original NCAAF decisions, completed
two full reading batches and a final comparison in 198 seconds, and selected
one clear ticket for a simulated early-window capacity. It did not publish or
replace an existing admission. This is an evidence-quality policy, not a
calibrated win probability or a guarantee; its outcomes need their own record.
A later read-only check processed the complete first live June MLB decision
(51,274-byte reading packet) in 38.7 seconds. It assessed the original ticket as
`toss_up` and correctly retained it for simulated schedule coverage. No rehearsal
wrote a pick or admission; the production worker follows the actual clock.

## June and subscription verification

June's literal research model previously fell through the vendor-replacement
shim to metered Haiku. The June-specific wrapper now intercepts it first.
June's prompts, factors, high research effort and tool loop remain unchanged.
The brain is untouched. Cancellation terminates owned Claude child processes.

A live transport canary completed Sonnet tool-call turns, switched to Luna,
and recovered an exact source marker and final sentence from the preserved
history. Tests cover initial exhaustion, mid-research failover, both providers
unavailable, the final paid rung, cancellation and brain routing. Native API
retry tests verify exact replay of the complete seed and tool-result IDs after
a failed request; pending CLI results are text on the first API turn because
CLI calls have no Anthropic tool-use IDs. They verify transport behavior,
not equal pick quality between models.

A full Rockies/Tigers rehearsal used `--test --store false`. It stopped because
neither confirmed batting lineup was available and produced/stored no pick.
The scheduler is now enabled to use June's normal readiness gates and retries.

The restored cohort now has **11 of 300 required MLB picks** at this checkpoint:
four stamped `80c55f8305ca`, six stamped `dc4bc0060d88`, and today’s first pick
stamped `ddea440c3b63`, alongside four older-system September 11 picks. Today's permitted model/plumbing changes produce full surface
stamp `ddea440c3b63`; unchanged prompt pins remain the freeze guard. Do not reset
the observation count merely because permitted plumbing changes the stamp.

The separate Anthropic API billing page was verified on September 12: **$14.80**
remaining; existing auto-reload triggers at **$5** and restores the balance to
**$15**. No credit purchase or billing setting change was made in this follow-up.
Claude subscription usage credits remain off; do not confuse that switch with
API auto-reload. The CLI strips `ANTHROPIC_API_KEY` before launching. Paid API
research is reached only after Sonnet and Luna fail; game/prop brain paid routes
remain unchanged. A running MLB child was allowed to finish on its original
loaded subscription configuration; fresh children load the new fallback order.

## Release and operational evidence

Ready archive: `/Volumes/KINGSTON/Gary-2.25-928-September20.xcarchive`.
Metadata: `ai.betwithgary.app`, 2.25/928. Upload options:
`/Volumes/KINGSTON/gary-924-upload-options.plist`.
After Apple sign-in, inspect the live build/review state before retrying or
changing the submission. Last-confirmed TestFlight was 926; 927 was an earlier
ready local archive. The existing review's last recorded state was build 920
waiting since September 8. Apple case 102957999956 had an acknowledgement,
not a confirmed expedition. Do not claim current progress from historical state.

Web production remains security-patch deployment
`dpl_GFHJRoGiAfbDPLKDBTNDtLKyuK9H`, commit `4a027b2b`. Later backend/native commits
changed no web files; Vercel's configured ignore command skipped their web builds.

X receipt: intent `682e12bd-0b44-4ae5-a8ca-b04d50751f53`, root
`2098165897915486488`, existing reply `2098165899911917886`; state completed.

The August 31–September 6 UTC funnel week has 8 consented website sessions and
1 useful session. Three browsers were first observed; one had a complete
seven-day observation window and returned, while two were immature. No Book
open/save/settlement sessions were observed. These tiny consent-limited samples
do not establish demand, retention or total traffic. No customer IDs were exported.

Scheduler and Winners run from `/Users/adam.preda/Gary2.0/gary2.0`. At the audit,
one of 15 MLB games had published and none had started without a pick. No open profile
support reports were found. The edge timestamp audit now excludes `.test.*`
files, avoiding a false redeploy demand from the slip-scanner test-runner change.
Runtime/shared source changes remain checked; timestamps still do not prove
deployed source-byte equality. The private `ios/GaryApp/GoogleService-Info.plist`
remains untouched and uncommitted, the documented working-tree exception.

The three new migration versions (`20260912133639`, `20260912133808`,
`20260912143745`) match the remote ledger. The repository also has substantial pre-existing historical
local/remote migration-name mismatches, including older short date prefixes.
Those were not relabeled or marked applied without a separate content audit.
Do not infer that a blanket `db push` is safe from today's matching entries.

The importer audit found `mlbJudgment*` still used by Winners evidence/history;
`mlbCaseMenu` by shared data fetchers and the generic orchestrator; `penArms`,
`bullpenLedger`, `mlbSeasonContext` and `mlbSeriesState` by shared stat routers
and shadow work; and the remaining September desk helpers by the September
MLB report still reachable through the generic report builder. Do not bulk-delete.

## Validation and commits

- Backend follow-up: the full **375-file / 4,103-test** run passed 4,102 tests;
  its only failure asserted the superseded paid-first billing order. That assertion
  was updated and the affected billing/worker/database suites passed **85 tests**.
  The final matching migration filename and API retry suites passed **39 tests**.
  June’s unchanged pins are included. Earlier audit-only changes passed 18 tests.
- Native Node edge helpers: **221 tests passed**. Existing slip-scanner tests
  were converted from Deno imports to the shared Node runner; runtime unchanged.
- Web: **77 files / 886 tests passed**, typecheck/build passed, lint passed with
  two pre-existing warnings, credential-free fixture smoke passed.
- Winners isolated PostgreSQL: **38 tests passed**, covering all eight supported
  league codes, a 15-game/four-window day, model outages, missing evidence, lone
  games, invalid tickets, early reservations, historical transition to six,
  concurrent fills, permissions and immutable admissions. All five curation RPCs
  are invoker functions with fixed search paths and service-only execution.
  The security advisor reports no new warnings for these functions; private
  evidence tables intentionally retain no client RLS policies. Existing unrelated
  advisor warnings remain outside this change.
- Native: simulator build/visual checks, Release archive and signature passed;
  upload explicitly failed on account access.

Implementation: `015879f0` research; `57559f59` NFL articles; `8eab804e`
NCAAF/build 928; `aac1f639` edge tests; `b3d23dbc` Winners. Earlier postponement:
`6796f7b5`; web security: `4a027b2b`. Explicit pathspec commits, pushed to main.

## Remaining gates

1. Adam's Apple sign-in, then upload/processing/TestFlight and live review-state
   verification. September 20 is the campaign target, not a promised approval date.
2. Complete June's 300-pick observation period before considering prompt changes
   or removing still-consumed September modules. Preserve the two June quirks.
3. Xcode Cloud remains optional while the local release route is viable.

Do not reopen the authorized Winners, rank-placement or xERA decisions.
