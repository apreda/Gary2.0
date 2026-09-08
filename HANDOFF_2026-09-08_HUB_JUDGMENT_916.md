# Hub 916: connected research and reading experience

Implemented directly on canonical `main` at `/Users/adam.preda/Gary2.0`.
This is the next feature-approval candidate, version **2.25 (916)**.
Build 915 remains a separate, immutable release. **Do not upload or select 916
for App Store submission until Adam approves this feature.**

Engineering implementation and final build verification are complete. The
candidate is ready for Adam's final feature review, with the physical gesture
and accessibility checks below explicitly reserved for that review.

Review packet:
`/Users/adam.preda/Documents/ChatGPT/Gary/hub-judgment-2026-09-08/REVIEW.md`.

## What changed

The Hub now presents Gary's judgment, a short explanation, and an optional
full case for today's exact matchup. The case includes the reasoning,
counterargument, material conditions, what could change Gary's view, and cited
observations with their original measurement windows. A useful judgment can
advise restraint; it does not require a betting recommendation.

Gary orders the complete current set for usefulness and timing. This optional
editorial pass changes only order, preserves every approved argument, and
reuses its result while the evidence and argument set remain unchanged. Invalid
or unavailable ordering falls back to exact kickoff and stable source order.
The native app rejects inconsistent ranks across the visible current set.

The existing readable fonts remain. The page uses Gary's shared dark backdrop,
a compact routine lead, supporting rows and grouped matchup research. Full
featured arguments are not repeated in the lower groups. MLB **Fantasy watch**
is integrated into the Hub with scoring choices and complete cases; saved MLB
Fantasy selections and old links migrate into that section. NFL keeps its
separate weekly Fantasy desk. Reference material remains available. No new
Hub performance ledger was added.

Full cases retain exact game/player actions and original source research.
Search includes current judgment text. Game sheets now label mixed player and
team streaks accurately, expose a named close/escape action, and hide the dock
from accessibility while the Hub modal is open.

## Data and runtime

Synthesis receives the full eligible source pool plus separately checked current
game context, before presentation caps. It preserves original observation
clocks through later voice generation and cached collector reuse. Validation
checks exact identities, numerical provenance, season/sample/role distinctions,
citations and material limitations. Unposted orders and probable pitchers stay
unconfirmed. A successful refresh of unchanged evidence preserves original
argument text and generation time.

The service-only `publish_hub_judgment` RPC updates only `meta.judgment`, under
an exact primary-row lock. It rejects identity mismatches, older or conflicting
equal-time envelopes, expired cases and newer cited source observations.
Original source copy, grading and sibling metadata survive publication. Native
selection checks source clocks before deduplication and suppresses stale,
started-game, wrong-date and invalidated judgments.

Deployed database migrations:

- `20260908151609_hub_judgment_publication.sql`
- `20260908161936_hub_judgment_source_observation_guard.sql`

The new `com.gary.hub-judgments` LaunchAgent runs the canonical
`gary2.0/scripts/run-hub-judgments.js` with the existing Sol content model. It
attempts a refresh every 15 minutes from 06:00 through 23:59 Eastern, across
MLB, NFL, NCAAF and NBA. It rechecks published research rather than replacing
daily collectors, Fantasy, or pick workers. Long runs can coalesce scheduled
intervals; source and game eligibility determine what the app can display.
The stage's elapsed budget starts before source/slate reads and reserves 60
seconds for publication. The optional editor cannot consume that reserve or
withdraw an otherwise complete case when its own budget expires.

Acceptance also repaired two real research defects: head-to-head history now
uses completed regular-season games strictly before the target game, and
ballpark pitching samples use exact outs. The repaired Schlittler venue sample
is **206 outs / 68.2 innings**, not a rounded decimal 68.7. Prior affected rows
are preserved in the repair receipts.

## Verification and evidence

Evidence directory:
`/Users/adam.preda/Documents/ChatGPT/Gary/hub-judgment-2026-09-08`.

- All **15 current MLB arguments** passed independent content review. Atomic
  publication and anonymous app readback matched exactly; source fields and
  approved argument text remained unchanged.
- The real editorial pass ordered all 15 cases in 29.3 seconds. Fresh provider
  revalidation and a normal CLI replay reused every argument and the editorial
  order, with no new generation calls and zero publication rejections.
- The installed worker completed all four actual league stages successfully.
- Backend: **3,527 tests verified passing** across the full run and a targeted
  rerun. The full run had three Swift subprocess timeouts during concurrent
  archive compilation; the same three files passed with original deadlines
  once compiler contention ended. This was not a single uninterrupted green run.
- Edge helpers: **217 passed**. Web: **838 passed**, type generation and
  TypeScript passed. The real server-rendering smoke passed from a public-source
  fixture export. That export was verification only; implementation stayed on main.
- Subsequent focused suites cover editorial permutation/cache/deadline handling,
  native ordering, source freshness, malformed additive metadata, modal
  accessibility and original case preservation. Final counts are in the review
  receipt.
- Final native refinement: 67 focused checks plus the latest model checks and
  extracted SwiftUI typechecking passed. Independent final editorial/deadline
  review reran 33 tests successfully; these overlap earlier suites and are not
  additional unique full-suite tests.
- Final 916 Simulator interactions verified the current lead/full case, evidence
  expansion, exact Detmers player and LAA/BOS game, full-reasoning search,
  Categories/Points scoring, section jumps, Fantasy full case and Reference.
  Normal and largest accessibility text captures are attached. Close controls
  worked; the game modal excludes the background dock from its accessibility
  tree. NFL weekly Fantasy compatibility was exercised on the earlier 916
  Simulator build; its unchanged Fantasy implementation is retained in the final
  build. This does not claim a final-build physical VoiceOver walkthrough.

Key receipts: `final-publication-receipt.json`,
`editorial-publication-receipt.json`, `live-editorial-cli-replay.json`,
`worker-final-run-receipt.json`, `source-observation-migration-receipt.json`,
`backend-final-tests.log`, `backend-final-timeout-rerun.log`,
`edge-full-tests.log`, `web-verification-receipt.json`, and `web-smoke.log`.

The final app build is based on native source `54337a8a` and the 131 public
inputs in `native-final-source-before.json`. Protected Google/SecretsLocal
configuration is deliberately excluded from hashes and commits. The first
successful 916 build/archive preceded the final refinements and is not the
approval artifact.

Final archive: `/Volumes/KINGSTON/Gary-2.25-916-Hub-FINAL.xcarchive`.
Version **2.25 (916)**, bundle **ai.betwithgary.app**, device architecture arm64.
Executable SHA-256:
`269840d3379e213c1a5beb722eb1da83ba0c90605af44754e2c85c5eb48b565e`.
All 131 public source inputs match the reviewed native snapshot. Strict deep
code-signature verification passed. The 21 bundled privacy manifests parse
and independently match build 915 byte for byte. This is a signed development
archive; App Store export, upload and Apple processing have not occurred.

Receipts: `final-archive-receipt.json`, `final-simulator-build-receipt.json`,
`independent-916-artifact-review.json`, `independent-916-privacy-review.json`.
The installed final Simulator executable has SHA-256
`729aaf2e480c3ce9c6cf31c0be3738e8e4bd13bb4da4dcd8a8463f447811ddc0`.
Its device is `709A9235-5F15-40D3-BA98-F7693C47B640`; preserved 915 QA and
GaryShots installations were not changed.

## Release boundaries

The production truth audit confirms canonical worker paths, no unpushed code
and all 20 edge deployment timestamps. Its overall working-tree warning also
includes concurrent launch/design-document work and the required local
GoogleService configuration exception; it must not be reported as an entirely
clean checkout. MLB picks remain owned by the separate pick pipeline.

Automated freshness fixtures cover empty, stale, failed, changed, started-game,
date-rollover and doubleheader cases. Successful other-league worker execution
does not establish visual coverage of every future sport/provider slate.
Actual swipes, complete VoiceOver/escape traversal, Reduce Motion interaction
and user comprehension remain human acceptance checks. The Mac automation
tool's drag/scroll commands failed to move even native iOS Settings; Settings'
exposed accessibility ScrollDown/ScrollUp actions worked. This isolates an input
limitation, not a demonstrated Gary defect or a passed physical gesture test.
The preserved control is in
`/Users/adam.preda/Documents/ChatGPT/Gary/launch-readiness/continuation-2026-09-08/scroll-input-diagnostic`.
Tap navigation, section anchors, layouts and accessibility-tree checks above
remain verified. No absolute prediction of future provider/runtime reliability
is implied by this release snapshot.

The accepted product plan is
`/Users/adam.preda/Documents/ChatGPT/Gary/HUB_PRODUCT_AND_DESIGN_PLAN_2026-09-08.md`.
This handoff supersedes older Hub implementation status; older releases retain
their original upload, Apple review and TestFlight evidence.
