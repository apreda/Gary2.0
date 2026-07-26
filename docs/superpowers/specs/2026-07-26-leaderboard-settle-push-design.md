# Leaderboard + Settle Push — Design Spec (build next session)

**Date:** 2026-07-26 (founder green-light; builds on Tail/Fade + Your Book)

**One line:** Public standings computed from ledgers nobody can fake — plus the push that tells you your bet settled.

## Leaderboard

- **Credible by construction:** rankings read ONLY the WITH GARY ledger (system-graded, lock-immutable) and, later, `user_streaks.best`. YOUR PLAYS (self-graded) never ranks — that line is the product's honesty and the App Store story.
- **Opt-in:** new `public_profiles` table (`user_id pk, display_name text unique, created_at`); nobody appears without creating a handle. RLS owner-only on the table; the board is served by a SECURITY DEFINER RPC returning (display_name, record, net units, best streak) aggregates — no user ids, no row-level data crosses the wall.
- **Windows:** 7d / 30d / season chips. **Floor:** minimum 5 graded verified bets to appear (kills one-lucky-bet boards).
- **Display:** units and records only — never dollars (App Store 5.3 optics, same doctrine as the Billfold's hypothetical framing).
- **Handle hygiene v1:** length/charset limits + a small blocklist; report/rename tooling later.
- Surface: YOU page module first; web later if it earns it.

## Settle push

- Extend the settle path in `grade-results`/`grade-props`: after a user bet PATCHes to a final status, enqueue a push through the EXISTING push infrastructure (recon `20260702_push_identity_and_notify.sql` + the `notify-new-pick` edge fn pattern before writing anything).
- Copy shape: "Your tail settled: +0.63u" / "Your fade lost: -1.00u" / streak variant "Day 5 lives." Plain voice, no emojis, no lingo.
- Respect the user's existing notification opt-in state; no new permission prompts beyond what the app already runs.

## Open at build time

- Exact push payload routing (token table shape from the Jul 2 migration); whether leaderboard season = NFL season boundary or rolling; handle claim UI placement (YOU page vs Settings).
