# Hub research dashboard — build 919

> **Latest direction — September 8, Claude takeover:** Adam explicitly said the Apple sign-in, data-rights and staffed-support issues must be fixed before submission. App Review is on hold. Build 919 already uploaded and processed; 920 is unfinished and has missing Swift components. Read `HANDOFF_2026-09-08_CLAUDE_FABLE_5_1.md` at the repository root and the final Git receipt before acting. Older ownership and readiness statements below are historical.


September 8, 2026. Native source: `96e7f905a1604b05694ef8e6458bb8a5d0681267`.
Initial bullpen backend: `59d25429`. These commits are pushed to origin/main.
This supersedes 917's discussion-only header status and retains its observational
research foundation. Do not revive the superseded judgment-first 916 candidate.

## User direction and implementation

Adam requested useful measurements and connections, with comparable copy length,
that help users make their own decisions. Do not fill Hub copy with preferences,
predictions or stat-to-pick rules. His examples are product direction, not facts
or a fixed category checklist. xERA remains prohibited throughout Gary; BDL is
not an exclusive provider requirement, but other sources need a valid use basis.

919 replaces the oversized lead with a compact dated dashboard and two varied
supporting observations. Selection respects game phase, distinct categories and
exact games, including doubleheaders. The original research sections remain.
Cards use explicit Team research / Player research / Game research destinations
bound to the actual opening logic. Large accessibility sizes stack supporting
cards and omit decorative IN FOCUS text that previously squeezed the category.

Player/team research cards share quiet charcoal panels, fine rules and plain
close controls. The bright filled W1 pill is now an inline current-streak label.
These are reviewed implementation choices, not a standing design guide.

## Texas bullpen example and verified source

Live row 30436, team BDL 28, game BDL 5059948, September 8, is:

> Texas Rangers pen: 18 relief IP across 3 games

> 5 of those innings came from Kumar Rocker on Sep 4 (73 pitches). Tyler Alexander
> worked all 3 games (47 pitches); Jacob Latz worked 2 games (40 pitches; 1.85 season
> ERA over 63.1 IP). The pen allowed 10 ER in that 18-IP span (Sep 4–Sep 6). No team
> game on Sep 7.

The three final MLB boxes 822852 / 822850 / 822848 total 54 outs, 264 pitches,
10 earned runs, 10 strikeouts, four walks and eight relievers. September 7's
absence of a team game was checked against the official schedule. Workload is
not an availability determination. Season stats carry their source date.

The actual team card shows three arms, with a working expansion exposing all
eight. Each arm retains workload, appearances, last-used date and available
season ERA/IP with its as-of date. MLBAM IDs are not substituted for BDL player
IDs or linked to the wrong native player. Unknown counts stay unknown; baseball
innings use outs and accept only .0/.1/.2. Optional malformed metadata does not
drop the entire connection/feed. The ledger requires `bullpen-facts-v1`, dated
source provenance and exact team identity. Do not casually change its version.

The bounded publication CLI stores originals first and checks today's ungraded
exact row plus prior detail/version/judgment revision. It does not rewrite
historical results. The ordinary runner shares the current-row guard and skips
ambiguous resumed-game source windows. A later source read must not backfill a
missing day as a proven off day.

## Verification and limitations

- Initial insight scope: 474 tests / 42 suites passed in the final collector
  scope; parent's earlier independent run was 470 / 42. Do not add the counts.
  The final publication guard also passed its 32 focused checks.
- Native broader scope: 35 tests / 14 suites. The first run had 32 passes and
  three fixture extraction failures due to omitted existing Swift dependencies.
  Those fixtures now include GaryMlbMetricPolicy and ExactGameIdentity; the
  affected five tests / three suites passed on rerun. This is 35 covered tests,
  not an additive 40. Actual optimized Swift bullpen contract independently passes.
- Release simulator r3 compiled successfully. Actual app screenshots and AX
  show the compact dashboard, correct team/player navigation, quiet W1, dated
  ledger and eight-arm expansion. Largest-text rendering passed after the
  decorative header fix. Physical scrolling gestures were inconclusive with
  the available automation and must not be represented as verified scrolling.
  A minor singular '1 appearances' accessibility label remains nonblocking.
- Signed device archive and local App Store distribution export passed strict
  deep signature and version/bundle checks. Code/profile contain Apple sign-in,
  production push and no debugging entitlement in the distribution app.
  All 21 privacy manifests match 918. Actual Apple-provider completion on a
  signed phone remains unverified; signature checks do not establish it.

## Frozen artifacts

Evidence base: `/Users/adam.preda/Documents/ChatGPT/Gary/`.
Native manifest: `app-store-submission-2026-09-08/native-919-public-snapshot/manifest.json`.
The 133 tracked public app/project/test files match source commit and disk.
The 29-file difference from 918 is historical `ios/GaryShots` image material,
not compiler input. Private Google configuration and SecretsLocal were excluded
before any read/hash; established compiler-only symlinks supply local builds.
The known dirty private configuration is preserved and must not be staged.

- Archive: `/Volumes/KINGSTON/Gary-2.25-919-Research.xcarchive`.
- Simulator: `/Volumes/KINGSTON/gary-hub-stats-919-dd/Build/Products/Release-iphonesimulator/GaryApp.app`.
- Distribution: `/Volumes/KINGSTON/gary-919-local-export/GaryApp.ipa`.
- Verified distribution app: `/Volumes/KINGSTON/gary-919-distribution-check/Payload/GaryApp.app`.
- Distribution executable SHA-256: `948b520d3c3d030e5c164cf5d5441755a1dee156afda5d95fda328f0c4d8c135`.
- Local IPA SHA-256: `8389f9cb1d390ad1fa56f154f111ef3b8f0291a0e048a0e9a8c5425068819ad5`.
- Evidence: `hub-stats-first-2026-09-08/` and submission folder's `native-919-*.json`.

## Release checkpoint

919 upload succeeded at 21:07:38.621 UTC. Apple processing is Complete; build
UUID `459985e1-b2fb-4b21-b542-719d016c65f6` has the existing internal Beta group
and one tester. What to Test was saved with the Apple-login priority check.
Do not upload 919 again. 918 was already uploaded and processed; never reupload it. The saved
App Store draft is still 2.25 / 915 / Prepare for Submission. User authorization
to submit, request expedition and email Apple persists, but three factual checks
remain: actual signed-phone Apple login, applicable MLB StatsAPI/Savant use basis,
and the human responsible for support/profile reports. Do not attest rights or
operational coverage without evidence. No App Review submission, expedited
request or urgency email has been sent by this task.

The submission owner is task `01a0818d-6d01-7070-a14a-1e611f65da22`.
Root launch task owns the integrated readiness handoff. Avoid competing uploads,
native rebuilds or Apple form changes. Final review notes/screenshots must match
919 before submitting the editable draft. See the submission document for the
prior rejection, prepared draft materials and still-unverified factual scope.

## Subsequent authorized 920 work

Adam subsequently explicitly requested the final Hub layout and build 920 in
`Discuss Hub redesign and product` (`01a08141-a99a-7ba3-9bac-546b214007e3`).
That task now owns native layout, including a single-row masthead, compact focus
plus quick list, independently expanding research modules, peer Fantasy watch
and contextual detail/charts from existing observations. 920 is reserved and
not yet archived. This task remains the sole Apple upload/submission owner and
must wait for the native owner's final commit and verification before freezing
920. Preserve 919 player/team cards and factual backend repairs. The 919 App
Store screenshot assembly stopped because 920 needs matching final materials.
Raw 919 captures remain evidence, not a submitted screenshot set.

## Additional current-copy publication

`0b678ea6` and `49ea372c` add a bounded current-row research restoration and typed
source formatters. 47 specifically reviewed current ungraded MLB rows were
updated and read back, with 47 immutable original backups and no skipped writes.
Forty originals are verbatim; seven starter-record bodies omit only the exact
terminal assertion “He starts tonight.” Ballpark-shift copy was excluded because
one old source string contained invalid 44.7 baseball innings. No broad claim
is made that a computed_detail field is inherently factual.

The deployed `20260908211837_observed_hub_research_cas` is service-only SECURITY
INVOKER with an empty search_path. Current-date, grade and exact identity checks
plus old detail/full-meta equality happen atomically in the database. Clients
for this release accept **detail and meta only**; headline/value/tone/spark stay
unchanged. The SQL function has optional display-field capability, but callers
do not use it because those fields are outside the expected-state comparison.
This is an identity/detail/metadata comparison, not a full-row comparison.
Large metadata travels in a POST body; direct URL predicates were too large.
The live no-op service call returned no rows and anonymous invocation was denied.
Thirty-two isolated PostgreSQL cases passed; 66 copy/helper/policy checks and
40 typed-source checks passed. Counts overlap other suites and are not additive.

Philadelphia row 30496 was separately refreshed from 144 independently tallied
unique completed 2026 regular-season games before September 8: 25–13 in one-run
games, 56–50 in the other 106. Its existing factual headline/value were retained;
only body/meta changed, with an immutable backup and verified readback.

Final first-inning source/window repair and heat/cooling sample-unit repair are
still in progress. Actual Devers rendering exposed the old AB fallback labeled
as PA; do not treat the initial 47-row copy restoration as closing that factual
unit issue. The final evidence/repair receipts must supersede that label.
