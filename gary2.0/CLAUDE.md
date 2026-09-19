# Gary — current project instructions

Production checkout: `/Users/adam.preda/Gary2.0`, main. Read root `AGENTS.md`.
Current sports: MLB, NFL and NCAAF. Retain NBA's pinned April 8 prompts and
seasonal features. NHL/NCAAB were retired August 27; World Cup UI is retired.

## Current direction — September 19, 2026

- Adam authorized the college repair and resumption, then two native bug and
  performance passes per current page (MLB/NFL/NCAAF, excluding NBA), cleanup
  of obsolete code, and delivery to TestFlight. These are implementation
  instructions; another approval is not needed for the requested fixes.
- NCAAF: one game pick and at most one player prop per eligible game. Either
  team in ACC, Big Ten, Big 12, SEC or the current Pac-12 qualifies, as does
  Notre Dame. Boise State is intentionally included in the 2026 Pac-12.
- College decisions use Sol. Supply dated rosters, named starting QBs,
  availability, coaches, transfers and attributed matchup reporting. Gary
  owns the prediction and may apply informed judgment; no favorite/underdog
  quota, prescribed conclusion, or statistic proving every opinion.
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

## Current handoffs and implementation entry points

Start with [native design fixes and container restoration, builds 935–936](../HANDOFF_2026-09-19_NATIVE_DESIGN_935.md),
[native two-pass review, cleanup and build 934](../HANDOFF_2026-09-19_NATIVE_REVIEW_934.md)
and [failure policy, subscription routing and college delivery](../HANDOFF_2026-09-19_FAILURE_POLICY_AND_SUBSCRIPTIONS.md).
The earlier [college/odds/UI repair](../HANDOFF_2026-09-19_COLLEGE_ODDS_UI_REPAIR.md)
explains the data changes; its old delivery/hold status is superseded by the
failure-policy handoff. Build 2.26 (936) reached TestFlight September 19 at
4:38 PM ET. The native handoff records an unresolved intermittent database
restart/API issue; UI recovery is improved, but the server cause is unconfirmed.

- [MLB bullpen exception](../HANDOFF_2026-09-16_BULLPEN.md)
- [Prop Winners and HR policy](../HANDOFF_2026-09-16_PROP_WINNERS_HR.md)
- [Launch scorecard](../GaryMarketing/launch-2026-09/EXECUTION_REVIEW_2026-09-18.md)
- `src/services/agentic/orchestrator/agentLoop.js`: common decision sequence.
- `src/services/agentic/scoutReport/`: sport desks and evidence.
- `src/services/agentic/constitution/`: Gary's sport awareness.
- `scripts/run-agentic-picks.js`: generation entry; `scripts/scheduler.js`: scheduler.
- `src/services/agentic/orchestrator/modelCascade.js`: shared provider routing.

Historical handoffs remain in the repository for receipts, not as competing
current instructions. Native fixes are delivered only after a successful
upload and verified TestFlight processing. Public App Store submission is a
separate action.

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

Use Adam's current request. The old design guides, palette/font mandates,
layout prescriptions and aesthetic memories were deleted at his request on
September 8, 2026. Do not restore them from history or treat existing code
and screenshots as mandatory styling. This creates no replacement style
rules. Operational, data-integrity and accessibility requirements remain.

Behavior vs. visuals: prop-slip grouping remains intact. Winners admission now comes only from the immutable server board (founder GO, Sep 4 2026), not local confidence/start-time selection. Home retains its featured games. Do not reintroduce automatic first-underdog or marquee admission.

## LOCKED: Injury Handling

DO NOT edit injury handling code without explicit user confirmation. This includes:
- Injury labels: FRESH (0-3 days), PRICED IN (>3 days), Out For Season, RECENT, GTD, Day-to-Day
- Injury duration calculation logic
- Injury sections in scout reports
- Any code in ballDontLieService.js, bdlInjuries.js, bdlPlayers.js that deals with injury status, duration, or labeling
- The FRESH/PRICED IN labels are intentional — Gary needs these in the scouting report

Always double-check with the user before touching ANY injury-related code, labels, or duration logic.

## Session-End Law: Repo = Production (founder, Aug 24 2026)

"If we change something here I assume it was changed in production too —
that needs to be the case at the end of each session." Before ending ANY
session that touched code, run `node scripts/production-truth.js` and get a
green result: its DEPLOY PARITY section verifies every edge function's
deployed timestamp against its last local change (including `_shared/`),
and it flags uncommitted work and unpushed commits. Mid-experiment state is
allowed ONLY while the session is still going or when the handoff says so
explicitly — silence means parity. If the user says a behavior is retired
or changed, that must be true in the RUNNING system before the session
ends, not just in the repo.

## Model providers

Use the current subscription routing in `modelCascade.js` and the latest handoff.
Claude subscription → business GPT Plus → personal GPT Pro → configured DeepSeek
last. College decisions remain Sol on GPT. Metered Anthropic/OpenAI routes and
Gemini are disabled. Do not revive an old model order from a historical handoff.

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
