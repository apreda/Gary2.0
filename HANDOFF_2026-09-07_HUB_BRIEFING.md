# Main Hub daily briefing — September 7, 2026

Adam approved the main Hub samples and said to go ahead. This implements the
recommended daily briefing direction in the native app: one solid warm lead,
two supporting reads, and compact expandable specialist boards. The existing
horizontal game strip, header, full player/team reads, and separate Fantasy
page remain the foundation. The supplied `anti-ai-slop-design.md` informed the
warm surfaces, restrained gold labels, and removal of the redundant hero stat.

## Release status — visual QA still blocked

- Version **2.25 build 905** passes the Debug simulator build and signed Release
  archive. Both project configurations and the archive report 905.
- Archive: `/Volumes/KINGSTON/Gary-2.25-905-Hub.xcarchive`.
- Debug app installed on the existing iPhone 17 simulator
  `709A9235-5F15-40D3-BA98-F7693C47B640`.
- Logs: `/tmp/gary-hub-905-debug.log`, `/tmp/gary-hub-905-archive.log`, and
  `/tmp/gary-hub-905-focused.log`.
- **Build 905 has not been uploaded to App Store Connect.** Final visual and
  interaction QA is pending because Computer Use reports the Mac is locked
  and cannot unlock it automatically. Adam was asked to unlock the Mac. Do not
  call this redesign live, visually verified, or available in TestFlight yet.
- The preceding uploaded native build is 904. Backend services and pick
  generation are not changed by this implementation.

## Behavior and safeguards

`HubFrontPageSelection` selects one lead plus at most two supporting stories
from the complete relevance-ordered eligible pool. Upcoming games precede
live games, unknown context, and completed/interrupted context. Connection
stories can lead only within the best available phase. Missing clocks never
become fabricated midnight starts or live status. Exact league-scoped game IDs
keep doubleheaders separate. One local minute tick updates the visible main
Hub across start times and the slate rollover; it adds no provider polling.

The featured set contains exactly the displayed stories and is excluded from
later beats and overflow for every league. Regression owns its separate board;
unfeatured streak signals remain in More Edges. Opening a beat exposes its
whole feed. Regression no longer silently stops at eight rows. The section
index opens its destination before scrolling, and its order follows the page.
Fantasy-only data cannot suppress the main Hub's empty state.

The lead retains the original headline and full explanation. Supporting
headlines wrap without a two-line cutoff. Full-read fallback panels retain the
complete source text, scroll when needed, and keep the close button outside
the scroll. Team reads now have their own reachable card action after expansion.

`HubStoryIdentity` requires a populated, unique player card for the current
slate, league, player, and supplied game. The app opens that prefetched card
with the original signal. An exact-ID miss does not become a name match or a
doubleheader sibling; the full story remains available as fallback. Failed
league loads retain last-good signals only for the same slate date, and a
request completing across rollover is reissued for the new date.

The strip and game popup use exact league/game score lookups. ID-less legacy
rows may use a unique same-league match only. Known final/live/interrupted board
states stay labeled when the live score is absent, without inventing a score.
The popup and full-read View Game links forward league and provider game ID to
Picks. Typed Picks requests wait while loading and never substitute a same-name
game; a settled missing target returns to the overview.

## Completed verification

- **67 tests passed** across seven focused suites: Hub selection, Hub team
  routing, Hub identity, player-card scope, card coverage, football wiring and
  Picks crash recovery. Tests execute the actual Foundation selection and
  shipping Swift routing functions, including missing/arriving doubleheader
  targets, league collisions, empty packs and the original full read.
- The standalone `HubStoryIdentityTests.swift` harness passed **42 checks**.
- The existing Fantasy native harness passed full copy, league/date isolation,
  expiry, overnight recovery and exact player/game routing.
- Debug build and signed Release archive passed. Only pre-existing unused
  variables and App Intents extraction warnings remained in the archive.
- Source review checked the new disclosure routes, complete board access,
  exact status joins, and the bounded full-read fallback. Diff and project
  plist checks passed.
- Implementation commit `f5fee408` is pushed to `origin/main`. The production
  truth audit at that commit confirmed scheduler PID 79083 in the canonical
  checkout, Winners worker PID 89023 running, and all edge deployment timestamp
  checks passing. MLB had 8/11 games published, three pending, and zero started
  games missing a pick. The audit exited 1 solely for the preserved private
  `GoogleService-Info.plist` working-tree exception; there were no unpushed
  commits. Log: `/tmp/gary-hub-905-production-truth.log`. This read-only audit
  does not replace the pending native visual check or upload.

## Resume after the Mac is unlocked

Use the Computer Use skill's Node/Sky interface for all simulator UI actions.
Check the real MLB main Hub, scroll the game strip independently, open the
lead and both supporting reads, expand Regression/Bats/Arms/Streak/NRFI, use
the section index, and exercise View Game. Verify NFL's real quiet-day state,
switch through NCAAF, and revisit MLB/NFL Fantasy. Inspect long copy at larger
text sizes and make sure the full-read close action remains reachable.

After QA, upload the prepared archive with the existing signed-in Xcode setup:

```sh
xcodebuild -exportArchive \
  -archivePath /Volumes/KINGSTON/Gary-2.25-905-Hub.xcarchive \
  -exportOptionsPlist /tmp/gary-privacy899-exportoptions.plist \
  -allowProvisioningUpdates
```

That export configuration uses App Store Connect upload, automatic signing,
and `manageAppVersionAndBuildNumber=false`. Do not regenerate from stale
`project.yml`. If code changes during QA, rebuild and replace the unuploaded
archive before uploading. Record the upload result separately from Apple
processing or actual TestFlight availability.

The canonical checkout is `/Users/adam.preda/Gary2.0` on main. Preserve the
private `ios/GaryApp/GoogleService-Info.plist` as the known uncommitted local
configuration exception. Concurrent social-post work belongs to its own task.

One existing follow-up outside this UI change: `scripts/check-card-coverage.js`
still uses looser ID/name matching than the app's new exact-game resolver and
can overstate card reachability. Its monitor logic was not changed here.
