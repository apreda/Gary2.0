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

## LOCKED: Approved UI Designs (June 4, 2026)

User-approved and locked — do NOT restyle these surfaces without explicit direction,
including while doing adjacent work. Tune-ups by request only.
- **The Picks page** (TODAY + per-game pages): hero w/ score strip (FINAL SD 4 · PHI 6),
  time-in-slot cards, full-size Prop Slip rows, GAME INTEL edges. "That design is perfect."
- **Game Pick Card** (gold, CompactPickRow): eyebrow + matchup + "Gary's Take ›" +
  gold pick chip with grey odds. Gold marks only the pick text and Gary's voice.
- **Prop Pick Card + Prop Slip** (silver, CompactPropRow/PropSlipCard): silver twin of the
  game card; OVER calls gold, UNDER calls silver; rows flip. THE RULE (final, June 5,
  user-confirmed working): group props BY GAME — 2+ props from the SAME game share ONE
  slip (scales to any count); a prop alone is its own card. Groups ride a HORIZONTAL
  rail per league shelf (slip 344pt / card 308pt); automatic from the data. Winners
  selection (selectPremiumProps) = straight confidence cut, top 5 per sport, NO per-game
  cap (any per-game cap makes same-game pairs impossible by construction — the bug that
  caused four rounds of churn). Slip eyebrow names the LEAGUE ("MLB · 2"), never "PROPS".
  W/L letter capsules: leading (beside name) on Picks, trailing corner on Winners
  (resultLetterTrailing). Team labels are mascot-short (Formatters.shortTeamName).
  One shared back app-wide (PropSlipBack: GARY'S TAKE · The Numbers · The Read). The
  Picks TODAY page's combined top-props slip is a user-approved exception (locked page).
- **The Home front page** (HomeView, June 8 2026): opens on **Morning** (results-first — the
  view users land on), with a three-pill state switcher **Morning · Pre-game · Live** (matte
  capsule, gold active pill — NO "Auto"). Each state re-orders the same blocks. Morning:
  scorecard (record / net flat stakes / best cash) → **Gary's form** (last-10 W/L pips +
  streak chip + net·L10 + win rate) → last-night marquee → The Wire (market-pulse strip +
  betting-angle rows + 𝕏-voice quotes) → Prop Box → Biggest cashes → The Receipts. Pre-game:
  last-night strip → board + free pick → the slate → the Wire. Live: live tape → takeover
  (score + base diamond + outs) → live board → in-game Wire → tonight strip. Pre-game/Live
  ride `#if DEBUG` sample data until real picks/live games exist (never ships in release).
  World Cup module is parked (it used to lead the page) — restore on request. User-approved:
  "the Morning page is perfect, that is what I want users to see first."

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
