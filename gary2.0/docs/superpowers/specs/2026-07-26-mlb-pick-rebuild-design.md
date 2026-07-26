# MLB Pick System Rebuild — "One Desk, One Read"

**Date:** July 26, 2026
**Status:** Founder-approved in conversation (delete-and-rebuild, no parallel lane, no side-by-side). Cost explicitly NOT a design driver — pick quality is the only goal.
**Deadline:** live for as much of today's slate as the build allows; every window after deploy runs v2.

## Why we are rebuilding

Three full Sol slates on the inherited system produced break-even results and four diagnosed diseases, none of which were data starvation:

1. **Clue curation** — facts cited when they support the landed side, dropped when they don't (the Jul 24/25 Reds H2H flip).
2. **Magnitude inflation** — modest situational splits promoted to separators ("2.61 night ERA" as a reason).
3. **Chalk corroboration** — season aggregates the price already contains used as separators; favorites went 12-12 paying juice while price-hunting went 4-2.
4. **A desk that reads like a terminal** — 18 of 19 sections are numbers; world/stakes/narrative live in one section at the bottom. The founder's frame: "we are asking Gary to do math."

The pass structure (Flash pre-investigation → briefing → Pass 1 → Pass 2.5 → Pass 3) was engineered around a weaker brain's limits (Gemini cost, steering, context). Sol at xhigh reads a complete desk and thinks; the scaffolding is now overhead that fragments attention.

## Design decision: no tools (founder-confirmed, quality argument)

One Sol call over a complete desk. No fetch_stats loop, no Gary-side grounding searches.

- Tools and desk drink from the same well (same BDL/Savant endpoints) — calls add motion, not knowledge. Genuinely missing data is a **desk gap**; the fix is a permanent desk section for every game, never a sometimes-fetch. No-tools creates that flywheel; tools would hide gaps forever.
- Fetching is where curation starts: by iteration 3 a read is forming and fetches confirm it — the Reds disease moved a layer earlier, invisible to audits.
- One contiguous read puts the whole xhigh reasoning budget on weighing everything against everything — exactly the discipline the audits found missing. Fragments anchor; a whole page gets weighed.
- The pick becomes a pure function of the desk: stored desk + stored pick = perfectly auditable, run-stable (the 4-identical-runs launch consistency, made structural).

Grounding remains as **curated desk input** (date-anchored news section), never as Gary's search box.

## THE DESK — input contract

New builder `src/services/pickdesk/mlbDesk.js`. Wraps the existing `buildMlbScoutReport` (stats core + tape rows untouched — iOS Tale of the Tape keeps working) with a new frame. Section order is the design:

1. **THE BOARD** — every book's ML both sides + run line both sides with prices (from `getOddsV2` rows, the sol-native board format) + a bet-mechanics legend (facts: -1.5 pays on 2+; +1.5 cashes on win or one-run loss; ML pays outright). The board opens the desk because the bet is the question.
2. **THE STAKES** — computed, facts-only, zero new API calls (standings already fetched): each team's record, division position, games back, playoff seed, current streak; trade deadline date and days remaining. No interpretive labels (no "sellers" / "buyers") — facts carry it.
3. **THE WORLD** — the existing grounded same-day news/storylines section, repositioned from the bottom of the report to the front matter.
4. **THE SHELF** — the full existing stats desk verbatim (probables with arsenal/platoon/contact, confirmed lineups with L7/L15 rolls, division standings, team season stats, Savant xStats, structured injuries with duration tags, rolling L1/L3/L5/L10 box lines, bullpen last-3-games pitch counts, series state + season H2H per-game lines **plus a new computed at-venue aggregate line** ("At [park]: [Home] X–Y"), last-10 results with scores, roster moves last 7 days, schedule shape, rest, weather).

Return shape: `{ deskText, tapeRows, meta }` where meta carries teams/ids/times for the chassis.

## THE BRAIN — decision contract

New `src/services/pickdesk/garyBrain.js`. One `gpt-5.6-sol` call at `xhigh` through the existing OpenAI Responses adapter (`openaiSession.js`). No tools passed.

- **System prompt:** the founder-curated Jul 22 survivors, verbatim, assembled without constitution pass-scaffolding: identity (Gary, 30 years, storyteller, no autobiography), JUDGMENT vs FABRICATION, FACT-CHECKING PROTOCOL (zero tolerance), THINK LIKE A SHARP, formatting rules (no tokens/feeds, skip missing data), today's date. Source: `buildSystemPrompt` content minus constitution injection; MLB injury-label semantics (NEW/KNOWN/SP SCRATCH) ride with the desk's injury section header, not as constitution.
- **User message:** THE DESK + the DECISION ASK — the founder-approved best-bet language (Pass 2.5 lineage, exactly as `run-sol-native.js` carries it) with two deliberate deltas: the "investigate with your tools" sentence removed (no tools), and **no paragraph/word-count bracket** (card = the pick and the reasons, scene-setter open; length unforced — founder law).
- **Output:** "Gary's Take" prose + JSON `{ final_pick, rationale, confidence_score }`; organic confidence 0.50–1.00 ("your read against the price, not the shortness of the price") — Winners slots depend on this field's semantics, unchanged.
- **Rails (unchanged doctrine):** `auditPickRationale` + `auditCountClaims` on the output; one retry with the audit message; still failing → null, no store (prevent fabrication, never detect-and-ship). Malformed JSON → one re-ask, then null.

## THE CHASSIS — reused untouched

`scripts/run-agentic-picks.js` keeps: scheduler tier contract (T-90/60/30/15), lineup hard-fail gate, coverage policy (Gary picks every game), F-5 best-book election + pick-text rewrite, tape `statsData` on the pick, immediate store + dedupe, `rationale_plain` layer, `model` tag, no-stats hard fail. The single seam: the MLB game path calls `garyBrain` instead of `analyzeGame`.

## THE SNAPSHOT — audit trail (new)

The exact `deskText` persisted per pick — table `pick_desks` (`pick_id text primary key, game_date date, matchup text, desk text, created_at timestamptz default now()`). Non-blocking write after pick store; failure logs and never blocks the pick. Closes the "we can only re-render, not replay" gap found in the Jul 26 audit.

## DELETED — the old MLB game lane (same push)

- Flash research walk + briefing for MLB games (`flashAdvisor` MLB game path, `flashInvestigationPrompts` MLB game entries).
- Pass machinery for MLB games: `buildMlbPass1`, MLB branches of `buildPass25Message`/`buildPass3Unified`, checkpoint markers — removed from the MLB game flow.
- `getMlbSpreadFactors` / `getMlbSeasonAwareness` (their surviving content lives on in desk/ask), MLB game constitution wiring.
- `scripts/run-sol-native.js` (superseded by the real thing).
- Where a file is shared with the props lane or future sports (agentLoop, passBuilders, constitution index), the MLB **game** path is severed and a dated header comment marks the lane dead; shared code stays for its remaining consumers. Full file deletion only where nothing else imports.

## Cutover

Build immediately; windows firing before deploy run old code one last time; store-level dedupe makes the mid-slate handoff clean (already-picked games skip; unpicked games get v2 at their remaining tiers). One founder `railway up` when green. The old lane dies in the same push that ships v2 — no parallel running, no side-by-side (founder call, Jul 26).

## Testing

- Architecture pins (port of `solGameBrain.test.js`): model `gpt-5.6-sol`, effort xhigh, zero tools passed, ask contains the best-bet language, system prompt contains the fact-check protocol, no length bracket present.
- Desk builder: sections present and ordered (BOARD first, STAKES second, WORLD third), board rows formatted, venue H2H line computed correctly from meeting lines, tape rows pass through.
- Brain: JSON parse paths (clean, fenced, malformed→re-ask→null), statAudit retry wiring, null on double failure.
- Full suite green before push.

## Explicitly out of scope (follow-ups, not this build)

- Grounding provider swap Gemini → OpenAI Responses `web_search` (first follow-up; freshness protocol ports as prompt text).
- Props lane rebuild (still Gemini 3.6 through the old machinery), recaps/insights/grading-fallback de-Gemini.
- NBA/NHL/NCAAB game lanes (October matter; they get this treatment after MLB proves it).
- Prompt changes #1 (price/magnitude awareness) — parked; the desk reframe may make it unnecessary; revisit on the first v2 sample.

## Cost

Not a design driver (founder call). Expected to fall out of the architecture anyway (no Flash walk, one call per game); measured per-game number reported after the first full v2 slate from the cost tracker.
