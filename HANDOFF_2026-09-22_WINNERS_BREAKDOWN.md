# Winners breakdown, the streak pick, the orb — September 22, 2026 (afternoon)

Adam's second review of the day (after Darts). Saved locally, simulator
build green, walked in the simulator, no archive. Commit on main, push held.

## The breakdown (`ios/GaryApp/WinnersLab/LabPlayView.swift`, rewritten)

- **The way back rides beside the ticket.** The system navigation bar is
  hidden; a gold chevron sits left of the league in the hero row. The
  ticket starts at the top of the screen.
- **Hero:** price, then the stake in dollars, then the book that held the
  price. A primetime emblem (TNF, SNF, MNF, MLB's Sunday night game) sits
  beside the time (`LabFormat.primetime`, `LabPrimetimeBadge`).
- **The matchup, on tabs** under the matchup name (no green title):
  TEAMS = the old pick-card back (`TaleOfTapeSection`, gold accent now,
  expandable, injuries); PITCHERS (MLB) = THE ARMS plates from the day board
  (`ScoutArmsSection`, names open the player card); QUARTERBACKS and SKILL
  (NFL) = rows from today's player cards for the two teams (season line, last
  games, tap opens the card). Card tabs only exist on game day, because the
  cards are built per day.
- **THE MOVE** replaces THE NUMBER: the line as a yardstick (`LabYardstick`,
  `LabTracker.swift`) with OPENED and NOW/CLOSE marks and every ladder rung
  as a faint tick; the spread for a spread pick, the price for a moneyline,
  the total for a total. The ladder RPC (`line_ladder`) now answers to the
  league label as well as the odds sport key (migration
  `line_ladder_accepts_league_labels`), and its rungs stop at kickoff, so
  the breakdown finally gets rungs. Beside it THE TAPE; the two plates are
  the same height (`fixedSize(horizontal: false, vertical: true)` on the row).
- **THE BOOKS, live.** `get_books_now(league, date, game_id)` returns every
  book's latest pre-kickoff quote from `odds_snapshots` (the scheduler's
  closing watch records every book; prediction markets excluded). One grid:
  BOOK · SPREAD (number and price) · ML, the best price per column in gold,
  a brand-colored mark beside each name (no logos), the freshness in the
  title note. Falls back to the pick-time snapshot when the RPC has nothing.
- **PROPS ON THIS GAME (Extras):** Gary's props on the game from the Picks
  day (`fetchPropPicks` filtered by game id or matchup), each with his
  `key_stats` bullets. On an NFL yardage prop the fan's own number: a
  draggable yardstick (`LabProjectionStick`) with the line marked in gold
  and LOCK; the call persists per prop in UserDefaults (`yourCall.<date>.
  <player>.<prop>`). MLB props list without the stick.
- **THE CASE on tabs:** THE CASE · AGAINST · THE PATH (only those present).
- On the card with it, What Gary read, the briefing: unchanged.

## The board (`WinnersLabView.swift`)

- One row under the header: the sport tabs on the left, YESTERDAY's line on
  the right; the TODAY head carries the date and the open count.
- **THE STREAK PICK** module leads TODAY: flame, STREAK PICK, the league,
  "N STRAIGHT" (and BEST when higher), the ticket, the price, the state, the
  stake. Shows yesterday's until today's is chosen. Tap opens its breakdown.

## The streak pick (backend, migration `20260922000600_streak_books_lanes.sql`, applied)

- `streak_picks` (one row a day). `select_streak_pick(date)` chooses the
  board ticket with the biggest stake (a game pick wins a tie, then the
  earlier admission) once the day's first admitted play is an hour from
  starting; immutable for the day. pg_cron `streak-pick-select` every 10
  minutes. `get_streak(date)` returns the current streak (leading run of
  wins; a push or an ungraded day is skipped), the best streak, today's and
  yesterday's pick with its grade. Public read: it is the free pick.
- Sep 20 (Falcons +2.5, lost) and Sep 21 (Tigers ML, won) were chosen by
  hand for the first look; the streak reads 1.

## The unveil (`LabUnveil.swift`, rewritten)

Adam approved the pack + board mock. The foil pack shakes, the top tears, a
flare, the ticket lands, the stake stamps, the ticket parks at the top, and
three reasons clatter in on split-flap rows (`LabFlapRow`: cells fill by
whole words, no mid-word cut; the full sentence reads under each row). A tap
during the run lands on the parked board; a tap on the parked board opens
the breakdown; Reduce Motion shows the parked board at once. The reasons are
a prop's own `key_stats`, else the first three sentences of Gary's take,
verbatim. The proper source is a short reasons list from the pick ask at
decision time (NFL/NCAAF/props; MLB's June lane is frozen, so a sub-worker
read of the stored rationale); not built yet.

## The orb (`GaryTalk.swift`, `ContentView.swift`)

The Talk button is a 22pt gold orb with a breathing halo at the dock's right
edge (in the chrome, never over the page); Reduce Motion stills it.

## Darts

`select_darts` now also draws from the core prop lane: 2+ hits (MLB),
receiving yards over and passing touchdowns over (NFL), at most two darts of
one kind a day. The page prints the market from the prop ("OVER 51.5
RECEIVING YARDS"). First touchdown, quarterback rushing touchdown and the
first-inning run are not pick lanes yet; they need markets in the props
brain before darts can draw them.

## NFL player cards

`props[].rate` is filled for NFL cards from the game-log window
(`footballPlayerInsightCards.js`, `nflHitRate`): "3/5" means three of the
last five games cleared the line. Lands with the next card build.

## Performance

Adam saw the app freeze once on the morning build. Not reproduced in the
simulator walk. Checked: the day-cards fetch decodes off the main actor;
the flap rows render from one periodic timeline; the breakdown loads its
side reads concurrently. If it recurs, the first suspect is the 700-card
day fetch on a Picks or Darts tap on a slow connection (a 30-minute cache
follows the first fetch).

## Open

- The three unveil reasons from the pick ask (above).
- Team names on the Picks page → team card.
- The projection stick's result: show the actual against the fan's call
  once the game grades (needs the prop result in the breakdown).
- A second sport tab set for the breakdown when the play is a prop (today
  the matchup tabs read the game's teams only when the play is a game).

## Adam's third review (12:05 PM): the unwrap, the flaps, the money, more lanes

- **The unwrap.** The pick now spells itself out on big flap cells the
  moment the ticket lands (about 2.5 seconds of clatter), then the stake
  stamps, the ticket parks, and the three reasons follow. A tap skips to the
  parked board. Same in the mock (`winners-unveil-pack-board.html`, artifact
  v5): the stamp sits inline in the price row between the price and the
  state, never over anything; the amounts read $100 (the new minimum).
- **The flaps.** No line through the letters; cells are 12.6 x 27 (17pt
  Bebas) for reasons and 16.5 x 36 (26pt) for the pick.
- **Complete sentences.** The reasons on the board are whole sentences from
  Gary's take (a prop's key stats, else the first three sentences). The
  proper source stays the pick ask (a short reasons list at decision time).
- **Injury framing (NFL).** Already in `nflConstitution.js` since Sep 21:
  ESTABLISHED INJURY RULE ("the line was set with that absence already
  factored in") and ABSENCES AND THE NUMBER ("a number can carry a named
  absence... accurately, or treat it as more or less than it is... the
  reported absence alone assigns nothing"). That is the NBA framing with
  NFL nouns, awareness only, no Layer 3. Nothing changed.
- **Dart kinds added:** `int` (interceptions thrown over, from the core
  lane when it picks that market) and `tetd` (a touchdown pick whose player
  has a TE card that day). `passtd` now also matches the lane's own
  `passing_tds` token. The core lane has not picked interceptions this
  season, so that kind stays empty until a lane produces it (below).

## The darts lane, proposed (not built)

Today the board only draws from picks Gary already makes (HR, TD, core
props). Adam's chosen kinds that no lane produces: first touchdown, QB
rushing touchdown, interceptions thrown, the first-inning run. Proposal:
one darts pass per league per day, after the game desks exist and before
the picks publish, on a cheaper model, in three steps:
1. **The menu** (mechanical): BDL player props for the dart markets on the
   day's games (first_td, anytime_td for TEs, passing_tds, interceptions,
   qb rushing_tds; MLB hits 1.5, nrfi/yrfi), same-book corroboration as the
   core menu, price floor -150.
2. **The screen** (Jev): a typed judgment per candidate from the game desk
   and the player's game log, ranking the menu; no side chosen.
3. **The throw** (a smaller model on the subscription cascade, Sonnet-class):
   Gary picks 3 to 4 darts per league from the screened menu with a
   two-sentence reason each, written under the writing rules. Stored in
   `prop_picks` under lane `DART` so the grader, `select_darts` and the
   ledger need no new plumbing.
Never on the record; a dart may sit on a game Winners or Picks also has a
play on, since it is a lean. Budget: one Sonnet-class call per league per
day plus the Jev screens.
