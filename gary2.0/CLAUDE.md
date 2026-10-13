# Gary — current project instructions

Production checkout: `/Users/adam.preda/Gary2.0`, main. Read root `AGENTS.md`.

## Adam's iteration rules — September 21, 2026

- Never show screenshots as proof or for review. Adam checks the actual app
  himself and tells us whether the output is correct.
- Do not add tests or run tests unless Adam explicitly asks. No automatic
  regression suites, smoke checks, or visual QA during ordinary edits. When he
  confirms the app output is correct, accept that as sufficient verification.
- Do not archive, upload or send builds to TestFlight until Adam explicitly
  requests it. Save the requested changes and batch release work when he asks,
  typically at the end of the day.
- Do not indirectly trigger tests or release workflows through a push; hold
  such pushes until he authorizes that work.

These instructions supersede older automatic testing, production-audit and
TestFlight-delivery requirements in this file, README files and skills.

Current sports: MLB, NFL, NCAAF and NHL. Retain NBA's pinned April 8 prompts and
seasonal features. NCAAB was retired August 27; World Cup UI is retired.

## NHL game picks — October 3, 2026

Founder GO Oct 3 2026: NHL game picks at no data cost. The Aug 27 lane was
BDL-based and is not restored; this lane reads the league's own free feeds.

- Data: `src/services/nhlApiService.js` (api-web.nhle.com, api.nhle.com/stats,
  ESPN injuries) and `src/services/nhlGameData.js`. BDL's NHL endpoints need a
  paid tier this account does not carry and are never asked for hockey. The
  NHL game id rides wherever a BDL game id does.
- Lines: DraftKings from the league's partner feed, game day only. A future
  date's board is unpriced. The Odds API backup is used only for a game-day
  outage of the partner feed.
- Ticket: the moneyline on every game (overtime and shootout included), at
  any price, never rewritten into another bet. No puck line, no total.
- Shape: MLB's desk-two-cases-bet flow with hockey's nouns
  (`scoutReport/sports/nhl.js`, `orchestrator/nhlPrompts.js`,
  `constitution/nhlConstitution.js`, tools in `statRouters/nhlFetchers.js`).
  The starting goalie is read like a starting pitcher. The league feed does
  not confirm starters; the desk says so and carries dated reporting.
- Not built: props (no free source prices them), Winners admission, push
  alerts, insight cards. NHL picks publish without a real-money bet until the
  founder admits the league to Winners.
- Hold switch: `GARY_MANUAL_GAME_PICKS=icehockey_nhl`, then reload the scheduler.

## Every sport, one system — October 8, 2026

Founder, Oct 8 2026: "all of the game picks for all the sports need to follow
the same system ... the research assistant, Gary, both cases, and then the
pick." MLB's June loop is the reference (since Sep 24 every MLB read carried
both cases, 64 of 64); NFL took it on Oct 4; college takes it now:

- The research assistant runs for college like the NFL's and MLB's (the
  `researcherOn` switch in `agentLoop.js` no longer excludes NCAAF; the Oct 3
  reason, the roster dossier, was deleted Oct 7). Its grouped college plan
  (`footballResearchPolicy.js`, 28 served tokens) and the ASK RESEARCHER
  follow-ups are the shared ones. `GARY_RESEARCH_EFFORT` lowers every
  researcher if college Saturdays strain the GPT logins.
- Both cases under their headings, then the pick: college's first message ends
  with the NFL cases block as written; a college or NFL answer without both
  cases fails the pick (`cases_missing`) and a later scheduled attempt makes
  it. MLB's June loop is unchanged.
- Differences between sports live in the ticket, not the procedure: the
  question and the case headings follow the bet (moneyline or run line in
  baseball, the spread in football). College keeps its own decision turn
  (menu, house limit) and NFL its one-question turn by the Oct 4 law.
- NHL is held and off the app; it takes the same shape when it returns.

## Gary's card — October 12, 2026

Founder GO Oct 12 2026 evening ("just fix the judge yourself ... he ranks them,
then we send the best rank one to winners"; "I trust you, go ahead"). Three
graders in three weeks separated nothing (lean 82-71-3, toss-up 9-9,
unsupported 9-9; NFL 0 clear of 14 after the Oct 11 rewrite), and the bet
step's parser had recorded 53 of 55 "passes" with no reason: Gary's answer
was dropped on its ticket id (he had bet the Rams $200 and the Dodgers $400
that night). Nothing from the record gates the new system; its judgment
starts with the weekly report.

- Every game pick runs as before: desk, research, both cases, the pick, the
  bet step (`garyBet.js`; the parser now takes a one-ticket answer whatever he
  called the ticket, and a pass nobody wrote carries `parser_default`).
- THE CARD (`pickdesk/garyCard.js`, migration `20261012233000_winners_card.sql`):
  right after the pick publishes, the same brain places it on today's card,
  his picks of the day so far top to bottom, each in his own words from when he
  made it (the private weighing; the rationale where there is none). Slot 1 is
  the pick he would hand a friend who can make only one bet today. Earlier
  picks never move; nobody re-judges an old pick; the day's first pick takes
  slot 1 with no call. Placements run one at a time (SQL `card_claim_turn`, a
  three-minute lease). A missing or malformed answer goes to the bottom,
  flagged, and never touches the pick or the bet. The same answer carries the
  card reasons (`winners_reasons`). He sees no stakes, results, counts or
  mention of Winners in the card ask.
- THE BOOK (founder, Oct 12 2026 night: "I don't want to mandate a certain
  amount, that is not how a real human would do it, what if we have only 1 or
  5 strong plays?"; migration `20261013001500_winners_card_cut.sql`): the
  one-in-five count is gone. At every placement the same answer also names
  which picks on the card, the new one included, are in his book today
  (money on them); the latest answer is the day's cut. SQL `seat_the_card`
  (the Winners worker every 30 seconds) puts a pick on Winners when the cut
  includes it, inside 75 minutes of its own kickoff and 20 minutes out at the
  least, once the card holds two picks, at his bet-step amount. A seat is
  final whatever a later cut says. The day's first pick is placed with no
  call and decided by the second placement's cut. A seated pick he passed
  takes the number ask (`garyBigGameStake.js`). Board policy `winners-card-v1`,
  reason "Gary's book: #2 of 11 on his card". Gary never predicts his own
  spread (Aug 5, Oct 4 laws stand): the Oct 12 research's "own number" design
  was rejected for that reason.
- Unchanged: big games (`winners_big_games`; the judge `winnersReader.js` still
  reads them, on at his number whatever it said), props (daily-props-v1), the
  daily floor (now ordered by the card), darts. The judge no longer reads an
  ordinary game pick.
- Judge the card weekly, never Gary: `node scripts/winners-judge-report.js`
  (board vs the rest vs passes, the grade split, the card's slots #1, #2-3,
  #4-5, #6+, and his book in vs out, against results). Nothing from past
  picks gates or tunes it (founder, Oct 12). Expect fewer than everything and
  more than a sharp; if the book is most of the slate after two weekends, the
  only levers left are a count or his own number, and both are his call.

## College desk and menu — October 3, 2026

Founder GO Oct 3 2026 after the 85-103 start ("just fix and do 2 3 4 ... then
do all 7"). The college desk and the college decision text changed; the model
route, coverage rules and Winners admission did not.

- Desk order is football first, the market last: availability, press
  accounts, quarterbacks and staff, the season game by game, home and road,
  team numbers, then THE LINE (the price only, since Oct 4 2026).
- `scoutReport/sports/ncaafSchedule.js` supplies the site (stadium, city,
  capacity, surface, elevation, neutral or not, the visitor's trip, local
  kickoff, the kickoff-hour forecast at that stadium), every game this season
  with its date, site, halves and the opponent's conference, current record
  and AP rank, each team's home, road and neutral-site results with counts,
  who played quarterback in every game (the most pass attempts; the box
  score does not record who started), the starting quarterback's games by
  site, and the schedule behind the season totals. The
  game feed names a "home" team at a neutral site; the schedule provider's
  neutral flag decides, so a kickoff classic or the Cotton Bowl is never a
  home or road game. The old five-game form line (mascots only, undated, ran
  into last season) is gone.
- Availability prints once, in INJURY REPORT. The quarterbacks-and-staff block
  no longer repeats the names.
- Missing press accounts say so on the desk with the reason. The dossier
  search has a ten-minute window (it was cut at six: 7 of 31 desks on Oct 3
  had none).
- College sessions are handed college tools only
  (`toolDefinitionsForSport`); other sports keep the shared list.
- The menu (`ncaafMenu` in `passBuilders.js`): every ticket is named. When a
  favorite's moneyline is past the house limit the game is framed as which
  side of the spread, with the underdog's moneyline as the third ticket and
  how each spread ticket settles stated as a fact. The old "a favorite priced
  past that is a spread ticket" sentence is gone, and the house-limit re-ask
  asks the choice again instead of swapping onto the favorite's spread.
- Awareness (`ncaafConstitution.js`): MLB's short-sample and inconsistency
  bullets are ported; the bullet that listed home field with reputation,
  records and rankings as things to question is cut. THE SPOTS is ported
  from the NFL with college's situations (a ranked team's first real road
  test, a conference underdog at home, a look-ahead, the side everyone is
  piling onto after a big week): facts about the week, never a lean.
- College Gary reads the web himself, the way NFL Gary does (founder yes,
  Oct 3 2026): search and page reading are open in his session, under the
  shared article-date rules, with the NFL's WEB CONTEXT block. Before this he
  read summaries of reporting written by the search login.
  `GARY_NCAAF_BROWSE=0` closes it.
- A record arrives with its games (founder, Oct 3 2026: "records don't help
  really"): every home, road, neutral-site and close-game record on the desk
  and in the college tools lists the games behind it, each dated, with its
  score, halves and who the opponent was (`opponentContext` in
  `ncaafSchedule.js`, shared by the desk and the tools).
- College waits for Opus (`scripts/lib/picks/collegeOpusWait.js`): when the
  Claude subscription is at a limit that reopens before a game's 90-minute
  attempt, the run leaves the game to a later scheduled attempt (240, 180, 90
  and 30 minutes before kickoff) instead of the GPT recovery login. A limit
  that reopens later than that changes nothing; GPT Sol picks as before.
- No DeepSeek behind Gary: the heavy route (picks, props, darts, Winners,
  the app's writing) is Opus, then the GPT Sol logins, then the next
  attempt. DeepSeek stays only behind background work.
- The college tools Gary calls (`NCAAF_HOME_AWAY_SPLITS`, `NCAAF_RECENT_FORM`,
  `NCAAF_CLOSE_GAME_RECORD`) mark neutral-site games the way the desk does
  (`statRouters/ncaafNeutralSites.js`).
- Shared loop, every sport but MLB's own June loop: a web search is tagged
  with stat names from its wording for the investigation count (a list
  written for basketball). Those tags are flagged `inferred`; they no longer
  make a later request for that stat look already answered, and they stay
  out of the pick's requested-stats record. Measured over Sep 1 to Oct 3
  logs it had dropped one real request (an NFL `INJURIES` call); NBA's
  unprefixed token names are the ones it would collide with.

## Desk searches after the move to GPT 6.1 Sol — October 3, 2026

Background searches moved to GPT 6.1 Sol on Oct 1. Its long desk searches
(a team's week of news) now often run past six minutes. The effects, found on
Oct 3: college desks lost their press accounts (7 of 31), and NFL desks lost
their articles (the Oct 1 desk carried one AS WRITTEN section; Sep 28 carried
twelve), because two timeouts switch the GPT search login off for the run and
Claude was then given three minutes. Repairs:

- `subscriptionSearch.js`: a GPT login that times out on a search hands that
  search to Claude, not to the other GPT login (same model, same question,
  same cut).
- NFL article discovery (`nflArticlesAsWritten.js`) and the college dossier
  (`anthropicFootballGrounding.js`) take the search lane's ten-minute window.
- A search that came back empty is named on the desk as a retrieval failure
  (NFL current state: REPORTING GAP; NFL articles and college press accounts
  say why they are missing).

## Reuse the sport that already has the feature — September 21, 2026

A feature that already exists for one sport is the reference implementation
of that feature for every other sport. A request for it in a second sport is a
port of the existing system with the sport's nouns swapped, never a new design.
The sport that built it first is the reference for that feature: MLB's Arms
take for a starters write-up (the NFL quarterback box was rebuilt as a stat
template; that is the mistake), the NFL's touchdown lane for a scoring-play
lane elsewhere. Separate files per sport are fine; two designs for one feature
are not. A deliberate difference needs a sport-specific reason stated in the commit.
Shared-system changes ship to every sport that has the system, in one update.
Where a sport rebuilt something another sport already had, bring it back to
the reference.

## Current direction — September 19, 2026

- Adam authorized the college repair and resumption, then two native bug and
  performance passes per current page (MLB/NFL/NCAAF, excluding NBA), cleanup
  of obsolete code, and delivery to TestFlight. These are implementation
  instructions; another approval is not needed for the requested fixes.
- NCAAF: one game pick and at most one player prop per eligible game. Either
  team in ACC, Big Ten, Big 12, SEC or the current Pac-12 qualifies, as does
  Notre Dame. Boise State is intentionally included in the 2026 Pac-12.
  Founder exceptions (Sep 26 2026): Texas State qualifies only against another
  current Pac-12 team, at home or away. No FCS opponents (founder, Oct 2
  2026): a game with an FCS team on either side is out. Exclude every matchup whose main spread
  is 23 points or more in magnitude, including exactly 23, before game/prop
  research or model calls. Apply the same rules to saved-slate and prop retries.
  One-time exception (founder, Oct 3 2026): Vanderbilt at Georgia, BDL game
  458366 on the 2026-10-03 slate, bypasses the 23-point game/prop exclusion.
  Other matchups and future meetings retain the limit; Winners keeps its
  separate admission rules.
- College game picks and props run Opus 5.5 (founder, Sep 22 2026: "all
  ncaaf picks should be on Opus not Fable or Astra"), on the Claude
  subscription, with the GPT Sol logins as the only recovery rungs.
- Effort (founder, Sep 23 2026): every model call runs at the effort its lane
  asks for, never a model-wide max. Game picks are the xhigh lane; nothing
  runs at max. Use the lightest model that does the job; Opus is for picks
  and Winners decisions.
- Supply dated rosters, named starting QBs, availability, coaches, transfers
  and attributed matchup reporting. Gary owns the prediction and may apply
  informed judgment; no favorite/underdog quota, prescribed conclusion, or
  statistic proving every opinion.
- Missing components remain visibly missing. Never pass off team passing
  totals as starting-QB analysis. Optional fields and wording preferences
  must not suppress a valid pick. Keep exact ticket identity and provider
  prices together; do not invent replacement quotes.
- No redundant AI reviews of Gary's writing or decisions. The unwanted
  five-minute AI repair automation was deleted; do not recreate it. Ordinary
  code failure reporting remains. Development checks verify mechanical
  behavior; they do not approve Gary's opinions.
- NFL Picks shows the current week's matchups and daily research before the
  day-of pick. Native surfaces use shared cards and immutable published
  tickets. Never rewrite a published prediction to make its result look better.
- MLB retains the June decision engine and its approved September 16 bullpen
  evidence repair. Preserve the June freeze and NBA prompts. The global xERA
  display ban remains; June's frozen decision input is the explicit exception.
- Winners reads the server board. Do not restore client-side admission or
  automatic favorite/underdog selection during UI maintenance.
- WINNERS = THE SEPTEMBER SYSTEM (founder GO, Oct 8 2026: "go back to the
  system that was 10-4 and 25-17 ... the grader is solid and Gary has more
  agency on his amount"; migration `20261008150000_winners_september_system.sql`).
  It replaces the Oct 3-7 systems: every MLB game automatic, college main
  games automatic, the NFL $300 rule, the in-session bet step, Gary-bets-only
  admission, the bankroll brief, the notebook and the bet scoreboard. The
  record behind it: Sep 25-30 MLB games under this gate 10-4 (+$966); Gary's
  passes the same week 12-9; Oct 1-7 games under the later systems -$2,202.
- Game picks, every league: Gary makes every pick. Right after, a separate call
  (`pickdesk/garyBet.js`, the Sep 24 ask, restored) asks whether he plays the
  ticket with real money and how much, showing cash on hand and what is
  already at risk today: $100 minimum, no maximum, a pass allowed. Then the
  card (see "Gary's card — October 12, 2026"): he places the pick among the
  day's earlier picks, and the top of the card is seated on Winners at his
  amount, one in five of the slate. A big game (`winners_big_games`, the MLB
  playoff rows; Sunday Night Football is no longer automatic) is on at his
  amount, or his number from one more question when he passed
  (`garyBigGameStake.js`), whatever the judge said. The Oct 8-11 judge gate
  (clear or lean, then clear only) is retired for ordinary game picks.
- College availability: the SEC, ACC, American and MAC official reports
  (`ncaafAvailabilityReports.js`, the public report service their sites embed)
  replace the searched injury list when the game has one. Big Ten, Big 12,
  Mountain West and Pac-12 stay on search plus one focused availability search;
  the Big Ten site runs a bettor detector, so its pages are not scraped.
- Props, MLB and NFL (no college props since Oct 9 2026): the Sep 16-24 selection (`winnersProps.js`,
  daily-props-v1, restored; it went 25-17, +$1,045). Gary makes every prop
  pick and is not asked to bet props. Within 90 minutes of a game window the
  reader compares that window's published props side by side, grades each, and
  selects clear and lean ones with its own stake, $100 to $1,000. At most six
  props a day, one per player, two per game, and the early and middle windows
  capped (SQL `claim_winners_props` / `finish_winners_props`).
- A wrongly admitted ticket is deleted, not shown as a Scratched line.
- THE DAILY FLOOR (founder, Oct 9 2026: "at least one game always make it to
  winners no matter what per day ... as long as games exist"; migration
  `20261009210000_winners_daily_floor.sql`). At the day pass
  (`day_pass_at`, 45 minutes before the main window) with nothing on
  Winners (darts and scratched plays don't count),
  `gary_private.winners_daily_floor` books one of Gary's game picks: the
  judge's best grade, then a pick he played, then his bigger amount, then
  the earliest start; only a game 20+ minutes out. Gary's amount, or the
  $100 minimum when he passed; policy `winners-floor-v1`. The
  `streak-pick-select` cron runs the floor, then `select_streak_pick`, so
  it becomes the day's free pick.
- Darts on Winners (founder GO, Oct 8 2026: "He already ranks them, and his
  order works"; migration `20261008180000_darts_on_winners.sql`,
  `src/services/darts/dartsBet.js`). MLB only. Gary throws exactly as before;
  the rule is ours, never his: his FIRST dart in H+R+RBI and his first in
  total bases go on Winners (his order at the throw: #1 hit 10 of 12 since
  Oct 1, #5 6 of 12), plus the one first-inning dart he chooses among the
  five. After the day's first throw of each category he is asked only the
  amount: money at risk, whole dollars, $100 minimum, no maximum, cash on hand
  and what is riding in front of him; a pass or an unusable answer books
  nothing. Home runs are never offered. The first-inning dart is booked at the
  throw; a player dart when the posted lineup confirms him (`dartsScratch.js`),
  through SQL `admit_dart`, with keys tagged `dart` so a props-lane twin never
  collides (a twin already on the board skips the dart). A booked dart is
  locked (no swaps anywhere since Oct 8), settles from the dart's own grade
  (ledger and `lab_ticket_result`), is voided when the dart is scratched, and
  never becomes the streak pick. Board policy `darts-top-v1`; the ticket
  carries `pick_text` ("Guardians @ White Sox: no run in the 1st") for the
  push and the app. A first-inning ticket books as player "No-Run" / "Yes-Run" (one word: the
  result rows shorten a name to its last word),
  market `1st_inning`, no line (Oct 8 2026), so every build titles it NO RUN 1ST
  INNING and passes the app's board check (an empty market failed the whole
  board). The props lane counts only its own tickets toward its limits, never
  darts (Oct 9 2026). NFL (founder GO, Oct 9 2026: "lets just do receiving
  yards then for now"): Gary's FIRST receiving-yards dart of the day, at the
  amount he names at the throw, booked 75 minutes before kickoff once the
  inactives are out and he is not ruled out (receiving yards 17-8 Sep 24 to
  Oct 8, his #1 5-2; rushing yards 6-9 and touchdowns stay off).
- Darts: the lineup-time review no longer swaps (founder, Oct 8 2026: a user
  who took the morning dart would see it taken down; the week's ten swaps went
  2-7). It fills open spots and marks parlay legs; a morning dart stands as
  thrown. A player not in the lineup is still scratched.
- MLB props workload (founder, Sep 26 2026): seek dated reporting about the
  starter's workload for this exact start, retaining reported pitch/innings
  ranges and attribution. The numerical screen uses the validated standard
  outs market to recognize a materially shortened outing (at least 25% and
  three outs below his historical workload). Scale both batters faced and
  historical ER/hits/walks/K counts; a market line is an exposure proxy, not
  a manager's limit or an exact expected mean. Gary still chooses the bet.
  This workload-reporting addition is an authorized exception to the June
  input freeze; no new review call or separate warning section is needed.
- Article dates (founder, Sep 26 2026): all sports and every search/browsing
  lane use the shared `articleFreshness.js` contract. Open publisher pages,
  preserve original publication date/time, source URL and the event's date,
  and prefer the newest game-specific reporting. Default current news is
  48 hours; live availability/workload seeks the latest 24 hours. Explicit
  topic windows still apply. Older reporting is labeled background and
  cannot establish current status. Never freshen it with a crawl, retrieval
  or modification date; undated current status stays unverified. Direct
  article readers enforce their publication window and evidence cutoff.
- Preserve the earlier dark Picks research containers. Adam rejected the
  September 19 grey fill; keep the wrapping/layout fixes and solid dark NCAAF
  panels without changing the established container palette.

## Current system notes

The app (Sep 24 2026): Home, Winners, Darts, Picks, Billfold. The Hub, the
classic Winners page, the old Fantasy briefing, Talk to Gary and Gary's voice,
the slip scanner, Systems and the store-safe App Store bridge were deleted on
Sep 24 2026 (founder: "we're only moving forward"). Do not restore them from
git history. The root handoff notes were folded in here and deleted the same
day; git history keeps them as receipts, not instructions.

Native loading repair (founder, Oct 3 2026): Winners publishes today's board
and yesterday's embedded grades independently of optional detail requests.
Unknown history is loading/retry; ungraded tickets are pending; only a
successfully read empty board says no plays. The free streak ticket uses the
same current module as every board ticket; its old compact fallback is removed.
Locked board counts offer sign-in/access refresh and never
masquerade as coming-soon picks; this does not change access or purchase gates.
Read-only Winners RPCs share in-flight work per account/token/body, with no
response cache or mutation coalescing. Tab, date and account transitions reject
obsolete responses. Home/Picks/Your Book publish core content before optional
sources, and failed reads have retry states rather than empty-board claims.
Billfold refreshes its current seven-day result window beside its cached
history; an empty successful window replaces old grades. Props and derived
totals stay hydrated during game-first refreshes. Visible history, bankroll,
personal book and leaderboard refresh on return and while open; hidden views
do not poll. These native edits await Adam's next requested build; no testing,
build, upload or push was requested for this repair.

Winners header (founder GO, Oct 7 2026, mocks 38, 39, 42 and 35 combined;
build 975): the logo is GaryFire on a winning run of two or more and
GaryIceCold on a losing one; by the profile, his money over his last ten
plays with W3 / L2 under it (`get_winners_run()`, read-only, game order, a
push neither extends nor breaks the run); the gold rule under the header is
the day's plays, each as long as its bet, with a play still to come as a
one-size gold dash; TODAY's row carries the record and money across every
sport (today's once a play has a result, before that yesterday's, marked
"Yesterday" in small type). No money split by sport (founder: "If Gary goes
3 and 2, it doesn't matter what the sports are"). The slim ticker keeps the
results and no longer repeats the totals.

False "Tap to retry" (Oct 7 2026, f73d3e87): session refreshes are
single-flight in `AuthManager` and a lapsing token is renewed before
authenticated reads; reads (never writes) ride out a brief drop through
`URLSession.garyRead`; pages keep their content through one failed refresh
and say so only after two.

NFL game picks take MLB's system (founder GO, Oct 4 2026, after a Week 4
Sunday where Gary took every side last week's results pointed to: "we don't
have the same system for nfl we do for MLB? Well yeah that is the issue"):
the desk, then the case for each side of the spread under
`CASE FOR [TEAM] COVERING THE SPREAD:` in MLB's alternating order
(`buildNflCasesMessage`, MLB's Pass 1 instructions verbatim), then the bet
turn, MLB's June ask in every sport (founder GO, Oct 11 2026): "What's your
bet, and what are the reasons why?" The Oct 8 per-case question ("for each
case: does it say what its side does on the field ... or is it mostly a list
of what's wrong with the other team") was the decision turn for one NFL
Sunday and became the scorecard: 8 of 14 write-ups graded the cases against
it and bet the side that passed (Jaguars -7.5 over a Philly case that said the
number had overreacted; Bears -1.5 at Lambeau), and "at the posted number and
price" produced break-even math at the bet (Browns +114). The idea sat
in NFL and NCAAF awareness as one line until Oct 11: what a team does on the field and
what the other team is missing are different things. The NFL constitution's
"take the bet anyway, because what it pays is worth the chance" sentences
are gone (Adam: the odds matter only if he likes the case). MLB's June bet
step is back to its frozen wording.
Both cases are stored as path_home/path_away. A first answer that skips a
case fails the pick and a later scheduled attempt makes it (founder, Oct 8
2026: both cases are the system). College takes the same cases block and
the same rule; its own decision turn follows unchanged.
THE WEIGHING (founder GO, Oct 11 2026, after the Jaguars +7.5 card spoke of
"the Philadelphia case" and break-even math to fans): Gary's answer to the
bet-turn question goes in a private `weighing` field, stored on the pick and
read ahead of the rationale by the judge and the bet step, never shown in the
app. The rationale is written for a fan: no mention of the cases or his
process. NFL and college; MLB's June step is untouched. Published picks keep
their rationales as written (the Jaguars card stays as a record of his
thinking).
The decision message is the output format and that question only (founder,
Oct 4 2026). The constitution names THE SPOTS (bounce-back, letdown, short
week, divisional dog at home, coming off a bye) as facts about the week, never
a lean. THE NUMBER ALREADY KNOWS was deleted from NFL and college on Oct 5
2026 (founder: Gary wrote "if the market overrated the Green Bay result" from
it), and the NFL injury paragraph is one sentence: every absence is already in
the spread.
THE MARKET IS THE PRICE (Oct 4 2026) and the Oct 5 ban on market material in
football are RETIRED (founder, Oct 12 2026: "No more Oct 4th rule please").
Market concepts, such as a spread inflated by the reaction to how each team
just looked, may reach Gary again in words the founder approves. Nothing came
back on its own: the NFL and college desks still show the market once, as THE
LINE (the posted spread and moneyline with their prices and the ticket menu),
with no opened/now line, line timeline, exchange prices, closing lines,
against-the-spread record or Jev market read. The line watch still records
boards for the app's line ladder. Gary still never makes his own number: no
projected margin, no distance threshold.
NFL AWARENESS = THE SPREAD (founder GO, Oct 12 2026 night; NFL only, "each
sport is different"). The NFL constitution, empty since Oct 11, carries one
awareness statement in `pass1Context`, the founder's words verbatim: a spread
is a price that carries the football and the reaction to how each team just
looked; recency bias can make the side of the team that looked bad the
cheaper side (buy low, sell high); whether that is happening in this game, or
last week showed a real change, is Gary's read. No look-ahead or line history
goes with it (founder: the concept holds at any number and Gary judges it
from the game data). College awareness is unchanged.
Later that night (founder GO: "Yes I agree with all of that GO ahead") the
NFL awareness grew from two statements to eleven, all plain facts: it gains "bettors favor favorites, well-known teams and
prime-time games, and the number is set with that in mind"; THE TEAMS (the
quarterback is the absence that matters most and other single absences
matter less than they seem; a team can play better without its star;
reputation lag; home field is worth far less than it used to be, with no
point value, since a value for a factor invites margin math; small early
samples); READING THE NUMBERS (stats that follow winning, passing efficiency
carries more than defense or the run game, motivation stories are what the
crowd bets). Same night the founder had it match MLB: one NFL AWARENESS
heading, no section headers, and no "is your read" lines at all ("can't he
just have awareness without being told what to do"); the recency-bias bullet,
rewritten from scratch, reads "When one team has looked good lately and the
other has looked bad, the reaction to that can inflate the spread toward the
team that looked good, and the team that looked bad can be the better side to
be on. That's recency bias: buy low, sell high."
Watch the write-ups for these cited where they fit, not as a checklist.
Jev supplies tentative situational assessments before Gary chooses; it does not
choose a side or turn classification confidence into a cover probability.
Football awareness is declarative context, not assigned reasoning. There is no
"Gary's Take" template, length target or subsequent rationale-writing
pass. Original evidence, research, tools, factual integrity and posted-market
constraints remain. A valid original rationale is stored unchanged; malformed
or provider-truncated output is a failed attempt, not a draft to rewrite.
The NFL desk also carries EACH UNIT, GAME BY GAME and WHO PLAYED THOSE SNAPS
(`scoutReport/sports/nflGameByGame.js`, founder GO Oct 4 2026: season totals
"only tell a small amount of the story"); college carries the same per-game
unit lines and its availability report beside each player's games.
Since Oct 12 2026 (founder GO, "Fix all those gaps", NFL only) each NFL game
line also carries what tells a fluke from a trend, all from the nflverse
play-by-play the ledger already streams (`nflPlayLedger.js`, schema 3): the
final score beside the stats (THE SITUATION keeps its halftime story), how the
turnovers happened (interceptions, fumbles and how many were lost, any
returned for a touchdown), the game script (snaps while the offense's win
probability was 5-95%), special teams (field goals with each miss's distance,
extra points, blocks, returns of 40+ yards, kick and return fumbles, onside
recoveries, special-teams touchdowns, safeties) and accepted penalties.
The same night (founder GO, "all those blind spots need fixed", NFL only),
the desk closed eight more: each game names both quarterbacks; each team's
block opens with its season drives (points a drive, red zone, average start,
each ranked) and the schedule its units faced (each opponent's season EPA
without its game against this team, ranked); each game shows its drives and
the drives faced (half-ending drives left out), its setting (roof, kickoff
temperature, wind, conditions), the team's rest and trip, and the regulars
missing on each side from nflverse snap counts (60%+ of snaps in at least
half the other games; did not play or under 40% that day). THE SITUATION
adds the stadium and roof, the kickoff-hour forecast for open-air and
retractable roofs, the local kickoff and the visitor's home clock, each
team's rest and trip and each head coach's seasons with the club and any
change this season (`nflSchedule.js`: nflverse schedules/games.csv plus a
stadium table keyed by nflverse stadium id). Article discovery asks for
local newspapers, beat writers and national reporting first; one second
search for the topics still missing accepts any readable reporting, club sites
included (Oct 13: the independent-only search found 8 of 16 topics; with the
second pass 15 of 16), and every club-site article is labeled as the club's
own account (15 of 16 articles on the Oct 12 Bills at Rams desk
were club sites). Tables inside an NFL article (box scores) are dropped from
its text; the writing stays whole (Oct 12 dry run: a fan-site recap printed
400 one-cell box-score lines). The game-by-game section grew from about 3,500 to 14,800
characters at Week 5 and grows with the season. Each game line names the
starting quarterback when someone else took most of the pass plays ("S.Darnold
started (12% of the pass plays), then D.Lock (89%)"), and a quarterback who sat
while another regular quarterback played is not listed as a missing regular.
NFL RESEARCH ASSISTANT = BEYOND THE DESK (founder GO, Oct 13 2026: keep what
it is good for, cut the rest). The six-subject sweep (identity, last game,
situation and story, offense against defense, availability, special teams)
mostly restated the desk (Oct 11: 14,000-21,000 characters a game, about 2.5
minutes on Opus). The NFL researcher (`nflResearchPrompts.js`, NFL branch) now
reports only newer or missing reporting on who plays and who calls the plays,
and tool facts where the desk has a gap, dated and sourced, under 4,000
characters, with no opinions or assessments, no story of the week, and
"nothing beyond the scout report" as a complete answer. Its briefing drops the
Context and Attributed assessments fields. Follow-ups (ASK RESEARCHER, up to 6)
stay, with the same no-opinions rule. Still Opus. College keeps the
six-subject method.
MLB's June engine, NBA's April prompts and NCAAF behavior remain unchanged.

Jev (TypeSafe) integration, via `src/services/jev/client.js`:
- Props: MLB (`pickdesk/propsBrain.js`) and NFL (`pickdesk/footballPropsDesk.js`) get labeled role,
  workload and matchup assessments before Gary decides. Backend `.env`:
  `GARY_JEV_ENABLED`, `GARY_JEV_MODE=assist`, `GARY_JEV_PROP_LEAGUES`,
  `GARY_JEV_MODEL`. No post-answer critic, no automatic direction change.
- NFL games: `jev/nflMarketAssessments.js`, inserted in the NFL branch of
  `agentLoop.js` after research and before the final question. Disable with
  `GARY_JEV_NFL_MARKET_ENABLED=false`. An unavailable assessment leaves the
  original evidence intact.
- NCAAF games (Sep 25 2026, ported from NFL): `jev/ncaafMarketAssessments.js`,
  inserted in `agentLoop.js` before Gary's first turn. Disable with
  `GARY_JEV_NCAAF_MARKET_ENABLED=false`. Both reads cover each team only
  since Oct 4 2026 (no crowd lean, no line movement).
- Private receipts live in `gary2.0/logs/jev/`. Published props carry
  `jev.run_id`. Use the [TypeSafe skill](../.agents/skills/typesafe-ai/SKILL.md).

MLB props trial (founder, Sep 25 2026): the Sep 23 prop model (684ee41e) and
the Sep 24-25 sheet changes (2d34917b, 9788e9a8) are on trial. If MLB core
props do not improve on the Sep 2-22 baseline (286-191, 60%) within about
three weeks (review around Oct 16 2026), revert to the earlier system. Revert
points are tagged: `props-before-sep24` (the Sep 23 model, before the sheet
changes) and `props-before-sep23-model` (the formula screen behind the 60%).

NFL props menu (founder, Oct 6 2026: "Formula narrows, Gary picks the side"):
the NFL volume model (`nflPropModel.js`) still chooses the three markets
worth a look, but the board shows each one's over and under at their posted
prices with the formula's projection, and Gary takes the side
(`nflMarketSides`, `buildNflSidesBoard` in `footballPropsDesk.js`). Why: since
the Sep 23 model chose the side, NFL unders went 19-21 (the model lags role
changes); Gary's own unders before it were 11-0. MLB keeps the formula's side
(Sep 2 to now, 60%; when Gary picked freely from the full MLB board, Aug 3 to
Sep 1, it was 50%). Judge the NFL change on its own record.
The formula reads role changes (founder GO, Oct 6 2026; `nflRoleChanges.js`): a
teammate who played the team's last game and is out now leaves his recent
share of targets and carries to the active players; from his third game a
player's role is this season's alone; his snap trend moves his share. On the
64 NFL props of Sep 24 to Oct 5 it changed little (4 unders dropped, 2-2).
Oct 7 2026 (founder GO, after NFL darts went TD 4-15 and rushing yards 5-9):
the darts NFL screen reads the same role changes; an anytime TD "yes" price is
measured against its real cut (`touchdownCut` in `nflPropModel.js`: x1.08 for
favorites, x1.15 to +200, x1.20 to +400, x1.25 past it, from 535 graded
prices; it was x1.07), on the props board and the darts list alike; and every
NFL prop and dart sheet says when last season was a different role
(`priorRoleNote` in `footballPropSheets.js`: another team, half or double the
touches a game, or a backup then and the starter now).

MLB props menu stays three deep (founder, Oct 7 2026: "revert"). An
eight-deep playoff menu ran Oct 6 for one night: a replay of today's formula
and menu rules on 678 saved MLB boards (Aug 5 to Oct 5) graded ranks 1-3 at
1056-676 (61.0%, +3.1% ROI) and ranks 4-8 at 913-846 (51.9%, -6.3% ROI), the
same in both eras and on both sides. Do not widen the MLB menu without new
evidence.

MLB playoff decision (founder GO, Oct 7 2026 night, after White Sox -130
and Yankees -168 lost: "we oversteered Gary towards the favorites ... and took
out the betting part of it"): the decision step is again the one that took
the Guardians at +110 that morning, June's playoff checkpoint as of Oct 4 (the
sharp-gambler synthesis, decision freedom with "upsets happen", "Records
describe what happened", the posted prices, no closing question), plus the
announcer opener; the ticket is a team's moneyline (founder: "no run lines
still"). The afternoon's "Which team do you think
wins?", the hidden price and "Which team do you bet to win, at its posted
price" are gone. Out in the postseason: the ESTABLISHED INJURY RULE and the
injury label's "already account for this absence" (false in October: Aaron
Judge, out for the ALDS, went unmentioned). "Each game is its own event"
stays out (founder). THE PRICE and the odds tool show the two moneylines.
The research assistant reads June's luck and sustainability sections again and
five October lines of June's season awareness (bullpen state, park, schedule
and rest, game-to-game variance, momentum). xERA is out of everything Gary and
his research read (founder: "i want xERA stats out completely"). Kept out:
implied probability, line movement and public money, the run-line and total
research sections, the regular-season standings, head-to-head and defense
research, "If one side is a heavy favorite, note the price", day/night splits. Kept: every data change of Oct 7 (postseason
numbers, starters' and relievers' postseason game by game, full articles).
The playoff bullpen section (founder GO, same evening: "no need for
duplicates") is one block per reliever (`mlbPlayoffPen` in
`scoutReport/sports/mlbPenPlayoffLines.js`): each team's pen at a glance and
rotation, the next game's starter, the last week's pitching moves, then per
arm his rest, his postseason totals, his last three outings batter by batter
plus any earlier postseason game on one line, his regular season with each
hand, and earlier meetings with tonight's opponent not already shown. The
pens' articles drop paragraphs already printed elsewhere on the desk. It ran
58-84K characters a desk; it now runs about 30-40K.

Odds sources (founder, Sep 25 2026): BDL first for game odds and props in
every sport; The Odds API is only the backup, on a free 500-credit plan
(`THE_ODDS_API_KEY` in `.env.local`), and every call to it goes through
`src/services/oddsApiBudget.js` (reserve, daily allowance, ledger in
`.cache/odds-api-budget.json`). Backups in use: game lines when BDL has no
market (`backupGameOdds.js`). Saturdays may spend up to 60 credits.
Paid backup requests are costed under a shared file lock; free event lists
remain available. A college backup board reserves one credit for its final
selected-market quote check before research starts. Reservations expire after
an hour; neither research nor quote checking can spend the monthly reserve.
NO POWER RATINGS ON THE COLLEGE DESK (founder, Oct 10 2026: SP+ and FPI "to
stay off"). FPI is ESPN's prediction model and SP+ is built to predict margins.
The college tools that served them, and the schedule, conference and opponent-tier
tools built from them, are deleted (eaeabf01); the researcher keeps model forecasts
out whatever the source. Opponent quality comes from the desk's game-by-game lines.

NO COLLEGE PROPS, EVER (founder, Oct 9 2026: "I'm done with college props
forever, we are never doing them again"). The piggyback prop after each college
game pick is deleted and the props CLI refuses college; props already published
stay up and settle normally.

Props markets: a published prop must be the quoting book's standard market
(`src/services/standardPropMarkets.js`, rechecked by `verifyPropQuotes.js`):
its own BDL two-sided over/under at that line, fresh within the hour, and not
one of two over/unders the book prints for the same player and stat. Quotes
keep the original BDL price. The shared prop odds floor is −179.

MLB bullpen (the one authorized exception to the June freeze, Sep 16): the
June lane reads `src/services/bullpen/snapshot.js`, and the June era hash
includes the shared bullpen modules. Low pitch counts, an idle day or an IL
activation do not establish availability; unreported restrictions stay unknown.

Operations: the Supabase project has had intermittent database outages
(Sep 19 restarts). The Sep 24 2:07–2:47 PM ET outage was self-inflicted: a
Claude analysis script bulk-selected `winners_curation_runs.input_snapshot`
(every stored desk) over REST, PostgREST died and only a project restart
brought the API back. Never bulk-select `input_snapshot`, `evidence_snapshot`,
`pick_snapshot` or `daily_picks.picks` over REST; aggregate in SQL. UI
recovery handles a failed read.

Maintenance map: [architecture](../docs/maintenance/ARCHITECTURE.md) and
[checked data boundaries](../contracts/README.md).

- `src/services/agentic/orchestrator/agentLoop.js`: common decision sequence.
- `src/services/agentic/scoutReport/`: sport desks and evidence.
- `src/services/agentic/constitution/`: Gary's sport awareness.
- `scripts/run-agentic-picks.js`: generation entry; `scripts/scheduler.js`: scheduler.
- `src/services/agentic/orchestrator/modelCascade.js`: shared provider routing.

Native changes stay pending for Adam's review until he requests a release.
Public App Store submission is a separate action.

## Layer 3 Violations — The Only Rule That Matters

When writing or editing ANY prompt that Gary sees, think in three layers:

**Layer 1 - AWARENESS (What to notice):** Statements about what factors exist. OK.
**Layer 2 - INVESTIGATION (What to look at):** Questions Gary asks himself + stats to check. OK.
**Layer 3 - CONCLUSION (What it means for the pick):** NEVER. Any statement that links a factor directly to a pick conclusion is a Layer 3 violation.

Examples:
- LAYER 3 VIOLATION: "High pace = underdog can hang"
- LAYER 3 VIOLATION: "If shooting is above average, expect regression = fade them"
- LAYER 3 VIOLATION: "Rest advantage = easier cover"
- LAYER 3 VIOLATION: "A gap between data and line = edge"
- LAYER 3 VIOLATION: "Home court is worth 3-4 points"

Gary WILL follow explicit if/then rules — he takes instructions literally. If we write "Fast pace helps underdogs stay close," Gary will pick underdogs in fast-paced games without investigating whether it's true for THIS matchup. Never tell Gary what a factor means for the pick. Never assign point values to factors. Never label something as "edge." Gary investigates and concludes on his own.

## Visual decisions

Read [`design.md`](../design.md) first: the short list of rules Adam has set
explicitly (no filled oval bubbles, no internal tags or machine dates in
reader copy, one design per component across sports, the floating dock).

Use Adam's current request. The old design guides, palette/font mandates,
layout prescriptions and aesthetic memories were deleted at his request on
September 8, 2026. Do not restore them from history or treat existing code
and screenshots as mandatory styling. This creates no replacement style
rules. Operational, data-integrity and accessibility requirements remain.

Behavior vs. visuals: prop-slip grouping remains intact. Winners admission now comes only from the immutable server board (founder GO, Sep 4 2026), not local confidence/start-time selection. Home retains its featured games. Do not reintroduce automatic first-underdog or marquee admission.

## Injury data is current, not locked (founder, Sep 24 2026)

The old injury-code lock is lifted: "It has to update. All the information has
to stay up to date 24/7, so when we run these picks, Gary has the information
that's real and up to date." A player is never injured forever because a
report said so last week. NFL availability drops weekly and game-day
designations filed before the team's last completed game
(`src/services/nflAvailability.js`, applied in the shared BDL injury fetch);
reserve designations (IR, PUP, NFI, suspensions) stay until the provider
changes them. Injury fixes follow the ordinary rules: real-world accuracy
first, no quota or prescribed conclusion for Gary.

## Session-End Law: Repo = Production (founder, Aug 24 2026)

The September 21 iteration rules supersede automatic checks and native release
work in this older policy. Clearly distinguish saved native edits from releases.

"If we change something here I assume it was changed in production too —
that needs to be the case at the end of each session." Before ending ANY
session that touched code, run `node scripts/production-truth.js` and get a
green result: its DEPLOY PARITY section verifies every edge function's
deployed timestamp against its last local change (including `_shared/`),
and it flags uncommitted work and unpushed commits. Mid-experiment state is
allowed ONLY while the session is still going or when the final report says
so explicitly — silence means parity. If the user says a behavior is retired
or changed, that must be true in the RUNNING system before the session
ends, not just in the repo.

## Model providers

Use the current subscription routing in `subscriptionRoutes.js`.
Gary is Opus 5.5 (founder, Oct 1 2026: "that can't change"): game picks,
props, darts, Winners and every word users read in the app or on X run
Claude Opus first, then the GPT logins. Claude usage is reserved for that.
Everything else is background work (searches, selection, fact checks,
research summaries, insight judgments): GPT 6.1 Sol on the two ChatGPT
logins first, Claude Opus only behind them. GPT 6.1 Sol is the only GPT
model ("no more 6 ever"): every GPT rung, Gary's recovery included. No Sonnet or Haiku on the Claude
subscription. Metered Anthropic/OpenAI routes and Gemini are disabled. Do not
revive an old model order from git history.

## A Fix Isn't Fixed Until It's Deployed

For anything that runs in the cloud — Supabase edge functions, migrations, cron jobs — committing the fix to the repo is HALF the fix. Production keeps running the old code until you deploy. Every bug-fix to a `supabase/functions/*` file MUST end with `npx supabase functions deploy <fn> --project-ref xuttubsfgdcjfgmskcol` and a verification call; every migration file MUST actually be applied. (Jul 2 2026: the phantom-grade ET-filter fix sat committed-but-undeployed for a day and silently mis-graded ~48 picks across a week. Same session, the DFS drop migration had sat unapplied.) When reporting a fix as done, say whether it is deployed, not just committed.

The same law covers the LOCAL pick daemon. "Deployed" means VERIFIED RUNNING IN THE PRODUCTION PROCESS — not committed, not pushed, not "the tree looks right." (Jul 29 – Aug 12 2026: the launchd plists pointed at a second clone of this repo in `Documents/ChatGPT/Gary/repo`, so two weeks of shipped pick-lane work — including an entire desk rebuild — never made a single pick, while every test and smoke run passed in the clone we were editing.) Any claim that a pick-lane change is live MUST cite `node scripts/production-truth.js` output or equivalent: the scheduler process's actual folder, the era hashes on disk, and (once picks store) the era stamped in the database. The scheduler daemon holds its code from spawn — after editing `scripts/scheduler.js` itself, restart it; pick runs are fresh processes and need no restart.

## Clean Up After Yourself

When removing, moving, or renaming code — fix ALL references. Stale comments, orphaned numbering (e.g. "BLOCK 8" when blocks 1-7 were removed), dead imports, outdated file-level docs — all of it gets cleaned up in the same change. Don't leave artifacts from old code structure behind.

## No Edits Without Approval

NEVER make code edits, file changes, or apply fixes without explicit user approval first. When issues are found:
1. Present the findings and proposed fixes
2. Wait for the user to approve before making any changes
3. If the user says "let's discuss" or "let's chat about it" — that means DISCUSS, not implement

This applies to all changes: bug fixes, prompt edits, refactors, new files, config changes. The only exception is if the user explicitly says "go ahead and fix it" or similar direct approval.

## Testing

When running test picks, store results in `test_daily_picks` table (not `daily_picks`). Use the `--test` flag or set the table target accordingly so test runs never pollute production data.

## Language: Say "Stats and Data" Not "Efficiency"

When discussing what Gary should analyze, say "stats and data" — meaning how teams score, defend, rebound, shoot, turn it over. Do NOT default to the word "efficiency" as shorthand. "Efficiency" sounds like one metric when we mean "all the real measurable basketball stuff." Be specific about which stats matter for the context.

## Communication Rule — No Summaries

When the user asks to see output, data, logs, rationale, or any artifact — show the FULL REAL THING, not a summary. Never paraphrase, condense, or editorialize what the system produced. Copy-paste the actual content. If it's long, show it in full anyway. The user will tell you if they want a summary. Default is always: show the real thing.
