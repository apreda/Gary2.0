# Scratched picks in the app (handoff for the iOS session, Oct 13 2026)

Founder (Adam), Oct 13 2026: "we need a mechanism for scratching the pick and letting the users know that this pick
was scratched and why" ... "it should be scratched or faded out, but we'll keep it up to let people know it was
scratched. We won't just remove it. That makes it look like we took it down."

## What the backend does (live since Oct 13 2026, commit ed5621d2)

Shortly before a game pick is due on Winners (75 min before NFL, college and MLB starts; 28 min before an NBA tip),
the Winners worker compares both teams' availability with what it was when Gary made the pick. If something changed,
Gary reads the news and either keeps the pick or scratches it. A scratch:

- adds two fields to that pick's object in `daily_picks.picks` (and, for NFL, in `weekly_nfl_picks.picks`):
  - `scratched_at`: ISO-8601 UTC string, e.g. `"2026-10-18T15:47:12Z"`
  - `scratch_reason`: Gary's reason, one or two plain sentences, written for fans (show it verbatim)
- never grades the pick: no `game_results` / `nfl_results` row is ever written for it
- voids any user bet that followed it (`user_bets` settle as `void`)
- on Winners: the pick never seats; a ticket already on the board gets `winners_board.scratched_at` and
  `scratch_reason = "Late news: <his reason>"` (the Winners page already renders SCRATCHED)

Both fields are absent on every pick that was not scratched. Decode them as optional.

## What the app needs (main picks feed, pick detail, any record or streak math)

1. Keep the pick where it is. Do not hide or remove it.
2. Fade it (the darts board's scratched treatment is the reference: dimmed card, `SCRATCHED` label in place of the
   result/status) and show `scratch_reason` verbatim under it. No W/L, no "pending", no live sweat state.
3. Exclude it from records, win rates, streaks and any graded counts (it has no result row, so a count that joins
   results is already right; check anything that counts picks without results as pending).
4. Optional and in place, not as explainer copy: the Winners ticket can show its `scratch_reason` under SCRATCHED.

House rules that apply: no explainer copy or captions (Sep 22 law), no oval pills, the app decoder must never require
the new fields (Oct 8: a required field broke the whole Winners board).
