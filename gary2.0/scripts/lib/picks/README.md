# Game runner boundaries

The executable remains `scripts/run-agentic-picks.js`. These modules separate
discovery and publication inputs from the decision loop:

- `calendar.js` delegates exact kickoffs to the canonical league date policy.
  NCAAF uses its 6 a.m. Eastern playing-date cutoff; other current leagues use
  the Eastern calendar day. Missing or date-only kickoff values stay missing.
- `window.js` selects explicit dates, daily games, NFL weeks and playoff windows.
- `discovery.js` fetches upcoming games, recovers an exact saved slate, applies
  current college coverage/metadata and honors CLI identity/matchup/time limits.
- `slate.js` owns exact saved-slate reads and live-versus-opening market merging.
- `odds.js` preserves provider quote values and formats pick-side comparisons.
- `stats.js` shapes tool observations into card rows and owns their shared key map.
- `storage.js` owns dry/test routing, publication readiness, pregame retry checks,
  weekly/daily writes and durable spool confirmation.

The production runner supplies provider/database services. Importing the
modules does not generate picks or access production. `pickDiscovery.test.js`
tests the actual boundaries with fixtures, including both DST transitions,
after-midnight college games, the 6 a.m. cutoff, exact IDs and missing prices.

The sport list in `pickRunSports.js` rejects retired NHL/NCAAB generation before
provider initialization. Unreachable NCAAB bracket/conference discovery and the
unused fallback predicate were removed from the executable. Historical provider
readers and reference catalogs remain available.

The June decision engine, April NBA prompts and protected injury handling are
unchanged. The remaining decision and publication coordination stays in the runner.
`pickShapingStorage.test.js` tests the real storage factory against a temporary
outbox, including partial failures and a game starting before a retry.
