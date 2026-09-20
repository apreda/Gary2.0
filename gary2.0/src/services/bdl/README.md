# Ball Don't Lie provider ownership

Consumers import `../ballDontLieService.js`, the stable public service object.
The former `../ballDontLie/index.js` entry aliases that same object. Endpoint
methods are installed on the public object, so `this` calls, test spies and
single-flight work continue to share the same state.

| Responsibility | Owner |
| --- | --- |
| API key, HTTP deadline, cache, retry and SDK construction | `transport.js` |
| Cross-process pacing / allowlisted disk cache | `../bdlRequestGate.js`, `../bdlSharedCache.js` |
| Complete-page collection / response decoding | `../bdlPagination.js`, `../bdlResponse.js` |
| Same-window football request coalescing | `footballBatching.js` |
| Generic games / players / team statistics | `games.js`, `players.js`, `teams.js` |
| Sport-specific endpoints | `mlb*`, `nfl*`, `ncaafStats`, `nba*` |
| Provider odds routing | `odds.js` |
| NFL recent-log calculation | `nflLogSummary.js` (uses `../nflPlayerLogFacts.js`) |
| Historical NHL / college basketball compatibility | `nhl*`, `collegeBasketball.js` |
| Locked injury / availability implementations | retained in `../ballDontLieService.js` |

Do not create another service instance, per-family cache, retry ladder or rate
limiter. Preserve missing/error behavior; an unavailable feed is not an empty
healthy roster. Reuse the pagination and decoding helpers when changing an
endpoint. Public method names must be unique across all groups; the duplicate
method regression test covers both literals and composition. Backend lint
checks this directory for unresolved identifiers and structural JavaScript errors.

The September 19 extraction preserved all 109 endpoint method bodies verbatim.
Subsequent changes should be narrow behavior changes with endpoint tests, rather
than copying a family into another provider implementation.
