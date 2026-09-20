# Small college rankings — TestFlight 2.26 (939)

Adam requested that college rankings appear small at the upper-left of team
names, rather than at the same size as the headline. Source commit
`87b6e8b5802149a9ebce8c62a45412f1c9b2ec20` is pushed to main.

`CollegeRankText` renders valid rank prefixes as small, raised digits without
the visible hash. The shared college pick-card front uses this for headline
and opponent labels; exported share-card matchup labels use the same treatment.
Underlying rank strings, accessible labels, team identities, picks, prices and
grades are preserved. No backend, prompt or injury-handling changes.

Simulator build and signed release archive passed. Existing college-ranking,
school-name and pick-formatting tests passed (3 files / 4 tests). Actual native
renders were inspected at 375-point phone width: gold Iowa, long Coastal
Carolina, both ranked teams, totals, an unranked MLB card, and a square share.
The complete existing CI is green:
https://github.com/apreda/Gary2.0/actions/runs/35484352217.

Upload succeeded September 19, 2026 at 22:39:29 ET. Apple confirmed processing
at 22:41:28 ET and TestFlight availability at 22:41:29 ET. Build **2.26 (939)**
is available to test. No public App Store submission was made.

- Archive: `/Volumes/KINGSTON/Gary-2.26-939-Sep19.xcarchive`.
- Apple processing email: `1a0bcb0ab58d005f`.
- TestFlight availability email: `1a0bcb0ac9ee747c`.
- Logs, actual Simulator renders and receipt:
  `/Users/adam.preda/Documents/ChatGPT/Gary/college-rank-styling-2026-09-19/`.

Production truth confirms the canonical scheduler/Winners processes and
current edge deployments; engine eras are unchanged. The audit still flags
the same three unrelated local exceptions: `gary2.0/deno.lock`, private
`ios/GaryApp/GoogleService-Info.plist`, and
`audit-evidence/nfl-70pct-snapshot-6f78c693/`. They were preserved and excluded
from the commit.
