# Sol Cutover — Game Picks Move to GPT-5.6 Sol (Approach A)

> **REVISION (Jul 22 PM, founder):** "I didn't think we were changing any part
> of our actual pick process — the only thing we should have changed is that
> we are using Sol 5.6 now." FINAL ARCHITECTURE: the FULL Gemini-era
> orchestrator pass stack (`analyzeGame` — storyteller identity, era-B
> awareness, best-bet synthesis, line-evaluation ask, THINK LIKE A SHARP,
> options menu) runs unchanged with `GAME_PICK_MODEL = 'gpt-5.6-sol'` through
> the OpenAI adapter seam (the July 5.5 bake-off path). `pickEngine.js` is
> DELETED. Everything below describing the pickEngine architecture is
> historical; the data-layer work (facts-only desk, fan-parity sections,
> count-claim rail, stale-injury monitor) all survives in the scout/statAudit
> layers and serves the full stack.

**Date:** 2026-07-22 · **Approved by:** founder (this session) · **Target:** deployed to Railway EOD today

## Decision

Sol REPLACES Gemini as Gary's game-pick brain. This is not an arm, a test, or
an A/B: the analysis core (born in the July rebuild) runs on `gpt-5.6-sol`
inside the existing production runner, hard-wired — no engine switch, no
dormant Gemini fallback. After tonight, Gemini game-pick reasoning no longer
exists in the pipeline.

Scope decisions (founder, this session):
- **Game picks → Sol.** Props → `gemini-3.6-flash` (released Jul 22; verify ID
  against the Gemini API before wiring — if it 404s, props stay on the current
  model and the founder is told; no silent fallback).
- Grounding search, grading fallback, recaps, insights **stay Gemini**.
- **Railway is the production host** (this cutover IS the cloud cutover; the
  laptop scheduler is unloaded — resolves scheduler incident #10).
- **Coverage unchanged:** every MLB game gets exactly one game pick (ML or RL).
  App structure, tables, and downstream pipelines unchanged.
- **Injury labels:** production FRESH/PRICED-IN labels stay in the scout report
  Sol sees (LOCKED domain; founder skipped the question — defaulted to keep,
  stated in-session). The arm's `stripInterpretiveLabels` is NOT used in
  production.

## Architecture

### 1. The seam

`scripts/run-agentic-picks.js` — at the single `analyzeGame(...)` call site
(~line 963), game picks call `analyzeGameSol(game, sportKey, options)` from the
new engine module. Hard-wired: there is no env toggle and no legacy path for
game picks.

Everything around the seam is byte-identical: slate discovery
(`getMlbGamesForETDate` semantics), MLB lineup gate, T-tier retries, dedup
("game already has pick"), immediate per-pick store, `--test`/`--force` flags,
no-stats hard gate, storage, notifications, grading, fact-checks.

### 2. The Sol brain

`src/services/agentic/pickEngine.js` — the July-rebuild analysis loop as
Gary's production brain, honoring the production result contract. (Nothing
lives under a "scratchArm" path anymore; that naming is retired.)

- **Inputs:** `(game, sportKey, options)` — same signature/options as
  `analyzeGame` (incl. `options.sportsbookOdds` pre-fetched by the runner).
- **Internals:** production scout report via `buildScoutReport` (labels
  intact); full per-book board (see §3); session via the hardened
  Responses-API adapter (`openaiSession.js`) with `thinkingLevel: 'high'`;
  tools = `fetch_stats` + `fetch_narrative_context` (grounding), self-selected,
  caps 12 iterations / 6 searches; statAudit hard rail — one corrective retry,
  then the game is left to the next retry tier (never store untraceable
  numbers).
- **System prompt:** the founder-approved 3-sentence prompt verbatim,
  unchanged except the ask presents the board as
  the menu (§3). No constitutions, no factor lists, no pass stack.
- **Output:** the `analyzeGame` result contract: `pick, type, odds, confidence,
  rationale, homeTeam, awayTeam, moneylineHome, moneylineAway, spread,
  spreadOdds, total, toolCallHistory, verifiedTaleOfTape, injuries, venue,
  _statAuditWarnings`. Fields the engine can't know (NCAAB rankings, CFP seeds)
  return null exactly as MLB does today.

### 3. The board is the product menu

The board rendered to Sol lists **ML + run line rows per book — no totals** —
because the game-pick product cannot ship a total (the runner filters them,
which would silently break every-game coverage). This is the real shippable
menu, not steering. PASS remains structurally impossible (coverage LOCKED).

### 4. Odds binding (F-5 discipline)

Sol's `final_pick` is parsed (team side + bet type) and **bound to a real board
row**; the stored price comes from the board via the existing best-line
election, never from Sol's prose. Board price wins on any mismatch and the pick
text is rewritten (same pattern as today's spread best-line rewrite). Nothing
`_oddsUnverified` ever ships.

### 5. App parity

`verifiedTaleOfTape`, `injuries`, `venue` pass through from the scout report.
Sol's `fetch_stats` calls are recorded into `toolCallHistory` in the production
shape so `statsData`/Tale of the Tape and the no-stats gate keep working even
when Sol trusts the briefing and calls few tools. Acceptance: a stored Sol pick
is field-for-field shape-compatible with a recent Gemini pick.

### 6. Props model swap

Props lane primary model → `gemini-3.6-flash` (after live ID verification).
One-line change at the `isPropsMode` model split; `modelTiering.test.js`
re-pinned.

### 7. Cost + config

`costTracker` learns `gpt-5.6-sol` at $5 in / $30 out per MTok (verify at
build). Expected ~$0.20-0.35/game ≈ $3-5/night MLB; the Flash researcher walk
(~$6/day) is gone with the Gemini game-pick brain. `run-scratch-arm.js` and the
scratchArm module are deleted (superseded by the production engine).

## Deletion plan (Gemini game-pick brain)

Deleted in THIS build: the game-pick dispatch into the Gemini orchestrator,
`run-scratch-arm.js` + `scratchArm/` (superseded), and any game-pick-only
prompt surface with no props consumer. Deferred ONE day: stripping game-pick
code out of files SHARED with the props pipeline (agentLoop, passBuilders,
constitutions carry props passes that stay on Gemini 3.6) — deleting shared
plumbing hours before a live slate risks the night; it comes out in tomorrow's
cleanup pass once props confirm stable.

## Cutover sequence (today)

1. Build; full test suite green (new engine tests + existing suite).
2. Sol's first picks on 2-3 of tonight's real MLB games (stored via `--test`
   so nothing ships) → founder reviews the actual cards — launch review, not
   an A/B.
3. On founder GO: commit + push → Railway auto-redeploys.
4. Unload laptop scheduler: `launchctl bootout gui/$(id -u)/com.gary.scheduler`
   (+ watchdog). Laptop = manual rescue only. Incident #10 closed.
5. Babysit tonight's first Railway tiers; report cards + cost.

## Explicitly not changing tonight

Storage tables and pick JSON shape, iOS/web readers, grading, fact-checks,
notify-new-pick, Winners selection, props structure and 2-per-game requirement,
coverage policy, injury handling (LOCKED), scout report data layer, grounding.
Retiring the Flash factor walk also retires the platoon-count template's feeder
(found in this morning's audit).

## After the cutover (deliberately deferred)

Hands-off week: no pick-process edits while Sol banks graded slates (the
git-archaeology law — winning eras were hands-off). Mechanical fixes from
today's launch-review cards are fair game; process improvement proposals come
back with a week of receipts. Tomorrow: shared-file cleanup pass (dead
game-pick code out of the props-shared orchestrator files).
