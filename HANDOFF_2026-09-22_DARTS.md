# Darts — September 22, 2026

Adam's call on the Hub (Sep 22, late morning): the Hub becomes "Gary's leans
that aren't bets" plus streaks and Gary's own fun numbers; the intel, the
player and team cards move to the Picks page; the Billfold stays the money
page (your book and the record); no friends board; no announcer line per
game; college has no darts. The tab swaps with Winners on the dock and gets
a fun name. Saved locally, simulator build green, no archive.

## The name

**DARTS.** Fun picks you throw for a big payoff; one word; fits the dock. Adam
changes it if he doesn't like it (`ContentView` dock label + `DartsView`'s
header, two strings).

## The dock

WINNERS wears the mark in the middle (index 1); DARTS takes the Hub's old
place on the left (index 2, SF symbol `scope`); HOME, PICKS, BILLFOLD as
before. `HubView` is unmounted (`GaryPage` removed from `ContentView`), not
deleted: its team card sheet and modules still compile and are the source
for the team card the Picks page will get next.

## Darts are their own lane (rebuilt Sep 22, 2:30 PM, founder)

Adam: "this is totally separate from the game picks or the prop picks...
these are the leans that we're going to put on this board at the start of
the day... it's not up to Gary. You can't say 'I didn't find any home runs
today'... We're not grading them. They're not going into the Billfold." And:
five in every category. The first version (darts drawn from Gary's HR and TD
prop lanes by `select_darts`, a `--lane=dart` pass after NFL props, Hit/Miss
from the props grader) is removed.

**Categories, five each** (`src/services/darts/dartsCommon.js`):
- MLB: home run, 2+ hits and a run (two prices: 2+ hits and run scored),
  first-inning run (yes or no on a game).
- NFL: anytime TD (RB/WR/FB), tight end TD, QB rushing TD (a QB's anytime
  TD), first TD, receiving yards over, passing TDs over, interception thrown.
- A category takes fewer than five only when the day's markets hold fewer
  (a one-game night has two quarterbacks).

**The run** (`scripts/run-darts.js`, launchd `com.gary.darts`, every 20 min):
from 09:15 ET (`DARTS_START_ET`) each league with games still to start gets
its board; the first run throws everything; later runs fill categories that
were short because markets had not posted, at most once an hour per league
(`dart_runs`). A thrown dart is never replaced. Every run also scratches.

**The boards** (`mlbDartsBoard.js`, `nflDartsBoard.js`): MLB reads the morning
board (`tomorrow_board` for today: park in words, total, moneylines, weather,
starters, the arms write-up, team offense and first-inning scoring, vs-hand
OPS), `mlb_field_lineups` (projected until posted: order, bats, OPS, season
HR, hot/cold) and BDL prices (HR, 2+ hits, runs scored, the first-inning
market); games the league called off are dropped. NFL reads BDL games,
spread/total, props with positions, the injury report (out players are left
off, questionable is printed) and nflverse weekly lines: this season's game
count and totals beside last season's. One book per price (DraftKings first).

**The throw** (`dartsBrain.js`): claude-sonnet-5 on the subscription at medium
effort (Terra behind it; Fable and Astra stay on the real picks), one call per
league. The ask is the contract only: exactly N per category from the board's
ids, two sentences each. Short or invalid answers are re-asked for exactly
what is missing (twice). Stored with `model · DARTS_PROMPT_SHA`.

**Scratches** (`dartsScratch.js`): any dart on a postponed game; MLB, the
player's club posted its lineup without him (statsapi feed); NFL, the injury
report has him out. The card says SCRATCHED with the reason.

**Database** (`20260922001200_darts_morning_lane.sql`, applied): `select_darts`
and its cron job dropped; `darts` gains position, book, odds_alt, model,
scratched_at, scratch_reason, unique per (date, league, kind, subject, game);
`dart_runs` logs each throw; `darts_day` has no grade; `get_darts` returns
today only (`yesterday` stays an empty list for build 951).

**The page** (built out Sep 23, founder: "do it your way for real", parts
taken from the 25 mocks on the canvas https://claude.ai/artifact/SXTr673CAFArSTFrdQ6mP5):
`ios/GaryApp/Darts/DartsView.swift` (the page) and `DartsParts.swift` (its pieces).
Top to bottom, one league at a time (MLB · NFL, no ALL):
- **The streak tape** (mock 01): the league's longest runs, good and bad in
  turn, crawling across the top ("MERRILL ▲ HIT IN 11", "REALMUTO ▼ 0 FOR 21").
  Names open cards. It holds still off screen (`readingPageActive`), in the
  background, under Reduce Motion and with VoiceOver.
- **The darts**, one category at a time: the category is the tab (no heading
  above it), a sideways swipe on the table moves on and the tab row follows.
  Each dart: first name and club color, the SURNAME big, the game, the price
  big in gold, his last 10 games as dots (gold where the dart would have hit);
  NFL darts show this season's games and last season in words. 2+ hits and a
  run labels both legs. First-inning darts show both clubs (each opens its
  team card) and each club's first-inning scoring in its last 10. Scratched
  darts dim and say SCRATCHED or POSTPONED. No reasons on the page.
- **Gary's parlay** banner (the parlay of the day; the slip tab rides the edge).
- **Gary** (mock 08): his game-pick record for 7D, 14D or 30D, green or red,
  over a chart of each day's net (bars) and the running line; the teams he is
  on a run with (wrapping, each opens its team card); side numbers as tiles
  that swipe (right now, underdogs over 30 days, primetime, yesterday's big
  prop and pick).
- **Streaks** (mock 15): tabs by kind (HITS, HOME RUNS, TOUCHDOWNS, 100 YARDS,
  WINS, SPREAD, TOTALS); paired kinds set side by side (hitting and hitless,
  winning and losing, covering and not, overs and unders), each run's length
  a bar on its own column's scale; names open cards.
- **Hit rates** on the yardstick (`DartsHitRates.swift`, MLB), last.

Form: `darts.form` jsonb, filled by the darts job after each throw for every
dart still missing it (`src/services/darts/dartsForm.js`): MLB `{of, ok}` from
BDL game stats (last 10 finals, not spring), first inning `{away, home, of}`
from the morning board's run profile, NFL `{now:{g,v,ok}, last:{g,total},
unit}` from nflverse (by player across clubs; a FIRST TD dart has no dots;
January/February belong to the previous season). A failed read leaves the form
null and the next run tries again. Gary's day-by-day record is `gary_run.daily`
(last 30 days by league) (`20260923000100_darts_form_and_daily.sql`).

First real throw: Sep 22, 2:19 PM ET, 15 MLB darts in 47 s (Alonso, Alvarez,
Olson, Caminero, Goodman to homer; Soto, Trout, Springer, Arraez, Tatis 2+
hits and a run; five first-inning calls). Blue Jays @ Orioles was rained out
at 2:06; its three darts were scratched by the job.

## NFL streaks (`src/services/nflStreaksService.js`)

MLB streaks come from BDL (`streaksService.js`); NFL streaks come from two
nflverse CSVs (schedules/games.csv, stats_player/stats_player_week_YYYY.csv),
no BDL calls, carried across from last regular season: team W/L runs (3+),
ATS runs (3+), player TD runs (3+), 100-yard rushing/receiving runs (2+),
with the next game. `streaks.kind` check widened (migration
`streaks_nfl_kinds`). Runs inside the results runner after the MLB streaks
(non-fatal) and by hand: `node scripts/run-streaks.js --nfl --date YYYY-MM-DD`.
Today's snapshot: Bills 10 straight covers, Seahawks W9 and 9 covers,
Colts 0-9 ATS, Zay Flowers TD in 5 straight, Hampton TD in 4 straight.

## Picks page: names open the player card

`ScoutArmsPlate` carries `playerId`/`fullName`; `ScoutArmsLayout` takes
`onName`. THE ARMS (MLB, `ScoutTrio`) opens the card by full name in today's
cards (`PlayerCardByName`); THE QUARTERBACKS (`FootballGameIntelView`) opens
it by the starter's id (`PlayerInsightSheet.directLeague` is new, so an NFL
id no longer fetches in MLB). No card today says NO CARD. Team names → team
card is next (the Hub's `HubTeamCardSheet` needs the day board, streaks and
cards handed to it from Picks).

## Profile

The FOLLOW button, the friends-board copy and `ProfileFollowAPI` are gone
(founder: "we aren't doing the friends thing anymore"). The leaderboard had
no friends lens already.

## Open

- Team card on the Picks page (above).
- Delete `HubView` and the Hub modules once the team card is ported.
