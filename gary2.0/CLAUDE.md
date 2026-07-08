# CLAUDE.md

Gary 2.0 is an AI sports betting platform (NBA, NFL, NHL, NCAAB, NCAAF) using a 2-model architecture: Gemini 3 Flash (research assistant — investigates with tools before Gary starts) and Gemini 3.1 Pro (Gary — evaluates and decides). Core orchestration lives in `src/services/agentic/orchestrator/agentLoop.js`. Sport-specific awareness in `src/services/agentic/constitution/`. Pick generation scripts in `scripts/`. Database is Supabase. All project context, architecture details, and user preferences are in the auto-memory files at `/Users/adam.preda/.claude/projects/-Users-adam-preda/memory/`.

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

## Design Authority (rewritten July 7, 2026 — founder's call)

**No stored design rules, no templates — ever.** The founder has fully delegated
design: the bar is "production-level, award-winning," and every part is designed from
scratch to fit the app and its page. Do not keep, consult, or create design-spec
files/rules (all prior ones were deleted on his order, July 7 2026); his reactions in
the live conversation are the only design input.

Behavior vs. visuals: prop-slip grouping and Winners selection logic
(selectPremiumProps: straight confidence cut, no per-game cap) encode hard-won
BEHAVIORAL rules — keep the behavior even when restyling the visuals.

## LOCKED: Injury Handling

DO NOT edit injury handling code without explicit user confirmation. This includes:
- Injury labels: FRESH (0-3 days), PRICED IN (>3 days), Out For Season, RECENT, GTD, Day-to-Day
- Injury duration calculation logic
- Injury sections in scout reports
- Any code in ballDontLieService.js, bdlInjuries.js, bdlPlayers.js that deals with injury status, duration, or labeling
- The FRESH/PRICED IN labels are intentional — Gary needs these in the scouting report

Always double-check with the user before touching ANY injury-related code, labels, or duration logic.

## A Fix Isn't Fixed Until It's Deployed

For anything that runs in the cloud — Supabase edge functions, migrations, cron jobs — committing the fix to the repo is HALF the fix. Production keeps running the old code until you deploy. Every bug-fix to a `supabase/functions/*` file MUST end with `npx supabase functions deploy <fn> --project-ref xuttubsfgdcjfgmskcol` and a verification call; every migration file MUST actually be applied. (Jul 2 2026: the phantom-grade ET-filter fix sat committed-but-undeployed for a day and silently mis-graded ~48 picks across a week. Same session, the DFS drop migration had sat unapplied.) When reporting a fix as done, say whether it is deployed, not just committed.

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
