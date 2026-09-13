# Native performance review — September 12, 2026

Adam requested a hard performance review and reported the wrapping date on
Home's Boston College/Rutgers recap. This review covers native rendering,
navigation, live updates, retained tabs, formatting and loading ownership.
Build candidate: 2.25 (930). It is not yet delivered to TestFlight.

## Findings and fixes

| Priority | Finding | Evidence and action |
| --- | --- | --- |
| High | Picks repeatedly resolves provider game identity during rendering. | The 929 navigation sample spends 3,856 of 8,022 main-thread samples inside `stripBlock`; 2,633 include `bdlGameId`. Each block requests identity again for abbreviations, score and interruption labels. Cache resolved and unresolved IDs when accepted content changes. Scope the cache to content revision, loaded date, sport and Today/Yesterday. Preserve the original resolver for pre-memo navigation. |
| High | The horizontal selector constructs every game block eagerly. | The original `HStack` runs the expensive row builder for offscreen games as well. It is now a `LazyHStack` with an explicit, single scroll target on each game block. Page ordering remains stable through score changes. |
| Medium | Looking up a game's league scans and parses the slate even though every branch returns the active league. | The 929 sample includes 1,223 main-thread samples in `league(for:)`. All successful branches require equality with the active sport, and the fallback returns that sport. Read that existing scope directly. |
| High | Home recompiles roughly 90 regular expressions per formatted pick. | The second runtime sample exposed `shortenTeamNamesInPick` as a Home hotspot. Its city-removal and following-word patterns, plus odds and market-suffix patterns, are now immutable static instances. A compiled comparison against the original source produced identical output for 17 cases: 1,407 original compilations versus 93 first-use compilations and zero warm compilations across 3,400 calls. |
| Medium | Billfold refreshes on foreground even while another tab is visible. | A retained Billfold called `loadData()` on every active scene transition, rebuilding its ledger and supplementary calculations offscreen. It now remembers a deferred refresh and performs it when Billfold becomes visible. Ordinary tab switching does not introduce another refresh. |
| Low | Home's once-per-second countdown remains scheduled while its retained tab is hidden. | The timeline now exists only while Home is active and the app is foregrounded. Returning reconstructs the countdown from the original target date. |
| Visual bug | The recap date wraps after the month. | Two independently laid-out labels compete with the flip glyph inside a narrow column. League and date now form one compressible, single-line label. The exact Boston College/Rutgers recap visibly reads `NCAAF · SEP 11`; its date value, final score, pick and card dimensions are unchanged. |

## Measurements and limits

Both navigation samples used the installed app in the iPhone 17 simulator,
with the same sequence of Home scrolling, NCAAF Picks pages, Hub, Winners and
Billfold, repeated twice. Sampling ran for 15 seconds at a requested 1 ms
interval. The commands change scroll offsets; they do not reproduce the
physical dynamics of a finger drag.

| Main-thread inclusive samples | Build 929 baseline | First candidate |
| --- | ---: | ---: |
| Total main-thread samples | 8,022 | 9,442 |
| `stripBlock` | 3,856 | 25 |
| `bdlGameId` | 2,633 | 2 |
| `parseISO8601` across all callers | 3,768 | 189 |
| `league(for:)` | 1,223 | 0 |

These are hotspot observations, not frame-rate or percentage-speed claims.
The process lifetimes, request completion times, live scores and machine load
were different. The first candidate preceded the regex and background-work
fixes. A Time Profiler attachment could not identify the simulator process;
an all-processes attempt stalled and was terminated. Neither produced a usable
Instruments trace. No physical iPhone was connected for profiling.

The deterministic optimized identity fixture makes 2,000 warm lookups with
zero timestamp parsing, including cached nil IDs. It verifies invalidation
for same-count content edits, another league, Today/Yesterday and rollover.
Existing tests retain exact-game navigation and doubleheader failure behavior.
The formatter regression also runs 3,500 concurrent calls against the shipping
functions and verifies no further pattern compilation, exact prices, school
names, Unicode and the existing store-safe bridge.

Local evidence:

- `/tmp/gary-perf-930-baseline.sample.txt`
- `/tmp/gary-perf-930-candidate.sample.txt`
- `/tmp/gary-930-format-benchmark.swift` and compiled counterpart
- `/tmp/gary-930-home-date.png`
- `/tmp/gary-930-strip.png`

## Remaining audit targets

1. **Launch fan-out and first-content latency.** `ContentView` mounts hidden
   tabs at 900 ms intervals. Home alone starts more than twenty independent
   reads; Hub and Picks add overlapping board/insight work. Source confirms
   this overlap, but there is no controlled cold-launch network trace yet.
   Measure first useful content and request duplication under a slow network
   before replacing UI prewarming with shared data prewarming. Preserve the
   existing independent-source failure and 6 a.m. ownership contracts.
2. **Hub player matching.** `researchPlayerIndex` rebuilds an array of player
   candidates for each destination label and tap. The candidate sample records
   108 main-thread samples in this path. A snapshot or index built when player
   packs are accepted is a possible next optimization; it must preserve exact
   game identity, missing payloads and ambiguous-name rejection.
3. **Retained view invalidation and rendering cost.** Home, Hub and Picks still
   observe the shared score cache while mounted. Polling already suppresses
   identical responses, but a real change can invalidate hidden views. Profile
   this on the phone with a full college slate and sustained scrolling. The
   grid, shadows and reveal effects need GPU/frame-time evidence before making
   a visual tradeoff.
4. **Long-session memory.** API cache entries have TTL checks but expired keys
   are not evicted automatically. Measure retained history and date-key growth
   across repeated slate transitions before choosing an eviction budget.

The above are specific remaining investigations, not claims that these causes
have been measured or fixed. The larger Home request graph, Hub matching and
API cache semantics were not rewritten during this pass.

## Verification and delivery

The first focused run passed 62 tests across five suites; the formatter
regression passed separately. An unrestricted full run alongside Xcode hit
Swift compiler timeouts under resource pressure and was stopped. A subsequent
bounded run and final native build results are recorded in the root handoff.
An intermediate countdown refactor missed an explicit return; the compiler
caught it and it was corrected before final build verification.

Apple account sign-in already blocks native distribution. An archive or source
push does not put this change on Adam's phone. Final archive, signing, upload
and production-audit status belong in `HANDOFF_2026-09-13_TESTFLIGHT_930.md`.
