# Hub and Fantasy redesign — September 7, 2026

Adam authorized this native Hub/Fantasy redesign. This is a dated release
record; its visual choices are not instructions for future design work. This pass preserves the games
strip and current native font family, and gives the content clearer hierarchy
and warm solid surfaces.

Implementation is committed and pushed to main as `f7eb9fbd`. Version 2.25,
build 907, was uploaded successfully at 2026-09-08 00:32:00 UTC. Apple processing
was verified Complete at 00:35 UTC. TestFlight lists it in the internal Beta
group with one invite and 90 days remaining. Apple build ID is
`3e15a8aa-e9eb-4ac4-ad98-23142eccadd4`. The earlier App Store submission was
not changed.

## Delivered behavior

- A two-row Hub/Fantasy masthead, warm static backdrop, solid lead panel,
  grouped supporting reads, and quieter specialist board disclosures.
- A clipped scrolling viewport prevents content appearing behind the status
  bar. Existing horizontal games strip, width constraint, data gates, search,
  section index and exact player/team/game routes remain in place.
- Fantasy features one full decision and compact follow-up calls. Pickups,
  Lineup and scoring controls lead to full reasoning, counterargument, next
  checks, opportunities, sources and evidence windows.
- Exact source-ID citations display as numbered references matching the
  evidence order. Stored prose, numbers, caveats and unknown bracket content
  remain unchanged. Category labels use readable names and ERA/WHIP/RBI/FLEX.
- Accessibility text sizes stack controls. Empty filters, expired windows,
  retry behavior and exact-player fallback remain explicit.

## Verification and release

See `audit-evidence/hub-fantasy-redesign-2026-09-07/README.md` for screenshots
and the bounded test/QA record. Five Hub suites / 14 tests and the executable
Fantasy model assertions pass. Debug, final optimized simulator and final
signed device archive succeed. Three final Release cold launches rendered;
no new GaryApp diagnostic crash report was present at 8:30 PM ET.

Final archive: `/Volumes/KINGSTON/Gary-2.25-907-Hub-Fantasy-final.xcarchive`.
Upload log: `/tmp/gary-hub-907-upload.log` (`EXPORT SUCCEEDED`).
The simulator is free for other tasks; normal text size was restored.

Production truth after the implementation push: scheduler PID 79083 and
Winners PID 89023 use the canonical checkout; all 11 MLB slate games have
published picks, none started without one, and all 20 edge timestamp checks
pass. Its exit 1 reflects only the preserved private
`ios/GaryApp/GoogleService-Info.plist` working-tree exception. That file was
not read, edited, staged or committed. No backend publication, paid generation,
hosting change or notification work was performed for this presentation pass.
