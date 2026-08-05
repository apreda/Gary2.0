# NFL POSTER FORMATS — build spec
## What social-auto-post becomes for football (GTM §7, expanded to a build contract)

> Jul 26 2026. Owner: Claude (build, behind dry-run) → founder approves real samples before any
> format goes live (standing rule). Target: built + dry-run-previewable by Aug 9 (P1); live paths
> stay no-op until NFL rows exist in `daily_picks`. MLB rhythm continues underneath, untouched.

---

## Ground rules (inherited, not new)

- Zero emojis, zero hashtags (recap's ✅❌+tags exception stays recap-only), no links in tweets,
  first person, no tout vocabulary, no ellipsis. `clean()` backstops every LLM string.
- Verdict register = v3.2 (naked Sol + `?evidence=1` grounding, under-100-char line). NFL verdicts
  are the SAME code path — only the evidence builder needs football stats (see §Data).
- Every new format ships `?dry_run=1&force_mode=<name>` first; founder sees real composed samples
  before the cron can touch it.

## The weekly slots

| Key (`thread_format`) | When (ET) | What it is | Source of truth |
|---|---|---|---|
| `week_tape` | Tue 11 AM | Weekly record thread: W-L + net units at $100 flat, every pick named with result, losses included, no commentary padding | `game_results` for the NFL week (Thu–Mon) |
| `lookahead` | Wed slot hour | One game Gary keeps circling for the weekend: the standard hook format (angle / pick line / edge) pointed at the week's most interesting line | `daily_picks` NFL rows + rationale |
| `standard` / `top_pick` | Thu + Sun + Mon, timing-aware | Existing pick-thread format, unchanged — NFL rows just flow in | existing `runPickMode` |
| `verdict` | Postgame waves (Sun ~4:15 PM / ~7:45 PM / ~11:30 PM checks; Thu/Mon late) | Existing verdict loop; NFL cap raised per-run on Sundays (see §Timing) | verdict v3.2 + NFL evidence |
| `sunday_card` | Sun 10 AM | The full Sunday slate as ONE share-card image + a short thread naming every pick | new OG route + `daily_picks` |

Nothing else. No countdowns inside these formats (launch-week countdown posts are a separate,
capped, manual-approved set per GTM P4).

## Data contracts (the actual build work)

1. **NFL evidence for verdicts** — extend `grade-results ?evidence=1` beyond MLB: passing/rushing/
   receiving leaders, scoring summary, turnovers, and the graded props for the game, same dossier
   shape. Gate: whatever stats source the NFL grading lane lands on (BDL NFL endpoints exist —
   confirm coverage when the NFL pipeline revives). Until then NFL verdicts would fall back to
   skip — build the evidence extension BEFORE Sep 9 so the launch-night verdict is grounded.
2. **Week definition** — `week_tape` aggregates Thu 12:00 AM ET through Mon 11:59 PM ET games by
   `game_date`; posts Tuesday. Push weeks (0 graded games) skip silently.
3. **Sunday card route** — new `web/app/api/sunday-card/route.tsx` (1200×1200, brand system:
   ink/card/gold, Barlow Condensed display, no team logos — text + sport token only). Input: the
   day's NFL rows; output: the slate list with prices. Reuses the share-card font/token plumbing.
4. **Timing** — Sunday verdict checks ride the EXISTING hourly cron (no new cron): the verdict
   loop already fires every run; only `VERDICT_CAP_PER_RUN` lifts to 8 on NFL Sundays so the
   1 PM wave (up to ~9 finals) clears in two runs. Weekday cap stays 4.
5. **Dedup** — same `social_post_log` uniqueness pattern; `week_tape` keyed `WEEK TAPE <tue-date>`,
   `sunday_card` keyed `SUNDAY CARD <date>`.

## Rollout

- Aug 1–9: build behind dry-run using synthetic NFL rows in `test_daily_picks` for previews.
- Founder approval gate: one composed sample of each format (dry-run JSON → I post the text/image
  here in chat), thumbs-up per format — his knowing single-item approval, per the standing rule.
- Preseason (Aug 7+): football references flow through EXISTING formats only (a lookahead-style
  hook needs no new code until picks exist). New formats stay dark until NFL picks are real.
- Sep 9: `standard` posts the Pats–Seahawks pick in the morning (this tweet IS the launch, GTM
  runbook); verdict fires postgame. First `sunday_card` + `week_tape` land Sep 13 + Sep 15.

## Open dependencies (not this spec's to solve, tracked so nothing lands on Sep 8)

- NFL pick generation revival (product lane — pickdesk rebuild owns pick creation now).
- NFL grading in `grade-results` (currently MLB-only) — blocks `week_tape`, verdicts, everything.
- BDL NFL box-score coverage confirmation for the evidence dossier.
