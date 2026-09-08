# Historical Picks game context repair — September 8, 2026

Native source commit `41793ede` fixes a confirmed display join: the September 7 NYM @ MIA pick showed today's scouting report underneath its original rationale. The four native source files are reviewed and frozen. Subsequent September 8 acceptance verified the corrected installed simulator UI and final signed build 915 archive, as recorded below. Upload has started; Apple processing and the remaining release acceptance steps are still pending.

## Evidence and cause

The release owner's installed build 915 reproduction was Picks → Yesterday September 7 → NYM @ MIA → Gary's Take. The final score was NYM 9–MIA 4 and the original ticket was Mets ML +108. Gary's Take discussed Tong/Pérez, while The Arms discussed Manaea/Alcantara.

Read-only stored evidence distinguishes two games:

| Accepted board date | Exact BDL game | First pitch UTC | Stored starters/report |
| --- | --- | --- | --- |
| 2026-09-07 | 5059929 | September 7, 17:10 | Jonah Tong / Eury Pérez |
| 2026-09-08 | 5059941 | September 8, 22:40 | Sean Manaea / Sandy Alcantara |

The original September 7 daily-picks metadata has game ID 5059929 and the matching start. Its serialized content mentions Tong/Pérez and does not mention Manaea/Alcantara; the audit queried those booleans, not private rationale text. Stored historical board content is coherent. No ticket, rationale, pick, grade or backend data correction was needed.

The native game page loaded `TodayBoardCache.get()` in an unkeyed task, then chose a board row by team names. Related Player Intel fetched today's rows; the lineup player carousel also fetched a player-only pack from today. Yesterday's missing-ID fallback could consult today's slate, and the landing connections accessor did not exclude Yesterday.

## Repair

- `ScoutTrio.swift` carries the accepted slate date, league and positive provider game ID together. A scouting row must match all three and be unique. A wrong or missing historical identity leaves optional context unavailable. Starters and forecasts require the exact row's game-time bucket even when only one candidate exists.
- `PicksTab.swift` passes the store's accepted Today/Yesterday date, keeps board/wire caches separate by date, rejects a mislabeled board response and retains only same-date cache fallback after failure. Existing refresh intervals remain intact. Yesterday cannot borrow today's slate ID or today's landing connections.
- `FootballGameIntelView.swift` receives the selected date for news selection and its Player Intel child. Injury selection priority, duration, labels and interpretation remain unchanged.
- `MLBGameIntelView.swift` forwards the selected game and accepted player-intel date into lineup player cards. A pack needs exact league, game and player identity; duplicate matches fail closed. The lineup's actual calendar date remains separate from the accepted app slate date.
- Game, player and carousel async loads clear and mask old state by their current scope. Request tokens reject late completions, including A → B → A navigation. Unknown scope never defaults these contextual reads to today.

No model, prompt, publication, injury policy or backend behavior changed. No production generation, grading, notifications or provider mutation was run.

## Verification

The new `iosHistoricalGameContext.test.js` compiles extracted production Swift with `-O` and executes the actual scoped selectors, caches and async loading methods. `ios/Tests/HistoricalGameContextTests.swift` supplies only transport/view-state collaborators. It covers exact games 5059929/5059941, doubleheaders, missing IDs/date-only pages, wrong-date responses, accepted midnight/6 AM slate transitions, empty/failing reads, concurrent shared cache requests, late responses and exact lineup player routing.

Final focused evidence is 63 passing cases across seven suites, recorded in serial passes: the four existing routing/player/weather/exact-ID suites, the two-case new optimized suite, and the three historical-score/Hub-day cases. The first broad focused attempt recorded three compile timeouts rather than assertion failures. The new test now extracts the actual `sameLeague` method instead of an unused college table. The two unrelated harnesses preserve their shipping MLB/NFL selector bodies and every assertion while trapping if they enter the unexercised NCAAF collaborator; no college mappings are invented. Their optimized rerun passed in 14.44 seconds. These tests make no new claim about NCAAF team-map coverage.

An independent agent reviewed all four source diffs, replayed seven historical/player/weather cases successfully, parsed the four Swift files and checked whitespace. Root independently confirmed the same source hashes before approving integration. No remaining concrete source defect was found in this scope.

Logs:

- `/Volumes/KINGSTON/gary-915-historical-context-focused.log`: initial serial run; four suites pass, three optimized compile deadlines recorded.
- `/Volumes/KINGSTON/gary-915-historical-context-execution.log`: final new optimized fixture, 2/2 pass.
- `/Volumes/KINGSTON/gary-915-historical-context-adjacent.log`: final historical-score and Hub-day fixtures, 3/3 pass.
- `/Volumes/KINGSTON/gary-historical-context-independent-review.log`: independent 7/7 replay and source review evidence.

Sanitized live evidence: `/Users/adam.preda/Documents/ChatGPT/Gary/launch-readiness/915-historical-game-context-evidence.json`. Original UI evidence is under `/Users/adam.preda/Documents/ChatGPT/Gary/account-guard-915-2026-09-08/capture-integrity/`.

Frozen native SHA-256:

| File | SHA-256 |
| --- | --- |
| ScoutTrio.swift | `8af9e477d31334352f43d5862993026d173cff16e4dab204ad52bc569ee0f209` |
| PicksTab.swift | `8ff7255b82d971c4c348942aff285c7ed0b8e1f649ed9ad313525e9e33df8725` |
| FootballGameIntelView.swift | `08ff7990c676526d103b37be53e148b1b87947d111381714b05382dc75381da6` |
| MLBGameIntelView.swift | `466928bf2cce72c90450ee9587c38459cdcbc1f1a2b1e6ff8db775c166630b3e` |

## Subsequent acceptance — September 8, 2026, 16:29 UTC

The final installed version 2.25/build 915 simulator executable is `f3217e7d01382e660fdffe46ef5d5733592be3803e4d9dfebd86388d6d04f0dd`, built from frozen source `41793ededc47a1934a3c2ef09fb2a5608822bed1`. Root's 16:24 UTC review of the release owner's actual screenshots and accessibility evidence confirms:

- Yesterday September 7 → NYM @ MIA shows final NYM 9–MIA 4, Mets ML +108, Tong/Pérez starter cards and a Tong/Pérez Arms report.
- The historical Jakob Marsee card visibly shows the Tong-specific read, right-handed split `.221 AVG / .670 OPS`, 8 HR in 357 AB, and the matching left-handed split. Eleven checks against the unique stored September 7/game 5059929/player 2618564 pack passed, with zero mismatches or unavailable values. Recent-game and pitch-mix fields below the captured viewport were confirmed through the saved accessibility tree, not a successful physical scroll.
- Returning to Today September 8 shows NYM @ MIA at 6:40 PM Eastern, Picks Incoming, and the distinct Manaea/Alcantara starters and Arms report. The separate September 8 Marsee pack is available and materially different; the historical card did not borrow it.

Root's 16:29 UTC independent archive review passed for `/Volumes/KINGSTON/Gary-2.25-915-Account-Guard-FINAL.xcarchive`: version 2.25/build 915, strict/deep signature validation, all 129 public build inputs unchanged, and all 21 privacy manifests identical to the verified build 914 manifests. The signed executable SHA-256 is `b6a553295ed11d0e923ecda3e8ca6959752ded3095e0c2b0bc4dd789782368ae`.

Acceptance receipts, relative to `/Users/adam.preda/Documents/ChatGPT/Gary/`:

- `account-guard-915-2026-09-08/root-historical-installed-ui-review.json`
- `account-guard-915-2026-09-08/root-final-archive-independent-review.json`
- `launch-readiness/915-historical-marsee-pack-match.json`

The earlier source/test evidence above remains the implementation record. Installed historical/current context and the signed archive are now verified. Upload is underway; successful delivery and Apple processing, the final screenshot set, physical-device acceptance and manual empty-Winners bottom-scroll acceptance have not yet passed. This bounded repair does not establish overall launch readiness.
