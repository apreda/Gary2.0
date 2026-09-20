# Date/time audit and cleanup — September 19, 2026

Adam requested a broader date/time audit after the Giants bullpen playing-date
repair, plus a candid assessment of code cleanup and maintainability. Runtime
changes are in `0ac2e8e31849dab0f67de189424b1033064e3d1b`, pushed to main.

## Confirmed defects and fixes

- **Calendar offsets across DST:** subtracting 24 hours is not always yesterday.
  At March 9, 2026 00:30 ET it selected March 7; at November 1 23:30 ET it
  selected November 1 again. Shared `supabase/functions/_shared/dateKeys.js`
  now separates Eastern instant-to-date conversion from calendar-key arithmetic.
  Local grading, recaps, fact checks, streaks, closing lines, diary, rationale,
  shadow reads and highlights use the shared calendar offset. Cloud graders,
  lineup dates and social reporting windows use the same implementation.
- **Date-only values and season boundaries:** the manual DST approximation and
  offset-then-host-local season calculation were removed. Provider date keys
  retain their literal day. Season helpers and Eastern hours work independently
  of the machine timezone; weekly NFL reads use the shared season helper.
- **NFL weekly windows:** the runner previously constructed its Tuesday cutoff
  in the host timezone and reparsed localized date strings. Its extracted helper
  now compares Eastern calendar keys, preserves Monday-only selection, and
  preserves the Tuesday 5 AM allowance independently of host timezone/DST.
- **Active June MLB tools:** team rest used UTC date strings for both now and
  the previous game. It now uses the baseball playing date, including a resumed
  session, and explicitly reports full calendar days off: Friday-to-Saturday
  is zero full off days. Statcast queried UTC dates that could omit Friday's
  West Coast start before UTC midnight or include Saturday's daytime game after
  UTC midnight. It now queries the extra UTC date, filters to the previous seven
  Eastern dates, and selects the latest three games by start time rather than ID.
  Recent StatsAPI lookback and Winners historical windows use calendar offsets.
- **Website/app rollover mismatch:** web still advanced at 3 AM despite native's
  approved 6 AM boundary. Web now matches 6 AM ET, retaining the previous calendar
  day across spring DST. Related Book, notice and marketing fixtures were updated
  to exercise the real new boundary, including both DST transitions.
- **Native calendar use:** the Billfold's seven elapsed hours from midnight
  became 8 AM in spring and 6 AM in fall. It now uses 7 AM Eastern wall-clock
  time. Hub tomorrow dates use the existing date-key helper; recent-record
  lookbacks use an Eastern Gregorian calendar and one captured current instant.

The June prediction instructions, constitution, model routing, injury handling,
published picks and original evidence are unchanged. June era on disk is now
`9d3d2be7e50e` due to the authorized mechanical tool-data correction. No test
prediction, production backfill or social message was issued.

## Verification and delivery

- Full `npm run verify`: **4,442 backend tests (415 files), 243 edge tests,
  937 web tests (88 files)** passed; Next/TypeScript checks passed.
- Regressions cover UTC midnight, date-only values, season/year boundaries,
  both DST transitions, four host/device timezones, the real cloud prop handler,
  actual shipping Swift date functions and active June MLB tool entry points.
- Fixture website smoke passed from a temporary credential-free checkout,
  including Home, Picks, Results/export, Book discovery, leaderboard and sitemaps.
  Temporary checkout removed. Four changed edge entry points passed Deno checks.
  Web lint has no errors and two existing navigation warnings.
- All four functions deployed September 20 02:25 UTC: `grade-results` v41,
  `grade-props` v25, `mlb-field-lineups` v14, `social-auto-post` v124.
  Read-only Winners and dry-run prop/social checks returned HTTP 200. At UTC
  September 20, the prop handler correctly queried Eastern September 19 and 18.
  Lineup handler boot/auth was checked with a public key (HTTP 403); no lineup
  mutation was invoked as a test.
- Vercel production deployment `dpl_Gna7Fiu7FxG6hRFgz9WDB5h8E2fF` is READY,
  serves code commit `0ac2e8e3`, and owns `www.betwithgary.ai`/`betwithgary.ai`.
  Live Home, Picks and Results returned HTTP 200.
- Signed archive and upload succeeded. **TestFlight 2.26 (938)** completed
  processing September 19 at 22:25:08 ET and was available at 22:25:13 ET.
  Archive: `/Volumes/KINGSTON/Gary-2.26-938-Sep19.xcarchive`.
  Apple emails: `1a0bca1b22113016` (processing), `1a0bca1c7e43de46` (available).
  This is TestFlight delivery, not public App Store submission.
- Production truth confirms scheduler PID 9168 runs from
  `/Users/adam.preda/Gary2.0/gary2.0`, Winners worker PID 66729 runs, and edge
  deployment timestamps are current. Fresh pick children load the repaired
  tools; the scheduler itself was not edited. Existing 15/15 MLB publications
  retain their original eras; the new engine has not been forced to republish.
- The overall production audit still flags the three pre-existing unrelated
  local exceptions: `gary2.0/deno.lock`, private
  `ios/GaryApp/GoogleService-Info.plist`, and
  `audit-evidence/nfl-70pct-snapshot-6f78c693/`. They were preserved and excluded
  from the commit. No unpushed runtime changes remain.

GitHub verification: https://github.com/apreda/Gary2.0/actions/runs/35483934349

Logs and release receipts are outside the repo at
`/Users/adam.preda/Documents/ChatGPT/Gary/date-time-audit-2026-09-19/`.

## Maintainability assessment and next cleanup

The code is workable and has substantial regression coverage. Changes take
extra tracing because similar implementations live in several places and many
tests extract source bodies or assert source strings. The first full run exposed
test harnesses missing the newly imported date helper; their fixtures now supply
that dependency, while new behavioral tests exercise the actual helper/handlers.

This pass removed the manual DST implementation and repeated calendar helpers,
and isolated NFL week selection. The next useful cleanup is incremental:

1. Reconcile the monolithic `ballDontLieService.js` (6,183 lines) and the parallel
   `services/ballDontLie/` modules. Trace callers first; do not assume the alternate
   tree can be deleted, and preserve locked injury behavior.
2. Split focused operations from the pick runner (2,716 lines), shared scout data
   fetcher (3,773 lines), and native Hub/Home screens (4,785/3,661 lines).
3. Make active June MLB versus retained non-June paths clearer at entry points.
   Preserve the pinned decision behavior while sharing mechanical provider/date
   helpers where practical.
4. Continue replacing source-string/VM extraction tests with behavior tests on
   exported units as those units are extracted. Keep integration, actual Swift
   and provider-fixture coverage.

UTC timestamps used for storage, elapsed time, API-required UTC query keys or
short-lived cache buckets are valid and were not mechanically replaced. This
audit fixes the confirmed paths above; it is not proof that every future provider
date shape or unused historical path is defect-free.
