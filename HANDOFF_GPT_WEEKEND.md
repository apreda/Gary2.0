# WEEKEND HANDOFF — GPT working on Gary (Aug 15–17, 2026)

Adam's instruction: work on Gary **the same way Claude does**. Last GPT stint,
work happened in a separate checkout and was lost when Adam came back. This
document exists so that never happens again. Read all of it before touching
anything.

## THE ONE RULE THAT CAUSED THE LAST LOSS

**The canonical repo is `/Users/adam.preda/Desktop/Gary2.0`** (git root; app
code in `gary2.0/`, iOS in `ios/GaryApp/`). Branch: `main`. Remote:
`https://github.com/apreda/Gary2.0.git`.

- **Never** work in `~/Documents/ChatGPT/Gary/repo`. It is RETIRED. The launchd
  plists no longer point at it. Anything committed there is stranded — the
  Big Numbers spec (`b369aca1`) sat lost in that clone for four days until it
  was found and cherry-picked to real main (`5ffcf295`) on Aug 14.
- Work directly on `main` in the canonical repo and **push to origin/main the
  same day Adam signs off**. No side branches that outlive the weekend, no
  separate scratch clones, no "I'll push it later."
- Before starting ANY session: `git fetch && git status` — confirm you are in
  `/Users/adam.preda/Desktop/Gary2.0`, on `main`, up to date with origin.

## PRODUCTION TRUTH (verify, never assume)

```
cd /Users/adam.preda/Desktop/Gary2.0/gary2.0
node scripts/production-truth.js
```

That prints: the scheduler's PID and folder, the prompt eras a fresh run would
stamp, the models the plists inject, and what today's stored picks are stamped
with. **If you claim something is live, cite this output.**

Key mechanics:
- **The working tree IS production for picks.** The scheduler spawns a fresh
  node process for every pick window, so a saved file is live at the next
  window with no deploy step. Corollary: never leave the tree mid-edit when a
  pick window is close.
- **Pick windows**: T-90/T-60/T-30/T-15 before each game's first pitch.
  **Do not edit pick-lane files** (`src/services/pickdesk/*`, scout report,
  statRouters, orchestrator) inside any window for a game not yet picked —
  check `tail -20 logs/scheduler/scheduler-<date>.log` for what's coming. A
  mid-window edit killed two picks on Aug 12 ("wireSection is not defined").
- `scripts/scheduler.js` itself is the ONE file the daemon holds from spawn.
  After editing it: `launchctl kickstart -k gui/501/com.gary.scheduler` and
  verify the boot banner in the scheduler log.
- **Supabase edge functions/migrations: committed ≠ deployed.** Every change
  under `supabase/functions/*` must end with
  `npx supabase functions deploy <fn> --project-ref xuttubsfgdcjfgmskcol`
  plus a verification call. Say "deployed and verified", never just "fixed".
- **Era discipline**: game prompts hash to `PROMPT_SHA` (see
  `scripts/lib/eraTruth.js`). Every pick run appends to `logs/era-runs.log`.
  If you change the prompt text, the era changes — that is expected and
  tracked, but SAY SO when reporting, and never change it without Adam's GO.
- Test picks go to `test_daily_picks` (`--test`), never `daily_picks`.

## CURRENT STATE (as of Fri Aug 14, ~11:30 AM ET)

- Game era `1c925fa6e05c`, props era `5fe5ac910162`. Both lanes run
  `codex-gpt-5.6-sol` via plist env override. Contract: turn 1 = blind read
  (JSON `away_path`/`home_path`, NO verdict, no board), turn 2 = board +
  "Which bet is it?" + merged Gary's Take card. RL games differ from ML by
  the bet options ONLY — a test pins byte-parity (`garyBrainRunLine.test.js`).
- Suite: `npx vitest run` → **288/288. It must stay green.** Three of those
  tests pin the ML/RL ask parity and the ask wording — if a prompt edit is
  approved, update the pins in the same change.
- Big Numbers rail (iOS Picks page): fixed five rows — HR L5, bullpen ERA
  L14, first-inning L10 (new Aug 14), park factor % (new Aug 14), current
  series (0-0 when a new series opens; the 2-day gap rule in `seriesRow`).
  Backend fields ride `tomorrow_board.run_profile` + `board[].park`, built by
  `src/services/tomorrowService.js`, published by
  `scripts/run-tomorrow-board.js --date YYYY-MM-DD`.
- Tweets: every game posts (30/day cap), each thread gets ONE reply —
  "Gary's Prop Bets" list + link-in-bio handoff (`social-auto-post`, deployed).
  Recap tweet is ledger-only, no commentary lead.
- Insights: hot/cold/platoon fall back to projected lineups from
  `mlb_field_lineups` (shared module `src/services/insights/lineupSource.js`);
  the edge function `mlb-field-lineups` merges BDL ids + throwing hand into
  projected pitchers. H2H emits for EVERY game with ≥1 season meeting.
- Scheduler has a start-time drift guard (statsapi re-check every 10 min).

## HOW ADAM WORKS — NON-NEGOTIABLE

1. **Talk first, edit on GO.** Conversation is ideas; nothing changes until he
   says "make it" / "go". An ambiguous "go ahead" → ask which part.
2. **No `git commit` until his sign-off**; working-tree edits during review are
   fine and are live (say so when they are). When he says "commit and push
   everything" — do exactly that, to origin/main, with explicit file paths.
3. **Never `git add -A` or directory adds.** Explicit paths, `git status`
   before, `git show --stat` after.
4. **`ios/GaryApp/GoogleService-Info.plist` is NEVER committed** — it holds the
   real Firebase key on disk, and the repo copy stays redacted.
5. **Never trim anything you show him.** Full output, word for word. No
   ellipsis ("...") anywhere, ever — in UI, in tweets, in chat.
6. Prompt/pick-process changes need explicit sign-off on the exact list.
   Layer 3 law (CLAUDE.md): never link a factor to a conclusion in any prompt
   Gary sees. No steering. Card = pick + reasons, never forced structure.
7. Injury-handling code is LOCKED without explicit confirmation (CLAUDE.md).
8. No new tests/benches unless he orders them (vitest suite maintenance is
   fine). No design templates; his live reactions are the only design input.
9. Report honestly: what ran, what failed, deployed vs committed. If tests
   fail, show the output.
10. iOS: build with `-derivedDataPath /Volumes/KINGSTON/gary-dd`, install to
    the booted sim, `open -a Simulator`, screenshot-verify via the GaryTour
    file harness (`GaryTour.swift` header shows the commands). NO computer-use
    driving of the sim. Never leave a Debug build on his phone.

## WEEKEND WATCHLIST (do these each day)

- **Morning ledger read**: yesterday's picks vs era stamps (`daily_picks`
  rows carry `prompt_sha`). Watch: chalk/dog ratio, hedge language in cards
  ("may", "steal it"), the doubled "Gary's Take Gary's Take" header (KNOWN
  open bug — Adam has not yet chosen the fix; do not fix without his GO).
- **Tweet threads**: confirm each game tweet got its props reply; check
  `social_post_log`. MISSED_PICKS lines in the function logs are loud.
- **Scheduler log**: drift-guard lines (`START-TIME DRIFT` / `DRIFT FIRE`),
  coverage rollup at end of day ("Daily pick coverage: N/N").
- **Board**: `run-tomorrow-board` runs at the 5 AM plan build; confirm the
  five Big Numbers fields populate for the new slate.

## OPEN ITEMS (Adam-gated — surface, don't solve silently)

- Doubled "Gary's Take" header on stored cards (his call pending on which
  side fixes it).
- xERA still shipping in the insights REGRESSION lane while removed from
  Gary's desk (his call pending).
- TestFlight: 2.24 (875) archive awaits his Distribute click.
- D-U-N-S number expected ~Aug 20 → then Apple org-conversion support call.

If something is ambiguous, do what Claude does: investigate, present findings
with evidence, and wait for Adam's GO.
