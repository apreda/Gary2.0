# College ranking context — September 19

Adam requested rankings next to college teams wherever they provide useful
context. This change decorates native team labels with the dated AP rank:

- Home's game board, including live/final scores, countdown and game ribbon.
- Picks' game navigation and the pre-pick matchup list.
- The shared Winners/Picks card's existing rank labels, now validating 1–25.
- Shared pick images, with both teams' ranks visible in the matchup.

`CollegeTeamRankings` reads only the supplied game's pick/slate snapshot. A
published pick takes precedence, including unranked sides. Yesterday's Picks
view supplies yesterday's picks and no current slate. Conflicting provider
IDs and different leagues cannot borrow a ranking. Legacy matches require
both full school names in their original order. Rankings never enter routing
identities, stored tickets, quoted odds, admission rules or model prompts.
Existing CFP seed presentation on pick cards is preserved. NCAAB historical
payloads use the same validation; this does not reactivate that sport's engine.
Card frames are unchanged. Picks resolves ranking context once per accepted
content revision, with a dictionary lookup during live redraws.

## Verification

- All 186 native checks in 54 suites pass on an isolated copy of this change
  over published main. The first shared-tree run also encountered unrelated
  in-progress shadow and Hub scroll-anchor assertion failures; those edits
  were preserved. A model-extraction dependency failure introduced during
  this change was repaired and its identity tests passed.
- The shared checkout's iPhone 17 simulator Debug build passes. Its first
  attempt ran out of external-drive space while copying dependencies; the
  task-created failed checkout was removed. An existing cache's generated
  AppleDouble sidecars also needed removal before the successful build.
- Rendered side-pick and total cards at 375-point width retain both ranks,
  the entire line/price and ordinary card dimensions. The share image retains
  both ranks. These Michigan/Ohio State fixtures are fictional QA examples.
- A live September 19 read found 53 NCAAF slate rows, 18 with at least one
  rank. Simulator Picks navigation displayed `KENT @ #6 OSU` from that data.
- Logs: `/tmp/gary-college-rankings-isolated-tests.log` and
  `/tmp/gary-college-rankings-build-final.log`. Renders use the existing
  `-renderShareCards` debug harness (13 and 14).

## Delivery boundary

Native source only, for the next iOS distribution. This is not an App Store
or TestFlight upload and does not resolve the existing Apple account gate.
No backend deployment, database mutation or worker restart is needed.
Publish this patch independently of the pending cascade/backend commits;
preserve concurrent native work, staged backend deletions and the private
GoogleService plist. A non-green whole-checkout production audit must remain
explicit while that separate work is unfinished. No research policy changed.
