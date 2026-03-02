# CLAUDE.md

Gary 2.0 is an AI sports betting platform (NBA, NFL, NHL, NCAAB, NCAAF) using a 3-model architecture: Gemini 3 Flash (research assistant — investigates with tools), Gemini 3 Pro (advisor — builds bilateral Steel Man cases), and Gemini 3.1 Pro (Gary — evaluates and decides). Core orchestration lives in `src/services/agentic/agenticOrchestrator.js`. Sport-specific awareness in `src/services/agentic/constitution/`. Pick generation scripts in `scripts/`. Database is Supabase. All project context, architecture details, and user preferences are in the auto-memory files at `/Users/adam.preda/.claude/projects/-Users-adam-preda/memory/`.

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

## LOCKED: Injury Handling

DO NOT edit injury handling code without explicit user confirmation. This includes:
- Injury labels: FRESH (0-3 days), PRICED IN (>3 days), Out For Season, RECENT, GTD, Day-to-Day
- Injury duration calculation logic
- Injury sections in scout reports
- Any code in ballDontLieService.js, bdlInjuries.js, bdlPlayers.js that deals with injury status, duration, or labeling
- The FRESH/PRICED IN labels are intentional — Gary needs these in the scouting report

Always double-check with the user before touching ANY injury-related code, labels, or duration logic.

## Clean Up After Yourself

When removing, moving, or renaming code — fix ALL references. Stale comments, orphaned numbering (e.g. "BLOCK 8" when blocks 1-7 were removed), dead imports, outdated file-level docs — all of it gets cleaned up in the same change. Don't leave artifacts from old code structure behind.

## Communication Rule — No Summaries

When the user asks to see output, data, logs, rationale, or any artifact — show the FULL REAL THING, not a summary. Never paraphrase, condense, or editorialize what the system produced. Copy-paste the actual content. If it's long, show it in full anyway. The user will tell you if they want a summary. Default is always: show the real thing.
