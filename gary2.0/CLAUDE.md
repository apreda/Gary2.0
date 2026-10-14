# Gary — working instructions

Production checkout: `/Users/adam.preda/Gary2.0`, branch `main`. This file is the current state and the rules.
History (what changed when, and why) is in `docs/history/CLAUDE-through-2026-10-13.md`; read it only when the
reason behind a rule matters. Do not restore anything from it as a rule.

## How we work with Adam

- **Talk first.** No code, prompt or config change without Adam's approval. "Let's discuss" means discuss.
  Present findings and the proposed fix, then wait. Direct approval ("go ahead", "GO") is the exception.
- **Gary's words need sign-off on the exact text.** Anything Gary reads (prompts, awareness, asks) changes only
  with the exact wording approved.
- **Tests (Oct 13 2026).** Run only the test files for what you changed; the full suite only before a big push,
  printing the summary line only. Never write a test that pins prompt wording, copy or source text; test
  behavior (numbers, money paths, settlement, data parsing, routing, SQL). Test picks go to `test_daily_picks`
  (`--test`), never `daily_picks`.
- **Releases.** No archive, TestFlight upload or App Store submission unless Adam asks. Don't trigger release
  workflows through a push. Never show screenshots as proof; Adam checks the real app.
- **Git.** Work on `main`. Commit with an explicit pathspec (other sessions share the checkout). Never commit
  `ios/GaryApp/GoogleService-Info.plist` or `deno.lock`.
- **A fix isn't fixed until it's deployed.** Edge function: `npx supabase functions deploy <fn>` and a
  verification call. Migration: apply it (`npx supabase db query --linked -f <file>`). Pick runs are fresh
  processes; long-running workers (`com.gary.winners`, the scheduler) need `launchctl kickstart -k` after their
  code changes. Say whether a change is deployed, not just committed. At session end, `node
  scripts/production-truth.js` should be green or the report says what is pending.
- **Database safety.** Never bulk-select `input_snapshot`, `evidence_snapshot`, `pick_snapshot`,
  `pick_desks.desk` or `daily_picks.picks` over REST (it took the API down once); one row at a time or SQL.
- **Clean up after yourself.** Removing or renaming code fixes every reference, comment and import.
- **Show the real thing.** When Adam asks for output, data or logs, show it in full, not a summary.
- **Say "stats and data"**, not "efficiency", when talking about what Gary analyzes.
- **Visuals:** Adam's current request, plus `../design.md` (no filled oval pills, no internal tags or machine
  dates in reader copy, one design per component across sports) and the dark Picks research containers (Adam
  rejected a grey fill). No other standing style guide.
- **One system, every sport; reuse the sport that has the feature.** A feature one sport has is the reference
  for every other sport: port it with the sport's nouns, never a second design. A shared-system change ships to
  every sport that has it.

## Gary's prompts: the rules that matter

**Layer 3 violations.** When writing anything Gary reads, think in three layers:
1. AWARENESS (what exists): OK.
2. INVESTIGATION (what to look at): OK.
3. CONCLUSION (what a factor means for the pick): NEVER.

Violations: "High pace = underdog can hang", "Rest advantage = easier cover", "A gap between data and line =
edge", "Home court is worth 3-4 points". Gary follows if/then rules literally, so never tell him what a factor
means for the pick, never give a factor a point value, never label anything an "edge". He investigates and
concludes on his own.

- **Awareness is plain fact, never instruction.** No "is your read", no "weigh", no "consider", no checklists of
  how to reason. One heading per sport's awareness block, as MLB has it.
- **Gary never makes his own number:** no projected margin, no fair line, no distance-from-the-number threshold.
- **The market appears once, as THE LINE:** the posted spread/moneyline with prices and the ticket menu. No line
  history, opening line, public money, closing line or ATS record. Market concepts (like recency bias inflating
  a spread) reach Gary only in words Adam approves; the Oct 4 "the market is the price" rule is retired.
- **Missing data stays visibly missing.** A failed fetch is never "none" or "no injuries". Don't pass off team
  totals as player analysis.
- **Injury data is current** and every absence is already in the spread (NFL wording). A designation from before
  the team's last game is history; this week's note beats the feed's leftover status word.
- **Articles:** the shared freshness contract (`articleFreshness.js`): publisher's own date, newest game-specific
  reporting first, older reporting labeled background.
- **No AI reviewer of Gary's writing or decisions.** A valid rationale is stored unchanged; malformed or
  truncated output is a failed attempt, not a draft. Published picks are immutable; never re-run a published pick.
- **Fans read the rationale; the weighing is private.** The rationale never mentions the cases or his process.
- **Effort:** each call runs at its lane's effort; game picks are xhigh; nothing runs at max.

## How a game pick works (every sport)

1. The desk (`scoutReport/sports/<sport>.js`): the situation, articles as written, the line, game-by-game data,
   availability.
2. The research assistant reads the desk and reports what it lacks. NFL: newer/missing reporting on who plays
   and who calls plays, under 4,000 characters, no opinions (`nflResearchPrompts.js`). Gary may ask it up to six
   follow-ups.
3. Gary's first message: the desk, the sport's awareness (`constitution/<sport>Constitution.js`), the briefing.
   (The NFL game pick and MLB postseason games run their own question instead of steps 2-4; see each sport.)
4. Both cases (an answer missing one fails and a later attempt makes the pick), then the decision, asked today as
   the question and the output format only: "What's your bet, and what are the reasons why?" A football underdog
   of +2.5 or less becomes its moneyline after he picks.
5. The bet step (`winners/garyBet.js`): does he put money on it, and how much ($100 minimum, no maximum).
6. Gary's card (`winners/garyCard.js`): he places the pick among today's picks and names his book.
7. Late news (`winners/lateNews.js`) when the pick is due, then Winners (below).

Today Gary is not shown his record or its patterns, other people's picks or predictions, power ratings or
prediction models (SP+, FPI), bet-sizing rules, counts, quotas or Winners mechanics. These are current choices,
not permanent laws; Adam may change them.

**Models.** Gary is Opus 5.5 (picks, props, darts, Winners asks, every word users read). Route: the Claude
subscription, then Opus through the API credit (`claude-api-<model>`: the same CLI with `ANTHROPIC_API_KEY`
kept; the $200 monthly Max credit on Console org "Adam's Individual Org", key "Gary Haiku", auto-reload off;
`model-usage.jsonl` logs `api_cost_usd`; `GARY_CLAUDE_API=off` disables it), then GPT 6.1 Sol. Background work
(searches, selection, summaries) runs GPT 6.1 Sol first, Claude behind it, never the API credit. No Sonnet,
Haiku, Fable or Gemini for Gary; no DeepSeek behind Gary. Routing lives in `subscriptionRoutes.js`. College
waits for Opus when the subscription reopens before the game's next attempt (`collegeOpusWait.js`).

## Winners (real money, $10,000 bankroll)

- **Game picks: Gary's card.** Each placement answers which picks are in his book today; the latest answer is
  the cut. `seat_the_card` seats a pick in his book at his bet amount, 75 minutes before an NFL/college/MLB start
  (28 before an NBA tip), at least 20 (10 NBA) minutes out, only after late news cleared it. A seat is final. A
  seated pass gets one number ask (`garyBigGameStake.js`). No count, no quota. Policy `winners-card-v1`.
- **Big games** (`winners_big_games`: MLB playoff games, NFL prime time, marquee college games) go on at the same
  moment after late news, at his amount or his number. Policy `winners-big-game-v1`. The judge is retired.
- **Late news.** Availability is recorded at publish and read again when the pick is due. Nothing changed: clear.
  A change, or an NBA/college player not yet ruled in or out (shown with the latest report and what the listing
  means): Gary answers stand or scratch. A scratch never goes on Winners, scratches a board ticket already on,
  stays in the app marked `scratched_at`/`scratch_reason` (faded, reason on the back), is never graded, and voids
  followers' bets. An unreadable feed is `no_feed` and the pick goes on.
- **The daily floor:** with nothing on Winners at the day pass, the top of the card goes on (`winners-floor-v1`).
- **Props:** MLB and NFL only; the reader selects clear and lean props with its own stake (daily-props-v1); at
  most six a day, one per player, two per game.
- **Darts on Winners:** MLB: Gary's #1 H+R+RBI and #1 total-bases darts and his one first-inning dart, at the
  amount he names (home runs never). NFL: his #1 receiving-yards dart. Booked when the lineup/inactives confirm.
- Winners admission comes only from the server board: never client-side admission or automatic
  favorite/underdog/marquee selection in the app.
- A wrongly admitted ticket is deleted, not shown as scratched. Nothing from past results gates or tunes the card.

## Sports

**MLB.** The June decision engine is frozen (`gary/agentic/mlbJuneEra/`): bug fixes only, plus the authorized bullpen
snapshot and starter-workload reporting. Playoffs (Oct 13 2026, `mlbJuneEra/playoffQuestion.js`): Gary is plain Opus
with Adam's view of October; he reads the series in words (results and headlines, records, who's favored, starters as
their beat writers tell it, bullpens in words, storylines, a short same-day news pass), answers "Who do you think wins
tonight, and why?", then writes the card from that answer with THE PRICE; the moneyline only, at any price, never
swapped. The stat tables are not in front of him. xERA is out of everything Gary and his research read. Props: the formula's three-deep
menu and side (don't widen without new evidence); the Sep 23 model is on trial against the Sep 2-22 baseline
(60%), review around Oct 16 2026, revert tags `props-before-sep24` and `props-before-sep23-model`. Darts scale with the slate: one more than the games per
category, at most five, one first-inning dart a game (`dartCounts`); the lineup-time review never swaps.

**NFL.** The desk: THE SITUATION (site, roof, kickoff forecast, rest, trips, coaches, records with neutral sites
apart), articles (independent reporting first, club sites labeled), THE LINE, game by game from the nflverse
play-by-play ledger (`nflPlayLedger.js`: the four most recent games in full, older ones on one line), who played
the snaps, starting quarterbacks (a questionable QB1 who has not been starting is named as such), the injury
report; this season's head coach comes from ESPN (`espnNflCoaches.js`; nflverse's current-season column is stale).
**The NFL game pick is the NFL question** (`orchestrator/nflQuestion.js`, founder GO Oct 14 2026: the replay that
went 11-4-1 and 10-5-1 on Oct 5-12, made live as it ran, no other changes): his instructions are Version D
(`nflConstitution.js` `pass1Context`: recency bias with "Good teams that have looked bad usually come back toward who
they have been", the quarterback/absences line, the star-out line) and the date; he reads the game in words (who's
favored, each team's last three seasons from nflverse (`nflLastSeasons.js`), THE SITUATION, last season, the
quarterbacks, the injury report, the beat writers, the week's storylines); no research notes, no web, no cases;
"Who do you like at this spread, and why?", then the card from his answer with THE LINE. The small-underdog
conversion and the moneyline limit apply. Props: the volume model (`nflPropModel.js`, role changes) picks three markets, Gary picks the side;
ladder rungs are live, guarded against books with doubled over/unders. Darts: receiving yards, rushing yards,
passing TDs, interceptions, anytime and QB TDs, counts by slate (`dartCounts`).

**NCAAF.** Coverage: a team from the ACC, Big Ten, Big 12, SEC or 2026 Pac-12, or Notre Dame (Boise State in;
Texas State only against another Pac-12 team); no FCS opponent; no main spread of 23 or more. Opus only, GPT
Sol as recovery. Availability: the SEC/ACC/American/MAC official reports (`ncaafAvailabilityReports.js`), else
web search plus one focused availability search; an unread side says so. Desk: site and schedule with
opponents' 2026 conferences, records and ranks (`ncaafSchedule.js`), per-game unit lines from CFBD, articles
(game recaps and previews never trimmed). College Gary reads the web himself (`GARY_NCAAF_BROWSE=0` closes it)
and keeps his own decision turn: the menu names every ticket, and a favorite past the house limit is framed as
which side of the spread with the underdog's moneyline as the third ticket. No power ratings. **No college
props, ever.**

**NBA.** Opens Oct 20 2026. The lane is pinned to the April 8 2026 prompts that went 152-106
(`orchestrator/nbaWinningEra.js`, `nbaConstitution.js`); only tool sentences were adapted, and the model is now
Opus 5.5. Injuries come from the NBA's own official report, posted every 15 minutes on game days
(`nbaOfficialInjuryReport.js`, read with `pdftotext`; it replaced the lapsed paid copy of the same report, Oct 13
2026), for the desk and the late-news check. Still needed: the BDL NBA tier (stats, standings, news notes).

**NHL.** Held and off the app (`GARY_MANUAL_GAME_PICKS=icehockey_nhl`). When it returns: the league's free feeds
(`nhlApiService.js`), DraftKings moneyline on every game, MLB's flow with hockey's nouns, not on Winners.

## Data sources

- BDL first for games, odds and props in every sport (the NFL tier is paid; NBA needs its own tier). The Odds API
  is the backup on a free 500-credit plan, every call through `oddsApiBudget.js`.
- nflverse (play-by-play, schedules/games.csv, snap counts, official injury report), CFBD (college stats; reads
  one week at a time), the conference availability reports, ESPN for recaps, Jev (TypeSafe) assessments for MLB
  and NFL props (switches: `GARY_JEV_*` in `.env`; see `.agents/skills/typesafe-ai/SKILL.md`).
- Props must be the quoting book's standard market (`standardPropMarkets.js`, `verifyPropQuotes.js`); the prop
  odds floor is -179.

## Map

`src/services/` is one folder per area, each with a short README (`src/services/README.md` is the index):
`providers/` (outside feeds), `sports/<league>/`, `gary/` (desks, orchestrator, tools, props desk, darts),
`winners/` (bet, card, book, late news, rules), `content/` (board, slate, recaps, insights, copy).

- Jobs: `scripts/README.md` (every launchd job at a glance). `scripts/run-agentic-picks.js` (pick runner),
  `scripts/scheduler.js`, `scripts/run-winners-board.js` (Winners worker), `scripts/run-darts.js`.
- `src/services/gary/agentic/orchestrator/agentLoop.js` (the decision sequence), `gary/agentic/scoutReport/`
  (desks), `gary/agentic/constitution/` (awareness), `gary/agentic/tools/statRouters/` (Gary's tools),
  `gary/agentic/orchestrator/subscriptionRoutes.js` (models).
- `src/services/winners/` (bet, card, late news), `gary/pickdesk/` (props), `gary/darts/`, `supabase/migrations/`
  (Winners SQL).
- App: `../ios/GaryApp` (Home, Winners, Darts, Picks, Billfold). Architecture notes:
  `../docs/maintenance/ARCHITECTURE.md`, `../contracts/README.md`.
