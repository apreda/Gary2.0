# Gary — current project instructions

Production checkout: `/Users/adam.preda/Gary2.0`, main. Read root `AGENTS.md`.

## Adam's iteration rules — September 21, 2026

- Never show screenshots as proof or for review. Adam checks the actual app
  himself and tells us whether the output is correct.
- Do not add tests or run tests unless Adam explicitly asks. No automatic
  regression suites, smoke checks, or visual QA during ordinary edits. When he
  confirms the app output is correct, accept that as sufficient verification.
- Do not archive, upload or send builds to TestFlight until Adam explicitly
  requests it. Save the requested changes and batch release work when he asks,
  typically at the end of the day.
- Do not indirectly trigger tests or release workflows through a push; hold
  such pushes until he authorizes that work.

These instructions supersede older automatic testing, production-audit and
TestFlight-delivery requirements in this file, README files and skills.

Current sports: MLB, NFL and NCAAF. Retain NBA's pinned April 8 prompts and
seasonal features. NHL/NCAAB were retired August 27; World Cup UI is retired.

## Reuse the sport that already has the feature — September 21, 2026

A feature that already exists for one sport is the reference implementation
of that feature for every other sport. A request for it in a second sport is a
port of the existing system with the sport's nouns swapped, never a new design.
The sport that built it first is the reference for that feature: MLB's Arms
take for a starters write-up (the NFL quarterback box was rebuilt as a stat
template; that is the mistake), the NFL's touchdown lane for a scoring-play
lane elsewhere. Separate files per sport are fine; two designs for one feature
are not. A deliberate difference needs a sport-specific reason stated in the commit.
Shared-system changes ship to every sport that has the system, in one update.
Where a sport rebuilt something another sport already had, bring it back to
the reference.

## Current direction — September 19, 2026

- Adam authorized the college repair and resumption, then two native bug and
  performance passes per current page (MLB/NFL/NCAAF, excluding NBA), cleanup
  of obsolete code, and delivery to TestFlight. These are implementation
  instructions; another approval is not needed for the requested fixes.
- NCAAF: one game pick and at most one player prop per eligible game. Either
  team in ACC, Big Ten, Big 12, SEC or the current Pac-12 qualifies, as does
  Notre Dame. Boise State is intentionally included in the 2026 Pac-12.
- College game picks and props run Opus 5.5 (founder, Sep 22 2026: "all
  ncaaf picks should be on Opus not Fable or Astra"), on the Claude
  subscription, with the GPT Sol logins as the only recovery rungs.
- Effort (founder, Sep 23 2026): every model call runs at the effort its lane
  asks for, never a model-wide max. Game picks are the xhigh lane; nothing
  runs at max. Use the lightest model that does the job; Opus is for picks
  and Winners decisions.
- Supply dated rosters, named starting QBs, availability, coaches, transfers
  and attributed matchup reporting. Gary owns the prediction and may apply
  informed judgment; no favorite/underdog quota, prescribed conclusion, or
  statistic proving every opinion.
- Missing components remain visibly missing. Never pass off team passing
  totals as starting-QB analysis. Optional fields and wording preferences
  must not suppress a valid pick. Keep exact ticket identity and provider
  prices together; do not invent replacement quotes.
- No redundant AI reviews of Gary's writing or decisions. The unwanted
  five-minute AI repair automation was deleted; do not recreate it. Ordinary
  code failure reporting remains. Development checks verify mechanical
  behavior; they do not approve Gary's opinions.
- NFL Picks shows the current week's matchups and daily research before the
  day-of pick. Native surfaces use shared cards and immutable published
  tickets. Never rewrite a published prediction to make its result look better.
- MLB retains the June decision engine and its approved September 16 bullpen
  evidence repair. Preserve the June freeze and NBA prompts. The global xERA
  display ban remains; June's frozen decision input is the explicit exception.
- Winners reads the server board. Do not restore client-side admission or
  automatic favorite/underdog selection during UI maintenance.
- Preserve the earlier dark Picks research containers. Adam rejected the
  September 19 grey fill; keep the wrapping/layout fixes and solid dark NCAAF
  panels without changing the established container palette.

## Current system notes

The app (Sep 24 2026): Home, Winners, Darts, Picks, Billfold. The Hub, the
classic Winners page, the old Fantasy briefing, Talk to Gary and Gary's voice,
the slip scanner, Systems and the store-safe App Store bridge were deleted on
Sep 24 2026 (founder: "we're only moving forward"). Do not restore them from
git history. The root handoff notes were folded in here and deleted the same
day; git history keeps them as receipts, not instructions.

NFL game picks keep the single-answer agency flow. Its substantive ask is
"What's the best bet at the posted number and price, and why?"
The decision message opens with the bettor's frame ported from the NBA opener
and the June MLB decision paragraph: you are
picking which side of this spread to take; read the game the way a sharp
gambler does; find the read you would put your own money on. The constitution
names THE SPOTS (bounce-back, letdown, short week, divisional dog at home, the
side everyone is on) as facts about the week, never a lean. The desk carries
WHERE THE MARKET SITS: the exchanges' prices (Polymarket, Kalshi) on the same
sides from BDL's odds feed, beside the book line and its move since first
seen. Jev reports the crowd's lean and the line's move as classifications. No
fade-the-public rule, no distance threshold, no projected margin.
Last week's good-game/poor-game contrast, reputation and continuing changes can
suggest overreaction or underreaction. Gary does not need a calculated fair spread,
betting percentages, demonstrated line movement or certainty to make that judgment.
Jev supplies tentative situational assessments before Gary chooses; it does not
choose a side or turn classification confidence into a cover probability.
Adam will judge the resulting picks; no historical comparison or evaluation system
was requested. Football awareness is
declarative context, not assigned reasoning. There are no mandatory two-sided
essays, "Gary's Take" template, length target or subsequent rationale-writing
pass. Original evidence, research, tools, factual integrity and posted-market
constraints remain. A valid original rationale is stored unchanged; malformed
or provider-truncated output is a failed attempt, not a draft to rewrite.
MLB's June engine, NBA's April prompts and NCAAF behavior remain unchanged.

Jev (TypeSafe) integration, via `src/services/jev/client.js`:
- Props: MLB (`pickdesk/propsBrain.js`), NFL (`pickdesk/footballPropsDesk.js`)
  and NCAAF piggyback (`pickdesk/ncaafPiggybackProps.js`) get labeled role,
  workload and matchup assessments before Gary decides. Backend `.env`:
  `GARY_JEV_ENABLED`, `GARY_JEV_MODE=assist`, `GARY_JEV_PROP_LEAGUES`,
  `GARY_JEV_MODEL`. No post-answer critic, no automatic direction change.
- NFL games: `jev/nflMarketAssessments.js`, inserted in the NFL branch of
  `agentLoop.js` after research and before the final question. Disable with
  `GARY_JEV_NFL_MARKET_ENABLED=false`. An unavailable assessment leaves the
  original evidence intact.
- NCAAF games (Sep 25 2026, ported from NFL): `jev/ncaafMarketAssessments.js`,
  inserted in `agentLoop.js` before Gary's first turn. Disable with
  `GARY_JEV_NCAAF_MARKET_ENABLED=false`. The college desk also opens with THE
  LINE (every move beside dated game-week absences) like the NFL desk.
- Private receipts live in `gary2.0/logs/jev/`. Published props carry
  `jev.run_id`. Use the [TypeSafe skill](../.agents/skills/typesafe-ai/SKILL.md).

MLB props trial (founder, Sep 25 2026): the Sep 23 prop model (684ee41e) and
the Sep 24-25 sheet changes (2d34917b, 9788e9a8) are on trial. If MLB core
props do not improve on the Sep 2-22 baseline (286-191, 60%) within about
three weeks (review around Oct 16 2026), revert to the earlier system. Revert
points are tagged: `props-before-sep24` (the Sep 23 model, before the sheet
changes) and `props-before-sep23-model` (the formula screen behind the 60%).

Props markets: every published prop needs same-book standard-market
corroboration (`src/services/standardPropMarkets.js`, rechecked by
`verifyPropQuotes.js`); no corroboration means no ticket. Quotes keep the
original BDL price. The shared prop odds floor is −179.

MLB bullpen (the one authorized exception to the June freeze, Sep 16): the
June lane reads `src/services/bullpen/snapshot.js`, and the June era hash
includes the shared bullpen modules. Low pitch counts, an idle day or an IL
activation do not establish availability; unreported restrictions stay unknown.

Operations: the Supabase project has had intermittent database outages
(Sep 19 restarts). The Sep 24 2:07–2:47 PM ET outage was self-inflicted: a
Claude analysis script bulk-selected `winners_curation_runs.input_snapshot`
(every stored desk) over REST, PostgREST died and only a project restart
brought the API back. Never bulk-select `input_snapshot`, `evidence_snapshot`,
`pick_snapshot` or `daily_picks.picks` over REST; aggregate in SQL. UI
recovery handles a failed read.

Maintenance map: [architecture](../docs/maintenance/ARCHITECTURE.md) and
[checked data boundaries](../contracts/README.md).

- `src/services/agentic/orchestrator/agentLoop.js`: common decision sequence.
- `src/services/agentic/scoutReport/`: sport desks and evidence.
- `src/services/agentic/constitution/`: Gary's sport awareness.
- `scripts/run-agentic-picks.js`: generation entry; `scripts/scheduler.js`: scheduler.
- `src/services/agentic/orchestrator/modelCascade.js`: shared provider routing.

Native changes stay pending for Adam's review until he requests a release.
Public App Store submission is a separate action.

## Layer 3 Violations — The Only Rule That Matters

When writing or editing ANY prompt that Gary sees, think in three layers:

**Layer 1 - AWARENESS (What to notice):** Statements about what factors exist. OK.
**Layer 2 - INVESTIGATION (What to look at):** Questions Gary asks himself + stats to check. OK.
**Layer 3 - CONCLUSION (What it means for the pick):** NEVER. Any statement that links a factor directly to a pick conclusion is a Layer 3 violation.

Examples:
- LAYER 3 VIOLATION: "High pace = underdog can hang"
- LAYER 3 VIOLATION: "If shooting is above average, expect regression = fade them"
- LAYER 3 VIOLATION: "Rest advantage = easier cover"
- LAYER 3 VIOLATION: "A gap between data and line = edge"
- LAYER 3 VIOLATION: "Home court is worth 3-4 points"

Gary WILL follow explicit if/then rules — he takes instructions literally. If we write "Fast pace helps underdogs stay close," Gary will pick underdogs in fast-paced games without investigating whether it's true for THIS matchup. Never tell Gary what a factor means for the pick. Never assign point values to factors. Never label something as "edge." Gary investigates and concludes on his own.

## Visual decisions

Read [`design.md`](../design.md) first: the short list of rules Adam has set
explicitly (no filled oval bubbles, no internal tags or machine dates in
reader copy, one design per component across sports, the floating dock).

Use Adam's current request. The old design guides, palette/font mandates,
layout prescriptions and aesthetic memories were deleted at his request on
September 8, 2026. Do not restore them from history or treat existing code
and screenshots as mandatory styling. This creates no replacement style
rules. Operational, data-integrity and accessibility requirements remain.

Behavior vs. visuals: prop-slip grouping remains intact. Winners admission now comes only from the immutable server board (founder GO, Sep 4 2026), not local confidence/start-time selection. Home retains its featured games. Do not reintroduce automatic first-underdog or marquee admission.

## Injury data is current, not locked (founder, Sep 24 2026)

The old injury-code lock is lifted: "It has to update. All the information has
to stay up to date 24/7, so when we run these picks, Gary has the information
that's real and up to date." A player is never injured forever because a
report said so last week. NFL availability drops weekly and game-day
designations filed before the team's last completed game
(`src/services/nflAvailability.js`, applied in the shared BDL injury fetch);
reserve designations (IR, PUP, NFI, suspensions) stay until the provider
changes them. Injury fixes follow the ordinary rules: real-world accuracy
first, no quota or prescribed conclusion for Gary.

## Session-End Law: Repo = Production (founder, Aug 24 2026)

The September 21 iteration rules supersede automatic checks and native release
work in this older policy. Clearly distinguish saved native edits from releases.

"If we change something here I assume it was changed in production too —
that needs to be the case at the end of each session." Before ending ANY
session that touched code, run `node scripts/production-truth.js` and get a
green result: its DEPLOY PARITY section verifies every edge function's
deployed timestamp against its last local change (including `_shared/`),
and it flags uncommitted work and unpushed commits. Mid-experiment state is
allowed ONLY while the session is still going or when the final report says
so explicitly — silence means parity. If the user says a behavior is retired
or changed, that must be true in the RUNNING system before the session
ends, not just in the repo.

## Model providers

Use the current subscription routing in `modelCascade.js`.
Claude subscription → business GPT Plus → personal GPT Pro → configured DeepSeek
last. Metered Anthropic/OpenAI routes and Gemini are disabled. Do not revive
an old model order from git history.

## A Fix Isn't Fixed Until It's Deployed

For anything that runs in the cloud — Supabase edge functions, migrations, cron jobs — committing the fix to the repo is HALF the fix. Production keeps running the old code until you deploy. Every bug-fix to a `supabase/functions/*` file MUST end with `npx supabase functions deploy <fn> --project-ref xuttubsfgdcjfgmskcol` and a verification call; every migration file MUST actually be applied. (Jul 2 2026: the phantom-grade ET-filter fix sat committed-but-undeployed for a day and silently mis-graded ~48 picks across a week. Same session, the DFS drop migration had sat unapplied.) When reporting a fix as done, say whether it is deployed, not just committed.

The same law covers the LOCAL pick daemon. "Deployed" means VERIFIED RUNNING IN THE PRODUCTION PROCESS — not committed, not pushed, not "the tree looks right." (Jul 29 – Aug 12 2026: the launchd plists pointed at a second clone of this repo in `Documents/ChatGPT/Gary/repo`, so two weeks of shipped pick-lane work — including an entire desk rebuild — never made a single pick, while every test and smoke run passed in the clone we were editing.) Any claim that a pick-lane change is live MUST cite `node scripts/production-truth.js` output or equivalent: the scheduler process's actual folder, the era hashes on disk, and (once picks store) the era stamped in the database. The scheduler daemon holds its code from spawn — after editing `scripts/scheduler.js` itself, restart it; pick runs are fresh processes and need no restart.

## Clean Up After Yourself

When removing, moving, or renaming code — fix ALL references. Stale comments, orphaned numbering (e.g. "BLOCK 8" when blocks 1-7 were removed), dead imports, outdated file-level docs — all of it gets cleaned up in the same change. Don't leave artifacts from old code structure behind.

## No Edits Without Approval

NEVER make code edits, file changes, or apply fixes without explicit user approval first. When issues are found:
1. Present the findings and proposed fixes
2. Wait for the user to approve before making any changes
3. If the user says "let's discuss" or "let's chat about it" — that means DISCUSS, not implement

This applies to all changes: bug fixes, prompt edits, refactors, new files, config changes. The only exception is if the user explicitly says "go ahead and fix it" or similar direct approval.

## Testing

When running test picks, store results in `test_daily_picks` table (not `daily_picks`). Use the `--test` flag or set the table target accordingly so test runs never pollute production data.

## Language: Say "Stats and Data" Not "Efficiency"

When discussing what Gary should analyze, say "stats and data" — meaning how teams score, defend, rebound, shoot, turn it over. Do NOT default to the word "efficiency" as shorthand. "Efficiency" sounds like one metric when we mean "all the real measurable basketball stuff." Be specific about which stats matter for the context.

## Communication Rule — No Summaries

When the user asks to see output, data, logs, rationale, or any artifact — show the FULL REAL THING, not a summary. Never paraphrase, condense, or editorialize what the system produced. Copy-paste the actual content. If it's long, show it in full anyway. The user will tell you if they want a summary. Default is always: show the real thing.
