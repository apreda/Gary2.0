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

## The page (`ios/GaryApp/Darts/DartsView.swift`)

One RPC, `get_darts(p_date)`, then:
- **TODAY / YESTERDAY** — the darts as modules (league, matchup, time; the
  player in Bebas; HOME RUN or ANYTIME TD with the price; Sealed with a
  countdown, Live with the score, Hit or Miss with the count). Tap opens the
  dart: the hero, Gary's take in full, a PLAYER CARD button (by id for the
  NFL, by name for MLB).
- **STREAKS** — player and team runs for MLB and NFL, longest first, the next
  game on the right. Tap a player for his card. Badges: W6, L4, ATS 10,
  ATS 0-9, 11 GM, HR ×4, TD ×5, 100 ×2, 0-24, O ×n, U ×n.
- **GARY'S RUN** — ON A RUN (his active win streak by team, 3+), YESTERDAY'S
  BIG ONE (the highest-priced winner, prop and game), PRIMETIME (TNF/SNF/MNF
  record this NFL season), RIGHT NOW (his active league streak, 2+),
  UNDERDOGS, LAST 30 DAYS (record and money on plus-money game picks).
- Text tabs ALL · MLB · NFL. The corner Talk button knows the page.

## Backend (`supabase/migrations/20260922000500_darts.sql`, applied)

- `darts` table (public read). `select_darts(p_date)` chooses from Gary's
  own HR lane (MLB) and TD lane (NFL) in `prop_picks`: by his stated
  confidence, one per game, at most two per price band (MLB bands 400/600,
  NFL 200/400), four per league per day, immutable once chosen. pg_cron
  `darts-select` runs it every 20 minutes for the ET date, so the board
  fills as the lanes publish (the HR lane publishes with lineups).
- `darts_day(date)` joins the props grader (`prop_results` by date, player,
  market, side) for Hit/Miss and the count.
- `gary_graded_games(from, to)` unions `game_results` (MLB, NCAAF) and
  `nfl_results` (regular season only); `gary_run(day)` computes the run.
- `get_darts(p_date)` returns today, yesterday, the latest streak snapshot
  per league (MLB + NFL) and the run. anon + authenticated.
- Sep 20 and 21 were selected by hand for the first look: Sep 20 has Rice
  +600, Lowe +440 and two more HR darts, four TD darts (Tuten +200 hit);
  Sep 21 has Skattebo +120 (miss). Today's MLB darts land when the HR lane
  publishes.

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
- Adam's pick from the leans list (in the session report) decides which
  lanes join HR and TD on the page; each new lean is a lane that publishes
  into `prop_picks` (or a new table) and a `kind` in `select_darts`.

## The DART lane — built Sep 22, 12:45 PM (founder GO)

The darts are Gary's own leans from the football props desk, not a second
design: `run-agentic-nfl-props.js --lane=dart` runs the same
`analyzeFootballPropsDesk` (scout report, players shelf, prop sheets, Jev
evidence assessment) with three differences:
- **The dart board** keeps the dart markets only (`DART_MARKETS` in
  `footballPropsDesk.js`): anytime touchdown (a tight end reads as its own
  kind on the page), passing touchdowns, rushing touchdowns (a quarterback's
  reads as its own kind), interceptions thrown, receiving yards. First
  touchdown stays out: the settlement layer marks it unsupported
  (`INVALID_NFL_PROP_TYPES`), and a dart nobody can grade is not a dart.
- **The ask** is `THE_DARTS_ASK`: up to two darts a game, leans that never
  touch the record, two sentences each, pass allowed. Prompt era
  `DARTS_PROMPT_SHA`.
- **The brain** is `DART_CASCADE` = claude-sonnet-5 on the subscription,
  then codex terra, at low effort (`runPropsDeskBrain` now takes `cascade`
  and `effort` overrides). Fable and Astra never see a dart.
Picks store in `prop_picks` with `lane: 'DART'` and sport NFL through the
same atomic store; the grader settles them like any prop; `prop_lane_ledger`
shows them under DART. Nothing else reads them: Winners admission's
`coreProp` excludes DART, and the app's `fetchPropPicks` drops the lane at
the source, so no prop card, log sheet or breakdown lists a dart. The Darts
page reads the `darts` table, and `select_darts` draws DART-lane picks first
(by Gary's confidence), then TD, HR and the core kinds; a quarterback's
rushing touchdown is the `qbtd` kind (his card says QB).

Order: the scheduler runs each NFL game's real props, then the dart child
(`--lane=dart`, non-fatal, logged as "Darts outcome"). The CLI's early-skip
dedup is lane-aware (a game with props still gets its darts; a game with
darts still gets its props). Always props first: the atomic store's dedup
key has no lane, so a dart thrown before the props could shadow a real card.

The scheduler holds its code from spawn; restart it for the dart child to
run (`launchctl kickstart -k gui/$UID/com.gary.scheduler`), when no pick
child is mid-run.

MLB darts stay as they were: the HR lane and the core lane's 2+ hits. A
first-inning-run dart needs a game-market lane; not built.

### Dry run receipt (Sep 22, 12:50 PM ET, `--lane=dart --store=0`, Falcons @ Packers, Thursday)
Dart board 21 priced markets, 11 players, Jev screened 11/11 (87K input
tokens), the throw on claude-sonnet-5 (43K in, 2.5K out): two darts. Michael
Penix Jr. over 0.5 interceptions -107 (56%): first live action in ten months
on a four-day week behind a hurt line against a seven-sack defense; against
it, his 1.1% interception rate last season. Christian Watson anytime TD +150
(62%): 9.5 targets and 94 yards a game with three scores, the room thinned
by Reed and Melton; against it, Atlanta has allowed four passing touchdowns
in two games. Both two sentences, no dashes. The Claude route timed out once
and the codex logins are capped until Sep 26, so the brain's own overload
retry carried it; a second Claude rung would make it sturdier. Scheduler
restarted 12:52 PM with the dart child armed for Thursday.
