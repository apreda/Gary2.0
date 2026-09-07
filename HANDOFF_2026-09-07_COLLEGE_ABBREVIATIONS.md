# College scoreboard abbreviations — September 7

The founder requested SMU @ FSU, then an audit of all college abbreviations
against television scoreboard conventions. The original Home bug searched pro
keyword maps for an unhandled NCAAF league: "Florida" matched the NHL Florida
Panthers code FLA, while Mustangs fell back to MUS. The first Home correction
was 572ed8a2. This follow-up covers the remaining college display routes.

## Reference and coverage

ESPN is the consistent scoreboard reference. The checked-in source snapshot is
`gary2.0/scripts/gen/data/ncaaf-scoreboard-teams.json`, dated September 7:

- ESPN teams API: https://site.api.espn.com/apis/site/v2/sports/football/college-football/teams?limit=1000
- FBS directory: https://www.espn.com/college-football/teams
- Provider name aliases: https://api.balldontlie.io/ncaaf/v1/teams?per_page=100

All 138 FBS directory teams already had the correct provider codes. Their full
names and school names now all resolve through the same ESPN display table.
The snapshot includes 761 ESPN entries (including lower divisions and duplicate
provider entries). Exact full names, schools and unambiguous short aliases
produce 1,990 lookup keys. Full names outrank bare aliases; ambiguous bare
aliases are omitted, with FBS schools taking priority over lower-division
namesakes such as Charlotte and Troy.

412 provider schools match ESPN; 127 had different codes, now corrected for
display. The 95 unmatched named provider schools retain their school name rather
than an unverified code. Mascot-only provider rows cannot identify a school and
are excluded. No claim is made that every historical/lower-division alias has
an ESPN match. Unknown names never enter pro mascot matching for NCAAF.

`node gary2.0/scripts/gen/ncaaf-team-names.js --check` verifies the reviewed
snapshot offline. `--refresh` explicitly refreshes sources; `--audit` prints
code differences and unmatched names. Refresh refuses incomplete sources and
checks every FBS alias before replacing output.

## App changes and verification

Home, Picks, Hub strips, football stat plates, Tomorrow rows, pick cards and
share cards use the shared league-aware formatter. College names take priority
over stale stored display codes. Chips preserve the entire code (UCLA, WASH,
UNLV, UCONN) and size longer labels to fit. Unused duplicate formatters were
removed. Provider codes remain separate for joining immutable stored Hub cards;
a regression verifies Butler's ESPN display BTLR still joins provider BUT.
Stored picks, their snapshots and server identity fields were not rewritten.

The full backend/native-source suite passed 2,166 tests in 238 files. Native
Swift execution checks all 138 FBS teams using full names, school names and
codes through the actual display helpers and chip labels. Regressions include
SMU/FSU with stale codes, Ohio/Ohio State, Miami/Miami (OH), professional Panthers,
unknown schools and share-ticket formatting. A focused rerun passed after the
unused share wrapper was removed. The complete iOS simulator build passed.

The updated app was installed in the iPhone 17 simulator. Home visibly rendered
`SMU @ FSU` and `SMU -154 · FSU +128`; recap rows retained WASH and MISS.
Evidence: `/Users/adam.preda/Documents/ChatGPT/Gary/audit-evidence/college-abbreviations-2026-09-07/`.
Build log: `/tmp/gary-all-abbreviations-build-final.log`.
Full test log: `/tmp/gary-all-abbreviations-full-tests.log`.

## Delivery boundary

These are native app changes. They require a subsequent distributed iOS build
to reach phones. This task did not upload an App Store/TestFlight build or change
Apple's existing review submission. Build 902 from the Mac-repair task predates
this follow-up. Preserve the real local Firebase plist and concurrent worker
recovery changes; only abbreviation-related files belong in this commit.
