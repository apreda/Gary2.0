# Giants bullpen workload dates — September 19, 2026

Adam flagged the Giants pick's statement that bullpen availability remained
unknown. The original saved evidence was present: both teams had 14 active
pitchers, complete logs and no request gaps. The availability language follows
the approved September 16 rule requiring a dated, attributed clearance report;
it does not establish a failed data request. Those instructions are unchanged.

## Confirmed defect

The workload collector grouped pitch timestamps by Eastern calendar date.
Friday's Giants–Dodgers game (StatsAPI 823898, official date September 18) began
at 02:15 UTC September 19. Pitches after midnight Eastern therefore became
Saturday work. The original Giants decision snapshot, cutoff
`2026-09-19T21:18:24.489Z`, contained these errors:

| Pitcher | Original workload | Correct workload |
| --- | --- | --- |
| Jason Foley | Friday 12 pitches, Saturday 15; two consecutive workdays; pitched today | Friday 27; one workday; did not pitch Saturday before cutoff |
| Carson Seymour | Saturday 10; Friday zero; pitched today | Friday 10; did not pitch Saturday before cutoff |
| Philip Abner | Saturday 28; Friday zero; pitched today | Friday 28; did not pitch Saturday before cutoff |

Harris and Wilkinson's quoted recent performance/rest observations matched the
saved data. The date defect and the availability-report policy are distinct;
the audit does not claim that the date defect alone caused the final wording.

## Change

`src/services/bullpen/evidence.js` now resolves official playing dates. An
uninterrupted outing stays on its game date across midnight. StatsAPI's dated
resumption fields split genuinely suspended/resumed games, supporting both
original and continuation schedule entries. Exact last-pitch timestamps still
determine elapsed hours. Recent detail collection includes games resumed in
the window even when their original official date is older, and unverified
same-day resumptions cannot reenter through an older dated log.

`service.js` uses this date mapping and labels the workload convention in the
rendered evidence. Snapshot version is `bullpen-game-evidence-v3`; June era is
`fa07a4133126`. No injury logic, prediction conclusion instructions, published
picks, stored original evidence, schema or edge functions were changed.

## Verification and production

- Full `npm run verify`: 411 backend files / 4,420 tests, 243 edge tests,
  88 web files / 935 tests; Next/TypeScript checks passed.
- Focused bullpen/June suites: 73 tests passed, including the Friday night
  regression, both resumed schedule shapes, late-night resumed pitches,
  unverified same-day resumption, existing doubleheaders and missing detail.
- Read-only collector replay at the original cutoff: 14 Giants pitchers,
  zero request gaps. Foley/Seymour/Abner now have Friday 27/10/28 pitches,
  one consecutive workday, and `pitchedToday: false`. Exact recorded last
  pitches are unchanged (17.2/16.9/16.6 elapsed hours at cutoff).
- Real suspended-game replay (Cleveland–Minnesota 777861): original May 19
  pitches and May 21 resumed pitches remain correctly separated under either
  schedule entry.
- Production scheduler PID 9168 launches fresh pick children from
  `/Users/adam.preda/Gary2.0/gary2.0`; no scheduler edit/restart is required.
  This repair applies to the next new MLB child. September 19's 15/15 stored
  MLB picks retain their original eras; no new prediction was generated here.
- Production service/edge/support checks pass. The audit's working-tree flag
  includes the existing unrelated exceptions: `gary2.0/deno.lock`, private
  `ios/GaryApp/GoogleService-Info.plist`, and
  `audit-evidence/nfl-70pct-snapshot-6f78c693/`. Preserve them.

Raw provider responses, the original stored workload extract, corrected replay,
comparison and full verification logs are saved outside the repo at
`/Users/adam.preda/Documents/ChatGPT/Gary/giants-bullpen-2026-09-19/`.
