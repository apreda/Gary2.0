# Sports stat audit — one additional round

Code commit: `8155115f`, pushed to `origin/main` from the canonical production checkout `/Users/adam.preda/Desktop/Gary2.0`.

The founder authorized one additional audit/fix round, then a recommendation about a second round. This round is complete. **Do not start round two until the founder says go.**

## Repairs

- NCAAF team QB, player-log, havoc and pressure requests now use the same dated-row validation as individual player evidence. Wrong season/team, future/invalid dates, explicit unfinished games, duplicate rows and conflicting versions cannot inflate the sample. Full names survive; zero-yard passers and negative-yard rushers remain eligible. Player log lines include dates and season labels.
- NCAAF QB aggregates retain every eligible appearance and leave partially missing fields unknown. Turnover calculations only count games with values for both teams, including the denominator. CFBD null/blank/boolean values no longer become numeric zero.
- College defensive counts retain the numeric values that actually arrive, with per-field coverage. The live provider omits defensive fields on offensive player rows; requiring those fields on every row would lose valid defensive counts. Missing values are not counted as zero, partial counts are labeled, and per-game rates require complete fields.
- NFL summaries preserve missing values, convert numeric strings before arithmetic, retain game/season/team identity, and resolve flat or embedded team IDs consistently. Unknown venues cannot enter away splits. Missing fields cannot fabricate averages, perfect consistency, target trends or usage trends.
- NBA logs honor the requested season and cutoff, fetch cursor pages before choosing recent games, and reject malformed/repeated/incomplete pagination without caching partial results. Raw rows are cached; sample size, cutoff and prop-line hit rates are computed for each request. Completed-game validation, duplicate/conflict checks, flat team IDs, sub-minute appearances and nullable arithmetic replace the old 30-day/first-page/whole-minute behavior. Historical delayed 2020 Finals still use the provider's actual season.
- Both Gary and the research assistant now request NBA defensive season averages using `general/defense`, correcting the invalid `defense/defense` combination. The pinned NBA winning-era prompt is unchanged.
- Shared completed-status handling no longer accepts `Not Final` merely because it contains “final”; the MLB relief/two-way appearance regression remains covered. NBA access failures reach the research tool as provider failures instead of an apparently empty player history.
- The changed evidence dependencies are included in football/MLB era fingerprints. No injury handling, model selection, existing pick records, scheduler logic, billing or Supabase cleanup was changed in this round.

Provider contract reference: [BALLDONTLIE NBA documentation](https://nba.balldontlie.io/) documents flat stat-game team IDs, cursor parameters, defensive average categories and HTTP 401 access errors.

## Verification

21 new regression cases. Full `npm run verify` passed with 1,979 backend tests, 168 edge tests, 333 web tests and Next/TypeScript checks. After the final NBA error-propagation change, the focused affected suites passed and the complete backend passed again with **1,980 tests**: **2,481 passing tests across the final relevant suites**.

The first full attempt hit an existing timing-sensitive BDL gate assertion: `AbortSignal.timeout` produced `TimeoutError` while the assertion expected `AbortError`. The unchanged gate suite passed in isolation and in both subsequent complete backend runs. No assertion was weakened.

Local logs:
- `/tmp/gary-stats-round1-verify-final.log`
- `/tmp/gary-stats-round1-backend-final.log`
- `/tmp/gary-stats-round1-production-final.log`

Live college smoke at `2026-09-05T15:56:52.123Z`: `NCAAF_QB_STATS` returned **Carlos Del Rio-Wilson**, Marshall, **2025**, 11 dated games, 171/256, 66.8%, 2,043 yards, 7.98 Y/A, 17 TD, 5 INT; evidence spans August 30–November 29, 2025. All row-rejection diagnostics were zero. This matches the season line from the founder's screenshot with its player identity intact.

Live NBA identity lookup succeeded, but both `/v1/stats` and `/nba/v1/stats` returned **401 Unauthorized** with the configured credential. Endpoint/account access remains unresolved; live NBA stat availability is **not verified**. No subscription or credential was changed. The repaired code surfaces this failure explicitly.

## Production

Post-push `production-truth.js` read `8155115f` in the scheduler's actual checkout. Scheduler **23440** and Winners **11032** remained running. All deployed edge timestamp checks passed; no unpushed code remained. The check exited 1 solely for the intentional, preserved local `ios/GaryApp/GoogleService-Info.plist` difference from the tracked redacted template.

Fresh-process evidence hashes:
- NFL: `a8173e991183`
- NCAAF: `a8e9b34d1e2b`
- MLB June: `6c7eb813e8a8`
- Props: `aa5fa0ab453b`

Pick children load the source afresh; scheduler source did not change. Existing picks retain their original eras. No pick regeneration or outbound posting was triggered for this audit.

## Recommendation for round two — awaiting go

Recommend another bounded round. Prioritize provider access/failure visibility, fallback pagination and historical cutoffs, then cache completeness/freshness. Specific inspection candidates are NFL per-player fallback paging and filtering before sample truncation, NCAAF pagination limits, and empty/error cache behavior across sports. These paths have not received the same end-to-end regression treatment as the repaired paths above. NBA account access should be resolved before claiming live NBA readiness.
