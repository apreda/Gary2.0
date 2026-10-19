# gary — the pick system

A game pick: desk (`agentic/scoutReport/`) → research assistant (`agentic/orchestrator/researchBriefing.js`) →
awareness (`agentic/constitution/`) → both cases → decision (`agentic/orchestrator/agentLoop.js`) → the bet step
and card (`../winners/`) → publication (`gamePickPublication.js`). Models and their order:
`agentic/orchestrator/subscriptionRoutes.js` (Claude subscription → API credit → GPT logins).

- `agentic/scoutReport/sports/<league>.js` builds each desk; shared pieces in `scoutReport/shared/` (data fetchers
  split by area in `dataFetchers/`, the tale of the tape). Articles as written: `nflArticlesAsWritten.js`,
  `ncaafArticlesAsWritten.js`, `nbaArticlesAsWritten.js`, `mlbPressAsWritten.js`.
- `agentic/tools/statRouters/`: Gary's stat tokens (`index.js` routes; `nba/`, `mlb/`, NFL and college fetchers).
  `agentic/tools/mcp/` serves tools to CLI models (NBA-only tools are gated to NBA sessions).
- `agentic/mlbJuneEra/` is the frozen June 15 2026 MLB engine: bug fixes only, guarded by
  `tests/services/agentic/mlbJuneEra.test.js`. `agentic/orchestrator/nbaWinningEra.js` pins the April 8 2026 NBA prompts.
- `pickdesk/`: the props desk (`propsBrain.js`, `propModel.js`, `nflPropModel.js`, sheets) and game-desk helpers.
- `darts/`: the darts board, screen, scratch and grading; counts scale with the slate (`dartsCommon.js` `dartCounts`).
- Plumbing: `marketTruth.js` (priced lines), `standardPropMarkets.js` + `verifyPropQuotes.js` (a prop is the book's
  standard market), `pickDataIntegrity.js` (a required read that fails fails the pick), `lineWatch.js`.

Change words Gary reads only with Adam's sign-off on the exact text.
