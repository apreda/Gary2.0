# Hub and Fantasy redesign — 2.25 (907)

Release evidence for the September 7, 2026 native UI redesign. Design authority
is Adam's current conversation feedback and
[anti-ai-slop-design.md](../../docs/design/anti-ai-slop-design.md). Older font
mandates and design rules remain retired.

## Changes

- Hub uses a warm static backdrop, solid lead and supporting panels, and a
  clearer native type hierarchy. The existing games strip is preserved.
  Scrolled content clips to the viewport so headlines cannot show behind the
  status bar; the backdrop still fills the safe area.
- Fantasy presents a featured decision followed by compact calls, with full
  reasoning and evidence available in detail. Scoring-format and decision
  filters remain available.
- Exact recognized evidence IDs become numbered citations for display, mapped
  to numbered evidence rows. Stored source strings, statistics and qualifiers
  remain unchanged; unknown bracket content is preserved.

## Completed verification

- Debug build succeeded after the design changes. Optimized Release simulator
  build and signed device archive succeeded again after the viewport fix.
  The final archive is `/Volumes/KINGSTON/Gary-2.25-907-Hub-Fantasy-final.xcarchive`.
- The final executable `FantasyBriefingTests` suite passed, including citation
  mapping, full-copy preservation, freshness and exact player/game routing.
- Five focused Hub suites passed all 14 tests. The final bounded read-only
  regression review found no remaining blockers in the reviewed changes.
- Live Debug simulator QA observed the correct MLB Pickups and Lineup views,
  the Points empty state, full Baez evidence, the exact NFL Vele decision
  fallback, and the PPR call with its alternative.
- Final optimized runtime QA verified MLB lead/supporting boards, NFL's
  next-slate state, and NCAAF's lead and exact Ashton Daniels breakdown route.
  Switching from NFL Fantasy to NCAAF returns to the main Hub with search.
- Four preferred-text-size increments exercised accessibility layouts in both
  scopes. Controls stack, date remains visible, and text wraps. Normal text
  size was restored after capture.
- Three cold launches of the final optimized build rendered successfully.
  No new GaryApp crash report was present at 8:30 PM ET; the existing report
  dated 7:23 PM predates the build 906 cache fix.

Screenshots: [MLB Fantasy](screenshots/mlb-fantasy.jpg),
[MLB full case](screenshots/mlb-full-case.jpg),
[MLB evidence](screenshots/mlb-evidence.jpg), and
[NFL Fantasy pickups](screenshots/nfl-fantasy-pickups.jpg).
Additional final Release captures: [MLB Hub](screenshots/mlb-hub-release.jpg),
[scrolled viewport](screenshots/hub-scrolled-viewport.jpg),
[NFL Hub](screenshots/nfl-hub.jpg), [NCAAF Hub](screenshots/ncaaf-hub.jpg),
[Hub accessibility](screenshots/hub-accessibility.jpg),
[Fantasy accessibility](screenshots/fantasy-accessibility.jpg).

## Release

Implementation commit `f7eb9fbd` is pushed to main. Build 2.25 (907) uploaded
successfully at 2026-09-08 00:32:00 UTC. App Store Connect was verified Complete
at 00:35 UTC; the build is assigned to the internal Beta group, one invite,
90 days remaining. Apple build ID: `3e15a8aa-e9eb-4ac4-ad98-23142eccadd4`.

Production truth after the push: canonical scheduler and Winners worker are
running; 11/11 MLB games published, zero started missing, all 20 edge timestamp
checks passed. Exit 1 is the single preserved private local configuration
exception (`GoogleService-Info.plist`), with no unpushed changes.

Native accessibility actions and viewport rendering were checked; this does
not establish physical-device touch behavior. No paid generation or data
publication was run for this presentation pass.
