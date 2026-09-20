# Runtime architecture and ownership

Current map: September 19, 2026. Instructions in root `AGENTS.md` and
`gary2.0/CLAUDE.md` are authoritative; dated handoffs are receipts.

## Execution surfaces

| Surface | Entry points | Responsibility |
| --- | --- | --- |
| Local scheduler | `gary2.0/scripts/scheduler.js` | Builds per-game schedules, invokes fresh child processes and records health |
| Game picks | `scripts/run-agentic-picks.js` | CLI selection, research coordination, model routing, publication |
| Props | `scripts/run-agentic-{mlb,nfl}-props.js` | Sport props desk and atomic game publication |
| College | game runner / NCAAF lane | Sol game decision with at most one eligible prop; standalone college prop desk parked in scheduler |
| Results | `scripts/run-all-results.js`, `run-results-for-date.js` | Exact game/prop settlement, recaps and dependent summaries |
| Morning content | `scripts/run-daily-content.js` | Ordered slate/content stages and storage-outage recovery |
| Winners worker | independent `com.gary.winners` LaunchAgent | Server-owned admissions; does not block pick scheduling |
| Cloud | `gary2.0/supabase/functions/`, applied migrations | Edge APIs, score/grade workers, auth/commerce and server data |
| Web | `web/app/`, `web/components/`, `web/lib/` | Next.js routes, presentation and typed server/client adapters |
| iOS | `ios/GaryApp/GaryApp.swift`, `ContentView.swift` | Native navigation, shared stores, models and feature views |

Backend paths in this document are relative to `gary2.0/` unless qualified.
The Mac scheduler and independent workers run from the canonical checkout.
A fresh pick child imports current disk code. Long-running processes retain
loaded modules and must be restarted when their loaded implementation changes.
Cloud sources do not take effect until deployed; an iOS source commit is not
a TestFlight delivery.

## Data and decision flow

1. Provider adapters fetch dated schedules, teams, players, stats and market
   quotes. `src/services/ballDontLieService.js` is the public BDL boundary;
   its `bdl/` modules share one transport/cache and the existing pagination,
   response decoding, request gate and cross-process cache helpers.
2. `src/services/agentic/scoutReport/` assembles attributed evidence. Missing
   optional evidence remains missing. `pickDataIntegrity.js` carries actual
   provider failures through a run, including legacy paths returning arrays.
3. The common `agentic/orchestrator/` handles supported game lanes. MLB enters
   `agentic/mlbJuneEra/`, the frozen June tree. NBA retains its April prompts.
   Subscription routing belongs to `orchestrator/modelCascade.js` and the
   game routing helpers; college remains on Sol.
4. Publication helpers and database constraints retain exact game identity,
   market, side, line and quoted price. Published predictions and original
   evidence are immutable; a display fix never rewrites their history.
5. Results use shared settlement policy and exact player/game identity.
   Native and web consume published rows and server Winners admissions.
   Display state must not silently reinterpret missing data as zero or healthy.

## Canonical policy owners

| Policy | Location |
| --- | --- |
| Calendar keys / Eastern slate dates | `supabase/functions/_shared/dateKeys.js`, `src/utils/dateUtils.js` |
| Football kickoff and playing-date identity | `src/services/{nfl,ncaaf}GamePolicy.js` |
| MLB live status | `supabase/functions/_shared/mlbGameStatus.js` |
| Game settlement | `supabase/functions/_shared/gameSettlement.js` |
| Football result identity / coverage | `scripts/lib/resultsGradingReliability.js` |
| Provider requests / caching | `src/services/bdl/transport.js` and existing `bdl*` helpers |
| Team identity | `src/services/teamIdentity.js` |
| Publication and run recovery | `scripts/lib/pickRunReliability.js`, `src/services/picksService.js` |
| Scheduler policy | `scripts/lib/schedulerPolicy.js` and adjacent scheduler helpers |
| Native shared data state | `ios/GaryApp/SharedStores.swift`, `SupabaseAPI.swift` |
| Native feature presentation | `HubView.swift`, `HomeView.swift`, `PicksTab.swift`, `UserBookView.swift` |

A calendar date is not an instant. Provider game IDs must survive doubleheaders
and delayed starts. The cleanup extracts these owners rather than introducing
new parallel rules on each client.

## Boundaries and exceptions

The old `src/services/ballDontLie/index.js` now aliases the canonical service.
Its unused injury modules and their core dependency remain at their original
paths under the explicit injury-code lock; they must not become new runtime
imports. Historical NHL and NCAAB provider methods remain compatibility reads,
not active pick lanes. NBA remains seasonal. Do not infer deletion safety from
an inactive sport alone: history, readers and fixtures may still use its schema.

`agentic/mlbJuneEra/` and pinned prompts are intentional freeze boundaries.
`GaryMockFixture.swift` and team catalogs are fixture/reference data, so their
line counts are not evidence of tangled runtime ownership. Applied migrations
and dated handoffs are history, not competing current configuration.

## Verification and delivery

Use focused behavior tests while extracting, then root `npm run verify`.
The existing Verify workflow also runs Apple framework tests and web fixture
and sitemap smoke tests. Native feature changes need a real Simulator build,
visual inspection where layout changes, a signed release archive, upload and
Apple's TestFlight confirmation. Provider tests use fixture responses; they do
not rerun Gary or write production picks.

`production-truth.js` checks daemon folders, disk era hashes, Git state and
edge deployment timestamps. Timestamps establish deployment recency, not a
byte comparison of deployed source. Keep that limitation explicit in receipts.
