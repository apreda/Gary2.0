# Winners background and Fantasy panels — September 7, 2026

Adam asked to see a different Winners background with the depth of the Home
grid, and more solid containers for the Fantasy content discussed immediately
before it. He explicitly requested the guide at
`/Users/adam.preda/Desktop/anti-ai-slop-design.md`; that request overrides the
older blanket instruction against stored design guidance for this work.

## Native changes

- Winners uses a warm, recessed background with static curved bands, distant
  light, and darker edges. It applies to the whole Winners page, including
  MLB-only dates. Home and Picks keep their existing backgrounds.
- Winners' supporting panels use the existing opaque surface and shadows.
  The gold game cards, silver prop cards and their reveal behavior are retained.
- Fantasy has a solid panel for each player, with the stored verdict above the
  full explanation and the measurements below it. Names and evidence wrap.
  Player lists render lazily. The original player-detail interaction remains.
- This is a visual pass. The earlier discussion about rebuilding Fantasy's
  recommendation process remains a proposal: no analyst prompts, availability
  decisions, injury handling, evidence sources or published rows changed here.

## Verification and delivery state

- Native Debug simulator build passed, log `/tmp/gary-winners-depth-build.log`.
- Checked Winners' current empty board, September 6 gold game card and silver
  prop board, date/mode switching, and Fantasy panels opening player details.
- The new backdrop has no timer, scroll observer or hit-testing surface. An
  idle simulator process snapshot after navigation showed 1.0% CPU; this is
  not a frame-rate or memory benchmark.
- `git diff --check` passed. Backend/web checks were not repeated for these
  native presentation changes.
- Preview runs in iPhone 17 simulator
  `709A9235-5F15-40D3-BA98-F7693C47B640`, using the existing derived-data folder
  `/tmp/gary-abbreviations-build`.
- **Preview only for native distribution:** no new archive or TestFlight
  upload was made for this visual review. The previously uploaded build 903
  does not contain these changes. The project build number is still 903.
- Screenshots are under
  `/Users/adam.preda/Documents/ChatGPT/Gary/design-preview-2026-09-07/`:
  `winners-depth.png`, `fantasy-panels.png`, and `winners-before.png`.
- Run `scripts/production-truth.js` after commit/push; the private
  `ios/GaryApp/GoogleService-Info.plist` remains the expected dirty-tree
  exception. It was not edited or staged.

The previous backend performance audit and uploaded build 903 are documented
in `HANDOFF_2026-09-07_PERFORMANCE_AUDIT.md`.
