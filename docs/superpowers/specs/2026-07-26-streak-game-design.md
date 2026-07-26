# THE STREAK — Design Spec (build next session)

**Date:** 2026-07-26 (founder green-light; builds on Tail/Fade + Your Book, same-day spec `2026-07-26-tail-fade-your-book-design.md`)

**One line:** One play a day. Win extends the streak, loss kills it. How far can you ride?

## Product shape

- A user designates ONE tail-or-fade per ET day as their **streak play** — a toggle inside the existing stake picker ("Make this my streak play"), switchable until lock like everything else.
- **Win extends. Loss resets to zero. Push/void holds** (the day simply doesn't count). **A missed day holds** — the streak is broken only by a loss, never by life. (Survivor-pool convention; punishing absence kills the ritual.)
- Current streak + personal best live on the Billfold YOU page as the module's crown; the pick card chip gains a small "DAY N" mark when the bet is the streak play.
- Share card: "DAY 11" variant of the ride card — the streak IS the share loop.
- Sep 9 framing: NFL kickoff is the season-zero moment ("start your streak week one").

## Mechanics (locked)

- Schema: `user_bets.streak_pick boolean not null default false` + partial unique index `(user_id, game_date) where streak_pick` — one per day, enforced by the DB like everything else in this system.
- `user_streaks` table: `user_id pk, current int, best int, last_counted_date date, updated_at`. Written SERVER-SIDE by the grade-results/grade-props settle path the moment the streak play settles — never computed on the client, so the leaderboard can trust it.
- Placement goes through the existing `place_user_bet` RPCs (new `p_streak` param) — lock integrity, odds resolution, and the guard trigger all apply unchanged. Unfakeable by construction.
- Settle order guard: streak updates are idempotent per (user_id, game_date) — a re-grade day flips the same day's contribution, never double-counts.

## Not building

- No entry fees, no prizes v1 (review safety); no multi-sport parallel streaks; no streak insurance mechanics. Longest-streak leaderboard column belongs to the leaderboard spec, not here.

## Open at build time

- Copy for the reset moment (drama without cruelty); whether push ("your streak lives: 4") ships with settle-push or after.
