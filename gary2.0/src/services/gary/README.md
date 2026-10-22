# gary — the pick system

A game pick: the desk (`agentic/scoutReport/sports/<league>.js`) → the research assistant
(`agentic/orchestrator/researchBriefing.js`) → the sport's decision (below) → the bet step and Winners (`../winners/`)
→ publication (`gamePickPublication.js`). Models and their order: `agentic/orchestrator/subscriptionRoutes.js`
(Claude subscription first, then the GPT logins; no DeepSeek behind Gary). Gary is Opus.

## The decision, by sport
- **NFL** (new system, Oct 19 2026): `orchestrator/nflRead.js` decides what Gary reads and in what order and asks the
  question; `orchestrator/nflKnowledge.js` is what he knows about NFL markets. The bettor's data is
  `../sports/nfl/nflBettorData.js`; the last three seasons `scoutReport/sports/nflLastSeasons.js`.
- **College football** (Oct 21 2026, the NFL treatment): `orchestrator/ncaafRead.js` with `orchestrator/ncaafKnowledge.js`,
  college's own copy (a change to the NFL never reaches it), with its own news desk (`nflResearchPrompts.js`).
- **NBA** (Oct 21 2026, the NFL treatment): `orchestrator/nbaRead.js` with `orchestrator/nbaKnowledge.js`; ratings and the
  season game by game from `../sports/nba/nbaBettorData.js`. Before a team's first game its desk carries BEFORE THE
  FIRST GAME (`../sports/nba/nbaOpeningNight.js`). `GARY_NBA_SYSTEM=april` runs the April 8 2026 prompts
  (`orchestrator/nbaWinningEra.js`) through `orchestrator/agentLoop.js` instead.
- `orchestrator/footballDeskText.js` is the desk-reading plumbing the three reads share.
- **MLB**: `agentic/mlbJuneEra/`, the frozen June 15 2026 engine: bug fixes only, guarded by
  `tests/services/agentic/mlbJuneEra.test.js`. Postseason games go to `mlbJuneEra/playoffQuestion.js`.

## The research assistant
`researchBriefing.js` investigates the desk factor by factor before Gary decides. Its time comes from
`optionalResearch.js` (`researchBudgetMs`); if it runs out, the whole briefing is dropped and Gary decides on the desk.
How many factors run at once is `orchestrator/footballResearchPolicy.js`: the NFL runs one researcher; MLB and the NBA
run three at once on the subscription session (`'subscription-cascade'`, the live provider name).

## The rest
- `agentic/tools/statRouters/`: Gary's stat tokens (`index.js` routes; `nba/`, `mlb/`, NFL and college fetchers).
  `agentic/tools/mcp/` serves the tools to the CLI models (NBA-only tools are gated to NBA sessions).
- `pickdesk/`: the props desks (`propsBrain.js`, `propModel.js`, `nflPropModel.js`, `nbaPropsDesk.js`, the sheets).
- `darts/`: one board per league (`mlbDartsBoard.js`, `nflDartsBoard.js`, `nbaDartsBoard.js`) plus the shared brain,
  screen, scratch, form and grading; counts scale with the slate (`dartsCommon.js` `dartCounts`). Darts are not on
  Winners.
- Plumbing: `marketTruth.js` (priced lines), `standardPropMarkets.js` + `verifyPropQuotes.js` (a prop is the book's
  standard market), `pickDataIntegrity.js` (a required read that fails fails the pick), `lineWatch.js`.

Change words Gary reads only with Adam's sign-off on the exact text (NFL and college logic are Claude's to decide).
