# The Winners Gate — design

Date: 2026-09-24 (Thu). Founder GO in chat, 3:30 PM ET.
Owner of the build: Claude. Owner of the bar: Adam.

## 1. What Adam decided

Winners is the paid room: Gary's real bets, games and props in one list, on
one $10,000 bankroll. The picks page stays free and Gary still picks every
game. What changes is how a pick becomes a Winners play.

A pick makes Winners because it is good, judged on its own the moment it is
made. Not because of the time slot it fell in, not because the day was thin,
not because it was the first underdog. The day's other picks never enter the
judgment. What a bettor manages is what he already has at risk, and that is
all Gary sees when he sizes a bet.

## 2. Why (the record that decided it)

MLB games, Sep 12 to 23 (graded tickets, flat units):

| Signal | Record | Units |
|---|---|---|
| Reader grade clear | 12-4 | +4.6 |
| Reader grade lean | 18-13 | +3.6 |
| Reader grade toss-up | 4-7 | -2.3 |
| Gary's own conviction 60+ | 41-26 | +5.5 |
| Gary 60+ and reader clear | 9-2 | +3.5 |
| Gary 60+ and reader clear or lean | 15-5 | +4.6 |
| Never read at all | 44-32 | +5.4 |

Only 48 percent of MLB picks were ever read. The rest sat in windows with no
seat. Six of twelve first-games-of-the-day made the board (versus 27 percent
of all picks) because the SQL admits a lone game the moment it is stored,
unread. Football's board (4-17) was almost entirely rule fills.

Price, Sep 4 to 23, MLB games on the board: favorites 28-14, dogs 8-17. The
dogs came from the first-dog rule. Winning above the price's break-even is
what grows the bankroll; a forced dog is where the board lost its money.

Stakes: the reader's stakes on games went 17-11 and lost $632. Props made
$1,225. The reader should not size games.

Props: MLB props hit about 65 percent in every reader grade and every
conviction band. The reader's grade has no signal on props; only bad facts
matter there.

## 3. How it works (the plain version)

Gary picks every game. A pick fires when the game is ready to be picked:
baseball when both lineups post, football the morning of the game. Nothing
about that changes.

The moment a pick is done, two things happen to it.

**Gary decides if he is betting it.** He just did the work, the case is in
front of him, and he sees what he already has at risk today. He says play or
pass. If it is a play, he says how much: $100 or more, from the bankroll.

**A reader checks his case.** It does not know what else is on the board and
does not compare games. It reads the desk and both sides' arguments and grades
the case clear, lean, toss-up, or unsupported, answering the questions in
Adam's checklist file.

**A pick makes Winners when Gary is betting it and the reader grades it clear
or lean.** Props work the same way, except the reader only blocks a prop whose
facts do not hold. That is the whole gate. No quota, no seat per time slot,
no first dog of the day, no filling a thin day. Some days it is three plays,
some days one. The one promise that stays is the big game: Gary always has a
play on it, at his stake.

Plays land on the Winners page as games become pickable. On an NFL Sunday
that is the whole board by 9 AM. On a baseball day it is the afternoon games
by late morning and the night games by mid-afternoon. Paid members get a push
when a play lands. Until then they see a sealed pack for the window ahead.

Football has one extra step. Ninety minutes before kickoff, when inactives
come out, if a player the case leans on is inactive, the play comes off the
board. Nothing is re-picked.

Every night, one line per play: Gary's call, the reader's grade, the stake,
the time slot, the result. Once a week we look at the lines and move the bar
with numbers.

## 4. The gate, exactly

A candidate is a published pick (game or prop) with its original evidence,
as today (`winners_candidates`). For every candidate:

| Condition | Games | Props |
|---|---|---|
| Gary's bet decision | play | play |
| Reader grade | clear or lean | anything but unsupported |
| Kickoff | still ahead | still ahead |
| Price | as published; MLB moneyline limit stands | as published; -179 prop floor stands |

All conditions true → the play is admitted at Gary's stake, trimmed only by
cash on hand. Any condition false → not on the board. There is no count, no
minimum, no maximum, no reserved seat, no fill, no rule admission.

Exception, the big game (`winners_big_games`, computed at slate publish, or
Adam's named game in `winnersBigGames.json`): its pick is on the board even if
Gary passes or the reader grades it toss-up, at Gary's stake or the $100
minimum. Unsupported still blocks it (bad facts are bad facts). This is the
only rule left, and it is a product promise, not a quality claim.

Admission happens when the second of the two inputs arrives, whichever order.
A play that is admitted stays admitted (never re-run, never replaced). A
football play can be scratched (section 9).

## 5. Gary's bet decision

Where: right after Gary's case, in the same session, the way the brief is
written today (`writeGaryBrief` in `run-agentic-picks.js`, after the case and
before `storePicks`). The June MLB lane is untouched: this is one adapted call
after the decision, outside the era, exactly as the brief is.

What Gary sees: his pick, the price, his full case, both sides' cases where
they exist, the bankroll's cash on hand, and today's plays already made with
their stakes (what is at risk). He does not see picks still to come.

What Gary answers (JSON):

```
{ "play": true | false,
  "stake_dollars": 100 or more (whole dollars) when play is true,
  "why": one or two sentences in his voice, written for the ledger, not the app }
```

Contract, not steering: the ask states the product facts (real money, the
bankroll, the minimum, what is already at risk) and asks the bettor's
question. It gives no rule for when to play, no target count, no favorite or
dog preference, no price formula. Any such rule is a founder-law violation.

Stored: on the pick itself (`bet` on the stored pick object for games and
props), so it rides into `winners_candidates.pick_snapshot` through the
existing enqueue with no new column. A missing or malformed decision is a
pass, logged; the pick still publishes to the free page as always.

Props: the same ask, once per game after the props brain answers, covering
every prop it picked in that game, each with its own play/pass and stake.

Model and effort: the brain that made the pick, in its session, low effort on
volume (it is reading its own case, not researching).

## 6. The reader

The reader's job changes from curating a day to grading one case. Its current
instructions tell it to rank a window strongest to weakest, choose stakes, and
that "daily coverage per active sport is required; weaker opportunities
receive smaller stakes, never a veto." That language is the fill and it goes.

The new contract: one candidate per read. Blinded as today (both cases by club
first, the ticket second). No stakes, no ranking, no coverage, no count. It
grades:

- **clear**: the original evidence supports a distinct advantage for this
  exact ticket at this price, and the main opposing point is addressed;
- **lean**: a supported preference with real uncertainty or dependence left;
- **toss-up**: closely balanced, a forced choice, or the main reason is a
  confident assertion rather than evidence;
- **unsupported**: essential evidence absent, contradictory, about the wrong
  game or date, or unable to support the ticket.

The questions it answers to reach the grade are Adam's, in the checklist files
(`winnersChecklist.{mlb,nfl,ncaaf}.md`, and a props file). Those files are the
reader's questions; editing and committing one changes the reader at the next
read. The current daily-curation prompt carries its own definitions instead of
the files; the rewrite reads the file.

It still writes the three or four "why it made the board" reasons
(`winnersSelectionReasons.js`) in the same pass, since the unveil shows them.
It still quotes exact passages from the record and the rationale for clear and
lean, and a quote that is not in the record fails the read.

Props variant: the packet is the props desk and the prop's rationale (props
were never written with a two-club debate). The "other side" of a prop is the
line and the opposing evidence in the desk. Same four grades; the gate only
uses unsupported.

Model: the heavy Winners cascade as today, GPT 5.6 Sol first, Claude Opus 5.5
behind it, high effort. Every grade in the record above came from Sol. The
reader is the same class of model as the pick.

Timing: reads start the moment a candidate lands, one at a time per league,
several in flight. A read takes one to two minutes. There is nothing for it to
race any more: a pick not yet read is not yet on the board, and no clock fills
its place.

## 7. Stakes and the bankroll

- Minimum $100 a ticket. No maximum. Gary can put the whole bankroll on one
  play if that is his call (Adam, Sep 24: "only a minimum, no maximum").
- The only trim is cash on hand, as today's trigger already does. A request
  the cash cannot cover is cut to the cash; $0 means the play is a prediction
  with no money, as today.
- Gary sizes. The reader's `stake_dollars`, `stake_reason` and `price_reason`
  are dropped from its contract.
- Everything on every surface stays in dollars, never units.

## 8. What gets deleted

SQL (one migration, `winners_gate`):

- `winners_daily_plan` windows, seats, quotas, `target`, the 25-percent rule,
  the six-clear exception, and the transitional six.
- `claim_winners_curation` window batching and capacity; replaced by a
  one-candidate claim.
- `finish_winners_curation` capacity checks; replaced by the gate.
- `ensure_winners_window_coverage`: lone-game admission and the T-60 fill, gone
  entirely, and its 15-second loop in the daemon.
- `winners_props_plan`, the cohort quotas (early ≤2, middle ≤4, six a day, two
  a game, one per player) in `claim_winners_props` / `finish_winners_props`;
  replaced by the same one-candidate claim and gate.
- `winners_board.stake_units` check `between 0 and 10` → `>= 0`.
- The bankroll trigger's `between 100 and 1000` → `>= 100`.

Code:

- `winnersRules.js`: first dog of the day and the plus-line automatic
  admission. Big game stays.
- `winnersCuration.js`: the batch/cross-batch machinery, `selectWithinSchedule`,
  stake parsing; the file becomes the single-case reader.
- `winnersProps.js`: `chooseProps` cohorts; the file becomes the props variant
  of the reader (or folds into one module).
- `run-winners-board.js`: the coverage loop; select and props loops become one
  read loop over a single queue.
- The "Confidence fill" and "Scheduled coverage" reasons never get written
  again. Existing board rows keep their history.

## 9. Football inactives

Football picks keep firing at T-240 (Sunday 1 PM games at 9 AM). At T-90 the
official inactives post. A new check reads the report for the two clubs and
compares it to the players Gary's case leans on (the brief's reasons and the
case text, by full name). If a named player is Inactive or Out and was not
already so when the pick was made, the play is scratched: board row marked
scratched, ledger void, pack shows SCRATCHED, push to members who saw it. The
free pick stands as published. Nothing is re-picked (founder law).

College has no inactives report; nothing to check.

## 10. The page and the push

The page already does the right thing: packs for windows still ahead, plays
as they land, yesterday below. Stakes above $1,000 must render (the plate's
number width). A scratched state is new.

Push: one message per admitted play, paid members only, on the existing
sender (`notify-new-pick`, the Primetime alert's shape): "Gary put $400 on
the Tigers." Prerequisite: the server must know who is paid. The sender uses
the same record the app uses to unlock the page; if that record is app-side
only today, a members table (account → Winners access) is built first and the
push waits for it.

## 11. The nightly line and the weekly look

`run-rationale-lanes` already prints the 🏆 line. It gains one row per play:
Gary's call (play/pass, stake), the reader's grade, the time slot (first game,
day, early evening, night), the price band, the closing price, the result, the
dollars. Plus the day's counts: picks, read, Gary plays, clear/lean, admitted.

Every Thursday: read the week's lines with Adam. The bar (clear-or-lean, the
props rule, the big-game exception) moves only from those numbers.

## 12. Laws this build lives under

- Never re-run or replace a published pick; every change applies to the next
  pick. Existing board rows and reasons are history.
- The June MLB lane is frozen; the bet decision is an adapted call after the
  decision, like the brief. NBA's winning era and football's lanes likewise
  gain the call after their decision, never inside it.
- No decision rules in Gary's prompts; the bet ask is a product contract.
- Winners is real money: dollars everywhere, never units.
- Effort matches the lane: the bet decision is low effort in the pick's
  session; the reader stays high on the heavy cascade.
- Commits by pathspec; the shared checkout has peers.

## 13. Rollout (verified on live days, in this order)

1. **Fri Sep 25, morning, before the first MLB pick:** the migration (section
   8), the reader rewrite (section 6), the one-queue daemon. Gate for the day
   = reader clear or lean (games) / not unsupported (props), since Gary's
   decision is not live yet. Verify on Friday's slate: every pick read,
   no lone-game or coverage rows, board count and grades in the log.
2. **Sat Sep 26:** Gary's bet decision on games and props; the gate uses it;
   Gary's stakes replace the reader's. Verify on Saturday MLB and NCAAF:
   `bet` on every stored pick, admissions match the two inputs, stakes trimmed
   only by cash.
3. **Sun Sep 27:** the football inactives scratch, live for NFL Sunday. The
   push once the members record exists.
4. **Week of Sep 28:** the nightly line; first Thursday look Oct 1. MLB
   postseason from Sep 29 and NBA in October run the same gate.

Each step ships in its own commit with its tests fixed to the new behavior
(no pinned counts, no text pins).

## 14. Expected volume

At clear-or-lean with Gary's play, about three MLB plays on a full slate,
one or two on a college Saturday, zero to one on an NFL Sunday until the NFL
lane is right (its picks are 8-22 since Sep 12, which no gate can fix). Props
volume is unknown until Gary's play/pass runs; the first week's lines decide
whether the ask's bankroll framing needs to change. No cap is added to hide a
flood; the numbers decide.

## 15. Open items

- Members record for the push (section 10): find the app's source of truth
  first; build the table only if there is none server-side.
- Adam's reader questions (why these, the props file): answered in chat after
  this spec; the checklist files are his to edit.
- Darts: separate design after this ships, same shape (Gary throws what he
  believes, a reader checks the facts, no quota).

## Appendix — files and functions touched

Backend (`gary2.0/`):

- a timestamped `winners_gate` migration under `supabase/migrations/` — replaces the plan,
  claim, finish, coverage and props functions; stake constraint and trigger.
- `src/services/pickdesk/winnersCuration.js` → single-case reader (rename to
  `winnersReader.js`); `winnersProps.js` → props variant or merged.
- `src/services/pickdesk/winnersChecklist.props.md` — new, Adam's questions
  for props.
- `src/services/pickdesk/garyBet.js` — new, the bet decision ask + parse
  (shape of `garyBrief.js`).
- `scripts/run-agentic-picks.js` — call `writeGaryBet` after the brief;
  store `bet` on the pick.
- `src/services/pickdesk/propsBrain.js`, `footballPropsDesk.js`,
  `ncaafPiggybackProps.js` and their runners — the props bet ask after the
  brain's answer; `bet` on each stored prop.
- `src/services/pickdesk/winnersRules.js` — drop first dog / plus line; keep
  big game.
- `scripts/run-winners-board.js` — one read queue, no coverage loop.
- `src/services/nflInactivesScratch.js` — new (section 9); scheduler hook at
  T-90 for NFL.
- `scripts/run-rationale-lanes.js` — the per-play line.
- `supabase/functions/notify-new-pick/` — the Winners play alert, members only.

iOS (`ios/GaryApp/WinnersLab/`): stake rendering above $1,000; scratched
state on the plate and the pack; push destination `winners`.

Tables: no new columns on `winners_candidates` or `winners_board`; `bet`
lives in `pick_snapshot`. A `scratched_at` on `winners_board` for football.
