# Cash Rail: the betting scoreboard on Home

Oct 29 2026. Adam picked "Cash Rail" (Opus agent 1's mock) from 25 explorations. The approved mock is
`.superpowers/brainstorm/68346-1793310397/agents/opus-1.html`; the app version must look and move like it.

## Intent

People watch a game to see which bets hit, so they can think "I should have taken that." Nothing tracks
that. When the day's big game kicks off, the countdown card on Home becomes a scoreboard of the betting
market: every bet the game has already cashed, at its pregame price, with what $10 would have paid. It is
for the fan who looked at the menu and passed, and for the casual Gary user who sees "Kraft first TD +1000"
without opening ESPN. It is not a tracker for the user's own slip.

## Goals

- The marquee hero card keeps its shape at kickoff and becomes Cash Rail, exactly as the mock does.
- Every hit uses the price frozen at kickoff. Only bets the game has already cashed ever appear.
- A hit reaches the card within about 30 seconds of the play.
- After the final whistle the board stays as the night's record.

## Non-goals and anti-goals

- No live odds, no live betting, no unders, nothing "on pace", nothing pending.
- No sportsbook names on screen (design.md).
- Not a box score: a player appears only when his stats cash a bet.
- No invented prices. A market without a real pregame price never appears (so no quarter or half game
  lines until a source for them exists).

## What Adam decided

- Cash Rail, built "the way it is in the mock fully", including the rail. The rail itself will be replaced
  later (Adam's idea: track Gary's darts, props and game pick for that game there). Build it now as mocked.
- Under the team names, instead of only the O/U: the original spread and Gary's pick for the game.
- The mock's single-rung ladder (one "O 58.5 / −115" stack under the hero) reads as odd spacing; smooth it.

## The card (iOS, `HomeMarqueeTracker` live state)

Matches the mock's grid, type and motion, in the app's tokens (`GaryColors`, `GaryFonts.display` = Bebas):

1. **Label row** above the card: the game's billing ("THURSDAY NIGHT FOOTBALL") left, gold pulsing dot +
   LIVE right (FINAL after).
2. **Scoreboard:** two team lines (away warm white, home gold, Bebas ~29), score right-aligned on each,
   gold diamond marking possession. Under them one dim line: spread + Gary's pick
   (`GB −6.5 · GARY PACKERS −6.5`; when Gary's pick is the total, `GB −6.5 · GARY OVER 46.5`). Hairline
   rule, then a right column: game clock in gold Bebas ~33 (`Q2 4:30`, `HALF`, `END Q3`, `FINAL`) and under
   it down and distance with field position (`2ND & 11 · CAR 21`), from the latest play.
3. **Rail** (unfolds at kickoff): 4 quarters across the card, gold elapsed line with a pulsing head at the
   game clock, a tick at each landing (height by price, top three bright), the longest price labelled.
4. **Hero** (unfolds at the first cash): JUST CASHED + when; price in light-gold Bebas ~50 with `$10 → $X`
   (amount green); player name in Bebas ~24 with a GARY'S PICK tag when the bet is Gary's; market line;
   the play that cashed it. Alt ladders show a rung strip once two or more rungs have cashed (one rung is
   already said by the market line: this is the smoothing Adam asked for).
5. **List:** header CASHED / $10 PAID, the top three other hits ranked by price (price, who + market + when,
   $10 paid, rung strip for ladders). One row per ladder, which climbs instead of adding rows.
6. **Footer:** `N BETS CASHED` and `ALL HITS ›`, which opens a full sheet with BIGGEST / LATEST tabs.
7. **Motion:** new hit lands in the hero (price glow, gold sweep, JUST CASHED blinks); the previous hero's
   price flies into its ranked row; rows reorder with a slide; the card's border flashes; scores pop when
   they change. Respect Reduce Motion.

Pregame the card is today's countdown, unchanged. A game with no hits yet shows the scoreboard and rail
only.

## Data

### Prices (frozen at kickoff)

- Source: BallDontLie `/nfl/v1/odds/player_props?game_id=` (2,319 rows tonight: milestones and
  over/unders for yards, receptions, anytime/first TD, interceptions, pass TDs, longest plays, quarter and
  half player props) and BDL game odds (spread, moneyline, total).
- BDL drops the rows after the game, so a snapshot job saves them: every 5 minutes in the last hour before
  kickoff; the last snapshot before kickoff is the frozen board.
- Price shown per bet: the best price across books at kickoff (what a fan could actually have gotten).
- Over/under markets count only the over side.

### Settlement (the new engine)

A pure function `settle(prices, plays, final?)` → hits. It walks BDL `/nfl/v1/plays` (type, text, period,
clock, score, scoring flag, yards, participants with roles, possession, down and distance, wallclock):

- Anytime TD, 2+/3+ TDs, first TD scorer (first scoring play's TD player), 1Q/1H/2H TD variants.
- Receiving, rushing, passing, rush+rec yards and receptions: cumulative per player; a milestone or over
  cashes on the play that crosses it. Same for the quarter/half variants within their window.
- Pass TDs, completions, attempts, rush attempts, interceptions thrown, longest reception/rush/pass,
  field goals made, kicking points.
- Game total over cashes when the combined score crosses it; moneyline and spread settle at the final.
- Each hit records: game, bet key, who, market label, rung label, price, elapsed game seconds (rail x),
  clock label, the play's short text, Gary flag, cashed-at time.
- Idempotent: re-running over the same plays yields the same hits.

### Storage and freshness

- `live_hits` (one row per cashed bet per game, unique on league + game + bet key) and `live_board_prices`
  (snapshots) in Supabase, anon read like `live_scores`.
- A local launchd worker polls BDL plays every 15 seconds while an NFL game is live and upserts hits.
  Speed is being measured tonight (BDL copies ESPN's plays; the probe reports the delay). If BDL is too
  slow, the settlement engine stays the same and only the play source changes.
- The app polls `live_hits` for the hero game every 15 seconds while it is live.

## Scope order

1. iOS Cash Rail card, driven by a `CashRailBoard` model, with a sample-game preview path so it can be
   checked in the simulator before real data exists.
2. Settlement engine + tests, run over tonight's real game (plays are kept, so it can be replayed).
3. Price snapshots, worker, tables; the app reads real hits.
4. Later: replace the rail with Gary's own bets for the game (Adam's call, not decided yet); other leagues.

## Calls I made (Claude), for Adam to check

- **Price rule:** best price across books at kickoff.
- **Billing label:** NFL night games read THURSDAY / SUNDAY / MONDAY NIGHT FOOTBALL by kickoff day and time;
  everything else reads the league and week (`NFL · WEEK 9`).
- **The other big games' ribbon** stays under the card as it is today.
- **Tapping the scoreboard** opens the game over Home (the live card no longer flips to its back; the hits
  are now the card's own content). ALL HITS opens the sheet.
- **One rung** shows no strip; two or more do.
- **NFL first.** Other leagues follow once the NFL board is proven.

## Left to the builder

Exact spacing and type sizes within the app's tokens, the polling plumbing, the rung-label wording for
each market, and how long a final board stays the hero before the next big game takes the slot (default:
until the next big game's countdown is under an hour).
