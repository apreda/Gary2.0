# NFL Sunday recovery — September 13, 2026

Adam returned after the laptop lost power and requested that Gary work for the
first NFL Sunday. The date is Sunday, September 13, 2026, Eastern time. This
receipt covers operational recovery; the September 12 completion, social audience,
and build-929 handoffs still govern product policy and release status.

## Verified at 10:35 a.m. Eastern

`node scripts/morning-health.js --date 2026-09-13 --json` reports **ok** at
`2026-09-13T14:34:44.720Z`. This is a time-stamped observation, not a guarantee
that every later scheduled job has already completed.

| Area | Production observation |
| --- | --- |
| Today's board | All 28 games: 13 NFL and 15 MLB; no game lacked both spread and moneyline prices in the initial check. |
| NFL research | 73 rows across all 13 games; the normal insights job continues enriching the feed. |
| NFL player cards | All 13 games covered; no due games missing or partial. |
| NFL league tabs | Three current-date tabs, newest written at 10:34:12 a.m. ET. |
| NFL Wire | Six current-date items from the repaired subscription path. |
| NFL Fantasy | Seven validated decisions published by the normal owner. |
| NFL game picks | Three of 13 published at this checkpoint; all other games remain pregame, none within the final 30-minute retry window. |
| NFL props | The Saints/Lions and Buccaneers/Bengals jobs stored four picks each; further jobs continue normally. |
| MLB | 71 research rows across all 15 games, player cards for all 15 games, four Wire items, eight recovered Fantasy decisions. |
| MLB game picks | Rockies/Tigers published; the other 14 games remain pregame. First pitch is 12:10 p.m. ET. |
| Yesterday's results | All 23 saved September 12 game tickets have exact-game grades and matching recaps. Missing historical picks were not invented or backdated. |
| Website | Home, Picks, Winners, Results and Hub returned HTTP 200. Browser verification confirmed the three NFL cards, a full Saints rationale on card flip, and refreshed Hub research including an NFL section. No browser console errors were recorded. |

The public site's ten-minute data cache initially showed the empty morning
board. It refreshed to the actual stored picks and research without a web
code change. `/nfl` is a valid permanent redirect to `/picks/nfl`, not an outage.

## Repair shipped

Commit **5e1d5d52**, pushed to `origin/main`, repairs Wire source receipts:

- The installed Codex CLI emits native browser opens as completed `web_search`
  events with the exact URL in `item.query` and `action.type = other`. It omits
  search-result URL lists. Wire previously recognized only object `url` fields,
  so it rejected every NFL item despite successful search output.
- Wire now asks the search transport to open each exact cited URL and recognizes
  those completed native-open events. URLs merely appearing in generated final
  prose, ordinary text queries, and unfinished legacy opens are not accepted.
  This captures source provenance; it is not an independent factual assessment
  of every article claim.
- The existing Anthropic search fallback previously discarded its result blocks,
  leaving Wire without source receipts there too. It now returns the actual
  search-result blocks across pause continuations. The provider order and
  cancellation budget remain unchanged.
- Existing team/slate, recap-stat and same-book movement gates remain in force.
  No game/prop decision prompt, frozen June logic, model selection, billing setting,
  or database schema was changed by this repair.

Validation: four focused Wire/search/storage suites passed **18 tests**;
the frozen June suite passed **20 tests**. A normal NFL run initially timed out
on the subscription provider and recovered four sourced items through its
existing API fallback. The subsequent full Wire recovery completed on the
subscription path, storing four MLB, six NFL and eight NCAAF items. No NBA games
or recent graded games existed, so its empty feed was retained.

The full Wire recovery used a bounded one-run allowance:

```sh
GARY_WIRE_TIME_BUDGET_MS=360000 GARY_CAP_WIRE=390 \
  node scripts/run-daily-content.js --date 2026-09-13 --stages wire
```

It completed in 149.6 seconds and recorded a successful `wire` stage, superseding
the failed morning attempt. No persistent timeout configuration was changed.
One bounded MLB Fantasy retry also succeeded after the initial owner rejected
unsupported generated claims. Its validators were preserved.

## Remaining day's schedule and operating constraints

The scheduler and independent Winners worker restarted around 10:14 a.m. ET,
before this investigation. We allowed active jobs to finish instead of restarting
them again. It has three NFL workers and advances each game into its prop job.
At this checkpoint it has moved on to further 1 p.m. games. Later games follow
their normal trigger and retry windows; they should not be called failed merely
because they are not published at 10:35 a.m.

Production `winners_daily_plan('2026-09-13', 'NFL')` is available and returns a
target of **four**: two places for the eight 1 p.m. games, one for the four
4:25 p.m. games, one for the 8:20 p.m. Cowboys/Giants game. The first comparison
window opens at 11:30 a.m.; required normal coverage is due by noon when valid
tickets are available. The current `daily-curation-v2` policy remains unchanged.
Do not force premature admissions, sample until a desired grade appears, or
manufacture tickets to fill reservations.

The normal X poster remains on its 15-minute cron, with the September 12 audience
selection and T−5 through T−120 eligibility rules. No test tweet was sent.
A concurrent task shipped reporting/recap changes in `7dc7a951`; production
truth observed `social-auto-post` v111 deployed at 10:31 a.m. ET. Marketing launch
remains September 20. Do not publish postponed campaign announcements today.

The Mac is on AC power with its existing keep-awake assertions active. Local
workers still require the Mac to stay powered and available. No host settings
were changed. Before diagnosing a later gap, inspect the actual owning job,
dated logs and stored coverage; old stderr contains historical quota failures.

## Evidence and release boundary

Local receipts from this run are under `/tmp/gary-sunday-20260913-*`, especially
`health-after.json`, `wire-recovery.log`, `wire-tests.log`, `june-tests.log`,
`mlb-fantasy.log` and `production-progress.log`. Durable stage evidence remains
in `~/Library/Logs/Gary2.0/daily-content-stages.jsonl` and the normal scheduler,
Fantasy, results and live-score logs.

`production-truth.js` confirms the production checkout, Sol game/MLB and Luna
prop configuration, current June era `ddea440c3b63`, no unpushed source at its
check, and deployed edge timestamps. Its overall parity result remains flagged
because other native/performance work is uncommitted, including the explicitly
protected local `GoogleService-Info.plist`. Edge timestamps do not establish
byte-for-byte deployed source equality. Preserve those unrelated changes.

No iOS archive, TestFlight upload or App Review action occurred during this
recovery. Do not infer Apple acceptance or physical-device sign-in from this
backend/web health check. Follow the build-929 handoff and inspect current Apple
state before any later release action.
