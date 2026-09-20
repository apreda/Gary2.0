# NFL player evidence, awareness and morning restart

Adam asked for correct, complete game context and Layer 1/2 awareness while Gary
owns the betting judgment. He explicitly approved repairing the spread/ML and
market-pricing contradictions, preserving the final betting question and the
moneyline cap, and pausing NFL until the repairs were ready.

Implementation: `7b3bd87e30bdece63d3a7eac2fcc595c95fc0ffd`, pushed to main.

## Data delivered to Gary

`QB_STATS`, `RB_STATS` and `WR_TE_STATS` now join the current roster to individual
season rows by player ID. Each player carries the actual season, games played,
and explicit unavailable fields. The prior-season fallback follows the player
across a club change. Team aggregates remain separately labelled context.
Roster depth is not a new starting-player or availability decision; the existing
official scout and injury handling remain the owners of those facts.

The September 10 saved evidence exposed the defect: Purdy's individual 2025
line was 9 games, 20 TD and 10 INT, but research attributed the team's 17 games,
33 TD and 16 INT to him. A fresh provider read confirmed the individual rows.
The repaired player tools returned named rosters for both sides of all 14 games
on September 20. The shipping formatter preserves their nested identities,
samples and missing values in Gary's actual tool text.

The saved NFL research non-answer beginning its last paragraph with "Could you
tell me directly what you'd like help with?" is now rejected by the existing
text guard, allowing existing provider recovery. No new AI reviewer was added.

## Prompt repairs

- NFL investigates eligible, quoted spread and moneyline tickets from the start.
  Bilateral headings identify teams rather than forcing a cover-only case.
  Case extraction still accepts historical cover headings.
- The final question stays exactly "What's your bet, and what are the reasons
  why?" The existing -179 default moneyline cap and ticket/price enforcement stay.
- Removed the blanket assertion that uncertainty is already priced in and the
  assertion that all game information was known when the line was set.
- Divisional awareness asks about familiarity, coaching/personnel continuity
  and previous meetings. It assigns no automatic margin or preferred side.
- The researcher no longer says divisional games are automatically tighter,
  and no longer treats the scoring-only EPA_LAST_5 token as per-play EPA.
- The player-QB instruction explicitly distinguishes the named individual line
  from combined team output.

NFL fingerprint: `c36010d9f11e`. NCAAF fingerprint: `dcd4885b8770`; shared
prompt/retrieval tracking now includes the restored researcher's source files.
The frozen June/game hash stays `9d3d2be7e50e`, props stays `f5843ba2d3f8`.
NBA's pinned prompt text, the frozen June tree, protected injury handling and
historical tickets were not edited. Root AGENTS.md already requires CLAUDE.md;
no duplicate rulebook was created.

## Pause and resume

NFL game decisions were held before the 9 a.m. trigger. The existing game-only
control allowed three NFL prop workers to begin at 9:00; they were stopped when
the hold was extended to props at 9:04. A separate `GARY_MANUAL_PROP_PICKS` setting
preserves the previous game-only behavior and supports a complete sport pause.
Both controls accept comma-separated BDL sport keys and are documented in the
launchd README. Other sports, line tracking and score services remained enabled.

Both temporary settings were removed and the scheduler was manually reloaded
at **09:10:27 ET**. PID **41418** runs from the canonical backend directory.
At **09:10:29**, the eight pending early NFL games entered the three-worker
pipeline; Carolina–Atlanta, Minnesota–Chicago and Philadelphia–Tennessee started
as child PIDs 41474–41476. This is a verified restart, not a claim that those
decisions had already published. Do not start duplicate manual game runs.

## Verification and receipts

Full backend: 4,548 tests in 426 files passed. Focused prompt/data/era checks
passed 65 cases; final formatter/scheduler checks passed 14. Lint and checked
boundary types passed. Live reads covered all 14 games/28 teams. The exact saved
non-answer is rejected by the repaired guard. New implementation CI:
https://github.com/apreda/Gary2.0/actions/runs/35512695220

The production audit after resume confirms the canonical scheduler, running
Winners worker, unchanged frozen hashes, current edge timestamps and no unpushed
commits. Its only flags are the preserved local `deno.lock`, private Firebase
configuration and NFL audit snapshot. It exits nonzero for those exceptions.
No game picks had been stored at that checkpoint, so a new persisted NFL era
receipt was not yet available. No edge code or migration changed.

Full evidence, prompt renderings and verbatim historical sources:
`/Users/adam.preda/Documents/ChatGPT/Gary/nfl-review-2026-09-20/`.
The original review remains a before-repair record; current prompts and actual
player-tool delivery are in its `after-repair/` directory. Historical prompts
were present in December and changed repeatedly through February; their presence
does not establish that any individual instruction caused the winning period.
