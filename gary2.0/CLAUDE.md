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

## College desk and menu — October 3, 2026

Founder GO Oct 3 2026 after the 85-103 start ("just fix and do 2 3 4 ... then
do all 7"). The college desk and the college decision text changed; the model
route, coverage rules and Winners admission did not.

- Desk order is football first, the market last: availability, press
  accounts, quarterbacks and staff, the season game by game, home and road,
  team numbers, then THE LINE and WHERE THE MARKET SITS.
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
  and the line timeline no longer repeat the names.
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
- MLB game picks (founder, Oct 3 2026): every published, priced, pregame game
  pick qualifies for Winners automatically, regardless of reader assessment,
  Gary's play/stake or main-game designation. SQL admits the exact published
  original on queue insertion; the sweep recovers publication/queue gaps.
  The app uses the original rationale when there is no reader commentary.
  This admission exception does not change MLB predictions or prop eligibility.
- College main games (founder, Oct 3 2026) use NFL's main-game Winners route,
  independent of Gary's ordinary play/stake threshold. Founder clarification
  the same day: a published college main-game pick qualifies regardless of
  the reader's assessment, stake or ordinary Winners spread/conference gates.
  Admission must also work when the reader is pending or unavailable: use the
  same exact published-ticket insertion/sweep route as automatic MLB games.
  Pick generation still enforces real market quotes and college coverage.
  Today's designated games are Alabama at Mississippi
  State, Florida at Missouri and Washington at USC (NBC). Named overrides
  support multiple games; otherwise college retains its ranked-game selection.
- Winners reads the complete saved original decision evidence, including
  tool responses. A prior rejection cannot veto a corrected read or a later
  main-game designation. Published tickets and started-game history stay fixed.
- Winners games outside MLB and college (founder, Oct 4 2026: "they aren't
  300 or more ... I only said for mlb that every game pick was going to make
  it"): an NFL game qualifies only when Gary plays it at $300 or more and the
  reader says clear or lean, or when it is a prime-time big game (TNF, SNF,
  MNF). The Sep 24 gate had no stake floor for games, so NFL games at $100 to
  $250 reached the board on Sep 27, Oct 1 and Oct 4. Migration
  `20261004140303_winners_games_need_300.sql`; six unstarted Oct 4 tickets
  were scratched with reason `gate: NFL game under $300`.
- Winners props (founder, Sep 26 2026): Gary must play the ticket, and it
  qualifies when the reader calls it clear OR Gary bets $300 or more. Exactly
  $300 qualifies; the stake route does not require a particular assessment.
  Apply changes to unstarted tickets; keep admitted history for started games.
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

NFL game picks keep the single-answer agency flow. Its substantive ask is
"What's the best bet at the posted number and price, and why?"
The decision message opens with the bettor's frame ported from the NBA opener
and the June MLB decision paragraph: you are
picking which side of this spread to take; read the game the way a sharp
gambler does; find the read you would put your own money on. The constitution
names THE SPOTS (bounce-back, letdown, short week, divisional dog at home, the
side everyone is on) as facts about the week, never a lean. The desk carries
WHERE THE MARKET SITS: the exchanges' prices (Polymarket, Kalshi) on the same
sides from BDL's odds feed, beside the book line and its move since first
seen. Jev reports the crowd's lean and the line's move as classifications. No
fade-the-public rule, no distance threshold, no projected margin.
Last week's good-game/poor-game contrast, reputation and continuing changes can
suggest overreaction or underreaction. Gary does not need a calculated fair spread,
betting percentages, demonstrated line movement or certainty to make that judgment.
Jev supplies tentative situational assessments before Gary chooses; it does not
choose a side or turn classification confidence into a cover probability.
Adam will judge the resulting picks; no historical comparison or evaluation system
was requested. Football awareness is
declarative context, not assigned reasoning. There are no mandatory two-sided
essays, "Gary's Take" template, length target or subsequent rationale-writing
pass. Original evidence, research, tools, factual integrity and posted-market
constraints remain. A valid original rationale is stored unchanged; malformed
or provider-truncated output is a failed attempt, not a draft to rewrite.
MLB's June engine, NBA's April prompts and NCAAF behavior remain unchanged.

Jev (TypeSafe) integration, via `src/services/jev/client.js`:
- Props: MLB (`pickdesk/propsBrain.js`), NFL (`pickdesk/footballPropsDesk.js`)
  and NCAAF piggyback (`pickdesk/ncaafPiggybackProps.js`) get labeled role,
  workload and matchup assessments before Gary decides. Backend `.env`:
  `GARY_JEV_ENABLED`, `GARY_JEV_MODE=assist`, `GARY_JEV_PROP_LEAGUES`,
  `GARY_JEV_MODEL`. No post-answer critic, no automatic direction change.
- NFL games: `jev/nflMarketAssessments.js`, inserted in the NFL branch of
  `agentLoop.js` after research and before the final question. Disable with
  `GARY_JEV_NFL_MARKET_ENABLED=false`. An unavailable assessment leaves the
  original evidence intact.
- NCAAF games (Sep 25 2026, ported from NFL): `jev/ncaafMarketAssessments.js`,
  inserted in `agentLoop.js` before Gary's first turn. Disable with
  `GARY_JEV_NCAAF_MARKET_ENABLED=false`. The college desk carries THE LINE
  (every move, with the day each team's absences were reported) as its last
  section since Oct 3 2026.
- Private receipts live in `gary2.0/logs/jev/`. Published props carry
  `jev.run_id`. Use the [TypeSafe skill](../.agents/skills/typesafe-ai/SKILL.md).

MLB props trial (founder, Sep 25 2026): the Sep 23 prop model (684ee41e) and
the Sep 24-25 sheet changes (2d34917b, 9788e9a8) are on trial. If MLB core
props do not improve on the Sep 2-22 baseline (286-191, 60%) within about
three weeks (review around Oct 16 2026), revert to the earlier system. Revert
points are tagged: `props-before-sep24` (the Sep 23 model, before the sheet
changes) and `props-before-sep23-model` (the formula screen behind the 60%).

Odds sources (founder, Sep 25 2026): BDL first for game odds and props in
every sport; The Odds API is only the backup, on a free 500-credit plan
(`THE_ODDS_API_KEY` in `.env.local`), and every call to it goes through
`src/services/oddsApiBudget.js` (reserve, daily allowance, ledger in
`.cache/odds-api-budget.json`). Backups in use: game lines when BDL has no
market (`backupGameOdds.js`), and college props when BDL has no college board
and the game is a founder-named main game or AP-ranked vs ranked (founder, Oct 3
2026: other college games skip props). Saturdays may spend up to 60 credits.
Paid backup requests are costed under a shared file lock; free event lists
remain available. A college backup board reserves one credit for its final
selected-market quote check before research starts. Reservations expire after
an hour; neither research nor quote checking can spend the monthly reserve.
College props take the same Gary bet step as NFL before publication. Recovery
can fill a missing bet on an exact unstarted saved prop; it cannot change the
prediction, rationale, quote or evidence.
An explicit college prop pass is accepted like NFL's pass, not a job failure.
Private receipts in `logs/ncaaf-prop-passes/` bind it to the published game
decision and kickoff so later game retries do not regenerate it. Empty boards,
quote mismatches and data failures remain retryable. Test-table failures do not
open production incidents. Incident recovery checks both UTC observation dates
around midnight so a late college game can recover on its original ET slate.

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
