# NFL market awareness — September 21, 2026

Adam authorized adapting the historical NBA better-bet logic for NFL, with Jev
assessing possible situations before Gary's decision. He explicitly declined a
historical comparison/evaluation system and will judge the picks himself.

The question is now exactly:

> What's the best bet at the posted number and price, and why?

Both posted spread and eligible moneyline choices remain available. The original
single-answer flow, original rationale and factual/market integrity rules remain.

## Decision behavior

- NFL awareness now includes last week's contrasting performances, recent
  blowouts, reputation, possible overreaction, possible underreaction and
  reasonable adjustments to genuine changes.
- A qualitative judgment needs neither a predicted score/fair spread nor betting
  splits, a measured line move, a special statistic or certainty. Actual claims
  about betting flows and movements still require evidence.
- The researcher surfaces the contrast and continuing/game-specific circumstances
  for both teams. Gary decides what they mean for the ticket.
- This follows CLAUDE.md's awareness/investigation layers. No factor assigns a
  side, no favorite/underdog quota exists, and no point adjustment is prescribed.

## Jev before the NFL decision

`src/services/jev/nflMarketAssessments.js` uses the shared `jev/client.js` created
by the separate props integration task. This task did not edit that client or
any prop integration code.

One request asks seven independent questions: last-game contrast; a tentative
reaction hypothesis for each team; continuing versus game-specific circumstances
for each team; and a useful source for each team's assessment. Possibilities
include excessive positive/negative reaction, insufficient recognition of
improvement/deterioration, a reasonable adjustment, and unclear evidence.

The request uses bounded excerpts from the original desk and research briefing,
plus the exact current quotes. Reporting retains its title, URL and date when
supplied. Shared-article references resolve back to the original article. The
full original desk and research remain visible to Gary. No new market feed,
fair-spread model, line-timing scheduler or backtest infrastructure was added.

Jev's text is inserted in the NFL-only branch of `agentLoop.js`, after research
and before the final question. It supplies possible situations, not a bet or a
cover probability. No classification-confidence cutoff governs picks. An
unavailable assessment leaves the original decision evidence intact; whole-game
cancellation still propagates. The shared client supplies its bounded request
timeout/retry, response validation and private request/response receipt.

The returned NFL context includes the assessment and receipt ID; console output
links the receipt to the game. New source files are included in NFL's source
fingerprint. NCAAF's hash also moves because the shared orchestrator source is
hashed, but this task changes only NFL behavior.

## Activation and delivery boundary

The canonical checkout is `/Users/adam.preda/Gary2.0`, main. These edits are saved
there for subsequent fresh NFL pick workers. `run-agentic-picks.js` loads the
backend environment, and the scheduler starts a fresh script per game attempt;
no scheduler restart is required for these module changes.

The existing backend TypeSafe credential was confirmed present without exposing
its value. This NFL assessment is enabled by default outside `NODE_ENV=test`.
`GARY_JEV_NFL_MARKET_ENABLED=false` (also `off` or `0`) disables it specifically;
the global `GARY_JEV_ENABLED=false` switch also disables it. Prop league settings
do not turn NFL game context on or off. A missing key produces an unavailable
assessment instead of failing a pick. No environment file was edited here.

At the initial implementation handoff, no live Jev request or newly generated
pick had been run. A completed production decision using this context has not
been observed. No test suites were added or run. Three existing literal NFL question expectations were updated to
match the authorized wording; MLB/NBA/NCAAF expectations were preserved. Changes
were reviewed in source. No push, release, build, daemon restart, database change
or historical-pick rewrite was performed. Unrelated working-tree work remains.

NBA's pinned April prompts, MLB's June game lane, NCAAF decisions and injury
handling/labels are unchanged by this task. CLAUDE.md records the new NFL wording
and preserves its Layer 1/2/3 policy.

## Authorized single replay — September 21 follow-up

Adam then requested replaying the September 20 Colts at Chiefs matchup to inspect
the selection and rationale. One completed replay is saved at
`/Users/adam.preda/Documents/ChatGPT/Gary/nfl-market-replay-2026-09-21/`.
`result.md` contains the full rationale; `complete-replay.md` contains every
application-visible prompt and response; `manifest.json` records frozen-input
hashes and the run; `jev-request-response.json` contains Jev's exact receipt.

The original pregame desk, researcher briefing and tool-result messages were
verified against the original capture hashes and reused with the current NFL
single-answer prompts, market awareness and Jev helper. The original Gary model
(`codex-gpt-6-astra`) was retained. The researcher was not regenerated. Web,
shell, apps and plugins were disabled; no current stats, odds or reporting were
fetched. No original Gary rationale, desired side or actual game result was
supplied. The replay script has no pick-publishing/database path.

Jev completed in 594 ms with 9,330 billed input tokens. It identified the
good-Chiefs/poor-Colts contrast and possible overreaction to the Colts' poor
opener; its top Chiefs interpretation was a reasonable adjustment. Gary selected
**Indianapolis Colts +6.5 -120**, stated confidence **0.56**, versus the original
**Kansas City Chiefs -6.5 -102**. His full explanation weighs the opener contrast,
game-specific circumstances, matchup support, counterarguments and exact price.

This demonstrates the requested reasoning in one retrospective replay. It does
not isolate Jev's causal contribution or establish predictive accuracy. Model
prior knowledge is not independently inspectable. No reroll, historical
benchmark, production rewrite, push or release occurred. AGENTS.md and CLAUDE.md's
props paragraph were also reconciled with Adam's separately authorized NFL game
context so the two integrations' documentation no longer contradicts itself.
